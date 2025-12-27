
import { GameConfig } from '../config.js';
import Platform from './Platform.js';
import EventBus from './EventBus.js';
import { Events } from '../constants.js';

class NetworkMgr {
  constructor() {
    this.baseUrl = GameConfig.apiBaseUrl;
    this.socket = null;
    this.isConnected = false;
    this.messageHandlers = [];
    
    this.pingInterval = null;
    this.pingTime = 5000; // 3秒一次心跳

    // 监听网页关闭/刷新事件，强制断开连接，确保服务器立即收到 Close Frame
    if (typeof window !== 'undefined') {
        window.addEventListener('beforeunload', () => {
            this.close();
        });
    }
  }

  /**
   * 发送 POST 请求 (用于登录等 HTTP 接口)
   */
  async post(endpoint, data = {}) {
    // 移除 baseUrl 尾部可能多余的 /
    const baseUrl = this.baseUrl.replace(/\/$/, '');
    const url = `${baseUrl}${endpoint}`;
    console.log(`[Network] POST ${url}`, data);

    try {
      let resData;
      if (Platform.env === 'wechat') {
        resData = await this._requestMinigame(wx, url, data);
      } else if (Platform.env === 'douyin') {
        resData = await this._requestMinigame(tt, url, data);
      } else {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
        if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
        resData = await response.json();
      }
      return resData;
    } catch (err) {
      console.error(`[Network] Request failed: ${url}`, err);
      return null;
    }
  }

  /**
   * 检查房间状态 (用于断线重连检测)
   * @param {string} roomId 
   */
  async checkRoomStatus(roomId) {
      // 如果没有专门的 check 接口，也可以复用 join 接口的预检逻辑
      // 这里假设有一个轻量级接口只返回 exists: boolean
      const res = await this.post('/api/room/check', { roomId });
      // 模拟数据：如果后端没实现该接口，这里临时返回 null 让上层处理
      return res;
  }

  _requestMinigame(provider, url, data) {
      return new Promise((resolve, reject) => {
          provider.request({
              url: url,
              method: 'POST',
              data: data,
              header: { 'Content-Type': 'application/json' },
              success: (res) => {
                  if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
                  else reject(new Error(`HTTP Error: ${res.statusCode}`));
              },
              fail: (err) => reject(err)
          });
      });
  }

  // --- WebSocket 部分 ---

  /**
   * 连接到房间
   * @param {string} roomId 房间号
   * @param {string} userId 用户ID
   * @param {Object} userInfo 用户信息(昵称头像)
   */
  connectRoom(roomId, userId, userInfo) {
    this.close(); // 先断开旧连接

    // 构造 WS URL
    // 注意：Cloudflare Worker 如果是 https，ws 需要是 wss
    const protocol = this.baseUrl.startsWith('https') ? 'wss' : 'ws';
    const host = this.baseUrl.replace(/^https?:\/\//, '').replace(/\/$/, ''); // 去掉协议头和尾部斜杠
    const wsUrl = `${protocol}://${host}/api/room/${roomId}/websocket?userId=${userId}&nickname=${encodeURIComponent(userInfo.nickname)}&avatar=${encodeURIComponent(userInfo.avatarUrl)}`;

    console.log(`[Network] Connecting WS: ${wsUrl}`);

    if (Platform.env === 'web') {
        this.socket = new WebSocket(wsUrl);
        this.socket.onopen = () => this._onOpen();
        this.socket.onmessage = (e) => this._onMessage(e.data);
        this.socket.onclose = () => this._onClose();
        this.socket.onerror = (e) => this._onError(e);
    } else {
        // 小游戏环境
        const provider = Platform.getProvider();
        this.socket = provider.connectSocket({ url: wsUrl });
        this.socket.onOpen(() => this._onOpen());
        this.socket.onMessage((res) => this._onMessage(res.data));
        this.socket.onClose(() => this._onClose());
        this.socket.onError((err) => this._onError(err));
    }
  }

  send(msgObj) {
      if (!this.socket || !this.isConnected) {
          // console.warn('[Network] Socket not connected, cannot send:', msgObj);
          return;
      }
      const jsonStr = JSON.stringify(msgObj);
      
      if (Platform.env === 'web') {
          this.socket.send(jsonStr);
      } else {
          this.socket.send({ data: jsonStr });
      }
  }

  close() {
      this.stopHeartbeat();
      if (this.socket) {
          // 清理旧回调，防止内存泄漏或错误触发
          if (Platform.env === 'web') {
              this.socket.onopen = null;
              this.socket.onmessage = null;
              this.socket.onclose = null;
              this.socket.onerror = null;
              this.socket.close();
          } else {
              this.socket.close({});
          }
          this.socket = null;
      }
      this.isConnected = false;
  }

  _onOpen() {
      console.log('[Network] WebSocket Connected');
      this.isConnected = true;
      this.startHeartbeat();
  }

  _onMessage(raw) {
      try {
          const msg = JSON.parse(raw);
          // 过滤掉 PONG 消息，不打印日志，避免刷屏
          if (msg.type !== 'PONG') {
             console.log('[Network] Recv:', msg);
          }
          
          if (msg.type === 'ERROR') {
              console.warn('[Network] Server reported error:', msg.payload);
              // 广播业务错误
              EventBus.emit(Events.NET_MESSAGE, msg);
          } else if (msg.type === 'PONG') {
              // 心跳回应，暂不需要处理
          } else {
              // 广播普通消息
              EventBus.emit(Events.NET_MESSAGE, msg);
          }
      } catch (e) {
          console.error('[Network] Msg parse error:', e);
      }
  }

  _onClose() {
      console.log('[Network] WebSocket Closed');
      this.isConnected = false;
      this.stopHeartbeat();
      EventBus.emit(Events.NET_MESSAGE, { type: 'LEAVE' }); 
  }

  _onError(err) {
      console.error('[Network] WebSocket Error:', err);
      // 关键：广播错误事件，让 UI 层可以处理
      EventBus.emit(Events.NET_MESSAGE, { type: 'ERROR', payload: err });
  }

  startHeartbeat() {
      this.stopHeartbeat();
      this.pingInterval = setInterval(() => {
          if (this.isConnected) {
              this.send({ type: 'PING' });
          }
      }, this.pingTime);
  }

  stopHeartbeat() {
      if (this.pingInterval) {
          clearInterval(this.pingInterval);
          this.pingInterval = null;
      }
  }
}

export default new NetworkMgr();
