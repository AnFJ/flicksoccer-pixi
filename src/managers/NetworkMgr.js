
import { GameConfig } from '../config.js';
import Platform from './Platform.js';

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
      let resData;

      // 1. 微信小游戏环境
      if (Platform.env === 'wechat') {
        resData = await this._requestMinigame(wx, url, data);
      } 
      // 2. 抖音小游戏环境
      else if (Platform.env === 'douyin') {
        resData = await this._requestMinigame(tt, url, data);
      } 
      // 3. H5 / Web 环境 (使用 fetch)
      else {
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
        resData = await response.json();
      }

      return resData;

    } catch (err) {
      console.error(`[Network] Request failed: ${url}`, err);
      
      // 如果后端连不上，返回 null，上层业务(AccountMgr)会处理成离线模式
      console.warn('[Network] Falling back to local mock data due to network error.');
      return null;
    }
  }

  /**
   * 内部方法：将小游戏的 request 回调封装为 Promise
   * 微信和抖音的 request 签名基本一致
   */
  _requestMinigame(provider, url, data) {
      return new Promise((resolve, reject) => {
          provider.request({
              url: url,
              method: 'POST',
              data: data,
              header: {
                  'Content-Type': 'application/json'
              },
              success: (res) => {
                  // 小游戏 API 返回的 res.data 通常已经是解析好的 JSON 对象
                  if (res.statusCode >= 200 && res.statusCode < 300) {
                      resolve(res.data);
                  } else {
                      reject(new Error(`HTTP Error: ${res.statusCode}`));
                  }
              },
              fail: (err) => {
                  // err 通常包含 errMsg
                  reject(err);
              }
          });
      });
  }
}

export default new NetworkMgr();
