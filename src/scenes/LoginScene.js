
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import Platform from '../managers/Platform.js'; 
import MenuScene from './MenuScene.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class LoginScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    // 1. 背景 (优先使用图片，失败则回退到纯色)
    const bgTex = ResourceManager.get('main_bg');
    if (bgTex) {
        const bg = new PIXI.Sprite(bgTex);
        bg.anchor.set(0.5);
        // 高度适配：让背景高度填满屏幕设计高度
        bg.height = designHeight;
        // 保持宽高比 (27:9)
        bg.scale.x = bg.scale.y; 
        
        // 居中显示
        bg.position.set(designWidth / 2, designHeight / 2);
        
        // 稍微压暗一点，避免干扰文字
        bg.tint = 0xDDDDDD; 
        
        this.container.addChild(bg);
    } else {
        // 兜底纯色背景
        const bg = new PIXI.Graphics();
        bg.beginFill(0x1a2b3c);
        bg.drawRect(0, 0, designWidth, designHeight);
        bg.endFill();
        this.container.addChild(bg);
    }

    // 2. 标题
    const title = new PIXI.Text('弹指足球', { 
        fontFamily: 'Arial', fontSize: 120, fontWeight: 'bold', fill: 0xFFD700,
        stroke: '#FFFFFF', strokeThickness: 6, dropShadow: true, dropShadowDistance: 6
    });
    title.anchor.set(0.5);
    title.position.set(designWidth / 2, designHeight * 0.4);
    this.container.addChild(title);

    // 3. 状态提示文本
    this.statusText = new PIXI.Text('正在登录...', {
        fontFamily: 'Arial', fontSize: 40, fill: 0xAAAAAA
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(designWidth / 2, designHeight * 0.7);
    this.container.addChild(this.statusText);

    // 4. 执行登录流程
    this.startLoginProcess(designWidth, designHeight);
  }

  async startLoginProcess(w, h) {
      try {
          // H5 端强制全屏尝试
          if (Platform.isMobileWeb()) {
              Platform.enterFullscreen();
          }

          // A. 静默登录
          await AccountMgr.silentLogin();
          
          const isH5 = Platform.env === 'web';
          const isNewUser = AccountMgr.isNewUser;

          // B. 逻辑分流
          if (isH5) {
              // H5 环境：直接进大厅 (无论是否新用户，因为 H5 拿不到微信资料，直接用随机名)
              this.enterLobby();
          } 
          else {
              // 小游戏环境
              if (!isNewUser) {
                  // 老用户：直接进大厅
                  this.enterLobby();
              } else {
                  // 新用户：显示授权按钮
                  this.statusText.text = "欢迎新玩家！";
                  this.createAuthButton(w, h);
              }
          }

      } catch (err) {
          console.error(err);
          this.statusText.text = "登录失败，请重试";
          // 显示重试按钮 (直接复用授权按钮的逻辑，但文字改为重试)
          this.createRetryButton(w, h);
      }
  }

  enterLobby() {
      this.statusText.text = "登录成功！";
      setTimeout(() => {
          SceneManager.changeScene(MenuScene);
      }, 500);
  }

  /**
   * 创建授权按钮 (仅针对新用户)
   */
  createAuthButton(w, h) {
      const btn = new Button({
          text: '授权登录', // 微信/抖音用户习惯点击此按钮
          width: 360, 
          height: 100, 
          color: 0x07c160, // 微信绿
          onClick: async () => {
              btn.alpha = 0.5; // 禁用点击防止连点
              this.statusText.text = "正在获取资料...";
              
              // 1. 调起平台授权弹窗/确认
              const profile = await Platform.getUserProfile();

              // 2. 如果获取成功，同步给后端更新名字头像
              if (profile) {
                  await AccountMgr.updateUserProfile(profile);
                  this.statusText.text = `欢迎, ${profile.nickName}`;
              } else {
                  this.statusText.text = "使用随机账号进入...";
              }

              // 3. 无论授权成功与否，都进入游戏
              setTimeout(() => {
                  SceneManager.changeScene(MenuScene);
              }, 800);
          }
      });
      btn.position.set(w / 2 - 180, h * 0.7);
      this.container.addChild(btn);
  }

  createRetryButton(w, h) {
      const btn = new Button({
          text: '重试', 
          width: 300, height: 100, color: 0xe74c3c,
          onClick: () => {
              this.container.removeChild(btn);
              this.statusText.text = "正在登录...";
              this.startLoginProcess(w, h);
          }
      });
      btn.position.set(w / 2 - 150, h * 0.5 + 120);
      this.container.addChild(btn);
  }
}
