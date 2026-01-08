
/**
 * Cloudflare Worker + Durable Objects (GameRoom)
 * 优化版：支持断线重连、自动清理僵尸玩家、节省流量
 * [新增] D1 数据库同步功能，支持房间状态标记 (Waiting/Playing/Unused) 而非物理删除
 */

// 数据库状态枚举
const DB_STATUS = {
    WAITING: 0,
    PLAYING: 1,
    UNUSED: 2
};

export class GameRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    // 存储当前活跃的 WebSocket 会话 { ws, userId, lastSeen }
    this.sessions = [];
    // 房间内存数据
    this.roomData = {
      players: [], // { id, nickname, avatar, level, theme, formationId, ready, teamId, socket, disconnectedAt, lastSeen }
      status: 'UNUSED', // 内部状态: UNUSED, WAITING, PLAYING
      currentTurn: 0,
      scores: { 0: 0, 1: 0 }, // 记录比分
      positions: null, // 记录上一回合结束时的棋子位置 (用于恢复)
      matchCount: 0, // [保留] 累计对局数
      roomId: null // [保留] 缓存房间号
    };

    // 尝试从持久化存储中恢复之前的状态 (如果存在)
    this.state.blockConcurrencyWhile(async () => {
      let stored = await this.state.storage.get("roomData");
      if (stored) {
        this.roomData = stored;
        // 刚恢复时，socket 引用都是空的，需要等待重连
        this.roomData.players.forEach(p => {
            p.socket = null;
            // 如果恢复时发现有残留玩家，标记为此时刻断线，以便后续 lazy 清理
            if (!p.disconnectedAt) p.disconnectedAt = Date.now();
        });
      }
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    
    // [新增] 解析并保存 roomId (URL格式: .../api/room/{roomId}/websocket)
    const pathParts = url.pathname.split('/');
    // pathParts[3] 应该是 roomId (根据 index.js 的路由逻辑)
    if (pathParts.length > 3) {
        this.roomData.roomId = pathParts[3];
    }

    // [新增] 在处理任何请求前，先清理无效的僵尸玩家(含超时Socket)
    await this.pruneInactivePlayers();

    // --- 1. 处理 HTTP 检查请求 ---
    if (url.pathname.endsWith('/check')) {
        // 只有当房间处于游戏进行中，或者有人在等且未满时，才认为房间有效可连
        // 注意：UNUSED 状态视为无效
        const isValid = this.roomData.status === 'PLAYING' || (this.roomData.status === 'WAITING' && this.roomData.players.length > 0);
        return new Response(JSON.stringify({ 
            exists: isValid,
            status: this.roomData.status,
            isGameOver: false 
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
    const formationId = parseInt(url.searchParams.get('formationId') || '0');
    
    let theme = { striker: 1, field: 1, ball: 1 };
    try {
        const themeStr = url.searchParams.get('theme');
        if (themeStr) theme = JSON.parse(themeStr);
    } catch(e) {}

    if (!userId) {
      return new Response("Missing userId", { status: 400 });
    }

    const { 0: client, 1: server } = new WebSocketPair();
    await this.handleSession(server, userId, nickname, avatar, level, theme, formationId);

    return new Response(null, { status: 101, webSocket: client });
  }

  // [核心新增] 清理不活跃玩家，释放房间位
  async pruneInactivePlayers() {
      const now = Date.now();
      
      // 1. 先清理 WebSocket 连接已死但未断开的 Session (超时检测)
      // 比如客户端断网但没发 Close 帧，Server 端 Socket 仍处于 Open 状态
      for (let i = this.sessions.length - 1; i >= 0; i--) {
          const s = this.sessions[i];
          // 超过 45秒 没有收到任何消息(含PING)，视为死链
          if (now - (s.lastSeen || now) > 45000) {
              try { s.ws.close(1000, "Timeout"); } catch(e) {}
              this.sessions.splice(i, 1);
              // 标记对应的玩家为断线
              const p = this.roomData.players.find(pl => pl.id === s.userId);
              if (p && !p.disconnectedAt) p.disconnectedAt = now;
          }
      }

      // 2. 清理 roomData 中的僵尸玩家
      const initialCount = this.roomData.players.length;
      
      this.roomData.players = this.roomData.players.filter(p => {
          // 如果玩家有活跃 socket (在 this.sessions 中)，保留
          const isActive = this.sessions.some(s => s.userId === p.id);
          if (isActive) {
              p.disconnectedAt = null; // 重置断线时间
              return true; 
          }

          // 如果不活跃：
          // 1. 如果房间在等待中 (WAITING)，直接踢出 (不占位)
          if (this.roomData.status === 'WAITING') return false;

          // 2. 如果游戏进行中 (PLAYING)，保留一段时间 (如 60秒) 等待重连
          if (this.roomData.status === 'PLAYING') {
              if (!p.disconnectedAt) p.disconnectedAt = now;
              // 超过 180秒 未重连，视为放弃
              if (now - p.disconnectedAt > 180000) return false;
              return true;
          }
          
          return false;
      });

      // 如果人数变化了，保存状态
      if (this.roomData.players.length !== initialCount) {
          // 如果人全没了
          if (this.roomData.players.length === 0) {
              // [修改] 不再 deleteAll，而是重置为 UNUSED 并保留 matchCount
              console.log(`[GameRoom] Room empty. Resetting to UNUSED.`);
              await this.resetRoomState();
              await this.closeRoomInDb(); // [新增] 标记数据库为 UNUSED
              return;
          } else if (this.roomData.players.length < 2 && this.roomData.status === 'PLAYING') {
              // 如果游戏中有人彻底超时被踢，理论上应该结束游戏，这里暂时保持状态
          }
          await this.saveState();
          await this.syncToDb(); // [新增] 同步更新数据库
      }
  }

  // [新增] 重置房间状态 (保留 ID 和 局数)
  async resetRoomState() {
      // 保留 matchCount 和 roomId
      this.roomData.players = [];
      this.roomData.status = 'UNUSED';
      this.roomData.scores = { 0: 0, 1: 0 };
      this.roomData.positions = null;
      this.roomData.currentTurn = 0;
      
      // 保存重置后的状态到 Durable Object 存储
      await this.saveState();
  }

  async handleSession(webSocket, userId, nickname, avatar, level, theme, formationId) {
    webSocket.accept();

    // 如果房间当前是 UNUSED 状态，说明是新开局/复用，切换为 WAITING
    if (this.roomData.status === 'UNUSED') {
        this.roomData.status = 'WAITING';
    }

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
      theme, 
      formationId,
      ready: false,
      teamId: -1,
      disconnectedAt: null, 
      lastSeen: Date.now() // [新增]
    };

    if (existingPlayerIndex !== -1) {
      // --- 重连逻辑 ---
      console.log(`[GameRoom] Player reconnecting: ${userId}`);
      // 保留原有状态 (teamId, ready)
      playerInfo.teamId = this.roomData.players[existingPlayerIndex].teamId;
      playerInfo.ready = this.roomData.players[existingPlayerIndex].ready;
      
      // 更新引用
      this.roomData.players[existingPlayerIndex] = { ...playerInfo, socket: webSocket };
    } else {
      // --- 新加入逻辑 ---
      // 分配队伍：优先填补空缺的 Team ID
      const takenTeam = this.roomData.players.length > 0 ? this.roomData.players[0].teamId : -1;
      playerInfo.teamId = (takenTeam === 0) ? 1 : 0;
      this.roomData.players.push({ ...playerInfo, socket: webSocket });
    }

    const session = { ws: webSocket, userId, lastSeen: Date.now() };
    this.sessions.push(session);

    await this.saveState();
    await this.syncToDb(); // [新增] 同步到数据库
    
    this.broadcastState();

    // 如果游戏正在进行中，给该玩家发送恢复数据
    if (this.roomData.status === 'PLAYING') {
        webSocket.send(JSON.stringify({
            type: 'GAME_RESUME',
            payload: {
                currentTurn: this.roomData.currentTurn,
                scores: this.roomData.scores,
                positions: this.roomData.positions, 
                players: this.roomData.players.map(p => ({
                    id: p.id, teamId: p.teamId, nickname: p.nickname, avatar: p.avatar, level: p.level, theme: p.theme, formationId: p.formationId
                }))
            }
        }));
    }

    webSocket.addEventListener("message", async msg => {
      try {
        if (!msg.data) return;
        
        // [新增] 更新活跃时间
        const s = this.sessions.find(ses => ses.userId === userId);
        if (s) s.lastSeen = Date.now();

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
    if (msg.type === 'PING') {
        socket.send(JSON.stringify({ type: 'PONG' }));
        return;
    }

    const player = this.roomData.players.find(p => p.id === userId);
    if (!player) return;

    switch (msg.type) {
      case 'READY':
        player.ready = !!msg.payload.ready;
        if (msg.payload.formationId !== undefined) {
            player.formationId = msg.payload.formationId;
        }
        this.broadcastState();
        this.checkStart();
        await this.saveState();
        break;

      case 'GET_STATE':
        // 响应客户端的状态查询请求
        this.broadcastState();
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
          // [流量优化] 瞄准信息不需要发回给自己
          this.broadcast({
              type: msg.type,
              payload: msg.payload
          }, socket);
          break;
      
      case 'SKILL':
          this.broadcast({
              type: 'SKILL',
              payload: msg.payload
          });
          break;

      case 'TRAJECTORY_BATCH':
          // [流量优化] 物理轨迹是高频数据，发送者本地已经模拟，不需要回显
          this.broadcast({
              type: 'TRAJECTORY_BATCH',
              payload: msg.payload
          }, socket);
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
        // [流量优化] 快照只需发给对方
        this.broadcast({
            type: 'SNAPSHOT',
            payload: msg.payload
        }, socket);
        break;
        
      case 'GOAL':
          if (msg.payload && msg.payload.newScore) {
              this.roomData.scores = msg.payload.newScore;
              // [核心修复] 
              // 1. 将 scoreTeam 传递给其他客户端
              // 2. 排除发送者 (socket)，因为发送者已经本地乐观更新了
              this.broadcast({
                  type: 'GOAL',
                  payload: { 
                      newScore: this.roomData.scores,
                      scoreTeam: msg.payload.scoreTeam 
                  }
              }, socket);
              await this.saveState();
          }
          break;

      case 'GAME_OVER':
          // [修复] 防止双端发送导致的重复结算
          if (this.roomData.status !== 'PLAYING') return;

          // 客户端通知游戏结束，重置房间状态为等待中
          this.roomData.status = 'WAITING';
          this.roomData.scores = { 0: 0, 1: 0 };
          this.roomData.positions = null;
          // [新增] 累计局数 (Accumulate)
          this.roomData.matchCount = (this.roomData.matchCount || 0) + 1;
          
          // 重置所有玩家准备状态
          this.roomData.players.forEach(p => p.ready = false);
          
          await this.saveState();
          await this.syncToDb(); // [新增] 更新数据库状态为 WAITING 并增加局数
          this.broadcastState(); // 广播新状态给所有客户端，以便UI刷新
          break;

      case 'LEAVE':
          // [核心修改] 区分游戏状态
          if (this.roomData.status === 'PLAYING') {
              // 1. 游戏中离开：视为"暂停/掉线"，保留玩家数据以便重连
              // 标记当前 session 为主动离开，以便 cleanupSession 广播正确的 reason
              const session = this.sessions.find(s => s.userId === userId);
              if (session) session.isManualLeave = true;
              
              // 关闭连接 (这会触发 close 事件 -> 调用 cleanupSession)
              socket.close(1000, "Left game (Paused)");
          } else {
              // 2. 等待中离开：视为"放弃"，彻底清除
              this.broadcast({
                  type: 'PLAYER_LEFT_GAME',
                  payload: { teamId: player.teamId, userId: player.id }
              });
              
              this.roomData.players = this.roomData.players.filter(p => p.id !== userId);
              
              if (this.roomData.players.length === 0) {
                  // 人走光了，关闭房间
                  await this.resetRoomState();
                  await this.closeRoomInDb(); // [修改] 标记为 UNUSED
              } else {
                  this.roomData.status = 'WAITING'; 
                  this.roomData.players.forEach(p => p.ready = false);
                  await this.saveState();
                  await this.syncToDb(); // [新增] 更新
              }
              
              // 关闭连接
              socket.close(1000, "Left game");
              const sIdx = this.sessions.findIndex(s => s.userId === userId);
              if (sIdx !== -1) this.sessions.splice(sIdx, 1);
          }
          break;
    }
  }

  checkStart() {
    if (this.roomData.players.length === 2 && this.roomData.players.every(p => p.ready)) {
      this.roomData.status = 'PLAYING';
      this.roomData.currentTurn = 0; 
      this.roomData.scores = { 0: 0, 1: 0 };
      this.roomData.positions = null; 

      this.syncToDb(); // [新增] 更新状态为 PLAYING

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
      theme: p.theme, 
      formationId: p.formationId,
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

  // [流量优化] 支持排除特定 socket (通常是发送者)
  broadcast(msgObj, exceptWs = null) {
    const str = JSON.stringify(msgObj);
    this.sessions = this.sessions.filter(s => {
      try {
        if (s.ws === exceptWs) return true; // 跳过发送，但保留 session

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
        // [新增] 标记断线时间
        player.disconnectedAt = Date.now();
        
        // 如果是 WAITING 状态，直接清理掉 (防止占位)
        if (this.roomData.status === 'WAITING') {
            await this.pruneInactivePlayers();
            // 广播新的玩家列表
            this.broadcastState();
        } else {
            // PLAYING 状态，广播掉线，保留位置等待重连
            // [新增] 区分是主动离开(manual) 还是 意外掉线(timeout/error)
            const reason = session.isManualLeave ? 'manual' : 'disconnect';
            
            this.broadcast({
                type: 'PLAYER_OFFLINE',
                payload: { 
                    teamId: player.teamId, 
                    userId: player.id,
                    reason: reason // 告诉客户端原因
                }
            });
            await this.saveState();
        }
    }

    if (this.sessions.length === 0) {
      // 房间没人了
      if (this.roomData.status === 'WAITING') {
          // 如果是等待状态且没人，立即重置并关闭
          console.log(`[GameRoom] Room empty (WAITING). Closing immediately.`);
          await this.resetRoomState();
          await this.closeRoomInDb(); // [修改]
      } else {
          // 如果是游戏状态，设置 3 分钟销毁闹钟 (快速回收，同时给短时重连机会)
          console.log(`[GameRoom] Room empty (PLAYING). Schedule close in 180s.`);
          await this.state.storage.setAlarm(Date.now() + 180000);
      }
    }
  }

  async alarm() {
    if (this.sessions.length === 0) {
      console.log(`[GameRoom] Executing auto-close due to inactivity.`);
      await this.resetRoomState();
      await this.closeRoomInDb(); // [修改]
    } else {
      console.log(`[GameRoom] Close cancelled, players returned.`);
    }
  }

  async saveState() {
    // 存储前移除 socket 和临时字段，节省空间
    const toStore = { 
        ...this.roomData,
        players: this.roomData.players.map(p => {
            const { socket, ...rest } = p;
            return rest;
        }) 
    };
    await this.state.storage.put("roomData", toStore);
  }

  // [新增] 同步房间状态到 D1 数据库
  async syncToDb() {
      if (!this.roomData.roomId || !this.env.DB) return;

      const p1 = this.roomData.players.find(p => p.teamId === 0); // Host
      const p2 = this.roomData.players.find(p => p.teamId === 1); // Guest

      const hostInfo = p1 ? JSON.stringify({ id: p1.id, nickname: p1.nickname, avatar: p1.avatar, level: p1.level }) : null;
      const guestInfo = p2 ? JSON.stringify({ id: p2.id, nickname: p2.nickname, avatar: p2.avatar, level: p2.level }) : null;
      
      let statusInt = DB_STATUS.WAITING;
      if (this.roomData.status === 'PLAYING') statusInt = DB_STATUS.PLAYING;
      else if (this.roomData.status === 'UNUSED') statusInt = DB_STATUS.UNUSED;

      try {
          // [修复] 适配新的 DB Schema: created_at/updated_at 使用数据库默认值 datetime('now', '+8 hours')
          // INSERT 时不传递时间，UPDATE 时显式更新 updated_at
          await this.env.DB.prepare(`
            INSERT INTO room_records (room_id, status, host_info, guest_info, match_count)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(room_id) DO UPDATE SET
            status = excluded.status,
            host_info = excluded.host_info,
            guest_info = excluded.guest_info,
            match_count = excluded.match_count,
            updated_at = datetime('now', '+8 hours')
          `).bind(
              this.roomData.roomId,
              statusInt,
              hostInfo,
              guestInfo,
              this.roomData.matchCount || 0
          ).run();
      } catch (e) {
          console.error('[GameRoom] Sync DB failed', e);
      }
  }

  // [修改] 关闭数据库中的房间 (标记为 UNUSED，不清空行)
  async closeRoomInDb() {
      if (!this.roomData.roomId || !this.env.DB) return;
      try {
          await this.env.DB.prepare(`
            UPDATE room_records 
            SET status = ?, host_info = NULL, guest_info = NULL, updated_at = datetime('now', '+8 hours') 
            WHERE room_id = ?
          `).bind(DB_STATUS.UNUSED, this.roomData.roomId).run();
          console.log(`[GameRoom] Room ${this.roomData.roomId} closed in DB.`);
      } catch (e) {
          console.error('[GameRoom] Close Room DB failed', e);
      }
  }
}
