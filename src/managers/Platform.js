
import { GameConfig } from '../config.js';

class Platform {
  constructor() {
    this.env = this.detectEnv();
    console.log(`[Platform] Current Environment: ${this.env}`);
    
    this._gameAds = []; // 存储游戏场景内的多个Banner/Custom广告实例
    this._rewardedAds = {}; // [新增] 缓存激励视频广告实例 (key: adUnitId)
    
    // [新增] 存储待处理的邀请信息 (从小游戏启动参数获取)
    this.pendingInvite = null; 
    
    // 初始化时立即检查启动参数
    this.checkLaunchOptions();
  }

  detectEnv() {
    if (typeof tt !== 'undefined') return 'douyin';
    if (typeof wx !== 'undefined') return 'wechat';
    return 'web';
  }

  /**
   * [新增] 检查小游戏启动参数
   */
  checkLaunchOptions() {
      const provider = this.getProvider();
      if (provider && provider.getLaunchOptionsSync) {
          try {
              const options = provider.getLaunchOptionsSync();
              console.log('[Platform] Launch Options:', options);
              
              if (options && options.query && options.query.roomId) {
                  this.pendingInvite = {
                      roomId: options.query.roomId,
                      fromUser: options.query.fromUser
                  };
                  console.log('[Platform] Found pending invite:', this.pendingInvite);
              }
          } catch (e) {
              console.warn('[Platform] Get launch options failed', e);
          }
      } else if (this.env === 'web') {
          // Web 端测试逻辑：解析 URL 参数
          const urlParams = new URLSearchParams(window.location.search);
          const roomId = urlParams.get('roomId');
          if (roomId) {
              this.pendingInvite = { roomId };
          }
      }
  }

