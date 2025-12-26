

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
   * 判断是否为移动端 Web 环境
   */
  isMobileWeb() {
    if (this.env !== 'web') return false;
    if (typeof navigator === 'undefined') return false;
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  enterFullscreen() {
    if (this.env !== 'web') return;
    try {
      const docEl = document.documentElement;
      const requestFull = docEl.requestFullscreen || 
                          docEl.webkitRequestFullscreen || 
                          docEl.msRequestFullscreen || 
                          docEl.mozRequestFullScreen;
      
      if (requestFull) {
        requestFull.call(docEl).catch(err => {
          console.warn('[Platform] Fullscreen request failed or rejected:', err);
        });
      }
    } catch (e) {
      console.warn('[Platform] Fullscreen API not supported');
    }
  }

  /**
   * 获取登录凭证
   * Web: 返回 UUID (存储在 localStorage)
   * MiniGame: 返回 code
   */
  async getLoginCredentials() {
    if (this.env === 'web') {
        let uuid = localStorage.getItem('finger_soccer_uuid');
        if (!uuid) {
            // 简单生成 UUID
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            localStorage.setItem('finger_soccer_uuid', uuid);
        }
        return { type: 'h5', deviceId: uuid };
    } 
    else {
        // 小游戏环境 (微信/抖音)
        const provider = this.getProvider();
        return new Promise((resolve, reject) => {
            provider.login({
                success: (res) => {
                    resolve({ 
                        type: this.env, 
                        code: res.code 
                    });
                },
                fail: (err) => {
                    console.error('Login failed', err);
                    reject(err);
                }
            });
        });
    }
  }

  /**
   * 获取用户信息 (尝试)
   * 微信现在很难静默获取，抖音可以直接获取
   */
  getUserProfile() {
    return new Promise((resolve) => {
      const provider = this.getProvider();
      
      if (this.env === 'douyin') {
        provider.getUserInfo({
          success: (res) => resolve(res.userInfo),
          fail: () => resolve(null)
        });
      } else {
        // Web 或 微信 (默认不弹窗，等待用户进入游戏后手动同步，或直接用服务器默认值)
        resolve(null); 
      }
    });
  }

  vibrateShort() {
    const provider = this.getProvider();
    if (provider && provider.vibrateShort) {
      provider.vibrateShort({ type: 'light' });
    }
  }

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
