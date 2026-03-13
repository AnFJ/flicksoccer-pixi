
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import Platform from '../managers/Platform.js'; 
import ResourceManager from '../managers/ResourceManager.js';
import AudioManager from '../managers/AudioManager.js'; 
import UserBehaviorMgr from '../managers/UserBehaviorMgr.js';
import MenuScene from './MenuScene.js';
import RoomScene from './RoomScene.js'; // [新增]
import NetworkMgr from '../managers/NetworkMgr.js'; // [新增]
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';

export default class LoginScene extends BaseScene {
  constructor() {
    super();
    this.progressBar = null;
    this.loadingLabel = null;
    this.currentProgress = 0;
    this.progressTimer = null;
    this.loadStartTime = 0;
  }

  async onEnter() {
    super.onEnter();
    this.loadStartTime = Date.now();
    UserBehaviorMgr.log('SYSTEM', '进入游戏', { time: this.loadStartTime });
    
    const { designWidth, designHeight } = GameConfig;

    await ResourceManager.loadLoginResources();

    this._initBasicUI(designWidth, designHeight);
    this._createProgressBar(designWidth, designHeight);
    this._startLoadingProcess(designWidth, designHeight);
  }

  _initBasicUI(w, h) {
      const bgTex = ResourceManager.get('login_bg');
      if (bgTex) {
          const bg = new PIXI.Sprite(bgTex);
          bg.anchor.set(0.5);
          bg.position.set(w / 2, h / 2);
          const scale = Math.max(w / bg.width, h / bg.height);
          bg.scale.set(scale);
          bg.tint = 0x888888;
          this.container.addChild(bg);
      } else {
          const bg = new PIXI.Graphics();
          bg.beginFill(0x1a2b3c);
          bg.drawRect(0, 0, w, h);
          bg.endFill();
          this.container.addChild(bg);
      }
  }

  _createProgressBar(w, h) {
      const barContainer = new PIXI.Container();
      const barW = 600;
      const barH = 30;
      
      const bg = new PIXI.Graphics();
      bg.beginFill(0x000000, 0.5);
      bg.drawRoundedRect(-barW/2, -barH/2, barW, barH, 15);
      bg.endFill();
      bg.lineStyle(2, 0xffffff, 0.3);
      bg.drawRoundedRect(-barW/2, -barH/2, barW, barH, 15);
      
      this.progressFill = new PIXI.Graphics();
      this.progressFill.beginFill(0x2ecc71); 
      this.progressFill.drawRoundedRect(0, -barH/2, barW, barH, 15); 
      this.progressFill.endFill();
      this.progressFill.x = -barW/2; 
      this.progressFill.scale.x = 0; 

      this.loadingLabel = new PIXI.Text('正在获取资源... 0%', {
          fontFamily: 'Arial', fontSize: 28, fill: 0xffffff
      });
      this.loadingLabel.anchor.set(0.5);
      this.loadingLabel.position.set(0, barH + 20);

      barContainer.addChild(bg, this.progressFill, this.loadingLabel);
      barContainer.position.set(w / 2, h * 0.9);
      
      this.progressBar = barContainer;
      this.container.addChild(this.progressBar);
  }

  _updateProgress(percent) {
      if (!this.progressBar) return;
      // 视觉进度条最高 100% (scale.x = 1)
      const visualP = Math.max(0, Math.min(percent, 1));
      this.progressFill.scale.x = visualP;
      // 文字进度可以超过 100%
      this.loadingLabel.text = `资源加载中... ${Math.floor(percent * 100)}%`;
  }

  _startProgressTimer() {
      if (this.progressTimer) clearInterval(this.progressTimer);
      this.progressTimer = setInterval(() => {
          this.currentProgress += 0.01;
          this._updateProgress(this.currentProgress);
      }, 60);
  }

  _stopProgressTimer(forceComplete = false) {
      if (this.progressTimer) {
          clearInterval(this.progressTimer);
          this.progressTimer = null;
      }
      if (forceComplete && this.currentProgress < 1) {
          this.currentProgress = 1;
      }
      this._updateProgress(this.currentProgress);
  }

