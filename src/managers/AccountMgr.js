
import Platform from './Platform.js';
import NetworkMgr from './NetworkMgr.js';

class AccountMgr {
  constructor() {
    this.userInfo = {
      id: null,
      nickname: 'Guest',
      avatarUrl: '', 
      level: 1,
      coins: 0,
      items: []
    };
    this.isLoggedIn = false;
  }

  /**
   * 执行登录流程
   */
  async login() {
    if (this.isLoggedIn) return this.userInfo;

    try {
      console.log('[Account] Starting login process...');
      
      // 1. 获取凭证 (Code 或 DeviceId)
      const creds = await Platform.getLoginCredentials();
      
      // 2. 尝试获取前端能拿到的基础资料 (抖音可以直接拿到，微信需要授权所以可能是null)
      const clientProfile = await Platform.getUserProfile();

      let userData = null;

      // 3. 请求后端 API
      if (creds.type === 'h5') {
          userData = await NetworkMgr.post('/api/login/h5', {
              deviceId: creds.deviceId
          });
      } else {
          userData = await NetworkMgr.post('/api/login/minigame', {
              platform: creds.type,
              code: creds.code,
              userInfo: clientProfile // 传给后端，如果有的话后端会更新DB
          });
      }

      // 4. 处理数据 (如果网络失败，Fallback 到本地模拟数据)
      if (userData && !userData.error) {
          this.parseUserData(userData);
      } else {
          console.warn('[Account] Network login failed, using offline mode.');
          // 离线模式默认数据
          this.userInfo.nickname = clientProfile?.nickName || 'Offline Player';
          this.userInfo.avatarUrl = clientProfile?.avatarUrl || '';
          this.userInfo.coins = 200;
          this.userInfo.id = 'offline_' + Date.now();
      }
      
      this.isLoggedIn = true;
      console.log('[Account] Login success:', this.userInfo);
      return this.userInfo;

    } catch (e) {
      console.error('[Account] Login exception:', e);
      throw e;
    }
  }

  /**
   * 解析后端返回的数据结构
   */
  parseUserData(data) {
      this.userInfo.id = data.user_id;
      this.userInfo.nickname = data.nickname;
      this.userInfo.avatarUrl = data.avatar_url;
      this.userInfo.level = data.level;
      this.userInfo.coins = data.coins;
      
      try {
          this.userInfo.items = JSON.parse(data.items || '[]');
      } catch (e) {
          this.userInfo.items = [];
      }
  }

  /**
   * 同步数据到服务器
   */
  async sync() {
      if (!this.isLoggedIn || this.userInfo.id.startsWith('offline_')) return;
      
      await NetworkMgr.post('/api/user/update', {
          userId: this.userInfo.id,
          coins: this.userInfo.coins,
          level: this.userInfo.level,
          items: this.userInfo.items
      });
  }

  /**
   * 增加金币
   */
  addCoins(amount) {
    this.userInfo.coins += amount;
    this.sync(); // 触发同步
    console.log(`[Account] Coins updated: ${this.userInfo.coins}`);
  }

  /**
   * 消费金币
   */
  consumeCoins(amount) {
    if (this.userInfo.coins >= amount) {
      this.userInfo.coins -= amount;
      this.sync(); // 触发同步
      return true;
    }
    return false;
  }
}

export default new AccountMgr();
