
import { GameConfig } from '../config.js';

class Platform {
  constructor() {
    this.env = this.detectEnv();
    console.log(`[Platform] Current Environment: ${this.env}`);
    
    this._gameAds = []; // 存储游戏场景内的多个Banner/Custom广告实例
    this._rewardedAds = {}; // 缓存激励视频广告实例 (key: adUnitId)
    this._interstitialAds = {}; // [新增] 缓存插屏广告实例 (key: adUnitId)
    
    // [新增] 存储待处理的邀请信息 (从小游戏启动参数获取)
    this.pendingInvite = null; 
    
    // 初始化时立即检查启动参数
    this.checkLaunchOptions();
    
    // [新增] 注册默认分享行为 (主要针对微信右上角)
    this.registerDefaultShare();

    // [新增] 延迟初始化插屏广告预加载 (不阻塞首屏)
    setTimeout(() => this.initInterstitialAds(), 2000);

    // [新增] 广告日志缓存
    this._adLogs = [];
    // [新增] 监听应用隐藏/退出事件，进行上报
    this.registerLifecycleListeners();
  }

  registerLifecycleListeners() {
      const provider = this.getProvider();
      if (!provider) {
          // Web 环境监听 visibilitychange
          if (this.env === 'web' && typeof document !== 'undefined') {
              document.addEventListener('visibilitychange', () => {
                  if (document.visibilityState === 'hidden') {
                      this.flushAdLogs();
                  }
              });
          }
          return;
      }

      if (provider.onHide) {
          provider.onHide(() => {
              console.log('[Platform] App hide, flushing ad logs...');
              this.flushAdLogs();
          });
      }
      
      // 某些平台可能有 onExit
      if (provider.onExit) {
          provider.onExit(() => {
              this.flushAdLogs();
          });
      }
  }

  /**
   * [新增] 记录广告行为
   */
  logAdAction(params) {
      // params: { adUnitId, adUnitName, adType, isCompleted, isClicked, watchTime }
      const log = {
          ...params,
          userId: null, // 稍后填充
          nickname: null,
          timestamp: Date.now()
      };

      // 尝试获取用户信息
      try {
          // 这里假设 AccountMgr 是全局可访问的，或者通过某种方式获取
          // 由于 Platform 是底层模块，可能无法直接引用 AccountMgr (循环依赖)
          // 我们尝试从 localStorage 或全局变量获取
          // 更好的方式是让 AccountMgr 注入用户信息，或者在 flush 时获取
          // 暂时先留空，flush 时填充
      } catch (e) {}

      this._adLogs.push(log);
      
      // 如果日志太多，主动上报一次
      if (this._adLogs.length >= 10) {
          this.flushAdLogs();
      }
  }

