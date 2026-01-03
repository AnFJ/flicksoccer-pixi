
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import Platform from '../managers/Platform.js'; 
import ResourceManager from '../managers/ResourceManager.js';
import AudioManager from '../managers/AudioManager.js'; // [新增]
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

    // 0. [新增] 初始化音频管理器 (注册音效)
    AudioManager.init();

    // 1. 第一步：先加载登录页背景 (极速加载)
    await ResourceManager.loadLoginResources();

    // 2. 渲染基础UI (背景、标题)
    this._initBasicUI(designWidth, designHeight);

    // 3. 创建进度条
    this._createProgressBar(designWidth, designHeight);

    // 4. 并行执行：静默登录 + 加载剩余游戏资源
    this._startLoadingProcess(designWidth, designHeight);
  }

  _initBasicUI(w, h) {
      // 背景，里面有包含标题
      const bgTex = ResourceManager.get('login_bg');
      if (bgTex) {
          const bg = new PIXI.Sprite(bgTex);
          bg.anchor.set(0.5);
          bg.position.set(w / 2, h / 2);
          
          // 简单的 Cover 适配
          const scale = Math.max(w / bg.width, h / bg.height);
          bg.scale.set(scale);
          
          // 压暗背景，突出文字
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
      
      // 进度条背景 (底槽)
      const bg = new PIXI.Graphics();
      bg.beginFill(0x000000, 0.5);
      bg.drawRoundedRect(-barW/2, -barH/2, barW, barH, 15);
      bg.endFill();
      bg.lineStyle(2, 0xffffff, 0.3);
      bg.drawRoundedRect(-barW/2, -barH/2, barW, barH, 15);
      
      // 进度条填充 (Fill)
      this.progressFill = new PIXI.Graphics();
      this.progressFill.beginFill(0x2ecc71); // 绿色
      this.progressFill.drawRoundedRect(0, -barH/2, barW, barH, 15); // 从左开始画
      this.progressFill.endFill();
      this.progressFill.x = -barW/2; // 起点在左侧
      this.progressFill.scale.x = 0; // 初始 0%

      // 进度文字
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
      // 限制在 0~1 之间
      const p = Math.max(0, Math.min(percent, 1));
      
      // 更新条长度
      this.progressFill.scale.x = p;
      
      // 更新文字
      this.loadingLabel.text = `资源加载中... ${Math.floor(p * 100)}%`;
  }

  async _startLoadingProcess(w, h) {
      try {
          // H5 端尝试全屏
          if (Platform.isMobileWeb()) {
              Platform.enterFullscreen();
          }

          // --- 并行任务 ---
          
          // 任务1: 资源加载 (占进度的 80% 权重)
          const assetLoadPromise = ResourceManager.loadGameResources((progress) => {
              this._updateProgress(progress / 100); 
          });

          // 任务2: 静默登录
          const loginPromise = AccountMgr.silentLogin();

          // 等待两者都完成
          await Promise.all([assetLoadPromise, loginPromise]);

          // 加载完成
          this._updateProgress(1.0);
          this.loadingLabel.text = "加载完成";

          // 短暂延迟，让用户看到 100%
          setTimeout(() => {
              this._onLoadingComplete(w, h);
          }, 500);

      } catch (err) {
          console.error("Login/Load Error:", err);
          this.loadingLabel.text = "加载失败，点击重试";
          this.loadingLabel.interactive = true;
          this.loadingLabel.once('pointerdown', () => {
             this._startLoadingProcess(w, h);
          });
      }
  }

  _onLoadingComplete(w, h) {
      const isNewUser = AccountMgr.isNewUser;
      const isH5 = Platform.env === 'web';

      // 隐藏进度条
      this.container.removeChild(this.progressBar);
      this.progressBar = null;

      // H5 或 老用户 -> 直接进入大厅
      if (isH5 || !isNewUser) {
          SceneManager.changeScene(MenuScene);
      } else {
          // 新用户 (小程序) -> 显示授权按钮
          this._createAuthButton(w, h);
      }
  }

  /**
   * 创建授权按钮 (仅针对新用户)
   */
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