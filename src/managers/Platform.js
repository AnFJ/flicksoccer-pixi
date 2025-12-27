
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
          console.warn('[Platform] Fullscreen API not supported');
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
   * 获取用户信息
   * 必须在用户点击按钮的回调中调用 (特别是微信)
   */
  getUserProfile() {
    return new Promise((resolve) => {
      const provider = this.getProvider();
      
      if (this.env === 'wechat') {
          // 微信: 必须使用 wx.getUserProfile 才能获取昵称头像
          // 必须由点击事件触发
          provider.getUserProfile({
              desc: '用于展示玩家头像和昵称',
              success: (res) => {
                  console.log('[Platform] WeChat profile success:', res.userInfo);
                  resolve(res.userInfo);
              },
              fail: (err) => {
                  console.warn('[Platform] WeChat profile failed/rejected:', err);
                  resolve(null);
              }
          });
      }
      else if (this.env === 'douyin') {
        // 抖音: 使用 tt.getUserInfo (可能需要 scope 授权)
        provider.getUserInfo({
          success: (res) => {
              console.log('[Platform] Douyin profile success:', res.userInfo);
              resolve(res.userInfo);
          },
          fail: (err) => {
              console.warn('[Platform] Douyin profile failed:', err);
              resolve(null);
          }
        });
      } else {
        // Web 环境不获取真实资料
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
