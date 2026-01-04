
import Platform from './Platform.js';
import NetworkMgr from './NetworkMgr.js';
import EventBus from './EventBus.js';
import { Events } from '../constants.js';

class AccountMgr {
  constructor() {
    this.userInfo = {
      id: null,
      nickname: 'Guest',
      avatarUrl: '', 
      level: 1, // 这里复用 level 作为 PVE 闯关进度 (第几关)
      coins: 0,
      items: [] 
    };
    this.isLoggedIn = false;
    this.isNewUser = false; 
    this.tempLoginCredentials = null; 
  }

  async silentLogin() {
    if (this.isLoggedIn) return this.userInfo;

    try {
      console.log('[Account] Starting silent login...');
      const creds = await Platform.getLoginCredentials();
      this.tempLoginCredentials = creds; 

      let userData = null;

      if (creds.type === 'h5') {
          userData = await NetworkMgr.post('/api/login/h5', {
              deviceId: creds.deviceId
          });
      } else {
          userData = await NetworkMgr.post('/api/login/minigame', {
              platform: creds.type,
              code: creds.code,
              userInfo: null 
          });
      }

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

  async updateUserProfile(profile) {
      if (!this.isLoggedIn || !profile) return;
      if (!this.tempLoginCredentials) return;

      console.log('[Account] Updating user profile...', profile);

      try {
          let creds = this.tempLoginCredentials;
          if (creds.type !== 'h5') {
              creds = await Platform.getLoginCredentials();
          }

          const userData = await NetworkMgr.post('/api/login/minigame', {
              platform: creds.type,
              code: creds.code,
              userInfo: profile 
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
      this.userInfo.items = [
          { id: 'super_aim', count: 99 },
          { id: 'super_force', count: 99 },
          { id: 'unstoppable', count: 99 }
      ];
      this.isLoggedIn = true;
      this.isNewUser = false; 
  }

  parseUserData(data) {
      this.userInfo.id = data.user_id;
      this.userInfo.nickname = data.nickname;
      this.userInfo.avatarUrl = data.avatar_url;
      // 强制转为整数，防止数据库或API返回字符串导致比较失败
      this.userInfo.level = parseInt(data.level) || 1; 
      this.userInfo.coins = parseInt(data.coins) || 0;
      
      try {
          this.userInfo.items = JSON.parse(data.items || '[]');
      } catch (e) {
          this.userInfo.items = [];
      }
  }

  async sync() {
      if (!this.isLoggedIn || this.userInfo.id.startsWith('offline_')) return;
      
      // 添加时间戳防止请求被缓存
      console.log('[Account] Syncing data:', this.userInfo);
      await NetworkMgr.post('/api/user/update', {
          userId: this.userInfo.id,
          coins: this.userInfo.coins,
          level: this.userInfo.level,
          items: this.userInfo.items
      });
  }

  /**
   * 增加金币
   * @param {number} amount 数量
   * @param {boolean} autoSync 是否立即同步服务器 (默认true，批量操作建议设为false)
   */
  addCoins(amount, autoSync = true) {
    this.userInfo.coins += amount;
    if (autoSync) {
        this.sync(); 
    }
    console.log(`[Account] Coins updated: ${this.userInfo.coins}, autoSync: ${autoSync}`);
  }

  consumeCoins(amount) {
    if (this.userInfo.coins >= amount) {
      this.userInfo.coins -= amount;
      this.sync();
      return true;
    }
    return false;
  }

  getItemCount(itemId) {
      if (!this.userInfo.items) return 0;
      const item = this.userInfo.items.find(i => i.id === itemId);
      return item ? item.count : 0;
  }

  consumeItem(itemId, amount = 1) {
      if (!this.userInfo.items) this.userInfo.items = [];
      
      const item = this.userInfo.items.find(i => i.id === itemId);
      if (item) {
          if (item.count >= amount) {
              item.count -= amount;
              this.sync();
              EventBus.emit(Events.ITEM_UPDATE, { itemId, count: item.count });
              console.log(`[Account] Consumed item ${itemId}, remaining: ${item.count}`);
              return true;
          }
      }
      return false;
  }

  /**
   * [新增] 增加道具数量 (看广告奖励用)
   */
  addItem(itemId, amount = 1) {
      if (!this.userInfo.items) this.userInfo.items = [];

      let item = this.userInfo.items.find(i => i.id === itemId);
      if (item) {
          item.count += amount;
      } else {
          this.userInfo.items.push({ id: itemId, count: amount });
          item = this.userInfo.items.find(i => i.id === itemId);
      }
      
      this.sync();
      EventBus.emit(Events.ITEM_UPDATE, { itemId, count: item.count });
      console.log(`[Account] Added item ${itemId}, total: ${item.count}`);
      return true;
  }

  // --- 签到相关逻辑 ---

  /**
   * 检查今日是否已签到
   * @returns {boolean}
   */
  isCheckedInToday() {
      // 我们使用一个特殊的 item ID 'sys_last_checkin' 来存储时间戳 (放在 count 字段)
      const lastTime = this.getItemCount('sys_last_checkin');
      if (!lastTime) return false;

      const lastDate = new Date(lastTime);
      const today = new Date();

      return lastDate.getFullYear() === today.getFullYear() &&
             lastDate.getMonth() === today.getMonth() &&
             lastDate.getDate() === today.getDate();
  }

  /**
   * 执行签到
   * @param {number} rewardCoins 奖励金币数
   */
  performCheckIn(rewardCoins) {
      // 1. 更新时间戳
      const now = Date.now();
      let item = this.userInfo.items.find(i => i.id === 'sys_last_checkin');
      if (item) {
          item.count = now;
      } else {
          this.userInfo.items.push({ id: 'sys_last_checkin', count: now });
      }

      // 2. 加金币
      this.addCoins(rewardCoins, true); // true = 立即同步
  }

  /**
   * 完成关卡
   * @param {number} levelId 刚刚完成的关卡ID
   * @param {boolean} autoSync 是否立即同步 (默认true)
   * @returns {boolean} 是否升级了
   */
  completeLevel(levelId, autoSync = true) {
      // 确保类型一致
      if (Number(levelId) === Number(this.userInfo.level)) {
          this.userInfo.level++;
          console.log(`[Account] Level Up! Now at level ${this.userInfo.level}`);
          if (autoSync) {
              this.sync();
          }
          return true;
      }
      return false;
  }
}

export default new AccountMgr();