  async _startLoadingProcess(w, h) {
      try {
          if (Platform.isMobileWeb()) {
              Platform.enterFullscreen();
          }

          // 开启模拟进度条：每 0.1s 增加 1%
          this.currentProgress = 0;
          this._startProgressTimer();

          // 1. 启动静默登录 (并行，不阻塞分包加载)
          const loginPromise = AccountMgr.silentLogin();

          // 2. 尝试读取本地缓存 (用于秒开判断)
          const hasCache = AccountMgr.loadFromCache();
          
          // 3. 加载所有分包
          await Promise.all([
              Platform.loadSubpackage('static_assets')
          ]);
          
          // 4. 初始化音频 (依赖分包资源路径)
          const audioInitPromise = AudioManager.init();
          
          // 5. 启动资源加载 (依赖分包资源)
          // 注意：这里不再直接用 ResourceManager 的回调更新进度，而是统一由定时器控制
          const assetLoadPromise = ResourceManager.loadGameResources();

          if (hasCache) {
              // --- 分支 A: 命中缓存 (秒开模式) ---
              await Promise.all([assetLoadPromise, audioInitPromise]);
              loginPromise.catch(e => console.warn('Background login warning:', e));
              
              this._stopProgressTimer(true); // 强制到 100% (如果还没到)
              this._onLoadingComplete(w, h, false);
          } else {
              // --- 分支 B: 无缓存 (普通模式) ---
              await Promise.all([assetLoadPromise, audioInitPromise, loginPromise]);
              
              this._stopProgressTimer(true); // 强制到 100% (如果还没到)
              this._onLoadingComplete(w, h, true);
          }

      } catch (err) {
          console.error("Login/Load Error:", err);
          this.loadingLabel.text = "加载失败，点击重试";
          this.loadingLabel.interactive = true;
          this.loadingLabel.once('pointerdown', () => {
             this._startLoadingProcess(w, h);
          });
      }
  }

  _onLoadingComplete(w, h, checkNewUser) {
      this._stopProgressTimer(); // 确保定时器关闭
      
      const duration = Date.now() - this.loadStartTime;
      UserBehaviorMgr.log('SYSTEM', '登录加载耗时', { 
          isNewUser: AccountMgr.isNewUser, 
          duration: duration 
      });

      // 稍微延迟一点点提升体验
      setTimeout(() => {
          if (this.progressBar) {
              this.container.removeChild(this.progressBar);
              this.progressBar = null;
          }

          if (checkNewUser && AccountMgr.isNewUser && Platform.env !== 'web') {
              // 是新用户，且不是Web环境 (Web默认Guest自动进)
              this._createAuthButton(w, h);
          } else {
              this._checkInviteAndEnter();
          }
      }, 200);
  }

  // [新增] 检查邀请并进入游戏
  _checkInviteAndEnter() {
      // 检查是否有来自平台启动参数的邀请
      const invite = Platform.pendingInvite;
      if (invite && invite.roomId) {
          console.log(`[Login] Auto-joining room: ${invite.roomId}`);
          this.loadingLabel.text = "正在加入邀请房间...";
          
          const user = AccountMgr.userInfo;
          NetworkMgr.connectRoom(invite.roomId, user.id, user);
          SceneManager.changeScene(RoomScene, { roomId: invite.roomId });
          
          // 清除邀请，避免退回主菜单后又自动进入
          Platform.pendingInvite = null;
      } else {
          // 正常流程
          SceneManager.changeScene(MenuScene);
      }
  }

  _createAuthButton(w, h) {
      const statusText = new PIXI.Text('欢迎新玩家！', {
          fontFamily: 'Arial', fontSize: 40, fill: 0xffffff
      });
      statusText.anchor.set(0.5);
      statusText.position.set(w/2, h * 0.65);
      this.container.addChild(statusText);

      const btn = new Button({
          text: '授权登录', 
          width: 360, 
          height: 100, 
          color: 0x07c160, // 微信绿
          onClick: async () => {
              btn.alpha = 0.5; 
              statusText.text = "正在同步资料...";
              
              const profile = await Platform.getUserProfile();
              if (profile) {
                  await AccountMgr.updateUserProfile(profile);
              }

              setTimeout(() => {
                  this._checkInviteAndEnter();
              }, 500);
          }
      });
      btn.position.set(w / 2 - 180, h * 0.75);
      this.container.addChild(btn);
  }
}
