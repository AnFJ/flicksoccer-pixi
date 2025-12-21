import Platform from './Platform.js';

class AccountMgr {
  constructor() {
    this.userInfo = {
      nickname: 'Guest',
      avatarUrl: '', // 默认头像
      coins: 0,
      id: null
    };
    this.isLoggedIn = false;
  }

  /**
   * 执行登录流程
   */
  async login() {
    if (this.isLoggedIn) return this.userInfo;

    try {
      // 1. 平台授权
      const platformData = await Platform.login();
      const profile = await Platform.getUserProfile();
      
      // 2. 模拟服务器注册/获取数据
      // 实际开发中这里应该调用 Cloudflare Worker 接口
      this.userInfo.nickname = profile.nickName || `Player_${Math.floor(Math.random()*1000)}`;
      this.userInfo.avatarUrl = profile.avatarUrl || 'assets/images/default_avatar.png';
      
      // 模拟读取本地或云端金币
      this.userInfo.coins = 50; // 注册送 50
      this.userInfo.id = 'user_' + Date.now();
      
      this.isLoggedIn = true;
      console.log('[Account] Login success:', this.userInfo);
      return this.userInfo;

    } catch (e) {
      console.error('[Account] Login failed:', e);
      throw e;
    }
  }

  /**
   * 增加金币
   * @param {number} amount 
   */
  addCoins(amount) {
    this.userInfo.coins += amount;
    // TODO: 同步到服务器
    console.log(`[Account] Coins updated: ${this.userInfo.coins}`);
  }

  /**
   * 消费金币
   * @param {number} amount 
   */
  consumeCoins(amount) {
    if (this.userInfo.coins >= amount) {
      this.userInfo.coins -= amount;
      return true;
    }
    return false;
  }
}

export default new AccountMgr();