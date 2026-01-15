
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
    
    // [新增] 注册默认分享行为 (主要针对微信右上角)
    this.registerDefaultShare();
  }

  detectEnv() {
    if (typeof tt !== 'undefined') return 'douyin';
    if (typeof wx !== 'undefined') return 'wechat';
    return 'web';
  }

  // ... (保留 registerDefaultShare, checkUpdate, loadRemoteAsset, checkLaunchOptions, shareRoom, setStorage, getStorage, removeStorage, isMobileWeb, enterFullscreen, getLoginCredentials, getUserProfile, vibrateShort, showToast, getProvider 方法不变) ...
  registerDefaultShare() {
      const provider = this.getProvider();
      if (!provider) return;
      
      const defaultTitle = "弹指足球，一球定胜负！";
      
      if (this.env === 'wechat' && provider.onShareAppMessage) {
          provider.onShareAppMessage(() => ({
              title: defaultTitle
          }));
      } else if (this.env === 'douyin' && provider.onShareAppMessage) {
          // 抖音也支持全局监听分享菜单
          provider.onShareAppMessage((res) => {
              return {
                  title: defaultTitle,
                  // 抖音分享通常需要 templateId 才能获得更好效果，这里留空使用默认
                  // templateId: '' 
              };
          });
      }
  }

  checkUpdate() {
      if (this.env === 'web') return;

      const provider = this.getProvider();
      if (provider && provider.getUpdateManager) {
          const updateManager = provider.getUpdateManager();

          updateManager.onCheckForUpdate((res) => {
              console.log('[Platform] Check update result:', res.hasUpdate);
          });

          updateManager.onUpdateReady(() => {
              provider.showModal({
                  title: '更新提示',
                  content: '新版本已经准备好，为保证游戏体验，请重启应用。',
                  showCancel: false, 
                  success: (res) => {
                      if (res.confirm) {
                          updateManager.applyUpdate();
                      }
                  }
              });
          });

          updateManager.onUpdateFailed(() => {
              console.warn('[Platform] Update failed');
          });
      }
  }

  async loadRemoteAsset(fileName) {
      if (this.env === 'web') {
          return `assets-origin/${fileName}`;
      }

      const provider = this.getProvider();
      if (!provider) return '';

      const fs = provider.getFileSystemManager();
      const userDataPath = provider.env.USER_DATA_PATH;
      const cacheDir = `${userDataPath}/game_cache`;
      const localPath = `${cacheDir}/${fileName}`;
      const cdnUrl = GameConfig.resourceConfig.cdnUrl.replace(/\/$/, '');
      const remoteUrl = `${cdnUrl}/${fileName}`;

      try {
          fs.accessSync(cacheDir);
      } catch (e) {
          try {
              fs.mkdirSync(cacheDir, true);
          } catch (err) {
              console.error('[Platform] Create cache dir failed', err);
          }
      }

      try {
          fs.accessSync(localPath);
          return localPath;
      } catch (e) {
          console.log(`[Platform] Downloading remote asset: ${remoteUrl}`);
          return new Promise((resolve) => {
              provider.downloadFile({
                  url: remoteUrl,
                  success: (res) => {
                      if (res.statusCode === 200) {
                          fs.saveFile({
                              tempFilePath: res.tempFilePath,
                              filePath: localPath,
                              success: (saveRes) => {
                                  resolve(saveRes.savedFilePath);
                              },
                              fail: (err) => {
                                  resolve(res.tempFilePath);
                              }
                          });
                      } else {
                          resolve(remoteUrl);
                      }
                  },
                  fail: (err) => {
                      resolve(remoteUrl);
                  }
              });
          });
      }
  }

  checkLaunchOptions() {
      const provider = this.getProvider();
      if (provider && provider.getLaunchOptionsSync) {
          try {
              const options = provider.getLaunchOptionsSync();
              if (options && options.query && options.query.roomId) {
                  this.pendingInvite = {
                      roomId: options.query.roomId,
                      fromUser: options.query.fromUser
                  };
              }
          } catch (e) {
              console.warn('[Platform] Get launch options failed', e);
          }
      } else if (this.env === 'web') {
          const urlParams = new URLSearchParams(window.location.search);
          const roomId = urlParams.get('roomId');
          if (roomId) {
              this.pendingInvite = { roomId };
          }
      }
  }

  shareRoom(roomId) {
      const provider = this.getProvider();
      const title = "来《弹指足球》和我一决高下！";
      const query = `roomId=${roomId}&fromUser=share`; 

      if (this.env === 'wechat') {
          if (provider.shareAppMessage) {
              provider.shareAppMessage({ title: title, query: query });
          } else {
              this.showToast("请点击右上角 '...' 发送给朋友");
          }
      } else if (this.env === 'douyin') {
          if (provider.shareAppMessage) {
              provider.shareAppMessage({
                  title: title,
                  query: query,
                  success() { console.log('Share success'); },
                  fail(e) { console.log('Share failed', e); }
              });
          }
      } else {
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
        requestFull.call(docEl).catch(err => {});
      }
    } catch (e) {}
  }

  async getLoginCredentials() {
    if (this.env === 'web') {
        let uuid = this.getStorage('finger_soccer_uuid');
        if (!uuid) {
            uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
            this.setStorage('finger_soccer_uuid', uuid);
        }
        return { type: 'h5', deviceId: uuid };
    } 
    else {
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

  getUserProfile() {
    return new Promise((resolve) => {
      const provider = this.getProvider();
      
      if (this.env === 'wechat') {
          provider.getUserProfile({
              desc: '用于展示玩家头像和昵称',
              success: (res) => {
                  resolve(res.userInfo);
              },
              fail: (err) => {
                  resolve(null);
              }
          });
      }
      else if (this.env === 'douyin') {
        provider.getUserInfo({
          success: (res) => {
              resolve(res.userInfo);
          },
          fail: (err) => {
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
    if( this.env === 'web') return null;
    if (this.env === 'douyin') return tt;
    if (this.env === 'wechat') return wx;
  }

  /**
   * [新增] 加载分包
   * @param {string} name 分包名称 (在 game.json 中配置的 name)
   * @returns {Promise}
   */
  loadSubpackage(name) {
      if (this.env === 'web') {
          return Promise.resolve(); // Web 模式下所有代码都在一起
      }

      const provider = this.getProvider();
      if (!provider || !provider.loadSubpackage) {
          return Promise.resolve();
      }

      return new Promise((resolve, reject) => {
          console.log(`[Platform] Loading subpackage: ${name}`);
          const loadTask = provider.loadSubpackage({
              name: name,
              success: (res) => {
                  console.log(`[Platform] Subpackage ${name} loaded successfully`);
                  resolve(res);
              },
              fail: (err) => {
                  console.error(`[Platform] Subpackage ${name} load failed`, err);
                  reject(err);
              }
          });
          
          // 可选：监听进度
          // loadTask.onProgressUpdate(res => { ... })
      });
  }

  // ... (保留 showGameAds, hideGameAds, showInterstitialAd, showRewardedVideoAd, navigateToMiniProgram, handleSocialAction 等广告相关方法不变) ...
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
          if (!bounds || bounds.width <= 0) return;

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
                      adInstance.style.left = bounds.x + (bounds.width - size.width) / 2;
                  });
              }

              if (adInstance) {
                  adInstance.onError(err => {});
                  adInstance.show().catch(err => {});
                  this._gameAds.push(adInstance);
              }

          } catch (e) {}
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
              } catch(e) {}
          });
          this._gameAds = [];
      }
  }

  async showInterstitialAd() {
      if (this.env === 'web') return true;

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

  async showRewardedVideoAd(adUnitId) {
      if(this.env == 'douyin') {
        return true;
      }
      if (this.env === 'web') {
          this.showToast('广告模拟成功');
          return new Promise(resolve => {
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
          let videoAd = this._rewardedAds[adUnitId];
          if (!videoAd) {
              try {
                  videoAd = provider.createRewardedVideoAd({ adUnitId: adUnitId });
                  this._rewardedAds[adUnitId] = videoAd;
              } catch (e) {
                  resolve(false);
                  return;
              }
          }

          if (videoAd.offClose) videoAd.offClose();
          if (videoAd.offError) videoAd.offError();

          const onClose = (res) => {
              const isEnded = (res && res.isEnded) || res === undefined;
              if (isEnded) {
                  resolve(true);
              } else {
                  this.showToast('观看完整视频才能获得奖励哦');
                  resolve(false);
              }
              videoAd.offClose(onClose);
          };

          const onError = (err) => {
              this.showToast('广告加载失败，请稍后再试');
              resolve(false);
              videoAd.offError(onError);
          };

          videoAd.onClose(onClose);
          videoAd.onError(onError);

          videoAd.load()
              .then(() => videoAd.show())
              .catch(err => {
                  resolve(false);
              });
      });
  }

  navigateToMiniProgram(appId, path = '') {
      if (!appId) return;
      const provider = this.getProvider();
      if (provider && provider.navigateToMiniProgram) {
          provider.navigateToMiniProgram({
              appId: appId,
              path: path,
              success(res) {},
              fail(err) {
                  if (this.env === 'douyin') {
                      this.showToast('跳转失败，请稍后重试');
                  }
              }
          });
      } else {
          this.showToast('跳转小程序: ' + appId);
      }
  }

  handleSocialAction() {
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