  /**
   * [新增] 上报广告日志
   */
  async flushAdLogs() {
      if (this._adLogs.length === 0) return;

      const logsToSend = [...this._adLogs];
      this._adLogs = []; // 清空

      // 填充用户信息 (动态获取，避免循环依赖)
      // 假设 window.GameAccountMgr 存在，或者通过其他方式
      // 这里我们尝试读取本地缓存的 userInfo
      let userId = '';
      let nickname = '';
      
      try {
          // 尝试从 AccountMgr 获取 (如果已挂载到 window)
          if (typeof window !== 'undefined' && window.GameAccountMgr) {
              userId = window.GameAccountMgr.userInfo.id;
              nickname = window.GameAccountMgr.userInfo.nickname;
          } else {
              // 尝试从 storage 获取
              // 注意：AccountMgr 存储结构可能复杂，这里简化处理
              // 实际项目中建议 AccountMgr 提供一个全局访问点
          }
      } catch (e) {}

      // 补全日志信息
      const finalLogs = logsToSend.map(log => ({
          ...log,
          userId: log.userId || userId || 'unknown',
          nickname: log.nickname || nickname || 'Guest'
      }));

      console.log('[Platform] Reporting ad logs:', finalLogs.length);

      // 发送到服务器
      // 避免使用 NetworkMgr (循环依赖)，直接用 fetch
      try {
          const API_URL = GameConfig.apiBaseUrl + '/api/ad/report'; // 需确保 GameConfig 可用
          
          // 小游戏环境用 wx.request / tt.request
          const provider = this.getProvider();
          if (provider && provider.request) {
              provider.request({
                  url: API_URL,
                  method: 'POST',
                  data: { logs: finalLogs },
                  success: () => console.log('[Platform] Ad report success'),
                  fail: (e) => {
                      console.warn('[Platform] Ad report failed', e);
                      // 失败放回队列？暂时不放回，避免死循环
                  }
              });
          } else {
              // Web / Fetch
              fetch(API_URL, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ logs: finalLogs })
              }).catch(e => console.warn('[Platform] Ad report failed', e));
          }
      } catch (e) {
          console.error('[Platform] Ad report error', e);
      }
  }

  detectEnv() {
    if (typeof tt !== 'undefined') return 'douyin';
    if (typeof wx !== 'undefined') return 'wechat';
    return 'web';
  }

  registerDefaultShare() {
      const provider = this.getProvider();
      if (!provider) return;
      
      const defaultTitle = "弹指足球，一球定胜负！";
      const defaultImage = ""; // 可选：配置分享图链接
      
      if (this.env === 'wechat') {
          // 1. 显示分享菜单 (好友 + 朋友圈)
          if (provider.showShareMenu) {
              provider.showShareMenu({
                  withShareTicket: true,
                  menus: ['shareAppMessage', 'shareTimeline']
              });
          }

          // 2. 配置好友分享
          if (provider.onShareAppMessage) {
              provider.onShareAppMessage(() => ({
                  title: defaultTitle,
                  imageUrl: defaultImage
              }));
          }

          // 3. 配置朋友圈分享
          if (provider.onShareTimeline) {
              provider.onShareTimeline(() => ({
                  title: defaultTitle,
                  imageUrl: defaultImage
              }));
          }

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

  /**
   * [新增] 初始化并预加载所有配置的插屏广告
   */
  initInterstitialAds() {
      if (this.env === 'web') return;
      const config = GameConfig.adConfig[this.env];
      if (!config || !config.interstitial) return;

      console.log('[Platform] Preloading interstitial ads...');
      Object.values(config.interstitial).forEach(adUnitId => {
          this.preloadInterstitialAd(adUnitId);
      });
  }

  /**
   * [新增] 预加载单个插屏广告
   */
  preloadInterstitialAd(adUnitId) {
      if (!adUnitId) return;
      
      const provider = this.getProvider();
      if (!provider || !provider.createInterstitialAd) return;

      // 如果尚未创建实例，则创建并挂载监听
      if (!this._interstitialAds[adUnitId]) {
          try {
              const ad = provider.createInterstitialAd({ adUnitId });
              
              ad.onLoad(() => {
                  console.log(`[Platform] Interstitial loaded: ${adUnitId}`);
              });
              
              ad.onError((err) => {
                  // 静默失败，不打扰用户
                  // console.warn(`[Platform] Interstitial load error: ${adUnitId}`, err);
              });

              ad.onClose(() => {
                  console.log(`[Platform] Interstitial closed, reloading: ${adUnitId}`);
                  // 关闭后自动加载下一次，确保下次展示时是 ready 状态
                  ad.load().catch(() => {});
              });

              this._interstitialAds[adUnitId] = ad;
              
              // 立即触发首次加载
              ad.load().catch(() => {});
          } catch (e) {
              console.warn('[Platform] Failed to create interstitial', e);
          }
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
    if (this.env === 'douyin') return tt;
    if (this.env === 'wechat') return wx;
    return null;
  }

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

  showGameAds(adNodes) {
      if (this.env === 'web') return; 
      if (!adNodes || adNodes.length === 0) return;

      const provider = this.getProvider();
      let bannerIds = [];
      if (this.env === 'wechat') bannerIds = GameConfig.adConfig.wechat.banners || [];
      if (this.env === 'douyin') bannerIds = GameConfig.adConfig.douyin.banners || [];

      // 先清理旧广告
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
                  // [优化] 增加更健壮的错误处理
                  adInstance.onError(err => {
                      // 屏蔽常规的加载错误日志
                      // console.log('[Platform] Ad load error:', err);
                  });
                  
                  // show() 返回 Promise，catch 避免未捕获异常
                  const showPromise = adInstance.show();
                  if (showPromise && showPromise.catch) {
                      showPromise.catch(err => {
                          // console.log('[Platform] Ad show failed:', err);
                      });
                  }
                  
                  // [新增] 记录 Banner 广告展示
                  this.logAdAction({
                      adUnitId: adUnitId,
                      adUnitName: 'banner',
                      adType: 'banner',
                      isCompleted: 1,
                      isClicked: 0,
                      watchTime: 0
                  });

                  this._gameAds.push(adInstance);
              }

          } catch (e) {
              console.warn('[Platform] Create ad failed', e);
          }
      });
  }

  /**
   * 隐藏/销毁游戏内广告
   * [优化] 增加 try-catch 屏蔽微信 "removeTextView:fail" 错误
   * [优化] 立即清空数组引用，防止重入
   */
  hideGameAds() {
      const ads = this._gameAds;
      // 立即清空引用，避免异步逻辑中重复操作
      this._gameAds = [];

      if (ads && ads.length > 0) {
          ads.forEach(ad => {
              try {
                  // 解绑回调，防止销毁后触发 onError
                  if (ad.offError) ad.offError();
                  if (ad.offClose) ad.offClose();
                  if (ad.offLoad) ad.offLoad();

                  if (ad.destroy) {
                      ad.destroy();
                  } else if (ad.hide) {
                      ad.hide();
                  }
              } catch(e) {
                  // 忽略微信开发者工具中常见的 "removeTextView:fail" 错误
                  // console.warn('Ad destroy error (ignored):', e);
              }
          });
      }
  }

  /**
   * 展示插屏广告 (优化版)
   * 优先使用缓存的实例，展示后自动预加载下一次
   * @param {string} adUnitId - 插屏广告ID
   */
  async showInterstitialAd(adUnitId) {
      if (this.env === 'web') {
          console.log(`[Platform] Mock Interstitial Ad: ${adUnitId}`);
          return true;
      }

      if (!adUnitId) {
          console.warn('[Platform] showInterstitialAd called without ID');
          return false;
      }

      // 1. 尝试获取预加载的实例，如果没有则创建
      if (!this._interstitialAds[adUnitId]) {
          this.preloadInterstitialAd(adUnitId);
      }
      
      const adInstance = this._interstitialAds[adUnitId];
      if (!adInstance) return false;

      return new Promise((resolve) => {
          // 绑定单次关闭回调以解决 Promise
          const onCloseOnce = () => {
              if (adInstance.offClose) adInstance.offClose(onCloseOnce);
              // [新增] 记录插屏广告展示
              this.logAdAction({
                  adUnitId: adUnitId,
                  adUnitName: 'interstitial', // 简单标记
                  adType: 'interstitial',
                  isCompleted: 1, // 插屏只要展示就算完成
                  isClicked: 0, // 无法监听点击
                  watchTime: 0
              });
              resolve(true);
          };
          
          if (adInstance.onClose) adInstance.onClose(onCloseOnce);

          adInstance.show().catch((err) => {
              console.warn('[Platform] Interstitial show failed, retrying load...', err);
              
              // 如果显示失败(可能没加载好)，尝试加载后立即显示
              adInstance.load()
                  .then(() => adInstance.show())
                  .catch(e => {
                      console.warn('[Platform] Interstitial retry failed', e);
                      if (adInstance.offClose) adInstance.offClose(onCloseOnce);
                      resolve(false);
                  });
          });
      });
  }

  /**
   * 检查并展示每日插屏广告 (启动/菜单页)
   * 每天只会展示一次
   */
  checkAndShowDailyInterstitial() {
      const todayStr = new Date().toDateString(); // e.g. "Thu Dec 26 2024"
      const lastShowDate = this.getStorage('last_daily_interstitial_date');

      if (lastShowDate !== todayStr) {
          // 获取配置的启动插屏ID
          const adConfig = GameConfig.adConfig[this.env];
          const adUnitId = adConfig && adConfig.interstitial ? adConfig.interstitial.startup : null;

          if (adUnitId) {
              this.showInterstitialAd(adUnitId).then(success => {
                  if (success) {
                      this.setStorage('last_daily_interstitial_date', todayStr);
                      console.log('[Platform] Daily interstitial shown.');
                  }
              });
          }
      }
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
              
              // [新增] 记录激励视频
              this.logAdAction({
                  adUnitId: adUnitId,
                  adUnitName: 'rewardedVideo',
                  adType: 'rewardedVideo',
                  isCompleted: isEnded ? 1 : 0,
                  isClicked: 0, // 无法监听点击
                  watchTime: isEnded ? 15 : 0 // 估算
              });

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
              console.log('[Platform] Rewarded video error:', err);
              resolve(false);
              videoAd.offError(onError);
          };

          videoAd.onClose(onClose);
          videoAd.onError(onError);

          videoAd.load()
              .then(() => videoAd.show())
              .catch(err => {
                  console.log('[Platform] Rewarded video show failed', err);
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
