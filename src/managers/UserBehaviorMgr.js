
import Platform from './Platform.js';
import AccountMgr from './AccountMgr.js';

class UserBehaviorMgr {
  constructor() {
    this.logs = [];
    this.startTime = Date.now();
    this.MAX_LOGS = 50; // 批量上报阈值
  }

  /**
   * 记录用户行为
   * @param {string} actionType - 行为类型 (SYSTEM, PROFILE, SOCIAL, THEME, CHECKIN, GAME)
   * @param {string} actionName - 具体行为名称
   * @param {Object} details - 详细信息 (可选)
   */
  log(actionType, actionName, details = {}) {
    const log = {
      seq: this.logs.length + 1,
      type: actionType,
      name: actionName,
      details: details,
      timestamp: Date.now()
    };
    
    this.logs.push(log);
    console.log(`[Behavior] ${actionType} - ${actionName}`, details);

    // 达到阈值自动上报
    if (this.logs.length >= this.MAX_LOGS) {
      this.flush();
    }
  }

  /**
   * 上报日志到服务器
   */
  async flush() {
    if (this.logs.length === 0) return;

    const logsToSend = [...this.logs];
    this.logs = []; // 清空本地缓存

    const user = AccountMgr.userInfo;
    const reportData = {
      userId: user.id || 'unknown',
      nickname: user.nickname || 'Guest',
      enterTime: this.startTime,
      leaveTime: Date.now(), // 上报时的时间作为当前时间点
      actions: logsToSend
    };

    try {
      await Platform.reportUserBehavior(reportData);
    } catch (e) {
      console.warn('[Behavior] Report failed', e);
      // 失败后放回队列头部 (可选，为了简单起见暂不放回，避免死循环)
    }
  }
}

export default new UserBehaviorMgr();
