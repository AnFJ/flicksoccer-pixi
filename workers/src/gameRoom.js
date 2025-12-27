
/**
 * Cloudflare Worker + Durable Objects (GameRoom)
 * 优化版：支持 3 分钟无活动自动销毁
 */

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // 存储当前活跃的 WebSocket 会话
    this.sessions = [];
    // 房间内存数据
    this.roomData = {
      players: [], // { id, nickname, avatar, ready, teamId, socket }
      status: 'WAITING', // WAITING, PLAYING
      currentTurn: 0 
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
    // 只要有新的 fetch 请求（玩家尝试连接），就取消掉销毁闹钟
    await this.state.storage.deleteAlarm();

    const upgradeHeader = request.headers.get("Upgrade");
    if (!upgradeHeader || upgradeHeader.toLowerCase() !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const nickname = url.searchParams.get('nickname') || 'Unknown';
    const avatar = url.searchParams.get('avatar') || '';

    if (!userId) {
      return new Response("Missing userId", { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    await this.handleSession(server, userId, nickname, avatar);

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(webSocket, userId, nickname, avatar) {
    webSocket.accept();

    const existingPlayerIndex = this.roomData.players.findIndex(p => p.id === userId);
    
    if (existingPlayerIndex === -1 && this.roomData.players.length >= 2) {
      webSocket.send(JSON.stringify({ type: 'ERROR', payload: { msg: 'Room is full' } }));
      webSocket.close(1008, "Room is full");
      return;
    }

    const playerInfo = {
      id: userId,
      nickname,
      avatar,
      ready: false,
      teamId: -1
    };

    if (existingPlayerIndex !== -1) {
      playerInfo.teamId = this.roomData.players[existingPlayerIndex].teamId;
      playerInfo.ready = this.roomData.players[existingPlayerIndex].ready;
      this.roomData.players[existingPlayerIndex] = { ...playerInfo, socket: webSocket };
    } else {
      const takenTeam = this.roomData.players.length > 0 ? this.roomData.players[0].teamId : -1;
      playerInfo.teamId = (takenTeam === 0) ? 1 : 0;
      this.roomData.players.push({ ...playerInfo, socket: webSocket });
    }

    const session = { ws: webSocket, userId };
    this.sessions.push(session);

    // 持久化当前房间配置
    await this.saveState();
    this.broadcastState();

    webSocket.addEventListener("message", async msg => {
      try {
        if (!msg.data) return;
        const data = JSON.parse(msg.data);
        this.onMessage(userId, data);
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

  async onMessage(userId, msg) {
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
        
      case 'TURN_SYNC':
        this.broadcast({
          type: 'TURN_SYNC',
          payload: msg.payload
        });
        break;
    }
  }

  checkStart() {
    if (this.roomData.players.length === 2 && this.roomData.players.every(p => p.ready)) {
      this.roomData.status = 'PLAYING';
      this.roomData.currentTurn = 0; 
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
        s.ws.send(str);
        return true;
      } catch (e) {
        return false;
      }
    });
  }

  async cleanupSession(session) {
    this.sessions = this.sessions.filter(s => s !== session);
    
    // 如果房间空了，设置 1 分钟后的销毁闹钟
    if (this.sessions.length === 0) {
      // 180,000ms = 1分钟
      console.log(`[GameRoom] Room is empty, scheduling destruction in 3 mins...`);
      await this.state.storage.setAlarm(Date.now() + 60000);
    }
  }

  /**
   * 闹钟触发器：由 Cloudflare 自动在设定时间调用
   */
  async alarm() {
    // 再次确认：如果此时依然没有活跃连接，则删除数据
    if (this.sessions.length === 0) {
      console.log(`[GameRoom] Executing auto-destruction due to inactivity.`);
      await this.state.storage.deleteAll();
      // 数据删除后，DO 实例会在下次 GC 时被完全回收
    } else {
      console.log(`[GameRoom] Destruction cancelled, players returned.`);
    }
  }

  async saveState() {
    // 存储除 socket 以外的数据
    const toStore = { ...this.roomData };
    await this.state.storage.put("roomData", toStore);
  }
}
