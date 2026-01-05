
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
      level: 1,
      coins: 0,
      items: [],
      checkinHistory: [],
      theme: {
          striker: 1,
          field: 1,
          ball: 1,
          formationId: 0
      }
    };
    this.isLoggedIn = false;
    this.isNewUser = false;
    this.tempLoginCredentials = null;
  }

  async silentLogin() {
    if (this.isLoggedIn) return this.userInfo;
    try {
      const creds = await Platform.getLoginCredentials();
      this.tempLoginCredentials = creds; 
      let userData = null;
      if (creds.type === 'h5') {
          userData = await NetworkMgr.post('/api/login/h5', { deviceId: creds.deviceId });
      } else {
          userData = await NetworkMgr.post('/api/login/minigame', { platform: creds.type, code: creds.code });
      }

      if (userData && !userData.error) {
          this.parseUserData(userData);
          this.isLoggedIn = true;
      } else {
          this.enterOfflineMode();
      }
      return this.userInfo;
    } catch (e) {
      this.enterOfflineMode();
      return this.userInfo;
    }
  }

  parseUserData(data) {
      this.userInfo.id = data.user_id;
      this.userInfo.nickname = data.nickname;
      this.userInfo.avatarUrl = data.avatar_url;
      this.userInfo.level = parseInt(data.level) || 1; 
      this.userInfo.coins = parseInt(data.coins) || 0;
      
      try { this.userInfo.items = JSON.parse(data.items || '[]'); } catch (e) { this.userInfo.items = []; }
      try { this.userInfo.checkinHistory = JSON.parse(data.checkin_history || '[]'); } catch (e) { this.userInfo.checkinHistory = []; }

      // 解析 theme
      try {
          const theme = JSON.parse(data.theme || '{}');
          this.userInfo.theme = {
              striker: theme.striker || 1,
              field: theme.field || 1,
              ball: theme.ball || 1,
              formationId: theme.formationId !== undefined ? theme.formationId : (data.formation_id || 0)
          };
      } catch (e) {
          this.userInfo.theme = { striker: 1, field: 1, ball: 1, formationId: 0 };
      }
  }

  async sync() {
      if (!this.isLoggedIn || this.userInfo.id.startsWith('offline_')) return;
      await NetworkMgr.post('/api/user/update', {
          userId: this.userInfo.id,
          coins: this.userInfo.coins,
          level: this.userInfo.level,
          items: this.userInfo.items,
          checkinHistory: this.userInfo.checkinHistory,
          theme: this.userInfo.theme
      });
  }

  updateTheme(newTheme) {
      this.userInfo.theme = { ...this.userInfo.theme, ...newTheme };
      this.sync();
  }

  updateFormation(id) {
      this.userInfo.theme.formationId = id;
      this.sync();
  }

  addCoins(amount, autoSync = true) {
    this.userInfo.coins += amount;
    if (autoSync) this.sync(); 
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
      const item = this.userInfo.items.find(i => i.id === itemId);
      return item ? item.count : 0;
  }

  consumeItem(itemId, amount = 1) {
      const item = this.userInfo.items.find(i => i.id === itemId);
      if (item && item.count >= amount) {
          item.count -= amount;
          this.sync();
          EventBus.emit(Events.ITEM_UPDATE, { itemId, count: item.count });
          return true;
      }
      return false;
  }

  addItem(itemId, amount = 1) {
      let item = this.userInfo.items.find(i => i.id === itemId);
      if (item) item.count += amount;
      else this.userInfo.items.push({ id: itemId, count: amount });
      this.sync();
      EventBus.emit(Events.ITEM_UPDATE, { itemId, count: AccountMgr.getItemCount(itemId) });
      return true;
  }

  isCheckedInToday() {
      if (!this.userInfo.checkinHistory.length) return false;
      const lastDate = new Date(this.userInfo.checkinHistory[this.userInfo.checkinHistory.length - 1]);
      const today = new Date();
      return lastDate.toDateString() === today.toDateString();
  }

  performCheckIn(rewardCoins) {
      this.userInfo.checkinHistory.push(Date.now());
      this.addCoins(rewardCoins, true); 
  }

  enterOfflineMode() {
      this.userInfo.id = 'offline_' + Date.now();
      this.userInfo.nickname = '离线玩家';
      this.userInfo.coins = 999;
      this.userInfo.theme = { striker: 1, field: 1, ball: 1, formationId: 0 };
      this.isLoggedIn = true;
  }
}
export default new AccountMgr();
