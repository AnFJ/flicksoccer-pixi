class Platform {
  constructor() {
    this.env = this.detectEnv();
    console.log(`[Platform] Current Environment: ${this.env}`);
  }

  detectEnv() {
    if (typeof tt !== 'undefined') return 'douyin';
    if (typeof wx !== 'undefined') return 'wechat';
    return 'web';
  }

  /**
   * 登录
   * @returns {Promise<{code: string, userInfo: any}>}
   */
  login() {
    return new Promise((resolve, reject) => {
      const provider = this.getProvider();
      if (!provider) {
        // Web 模拟登录
        resolve({ code: 'mock_code', userInfo: { nickName: 'Player1' } });
        return;
      }

      provider.login({
        success: (res) => {
          resolve(res);
        },
        fail: (err) => {
          reject(err);
        }
      });
    });
  }

  /**
   * 获取用户信息
   */
  getUserProfile() {
    return new Promise((resolve, reject) => {
      const provider = this.getProvider();
      if (this.env === 'wechat') {
        // 微信新版通常不需要 getUserProfile 即可玩游戏，这里仅作示例
        // 实际开发建议使用头像昵称填写能力
        resolve({ nickName: '微信玩家', avatarUrl: '' });
      } else if (this.env === 'douyin') {
        provider.getUserInfo({
          success: (res) => resolve(res.userInfo),
          fail: reject
        });
      } else {
        resolve({ nickName: 'Web玩家', avatarUrl: '' });
      }
    });
  }

  /**
   * 短震动反馈
   */
  vibrateShort() {
    const provider = this.getProvider();
    if (provider && provider.vibrateShort) {
      provider.vibrateShort({ type: 'light' });
    }
  }

  /**
   * 显示 Toast
   */
  showToast(title) {
    const provider = this.getProvider();
    if (provider && provider.showToast) {
      provider.showToast({ title, icon: 'none' });
    } else {
      console.log(`[Toast] ${title}`);
    }
  }

  getProvider() {
    if (this.env === 'douyin') return tt;
    if (this.env === 'wechat') return wx;
    return null;
  }
}

export default new Platform();