
import { GameConfig } from '../config.js';

class Platform {
  constructor() {
    this.env = this.detectEnv();
    console.log(`[Platform] Current Environment: ${this.env}`);
    
    this._bannerAd = null; // 缓存 Banner 广告实例
  }

  detectEnv() {
    if (typeof tt !== 'undefined') return 'douyin';
    if (typeof wx !== 'undefined') return 'wechat';
    return 'web';
  }

  /**
   * 跨平台持久化存储：设置
   */
  setStorage(key, value) {
    const provider = this.getProvider();
    if (provider) {
      try {
        provider.setStorageSync(key, value);
      } catch (e) {
        console.error('[Platform] setStorage failed', e);
      }
    } else {
      localStorage.setItem(key, value);
    }
  }

  /**
   * 跨平台持久化存储：获取
   */
  getStorage(key) {
    const provider = this.getProvider();
    if (provider) {
      try {
        return provider.getStorageSync(key);
      } catch (e) {
        return null;
      }
    } else {
      return localStorage.getItem(key);
    }
  }

  /**
   * 跨平台持久化存储：删除
   */
  removeStorage(key) {
    const provider = this.getProvider();
    if (provider) {
      try {
        provider.removeStorageSync(key);
      } catch (e) { }
    } else {
      localStorage.removeItem(key);
    }
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
   */
  async getLoginCredentials() {
    if (this.env === 'web') {
        let uuid = this.getStorage('finger_soccer_uuid');
        if (!uuid) {
            // 简单生成 UUID
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            this.setStorage('finger_soccer_uuid', uuid);
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
   */
  getUserProfile() {
    return new Promise((resolve) => {
      const provider = this.getProvider();
      
      if (this.env === 'wechat') {
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

  /**
   * [新增] 展示 Banner 广告 (底部居中)
   */
  showBannerAd() {
      if (this.env === 'web') return;
      const provider = this.getProvider();
      if (!provider || !provider.createBannerAd) return;

      // 获取当前平台的 AdUnitId
      let adUnitId = '';
      if (this.env === 'wechat') adUnitId = GameConfig.adConfig.wechat.bannerId;
      if (this.env === 'douyin') adUnitId = GameConfig.adConfig.douyin.bannerId;

      if (!adUnitId || adUnitId.startsWith('adunit-xx')) {
          console.warn('[Platform] Banner AdUnitId not configured.');
          return;
      }

      // 如果广告已经存在且是同一个ID，直接展示
      if (this._bannerAd) {
          this._bannerAd.show().catch(err => console.error(err));
          return;
      }

      try {
          // 获取屏幕信息用于定位
          const sysInfo = provider.getSystemInfoSync();
          const screenWidth = sysInfo.windowWidth;
          const screenHeight = sysInfo.windowHeight;
          const targetW = 300; // 建议宽度

          // 创建广告实例
          this._bannerAd = provider.createBannerAd({
              adUnitId: adUnitId,
              adIntervals: 30, // 抖音支持自动刷新
              style: {
                  left: (screenWidth - targetW) / 2,
                  top: screenHeight - 100, // 初始位置，加载后修正
                  width: targetW
              }
          });

          // 尺寸调整回调 (微信/抖音加载成功后会重置 style.height)
          this._bannerAd.onResize(size => {
              // 重新居中并贴底
              this._bannerAd.style.left = (screenWidth - size.width) / 2;
              this._bannerAd.style.top = screenHeight - size.height; // 贴底
          });

          this._bannerAd.onError(err => {
              console.error('[Platform] Banner Ad Error:', err);
          });

          this._bannerAd.show();
          console.log('[Platform] Banner Ad Created and Shown');

      } catch (e) {
          console.error('[Platform] Create Banner Ad failed', e);
      }
  }

  /**
   * [新增] 隐藏/销毁 Banner 广告
   * @param {boolean} destroy 是否彻底销毁 (默认 false，仅隐藏)
   */
  hideBannerAd(destroy = false) {
      if (this._bannerAd) {
          this._bannerAd.hide();
          if (destroy) {
              this._bannerAd.destroy();
              this._bannerAd = null;
          }
      }
  }

  /**
   * [新增] 跳转其他小程序 (用于 AdBoard 互推)
   * @param {string} appId 目标小程序 AppID
   * @param {string} path 目标页面路径
   */
  navigateToMiniProgram(appId, path = '') {
      if (!appId) return;
      
      const provider = this.getProvider();
      if (provider && provider.navigateToMiniProgram) {
          provider.navigateToMiniProgram({
              appId: appId,
              path: path,
              success(res) {
                  console.log('[Platform] Navigate success');
              },
              fail(err) {
                  console.warn('[Platform] Navigate failed', err);
                  // 抖音有时候需要用 showToast 提示
                  if (this.env === 'douyin') {
                      this.showToast('跳转失败，请稍后重试');
                  }
              }
          });
      } else {
          console.log(`[Platform] Mock Navigate to ${appId}`);
          this.showToast('跳转小程序: ' + appId);
      }
  }

  /**
   * [新增] 处理社交按钮逻辑 (微信游戏圈/抖音侧边栏/H5分享)
   */
  handleSocialAction() {
    console.log('[Platform] Handling social action...');

    if (this.env === 'wechat') {
        const wx = this.getProvider();
        // 微信小游戏：打开游戏圈
        if (wx.createPageManager) {
            const pageManager = wx.createPageManager();
            pageManager.load({
              openlink: '-SSEykJvFV3pORt5kTNpSxd30-TvafFgaZqHSUv3S6kVRb84TEE5RwHDiSF5f7nrJ6jVNpIsfaLHpurmt0qQJ2oX03HgDnc57u_Jz-MxLhkW8BahDJx2uHr0THo_701Wfg8QgkLfZchjnilapXRsz5r7YJsb36Aq6fN0F-H_QzDNoqaZBCiHIGX36PZuElKlWwSxqwIX4ruc0zAVFyp1EE3MCH2VXe4icADWEwO7P0LDqZHaESNstcVG-EskNEyncO_k-AE6oq542gY2m0IUAwEGxclH4yCHpNHKRnkeVFqYUbWxMY7Gj1h5o-c7agzhkD_ia8qOF6x8NtcEnxbuXw', // 由不同渠道获得的OPENLINK值
            }).then((res) => {
              // 加载成功，res 可能携带不同活动、功能返回的特殊回包信息（具体请参阅渠道说明）
              console.log(res);

              // 加载成功后按需显示
              pageManager.show();

            }).catch((err) => {
              // 加载失败，请查阅 err 给出的错误信息
              console.error(err);
              this.showToast('无法打开游戏圈');
            })
        } else if (wx.createGameClubButton) {
             // 兜底：如果只有创建按钮接口，通常比较麻烦，这里提示用户
             this.showToast('请使用右上角菜单进入游戏圈');
        } else {
            this.showToast('当前版本不支持游戏圈');
        }

    } else if (this.env === 'douyin') {
        const tt = this.getProvider();
        // 抖音小游戏：跳转侧边栏复访
        // 官方文档：tt.navigateToScene({ scene: "sidebar" })
        if (tt.navigateToScene) {
            tt.navigateToScene({
                scene: "sidebar",
                success: (res) => {
                    console.log('Navigate to sidebar success', res);
                },
                fail: (err) => {
                    console.warn('Navigate to sidebar failed', err);
                    this.showToast('侧边栏功能暂不可用');
                }
            });
        } else {
            this.showToast('请点击右上角收藏游戏');
        }

    } else if (this.env === 'web') {
        // H5：复制链接
        const url = window.location.href;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(() => {
                this.showToast('链接已复制，快去分享吧！');
            }).catch(() => {
                this.showToast('复制失败，请手动分享');
            });
        } else {
            this.showToast('请使用浏览器自带分享功能');
        }
    }
  }
}

export default new Platform();
