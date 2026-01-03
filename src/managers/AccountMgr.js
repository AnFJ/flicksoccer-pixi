
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
      this.userInfo.level = data.level || 1; // 确保至少是第一关
      this.userInfo.coins = data.coins;
      
      try {
          this.userInfo.items = JSON.parse(data.items || '[]');
      } catch (e) {
          this.userInfo.items = [];
      }
  }

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
   * [新增] 完成关卡
   * @param {number} levelId 刚刚完成的关卡ID
   * @returns {boolean} 是否升级了
   */
  completeLevel(levelId) {
      if (levelId === this.userInfo.level) {
          this.userInfo.level++;
          this.sync();
          console.log(`[Account] Level Up! Now at level ${this.userInfo.level}`);
          return true;
      }
      return false;
  }
}

export default new AccountMgr();
