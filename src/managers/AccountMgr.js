
import Platform from './Platform.js';
import NetworkMgr from './NetworkMgr.js';
import EventBus from './EventBus.js';
import { Events } from '../constants.js';
import { LevelRewards } from '../config/RewardConfig.js'; // [新增]

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
      unlockedThemes: {
          striker: [1],
          field: [1],
          ball: [1],
          formation: [0]
      },
      // [新增] 本地缓存的生涯数据
      matchStats: {
          total_pve: 0, total_local: 0, total_online: 0,
          wins_pve: 0, wins_local: 0, wins_online: 0,
          rating_sum_pve: 0, rating_sum_local: 0, rating_sum_online: 0
      }
    };
    this.isLoggedIn = false;
    this.isNewUser = false;
    this.tempLoginCredentials = null;
  }

  loadFromCache() {
      try {
          const cachedStr = Platform.getStorage(CACHE_KEY);
          if (cachedStr) {
              const data = JSON.parse(cachedStr);
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

  saveToCache() {
      try {
          Platform.setStorage(CACHE_KEY, JSON.stringify(this.userInfo));
      } catch (e) {
          console.warn('[AccountMgr] Save cache failed', e);
      }
  }

  async silentLogin() {
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
          this.isNewUser = !!userData.is_new_user; 
          this.saveToCache();
          EventBus.emit(Events.USER_DATA_REFRESHED);
      } else {
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

      try {
          const unlocked = typeof data.unlocked_themes === 'string' ? JSON.parse(data.unlocked_themes || '{}') : data.unlocked_themes;
          this.userInfo.unlockedThemes = {
              striker: unlocked?.striker || [1],
              field: unlocked?.field || [1],
              ball: unlocked?.ball || [1],
              formation: unlocked?.formation || [0]
          };
      } catch (e) {
          this.userInfo.unlockedThemes = { striker: [1], field: [1], ball: [1], formation: [0] };
      }

      // [新增] 解析生涯数据
      try {
          this.userInfo.matchStats = typeof data.match_stats === 'string' ? JSON.parse(data.match_stats || '{}') : data.match_stats;
          if (!this.userInfo.matchStats) this.userInfo.matchStats = {};
      } catch(e) {
          this.userInfo.matchStats = {};
      }
  }

  async sync() {
      if (!this.isLoggedIn || this.userInfo.id.startsWith('offline_')) return;
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

  // [新增] 提交比赛结果
  async recordMatch(matchType, isWin, rating, matchData) {
      if (this.userInfo.id.startsWith('offline_')) return;

      // 更新本地状态 (乐观更新)
      const stats = this.userInfo.matchStats || {};
      const keyTotal = `total_${matchType.replace('pvp_', '')}`;
      const keyWins = `wins_${matchType.replace('pvp_', '')}`;
      const keyRating = `rating_sum_${matchType.replace('pvp_', '')}`;

      stats[keyTotal] = (stats[keyTotal] || 0) + 1;
      if (isWin) stats[keyWins] = (stats[keyWins] || 0) + 1;
      stats[keyRating] = (stats[keyRating] || 0) + rating;

      this.saveToCache();

      // 发送给服务器
      await NetworkMgr.post('/api/match/record', {
          userId: this.userInfo.id,
          matchType: matchType,
          isWin: isWin,
          rating: rating,
          matchData: matchData
      });
  }

  /**
   * 通关逻辑
   * @returns {Object|null} 如果有解锁的奖励，返回奖励对象 {type, id, name...}
   */
  completeLevel(level, isFail) {
      if (!isFail && level === this.userInfo.level) {
          this.userInfo.level++;
          
          // [核心新增] 检查该等级是否有奖励
          let unlockedReward = null;
          // 注意：奖励是通关 level 后获得的，比如通关第2关，等级变为3，解锁奖励LevelRewards[2]或[3]?
          // 通常是 "通关第N关，解锁第N关奖励"。此时 userInfo.level 已经 +1 了。
          // 所以我们检查 level (即刚通关的那个关卡号)
          const reward = LevelRewards[level];
          
          if (reward) {
              if (reward.type === 'skill') {
                  this.addItem(reward.id, reward.count);
                  unlockedReward = reward;
              } else {
                  // 皮肤类：检查是否已解锁，未解锁则解锁
                  const isUnlocked = this.isThemeUnlocked(reward.type, reward.id);
                  if (!isUnlocked) {
                      this.unlockTheme(reward.type, reward.id);
                      unlockedReward = reward;
                  }
              }
          }

          this.saveToCache(); 
          return unlockedReward;
      }
      return null;
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
      // [修复] AccountMgr.getItemCount -> this.getItemCount
      EventBus.emit(Events.ITEM_UPDATE, { itemId, count: this.getItemCount(itemId) });
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
      this.userInfo.matchStats = {};
      this.isLoggedIn = true;
      this.saveToCache(); 
  }
}
export default new AccountMgr();
