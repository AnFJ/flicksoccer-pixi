
import { GameConfig } from '../config.js';

class Platform {
  constructor() {
    this.env = this.detectEnv();
    console.log(`[Platform] Current Environment: ${this.env}`);
    
    this._gameAds = []; // [新增] 存储游戏场景内的多个广告实例
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

  // --- 广告相关 ---

  /**
   * [修改] 展示游戏场景内的广告 (微信原生模板 / 抖音 Banner)
   * @param {Array<PIXI.DisplayObject>} adNodes 游戏中的广告牌 Pixi 节点数组
   */
  showGameAds(adNodes) {
      if (this.env === 'web') return; // Web 端不处理，直接显示游戏内的图片
      if (!adNodes || adNodes.length === 0) return;

      const provider = this.getProvider();
      
      // 获取配置列表
      let bannerIds = [];
      if (this.env === 'wechat') bannerIds = GameConfig.adConfig.wechat.banners || [];
      if (this.env === 'douyin') bannerIds = GameConfig.adConfig.douyin.banners || [];

      // 清理旧广告
      this.hideGameAds();

      adNodes.forEach((node, index) => {
          if (index >= bannerIds.length) return;
          const adUnitId = bannerIds[index];
          if (!adUnitId || adUnitId.startsWith('adunit-xx')) return;

          // 1. 计算 Pixi 节点在屏幕上的绝对位置和尺寸
          // 注意：Pixi 的 global 坐标系原点是左上角，与小程序的屏幕坐标系一致 (因为我们是全屏 Canvas)
          // 确保此时 SceneManager 已经完成了 resize，node.getBounds() 返回的是真实的屏幕坐标
          const bounds = node.getBounds();
          
          if (!bounds) return;

          // 2. 创建广告
          try {
              let adInstance = null;

              // --- 微信小程序：原生模板广告 (CustomAd) ---
              if (this.env === 'wechat' && provider.createCustomAd) {
                  // 原生模板广告支持 style.left, top, width
                  // fixed: true 建议开启，防止滚动影响（虽然游戏是 Canvas 一般不滚）
                  adInstance = provider.createCustomAd({
                      adUnitId: adUnitId,
                      style: {
                          left: bounds.x,
                          top: bounds.y,
                          width: bounds.width, 
                          // height 通常由模板自适应，无法强制设置，可能会超出 bounds.height
                          // 可以尝试寻找固定比例的模板
                          fixed: true 
                      }
                  });
              }

              // --- 抖音小程序：Banner 广告 ---
              else if (this.env === 'douyin' && provider.createBannerAd) {
                  // 抖音 Banner 宽高比一般是固定的 (约 3:1)，我们设置 width，height 会自适应
                  adInstance = provider.createBannerAd({
                      adUnitId: adUnitId,
                      style: {
                          left: bounds.x,
                          top: bounds.y,
                          width: bounds.width
                      }
                  });
                  
                  // 尝试调整位置使其垂直居中于广告牌 (因为高度不可控)
                  adInstance.onResize(size => {
                      const offsetY = (bounds.height - size.height) / 2;
                      adInstance.style.top = bounds.y + offsetY;
                  });
              }

              if (adInstance) {
                  adInstance.onError(err => {
                      console.warn(`[Platform] Game Ad ${index} Error:`, err);
                  });
                  adInstance.show().catch(err => console.warn('Ad Show Fail', err));
                  this._gameAds.push(adInstance);
              }

          } catch (e) {
              console.error(`[Platform] Create Game Ad ${index} failed`, e);
          }
      });
  }

  /**
   * [修改] 隐藏/销毁游戏场景广告
   */
  hideGameAds() {
      if (this._gameAds.length > 0) {
          this._gameAds.forEach(ad => {
              try {
                  ad.hide();
                  ad.destroy();
              } catch(e) {}
          });
          this._gameAds = [];
      }
  }

  // 旧接口保留为空实现或移除，防止 MenuScene 旧代码调用报错 (虽然 MenuScene 已经清理了)
  showBannerAd() {}
  hideBannerAd() {}

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
        if (wx.openGameClub) {
            wx.openGameClub({
                success: () => console.log('Opened Game Club'),
                fail: (err) => {
                    console.error('Open Game Club failed:', err);
                    this.showToast('无法打开游戏圈');
                }
            });
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
