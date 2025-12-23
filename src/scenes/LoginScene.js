
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import Platform from '../managers/Platform.js'; // 导入 Platform
import MenuScene from './MenuScene.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';

export default class LoginScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    const bg = new PIXI.Graphics();
    // Pixi v7 API
    bg.beginFill(0x1a2b3c);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    const title = new PIXI.Text('弹指足球', { // v7 写法建议分开
        fontFamily: 'Arial', fontSize: 120, fontWeight: 'bold', fill: 0xFFD700,
        stroke: '#FFFFFF', strokeThickness: 6, dropShadow: true, dropShadowDistance: 6
    });
    title.anchor.set(0.5);
    title.position.set(designWidth / 2, designHeight * 0.4);
    this.container.addChild(title);

    const loginBtn = new Button({
      text: '开始游戏', width: 300, height: 100, color: 0x07c160,
      onClick: async () => {
        try {
            // 如果是移动端 Web 环境，尝试强制全屏
            if (Platform.isMobileWeb()) {
                Platform.enterFullscreen();
            }

            loginBtn.alpha = 0.5; 
            await AccountMgr.login();
            SceneManager.changeScene(MenuScene);
        } catch (err) {
            console.error(err);
            loginBtn.alpha = 1;
        }
      }
    });
    loginBtn.position.set(designWidth / 2 - 150, designHeight * 0.7);
    this.container.addChild(loginBtn);
  }
}
