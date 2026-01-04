
/**
 * Cloudflare Worker + Durable Objects (GameRoom)
 * 优化版：支持断线重连和状态恢复
 */

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // 存储当前活跃的 WebSocket 会话
    this.sessions = [];
    // 房间内存数据
    this.roomData = {
      players: [], // { id, nickname, avatar, level, theme, ready, teamId, socket }
      status: 'WAITING', // WAITING, PLAYING
      currentTurn: 0,
      scores: { 0: 0, 1: 0 }, // 记录比分
      positions: null // 记录上一回合结束时的棋子位置 (用于恢复)
    };

    // 尝试从持久化存储中恢复之前的状态 (如果存在)
    this.state.blockConcurrencyWhile(async () => {
      let stored = await this.state.storage.get("roomData");
      if (stored) {
        this.roomData = stored;
        // 刚恢复时，socket 引用都是空的，需要等待重连
        this.roomData.players.forEach(p => p.socket = null);
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    // --- 1. 处理 HTTP 检查请求 ---
    if (url.pathname === '/check') {
        // 只有当房间处于游戏进行中，或者有人在等且未满时，才认为房间有效可连
        const isValid = this.roomData.status === 'PLAYING' || (this.roomData.status === 'WAITING' && this.roomData.players.length > 0);
        return new Response(JSON.stringify({ 
            exists: isValid,
            status: this.roomData.status,
            isGameOver: false // 如果有结束逻辑这里需要判断
        }), {
            headers: { 'Content-Type': 'application/json' }
        });
    }

    // --- 2. 处理 WebSocket 升级 ---
    // 只要有新的连接尝试，就取消掉销毁闹钟
    await this.state.storage.deleteAlarm();

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const userId = url.searchParams.get('userId');
    const nickname = url.searchParams.get('nickname') || 'Unknown';
    const avatar = url.searchParams.get('avatar') || '';
    const level = parseInt(url.searchParams.get('level') || '1');
    
    // [新增] 解析 theme 参数
    let theme = { striker: 1, field: 1, ball: 1 };
    try {
        const themeStr = url.searchParams.get('theme');
        if (themeStr) theme = JSON.parse(themeStr);
    } catch(e) {}

    if (!userId) {
      return new Response("Missing userId", { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    await this.handleSession(server, userId, nickname, avatar, level, theme);

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(webSocket, userId, nickname, avatar, level, theme) {
    webSocket.accept();

    const existingPlayerIndex = this.roomData.players.findIndex(p => p.id === userId);
    
    // 如果房间满了且是新玩家，拒绝
    if (existingPlayerIndex === -1 && this.roomData.players.length >= 2) {
      webSocket.send(JSON.stringify({ type: 'ERROR', payload: { msg: 'Room is full' } }));
      webSocket.close(1008, "Room is full");
      return;
    }

    const playerInfo = {
      id: userId,
      nickname,
      avatar,
      level, 
      theme, // [新增]
      ready: false,
      teamId: -1
    };

    if (existingPlayerIndex !== -1) {
      // --- 重连逻辑 ---
      console.log(`[GameRoom] Player reconnecting: ${userId}`);
      // 保留原有状态 (teamId, ready)
      playerInfo.teamId = this.roomData.players[existingPlayerIndex].teamId;
      playerInfo.ready = this.roomData.players[existingPlayerIndex].ready;
      
      // 更新引用 (更新 info 以防昵称/等级/头像/主题变化)
      this.roomData.players[existingPlayerIndex] = { ...playerInfo, socket: webSocket };
    } else {
      // --- 新加入逻辑 ---
      const takenTeam = this.roomData.players.length > 0 ? this.roomData.players[0].teamId : -1;
      playerInfo.teamId = (takenTeam === 0) ? 1 : 0;
      this.roomData.players.push({ ...playerInfo, socket: webSocket });
    }

    const session = { ws: webSocket, userId };
    this.sessions.push(session);

    await this.saveState();
    
    // 广播房间信息 (让大家知道有人进来了/回来了)
    this.broadcastState();

    // **关键：如果游戏正在进行中，给该玩家发送恢复数据**
    if (this.roomData.status === 'PLAYING') {
        webSocket.send(JSON.stringify({
            type: 'GAME_RESUME',
            payload: {
                currentTurn: this.roomData.currentTurn,
                scores: this.roomData.scores,
                // 发送最近一次同步的位置，如果没有则让客户端自行重置
                positions: this.roomData.positions, 
                players: this.roomData.players.map(p => ({
                    id: p.id, teamId: p.teamId, nickname: p.nickname, avatar: p.avatar, level: p.level, theme: p.theme
                }))
            }
        }));
    }

    webSocket.addEventListener("message", async msg => {
      try {
        if (!msg.data) return;
        const data = JSON.parse(msg.data);
        this.onMessage(userId, data, webSocket);
      } catch (err) {
        console.error("Message parse error", err);
      }
    });

    webSocket.addEventListener("close", async () => {
      await this.cleanupSession(session);
    });

    webSocket.addEventListener("error", async () => {
      await this.cleanupSession(session);
    });
  }

  async onMessage(userId, msg, socket) {
    // 处理心跳 PING -> PONG
    if (msg.type === 'PING') {
        socket.send(JSON.stringify({ type: 'PONG' }));
        return;
    }

    const player = this.roomData.players.find(p => p.id === userId);
    if (!player) return;

    switch (msg.type) {
      case 'READY':
        player.ready = !!msg.payload.ready;
        this.broadcastState();
        this.checkStart();
        await this.saveState();
        break;

      case 'MOVE':
        if (this.roomData.status === 'PLAYING' && this.roomData.currentTurn === player.teamId) {
          this.roomData.currentTurn = player.teamId === 0 ? 1 : 0;
          this.broadcast({
            type: 'MOVE',
            payload: {
              ...msg.payload,
              nextTurn: this.roomData.currentTurn
            }
          });
          await this.saveState();
        }
        break;
      
      case 'AIM_START':
      case 'AIM_UPDATE':
      case 'AIM_END':
          this.broadcast({
              type: msg.type,
              payload: msg.payload
          });
          break;
      
      case 'SKILL':
          this.broadcast({
              type: 'SKILL',
              payload: msg.payload
          });
          break;

      case 'TRAJECTORY_BATCH':
          this.broadcast({
              type: 'TRAJECTORY_BATCH',
              payload: msg.payload
          });
          break;

      case 'FAIR_PLAY_MOVE':
          this.broadcast({
              type: 'FAIR_PLAY_MOVE',
              payload: msg.payload
          });
          break;
        
      case 'TURN_SYNC':
        if (msg.payload) {
            this.roomData.positions = msg.payload; 
        }
        this.broadcast({
          type: 'TURN_SYNC',
          payload: msg.payload
        });
        await this.saveState();
        break;

      case 'SNAPSHOT':
        if (this.roomData.status === 'PLAYING' && player.teamId !== this.roomData.currentTurn) {
        }
        this.broadcast({
            type: 'SNAPSHOT',
            payload: msg.payload
        });
        break;
        
      case 'GOAL':
          if (msg.payload && msg.payload.newScore) {
              this.roomData.scores = msg.payload.newScore;
              
              this.broadcast({
                  type: 'GOAL',
                  payload: { newScore: this.roomData.scores }
              });

              await this.saveState();
          }
          break;

      case 'LEAVE':
          this.broadcast({
              type: 'PLAYER_LEFT_GAME',
              payload: { teamId: player.teamId, userId: player.id }
          });
          break;
    }
  }

  checkStart() {
    if (this.roomData.players.length === 2 && this.roomData.players.every(p => p.ready)) {
      this.roomData.status = 'PLAYING';
      this.roomData.currentTurn = 0; 
      // 游戏开始重置比分
      this.roomData.scores = { 0: 0, 1: 0 };
      this.roomData.positions = null; // 清除旧位置

      this.broadcast({
        type: 'START',
        payload: { currentTurn: 0 }
      });
    }
  }

  broadcastState() {
    const safePlayers = this.roomData.players.map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      level: p.level,
      theme: p.theme, // [新增] 广播 theme
      ready: p.ready,
      teamId: p.teamId
    }));

    this.broadcast({
      type: 'PLAYER_JOINED',
      payload: {
        players: safePlayers,
        status: this.roomData.status
      }
    });
  }

  broadcast(msgObj) {
    const str = JSON.stringify(msgObj);
    this.sessions = this.sessions.filter(s => {
      try {
        if (s.ws.readyState === 1) {
            s.ws.send(str);
            return true;
        }
        return false;
      } catch (e) {
        return false;
      }
    });
  }

  async cleanupSession(session) {
    const index = this.sessions.indexOf(session);
    if (index === -1) return; 
    
    this.sessions.splice(index, 1);
    
    const player = this.roomData.players.find(p => p.id === session.userId);
    if (player) {
        this.broadcast({
            type: 'PLAYER_OFFLINE',
            payload: { teamId: player.teamId, userId: player.id }
        });
    }

    if (this.sessions.length === 0) {
      console.log(`[GameRoom] Room is empty, scheduling destruction in 3 mins...`);
      await this.state.storage.setAlarm(Date.now() + 180000);
    }
  }

  async alarm() {
    if (this.sessions.length === 0) {
      console.log(`[GameRoom] Executing auto-destruction due to inactivity.`);
      await this.state.storage.deleteAll();
    } else {
      console.log(`[GameRoom] Destruction cancelled, players returned.`);
    }
  }

  async saveState() {
    const toStore = { 
        ...this.roomData,
        players: this.roomData.players.map(p => ({...p, socket: undefined})) 
    };
    await this.state.storage.put("roomData", toStore);
  }
}
