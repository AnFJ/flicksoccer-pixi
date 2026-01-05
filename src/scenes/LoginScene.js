
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import Platform from '../managers/Platform.js'; 
import ResourceManager from '../managers/ResourceManager.js';
import AudioManager from '../managers/AudioManager.js'; 
import MenuScene from './MenuScene.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';

export default class LoginScene extends BaseScene {
  constructor() {
    super();
    this.progressBar = null;
    this.loadingLabel = null;
  }

  async onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    AudioManager.init();

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
      const p = Math.max(0, Math.min(percent, 1));
      this.progressFill.scale.x = p;
      this.loadingLabel.text = `资源加载中... ${Math.floor(p * 100)}%`;
  }

  async _startLoadingProcess(w, h) {
      try {
          if (Platform.isMobileWeb()) {
              Platform.enterFullscreen();
          }

          // 1. 尝试读取本地缓存
          const hasCache = AccountMgr.loadFromCache();
          
          // 2. 启动资源加载 (Promise)
          const assetLoadPromise = ResourceManager.loadGameResources((progress) => {
              this._updateProgress(progress / 100); 
          });

          // 3. 启动登录 (Promise)
          // 无论是否有缓存，都要发请求去同步最新数据/检查Token
          const loginPromise = AccountMgr.silentLogin();

          if (hasCache) {
              // --- 分支 A: 命中缓存 (秒开模式) ---
              // 只等待资源加载完毕，不等待登录接口
              // 假设有缓存的一定不是需要授权的新用户
              await assetLoadPromise;
              
              // 确保登录请求在后台继续跑，不 await 它
              // 但要处理可能的未捕获异常
              loginPromise.catch(e => console.warn('Background login warning:', e));
              
              this._onLoadingComplete(w, h, false); // false = 不需要检查 isNewUser
          } else {
              // --- 分支 B: 无缓存 (普通模式) ---
              // 必须等待所有完成，因为要判断是否 isNewUser
              await Promise.all([assetLoadPromise, loginPromise]);
              this._onLoadingComplete(w, h, true); // true = 需要检查 isNewUser
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
      this._updateProgress(1.0);
      
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
              // 老用户 或 Web用户 或 缓存命中 -> 进大厅
              SceneManager.changeScene(MenuScene);
          }
      }, 200);
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
                  SceneManager.changeScene(MenuScene);
              }, 500);
          }
      });
      btn.position.set(w / 2 - 180, h * 0.75);
      this.container.addChild(btn);
  }
}