  /**
   * [新增] 分享房间邀请
   * @param {string} roomId 
   */
  shareRoom(roomId) {
      const provider = this.getProvider();
      const title = "来《弹指足球》和我一决高下！";
      // 封面图可以使用截图或者固定图片，这里暂未指定 imageUrl，使用默认截图
      const query = `roomId=${roomId}&fromUser=share`; 

      if (this.env === 'wechat') {
          // 微信小游戏：主动拉起转发（通常需要通过按钮 open-type="share"，但在 Canvas 只能调用 API）
          // 注意：wx.shareAppMessage 在较新版本通常需要并在 onShareAppMessage 中配置
          // 我们这里尝试主动调用，如果失败则提示用户点击右上角
          
          // 1. 设置被动转发配置 (右上角菜单转发)
          provider.onShareAppMessage(() => {
              return {
                  title: title,
                  query: query
              };
          });

          // 2. 尝试主动拉起 (部分基础库支持，或提示)
          if (provider.shareAppMessage) {
              provider.shareAppMessage({
                  title: title,
                  query: query
              });
          } else {
              this.showToast("请点击右上角 '...' 发送给朋友");
          }

      } else if (this.env === 'douyin') {
          // 抖音小游戏
          if (provider.shareAppMessage) {
              provider.shareAppMessage({
                  title: title,
                  query: query,
                  success() {
                      console.log('Share success');
                  },
                  fail(e) {
                      console.log('Share failed', e);
                  }
              });
          }
      } else {
          // Web 环境：复制链接
          const url = `${window.location.origin}${window.location.pathname}?roomId=${roomId}`;
          if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText(url).then(() => {
                  this.showToast('房间链接已复制！');
              });
          } else {
              this.showToast('请复制链接分享: ' + url);
          }
      }
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
   * 展示游戏场景内的广告 (微信原生模板 / 抖音 Banner)
   * @param {Array<PIXI.DisplayObject>} adNodes 游戏中的广告牌 Pixi 节点数组
   */
  showGameAds(adNodes) {
      if (this.env === 'web') return; 
      if (!adNodes || adNodes.length === 0) return;

      const provider = this.getProvider();
      
      let bannerIds = [];
      if (this.env === 'wechat') bannerIds = GameConfig.adConfig.wechat.banners || [];
      if (this.env === 'douyin') bannerIds = GameConfig.adConfig.douyin.banners || [];

      this.hideGameAds();

      adNodes.forEach((node, index) => {
          if (index >= bannerIds.length) return;
          const adUnitId = bannerIds[index];
          if (!adUnitId || adUnitId.startsWith('adunit-xx')) return;

          const bounds = node.getBounds();
          if (!bounds) return;

          try {
              let adInstance = null;

              if (this.env === 'wechat' && provider.createCustomAd) {
                  adInstance = provider.createCustomAd({
                      adUnitId: adUnitId,
                      style: {
                          left: bounds.x,
                          top: bounds.y,
                          width: bounds.width, 
                          fixed: true 
                      }
                  });
              }
              else if (this.env === 'douyin' && provider.createBannerAd) {
                  adInstance = provider.createBannerAd({
                      adUnitId: adUnitId,
                      style: {
                          left: bounds.x,
                          top: bounds.y,
                          width: bounds.width
                      }
                  });
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

  hideGameAds() {
      if (this._gameAds.length > 0) {
          this._gameAds.forEach(ad => {
              try {
                  if (ad.destroy) {
                      ad.destroy();
                  } else if (ad.hide) {
                      ad.hide();
                  }
              } catch(e) {
                  console.warn('[Platform] Dispose ad failed', e);
              }
          });
          this._gameAds = [];
      }
  }

  /**
   * 展示插屏广告
   */
  async showInterstitialAd() {
      if (this.env === 'web') {
          console.log('[Platform] Mock Interstitial Ad shown (Web)');
          return Math.random() > 0.5;
      }

      const provider = this.getProvider();
      if (!provider || !provider.createInterstitialAd) return false;

      const adUnitId = 'adunit-d0030597225347b3';

      return new Promise((resolve) => {
          let adInstance = null;
          
          const cleanup = () => {
              if (adInstance) {
                  adInstance.offClose(onClose);
                  adInstance.offError(onError);
              }
          };

          const onClose = () => {
              console.log('[Platform] Interstitial Ad closed');
              cleanup();
              resolve(true); 
          };

          const onError = (err) => {
              console.warn('[Platform] Interstitial Ad Error:', err);
              cleanup();
              resolve(false);
          };

          try {
              adInstance = provider.createInterstitialAd({
                  adUnitId: adUnitId
              });

              adInstance.onClose(onClose);
              adInstance.onError(onError);

              adInstance.show().catch((err) => {
                  console.warn('[Platform] Interstitial Ad Show Fail:', err);
                  cleanup();
                  resolve(false);
              });
          } catch (e) {
              console.error('[Platform] Create Interstitial failed', e);
              resolve(false);
          }
      });
  }

  /**
   * [新增] 展示激励视频广告
   * @param {string} adUnitId 广告位ID
   * @returns {Promise<boolean>} 是否完整观看 (true=发放奖励, false=中途关闭/失败)
   */
  async showRewardedVideoAd(adUnitId) {
      if (this.env === 'web') {
          console.log(`[Platform] Mock Reward Video: ${adUnitId}`);
          return new Promise(resolve => {
              // Web 模拟延迟后成功
              setTimeout(() => {
                  const success = confirm("模拟：是否看完广告？");
                  resolve(success);
              }, 1000);
          });
      }

      if (!adUnitId || adUnitId.startsWith('adunit-xx')) {
          this.showToast('广告配置未生效');
          return false;
      }

      const provider = this.getProvider();
      if (!provider || !provider.createRewardedVideoAd) {
          this.showToast('当前版本不支持视频广告');
          return false;
      }

      return new Promise((resolve) => {
          // 复用广告实例 (避免多次创建导致内存泄漏)
          let videoAd = this._rewardedAds[adUnitId];
          if (!videoAd) {
              try {
                  videoAd = provider.createRewardedVideoAd({ adUnitId: adUnitId });
                  this._rewardedAds[adUnitId] = videoAd;
              } catch (e) {
                  console.error('[Platform] Create Video Ad failed', e);
                  resolve(false);
                  return;
              }
          }

          // 清理旧回调，防止重复绑定
          if (videoAd.offClose) videoAd.offClose();
          if (videoAd.offError) videoAd.offError();

          // 绑定新回调
          const onClose = (res) => {
              // 用户点击关闭广告后，res.isEnded 为 true 表示播放完毕
              // 兼容性：小于 2.1.0 的基础库版本，res 可能为 undefined，默认视为成功
              const isEnded = (res && res.isEnded) || res === undefined;
              if (isEnded) {
                  console.log('[Platform] Video Ad Finished');
                  resolve(true);
              } else {
                  console.log('[Platform] Video Ad Cancelled');
                  this.showToast('观看完整视频才能获得奖励哦');
                  resolve(false);
              }
              // 解绑
              videoAd.offClose(onClose);
          };

          const onError = (err) => {
              console.warn('[Platform] Video Ad Error', err);
              this.showToast('广告加载失败，请稍后再试');
              resolve(false);
              videoAd.offError(onError);
          };

          videoAd.onClose(onClose);
          videoAd.onError(onError);

          // 加载并展示
          videoAd.load()
              .then(() => videoAd.show())
              .catch(err => {
                  console.warn('[Platform] Video Ad Load Fail', err);
                  resolve(false);
              });
      });
  }

  showBannerAd() {}
  hideBannerAd() {}

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

  handleSocialAction() {
    console.log('[Platform] Handling social action...');

    if (this.env === 'wechat') {
        const wx = this.getProvider();
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
             this.showToast('请使用右上角菜单进入游戏圈');
        } else {
            this.showToast('当前版本不支持游戏圈');
        }

    } else if (this.env === 'douyin') {
        const tt = this.getProvider();
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
