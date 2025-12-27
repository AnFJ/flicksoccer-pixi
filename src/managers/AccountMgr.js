
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
    this.isNewUser = false; // 是否为新注册用户
    this.tempLoginCredentials = null; // 缓存凭证，用于更新资料时的再次调用（如果需要）
  }

  /**
   * 静默登录：只用 code/deviceId 换取用户基本状态
   * 如果是新用户，后端会生成随机名字
   */
  async silentLogin() {
    if (this.isLoggedIn) return this.userInfo;

    try {
      console.log('[Account] Starting silent login...');
      
      // 1. 获取凭证 (Code 或 DeviceId)
      const creds = await Platform.getLoginCredentials();
      this.tempLoginCredentials = creds; // 缓存一下

      let userData = null;

      // 2. 请求后端 API (不带 userInfo)
      if (creds.type === 'h5') {
          userData = await NetworkMgr.post('/api/login/h5', {
              deviceId: creds.deviceId
          });
      } else {
          userData = await NetworkMgr.post('/api/login/minigame', {
              platform: creds.type,
              code: creds.code,
              userInfo: null // 静默登录传空
          });
      }

      // 3. 处理返回数据
      if (userData && !userData.error) {
          this.parseUserData(userData);
          this.isNewUser = !!userData.is_new_user;
          this.isLoggedIn = true;
          console.log(`[Account] Login success. Is New User: ${this.isNewUser}`);
      } else {
          console.warn('[Account] Network login failed, using offline mode.');
          this.enterOfflineMode();
      }
      
      return this.userInfo;

    } catch (e) {
      console.error('[Account] Login exception:', e);
      this.enterOfflineMode();
      return this.userInfo;
    }
  }

  /**
   * 更新用户资料 (通常在新用户点击授权后调用)
   * @param {Object} profile 平台返回的 { nickName, avatarUrl }
   */
  async updateUserProfile(profile) {
      if (!this.isLoggedIn || !profile) return;
      if (!this.tempLoginCredentials) return;

      console.log('[Account] Updating user profile...', profile);

      try {
          // 重新调用登录接口，但这次带上 userInfo
          // 注意：Code 只能用一次。
          // 实际上如果 sessionKey 没过期，可以直接调更新接口。
          // 但为了简化逻辑，我们这里假设后端可以处理 OpenID 的更新。
          // 这里的关键是：微信的 code 是一次性的。
          // 如果 silentLogin 已经用掉了 code，这里再调 login 必须重新获取 code。
          
          let creds = this.tempLoginCredentials;
          
          // 如果是小程序，必须重新获取 Code
          if (creds.type !== 'h5') {
              creds = await Platform.getLoginCredentials();
          }

          const userData = await NetworkMgr.post('/api/login/minigame', {
              platform: creds.type,
              code: creds.code,
              userInfo: profile // 带上资料
          });

          if (userData && !userData.error) {
              this.parseUserData(userData);
              console.log('[Account] Profile updated successfully.');
          }
      } catch (e) {
          console.error('[Account] Failed to update profile', e);
      }
  }

  enterOfflineMode() {
      this.userInfo.nickname = 'Offline Player';
      this.userInfo.avatarUrl = '';
      this.userInfo.coins = 200;
      this.userInfo.id = 'offline_' + Date.now();
      this.isLoggedIn = true;
      this.isNewUser = false; // 离线模式默认不当做新用户处理
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
   * 同步数据到服务器 (金币/等级)
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

  addCoins(amount) {
    this.userInfo.coins += amount;
    this.sync(); 
    console.log(`[Account] Coins updated: ${this.userInfo.coins}`);
  }

  consumeCoins(amount) {
    if (this.userInfo.coins >= amount) {
      this.userInfo.coins -= amount;
      this.sync();
      return true;
    }
    return false;
  }
}

export default new AccountMgr();
