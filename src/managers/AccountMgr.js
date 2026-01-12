
import Platform from './Platform.js';
import NetworkMgr from './NetworkMgr.js';
import EventBus from './EventBus.js';
import { Events } from '../constants.js';
import { LevelRewards } from '../config/RewardConfig.js'; 

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
      matchStats: {
          total_pve: 0, total_local: 0, total_online: 0,
          wins_pve: 0, wins_local: 0, wins_online: 0,
          rating_sum_pve: 0, rating_sum_local: 0, rating_sum_online: 0
      },
      // [新增] 每日模式解锁记录 { modeKey: timestamp }
      dailyUnlocks: {} 
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

  // [修改] 增加 userInfoToSync 参数，用于在授权后同步资料
  async silentLogin(userInfoToSync = null) {
    try {
      const creds = await Platform.getLoginCredentials();
      this.tempLoginCredentials = creds; 
      let userData = null;
      if (creds.type === 'h5') {
          userData = await NetworkMgr.post('/api/login/h5', { deviceId: creds.deviceId });
      } else {
          // [修复] 将用户信息放入 payload 发送给后端
          const payload = { platform: creds.type, code: creds.code };
          if (userInfoToSync) {
              payload.userInfo = userInfoToSync;
          }
          userData = await NetworkMgr.post('/api/login/minigame', payload);
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

      // 解析生涯数据
      try {
          this.userInfo.matchStats = typeof data.match_stats === 'string' ? JSON.parse(data.match_stats || '{}') : data.match_stats;
          if (!this.userInfo.matchStats) this.userInfo.matchStats = {};
      } catch(e) {
          this.userInfo.matchStats = {};
      }
      
      // [新增] 解析每日解锁数据
      try {
          this.userInfo.dailyUnlocks = typeof data.daily_unlocks === 'string' ? JSON.parse(data.daily_unlocks || '{}') : data.daily_unlocks;
          if (!this.userInfo.dailyUnlocks) this.userInfo.dailyUnlocks = {};
      } catch(e) {
          this.userInfo.dailyUnlocks = {};
      }
  }

  // 检查某个模式今日是否已解锁
  isModeUnlocked(modeKey) {
      if (!this.userInfo.dailyUnlocks) return false;
      const lastUnlockTime = this.userInfo.dailyUnlocks[modeKey];
      if (!lastUnlockTime) return false;
      
      const lastDate = new Date(lastUnlockTime).toDateString();
      const todayDate = new Date().toDateString();
      
      return lastDate === todayDate;
  }

  // 解锁某个模式
  unlockMode(modeKey) {
      if (!this.userInfo.dailyUnlocks) this.userInfo.dailyUnlocks = {};
      this.userInfo.dailyUnlocks[modeKey] = Date.now();
      this.saveToCache();
      // [修改] 解锁是关键行为，建议同步到服务器
      this.sync(); 
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
          unlockedThemes: this.userInfo.unlockedThemes,
          dailyUnlocks: this.userInfo.dailyUnlocks // [新增]
      });
  }

  // 提交比赛结果
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
          
          // 检查该等级是否有奖励
          let unlockedReward = null;
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
      // [关键修复] 将 profile 传给 silentLogin 以便同步给服务器
      await this.silentLogin(profile);
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

  performCheckIn(rewardCoins = 0) {
      this.userInfo.checkinHistory.push(Date.now());
      if (rewardCoins > 0) this.addCoins(rewardCoins, true); 
      else this.sync(); // 即使没有硬币(例如抽奖后发放)，也要记录签到时间
  }

  // [新增] 处理抽奖奖励
  processLotteryReward(prize) {
      if (prize.type === 'coin') {
          this.addCoins(prize.value);
      } else if (prize.type === 'skill') {
          this.addItem(prize.value, prize.count);
      } else if (prize.type === 'unlock_mode') {
          this.unlockMode(prize.value);
      }
      // 记录签到
      this.performCheckIn(0); 
  }

  enterOfflineMode() {
      this.userInfo.id = 'offline_' + Date.now();
      this.userInfo.nickname = '离线玩家';
      this.userInfo.coins = 999;
      this.userInfo.theme = { striker: 1, field: 1, ball: 1, formationId: 0 };
      this.userInfo.unlockedThemes = { striker: [1], field: [1], ball: [1], formation: [0] };
      this.userInfo.matchStats = {};
      this.userInfo.dailyUnlocks = {};
      this.isLoggedIn = true;
      this.saveToCache(); 
  }
}
export default new AccountMgr();
