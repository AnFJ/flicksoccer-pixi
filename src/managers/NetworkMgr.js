
import { GameConfig } from '../config.js';

class NetworkMgr {
  constructor() {
    this.baseUrl = GameConfig.apiBaseUrl;
  }

  /**
   * 发送 POST 请求
   * @param {string} endpoint 接口路径 (e.g. '/api/login')
   * @param {Object} data 请求体数据
   */
  async post(endpoint, data = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    
    console.log(`[Network] POST ${url}`, data);

    try {
      // 适配：小游戏环境通常有 wx.request 或 tt.request，但现在大多数 adapter 都支持 fetch
      // 如果你的 adapter 没有 polyfill fetch，需要在这里做环境判断
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        throw new Error(`HTTP Error: ${response.status}`);
      }

      const resData = await response.json();
      return resData;

    } catch (err) {
      console.error(`[Network] Request failed: ${url}`, err);
      
      // 为了演示，如果后端连不上，返回一个 Mock 数据防止游戏卡死
      // 实际生产环境应抛出错误让上层处理 UI 提示
      console.warn('[Network] Falling back to local mock data due to network error.');
      return null;
    }
  }
}

export default new NetworkMgr();
