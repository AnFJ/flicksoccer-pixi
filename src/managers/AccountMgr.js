
import Platform from './Platform.js';
import NetworkMgr from './NetworkMgr.js';
import EventBus from './EventBus.js';
import { Events } from '../constants.js';

const CACHE_KEY = 'finger_soccer_user_data';

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
      },
      // 默认解锁: 棋子1, 球场1, 足球1, 阵型0
      unlockedThemes: {
          striker: [1],
          field: [1],
          ball: [1],
          formation: [0]
      }
    };
    this.isLoggedIn = false;
    this.isNewUser = false;
    this.tempLoginCredentials = null;
  }

  // [新增] 从本地缓存加载
  loadFromCache() {
      try {
          const cachedStr = Platform.getStorage(CACHE_KEY);
          if (cachedStr) {
              const data = JSON.parse(cachedStr);
              // 简单的格式校验
              if (data && data.id) {
                  this.userInfo = data;
                  this.isLoggedIn = true;
                  console.log('[AccountMgr] Loaded from cache:', this.userInfo.nickname);
                  return true;
              }
          }
      } catch (e) {
          console.warn('[AccountMgr] Load cache failed', e);
      }
      return false;
  }

  // [新增] 保存到本地缓存
  saveToCache() {
      try {
          Platform.setStorage(CACHE_KEY, JSON.stringify(this.userInfo));
      } catch (e) {
          console.warn('[AccountMgr] Save cache failed', e);
      }
  }

  async silentLogin() {
    // 注意：即使 isLoggedIn 为 true，我们也允许再次调用以刷新数据（后台静默更新）
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
          this.isNewUser = !!userData.is_new_user; // 记录是否新用户

          // 登录成功后，保存最新数据到缓存
          this.saveToCache();
          
          // 广播数据更新事件 (如果已经在 MenuScene，界面会刷新)
          EventBus.emit(Events.USER_DATA_REFRESHED);
      } else {
          // 如果网络请求失败但本地有缓存，保持本地缓存状态，不进入离线模式覆盖数据
          if (!this.isLoggedIn) {
             this.enterOfflineMode();
          }
      }
      return this.userInfo;
    } catch (e) {
      console.error('[AccountMgr] Login error:', e);
      if (!this.isLoggedIn) {
          this.enterOfflineMode();
      }
      return this.userInfo;
    }
  }

  parseUserData(data) {
      this.userInfo.id = data.user_id;
      this.userInfo.nickname = data.nickname;
      this.userInfo.avatarUrl = data.avatar_url;
      this.userInfo.level = parseInt(data.level) || 1; 
      this.userInfo.coins = parseInt(data.coins) || 0;
      
      try { this.userInfo.items = typeof data.items === 'string' ? JSON.parse(data.items || '[]') : data.items; } catch (e) { this.userInfo.items = []; }
      try { this.userInfo.checkinHistory = typeof data.checkin_history === 'string' ? JSON.parse(data.checkin_history || '[]') : data.checkin_history; } catch (e) { this.userInfo.checkinHistory = []; }

      // 解析 theme
      try {
          const theme = typeof data.theme === 'string' ? JSON.parse(data.theme || '{}') : data.theme;
          this.userInfo.theme = {
              striker: theme.striker || 1,
              field: theme.field || 1,
              ball: theme.ball || 1,
              formationId: theme.formationId !== undefined ? theme.formationId : (data.formation_id || 0)
          };
      } catch (e) {
          this.userInfo.theme = { striker: 1, field: 1, ball: 1, formationId: 0 };
      }

      // [新增] 解析 unlocked_themes
      try {
          const unlocked = typeof data.unlocked_themes === 'string' ? JSON.parse(data.unlocked_themes || '{}') : data.unlocked_themes;
          // 合并默认值，防止缺失 Key
          this.userInfo.unlockedThemes = {
              striker: unlocked?.striker || [1],
              field: unlocked?.field || [1],
              ball: unlocked?.ball || [1],
              formation: unlocked?.formation || [0]
          };
      } catch (e) {
          this.userInfo.unlockedThemes = { striker: [1], field: [1], ball: [1], formation: [0] };
      }
  }

  async sync() {
      if (!this.isLoggedIn || this.userInfo.id.startsWith('offline_')) return;
      
      // 每次同步前先保存到本地缓存，保证本地是最新的
      this.saveToCache();

      await NetworkMgr.post('/api/user/update', {
          userId: this.userInfo.id,
          coins: this.userInfo.coins,
          level: this.userInfo.level,
          items: this.userInfo.items,
          checkinHistory: this.userInfo.checkinHistory,
          theme: this.userInfo.theme,
          unlockedThemes: this.userInfo.unlockedThemes 
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

  async updateUserProfile(profile) {
      this.userInfo.nickname = profile.nickName;
      this.userInfo.avatarUrl = profile.avatarUrl;
      // 重新触发登录接口以同步资料到服务器
      await this.silentLogin();
  }

  isThemeUnlocked(type, id) {
      const list = this.userInfo.unlockedThemes[type] || [];
      return list.includes(id);
  }

  unlockTheme(type, id) {
      if (!this.userInfo.unlockedThemes[type]) {
          this.userInfo.unlockedThemes[type] = [];
      }
      if (!this.userInfo.unlockedThemes[type].includes(id)) {
          this.userInfo.unlockedThemes[type].push(id);
          this.sync();
          return true;
      }
      return false;
  }

  addCoins(amount, autoSync = true) {
    this.userInfo.coins += amount;
    if (autoSync) this.sync(); 
    // 触发事件通知 UI
    EventBus.emit(Events.USER_DATA_REFRESHED);
  }

  consumeCoins(amount) {
    if (this.userInfo.coins >= amount) {
      this.userInfo.coins -= amount;
      this.sync();
      EventBus.emit(Events.USER_DATA_REFRESHED);
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
      this.userInfo.unlockedThemes = { striker: [1], field: [1], ball: [1], formation: [0] };
      this.isLoggedIn = true;
      this.saveToCache(); // 离线模式也缓存一下
  }
}
export default new AccountMgr();
