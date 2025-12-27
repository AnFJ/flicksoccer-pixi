
/**
 * Cloudflare Worker + Durable Objects (GameRoom)
 * 需要在 wrangler.toml 中配置:
 * [durable_objects]
 * bindings = [ { name = "GAME_ROOM", class_name = "GameRoom" } ]
 * 
 * [[migrations]]
 * tag = "v1"
 * new_classes = ["GameRoom"]
 */

// Durable Object 类：处理单个房间的状态和连接
export class GameRoom {
  constructor(state, env) {
    this.state = state;
    // 存储所有连接的 WebSocket
    this.sessions = [];
    // 房间数据
    this.roomData = {
      players: [], // { id, nickname, avatar, ready, teamId, socket }
      status: 'WAITING', // WAITING, PLAYING
      currentTurn: 0 // 0: Left, 1: Right
    };
  }

  async fetch(request) {
    // 处理 WebSocket 升级请求
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected Upgrade: websocket", { status: 426 });
    }

    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const nickname = url.searchParams.get('nickname') || 'Unknown';
    const avatar = url.searchParams.get('avatar') || '';

    if (!userId) {
        return new Response("Missing userId", { status: 400 });
    }

    // 获取 WebSocket 对
    const { 0: client, 1: server } = new WebSocketPair();

    await this.handleSession(server, userId, nickname, avatar);

    return new Response(null, { status: 101, webSocket: client });
  }

  async handleSession(webSocket, userId, nickname, avatar) {
    webSocket.accept();

    // 1. 检查房间是否已满 (最多2人)
    // 注意：如果是断线重连（userId相同），则允许替换
    const existingPlayerIndex = this.roomData.players.findIndex(p => p.id === userId);
    
    if (existingPlayerIndex === -1 && this.roomData.players.length >= 2) {
        webSocket.send(JSON.stringify({ type: 'ERROR', payload: { msg: 'Room is full' } }));
        webSocket.close(1008, "Room is full");
        return;
    }

    // 2. 加入/更新玩家数据
    const playerInfo = {
        id: userId,
        nickname,
        avatar,
        ready: false,
        teamId: -1 // 稍后分配
    };

    if (existingPlayerIndex !== -1) {
        // 重连：更新 socket 引用，保持 teamId 不变
        playerInfo.teamId = this.roomData.players[existingPlayerIndex].teamId;
        playerInfo.ready = this.roomData.players[existingPlayerIndex].ready;
        this.roomData.players[existingPlayerIndex] = { ...playerInfo, socket: webSocket };
    } else {
        // 新加入
        // 简单分配：0号位给第一个，1号位给第二个
        // TeamId.LEFT = 0, TeamId.RIGHT = 1
        const takenTeam = this.roomData.players.length > 0 ? this.roomData.players[0].teamId : -1;
        playerInfo.teamId = (takenTeam === 0) ? 1 : 0;
        this.roomData.players.push({ ...playerInfo, socket: webSocket });
    }

    // 保存 session 引用以便清理
    const session = { ws: webSocket, userId };
    this.sessions.push(session);

    // 3. 广播当前房间状态
    this.broadcastState();

    // 4. 监听消息
    webSocket.addEventListener("message", async msg => {
      try {
        if (!msg.data) return;
        const data = JSON.parse(msg.data);
        this.onMessage(userId, data);
      } catch (err) {
        console.error("Message parse error", err);
      }
    });

    // 5. 监听断开
    webSocket.addEventListener("close", async () => {
      this.cleanupSession(session);
    });
  }

  onMessage(userId, msg) {
      const player = this.roomData.players.find(p => p.id === userId);
      if (!player) return;

      switch (msg.type) {
          case 'READY':
              // 切换准备状态
              player.ready = !!msg.payload.ready;
              this.broadcastState();
              this.checkStart();
              break;

          case 'MOVE':
              // 转发击球动作给对手
              // 简单校验：是否轮到该玩家
              if (this.roomData.status === 'PLAYING' && this.roomData.currentTurn === player.teamId) {
                  // 切换回合
                  this.roomData.currentTurn = player.teamId === 0 ? 1 : 0;
                  // 广播移动指令 + 下一回合信息
                  this.broadcast({
                      type: 'MOVE',
                      payload: {
                          ...msg.payload, // force, id
                          nextTurn: this.roomData.currentTurn
                      }
                  });
              }
              break;
              
          case 'TURN_SYNC':
              // 如果客户端判定静止了，上报回合结束，双重确认
              // 这里简化处理，以前端模拟为主，收到 MOVE 直接切回合
              break;
      }
  }

  checkStart() {
      if (this.roomData.players.length === 2 && this.roomData.players.every(p => p.ready)) {
          this.roomData.status = 'PLAYING';
          this.roomData.currentTurn = 0; // 默认左方先手
          this.broadcast({
              type: 'START',
              payload: {
                  currentTurn: 0
              }
          });
      }
  }

  broadcastState() {
      // 发送不带 socket 对象的纯数据
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

  cleanupSession(session) {
      this.sessions = this.sessions.filter(s => s !== session);
      // 可选：如果玩家真正离开（不仅仅是断线），移除 players
      // 这里简化为：只有 socket 断开不移除数据，保留位置给重连。
      // 实际生产环境需要心跳检测和超时剔除逻辑。
  }
}


// --- Worker 入口 ---
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS 处理
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }

    try {
        // API 路由
        if (path.startsWith("/api/room/")) {
            // 提取 room ID: /api/room/1234/websocket
            const parts = path.split('/');
            const roomId = parts[3]; // 1234
            const action = parts[4]; // websocket

            if (!roomId || action !== 'websocket') {
                return new Response("Invalid path", { status: 404 });
            }

            // 获取 Durable Object ID
            // 使用 idFromName 根据房间号生成固定 ID，保证所有连入 "1234" 的人都进同一个 DO
            const id = env.GAME_ROOM.idFromName(roomId);
            const stub = env.GAME_ROOM.get(id);

            return stub.fetch(request);
        }

        // 复用之前的登录 API (这里只保留逻辑框架，具体实现复用你之前的代码或数据库)
        // 简单返回 mock 响应
        if (path === '/api/login/h5' || path === '/api/login/minigame') {
            // 这里为了演示，假设前端已经处理了登录，Worker 直接返回成功
            // 实际项目中请保留之前的 D1 数据库逻辑
             if (request.method === 'POST') {
                const body = await request.json();
                return new Response(JSON.stringify({
                    user_id: body.deviceId || 'mock_user_' + Date.now(),
                    nickname: 'Guest',
                    avatar_url: '',
                    coins: 1000
                }), { headers: { "Access-Control-Allow-Origin": "*" } });
             }
        }
        
        return new Response("Not found", { status: 404 });
    } catch (e) {
        return new Response(e.message, { status: 500 });
    }
  }
};
