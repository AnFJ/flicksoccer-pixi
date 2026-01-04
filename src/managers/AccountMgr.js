
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
      items: [],
      checkinHistory: [],
      // [新增] 主题配置
      theme: {
          striker: 1, // 1-7
          field: 1,   // 1-4
          ball: 1     // 1-3
      }
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
      this.userInfo.checkinHistory = [];
      this.userInfo.theme = { striker: 1, field: 1, ball: 1 };
      this.isLoggedIn = true;
      this.isNewUser = false; 
  }

  parseUserData(data) {
      this.userInfo.id = data.user_id;
      this.userInfo.nickname = data.nickname;
      this.userInfo.avatarUrl = data.avatar_url;
      this.userInfo.level = parseInt(data.level) || 1; 
      this.userInfo.coins = parseInt(data.coins) || 0;
      
      try {
          this.userInfo.items = JSON.parse(data.items || '[]');
      } catch (e) {
          this.userInfo.items = [];
      }

      try {
          const history = JSON.parse(data.checkin_history || '[]');
          this.userInfo.checkinHistory = Array.isArray(history) ? history : [];
      } catch (e) {
          this.userInfo.checkinHistory = [];
      }

      // [新增] 解析 theme 字段
      try {
          const theme = JSON.parse(data.theme || '{}');
          // 确保有默认值
          this.userInfo.theme = {
              striker: theme.striker || 1,
              field: theme.field || 1,
              ball: theme.ball || 1
          };
      } catch (e) {
          this.userInfo.theme = { striker: 1, field: 1, ball: 1 };
      }
  }

  async sync() {
      if (!this.isLoggedIn || this.userInfo.id.startsWith('offline_')) return;
      
      console.log('[Account] Syncing data. Theme:', this.userInfo.theme);
      
      // [修改] 同步时带上 theme
      await NetworkMgr.post('/api/user/update', {
          userId: this.userInfo.id,
          coins: this.userInfo.coins,
          level: this.userInfo.level,
          items: this.userInfo.items,
          checkinHistory: this.userInfo.checkinHistory,
          theme: this.userInfo.theme // 新增
      });
  }

  /**
   * [新增] 更新主题
   */
  updateTheme(newTheme) {
      this.userInfo.theme = { ...this.userInfo.theme, ...newTheme };
      this.sync();
      console.log('[Account] Theme updated:', this.userInfo.theme);
  }

  /**
   * 增加金币
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
              return true;
          }
      }
      return false;
  }

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
      return true;
  }

  // --- 签到相关逻辑 ---
  isCheckedInToday() {
      if (!Array.isArray(this.userInfo.checkinHistory) || this.userInfo.checkinHistory.length === 0) {
          return false;
      }
      const lastTime = this.userInfo.checkinHistory[this.userInfo.checkinHistory.length - 1];
      if (!lastTime) return false;

      const lastDate = new Date(lastTime);
      const today = new Date();

      return lastDate.getFullYear() === today.getFullYear() &&
             lastDate.getMonth() === today.getMonth() &&
             lastDate.getDate() === today.getDate();
  }

  performCheckIn(rewardCoins) {
      if (!Array.isArray(this.userInfo.checkinHistory)) {
          this.userInfo.checkinHistory = [];
      }
      const now = Date.now();
      this.userInfo.checkinHistory.push(now);

      if (this.userInfo.checkinHistory.length > 15) {
          this.userInfo.checkinHistory.shift(); 
      }
      this.addCoins(rewardCoins, true); 
  }

  completeLevel(levelId, autoSync = true) {
      if (Number(levelId) === Number(this.userInfo.level)) {
          this.userInfo.level++;
          if (autoSync) {
              this.sync();
          }
          return true;
      }
      return false;
  }
}

export default new AccountMgr();
