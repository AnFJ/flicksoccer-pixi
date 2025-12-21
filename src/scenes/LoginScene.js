import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import MenuScene from './MenuScene.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';

export default class LoginScene extends BaseScene {
  constructor() {
    super();
  }

  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    // 1. 背景
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, designWidth, designHeight);
    bg.fill(0x1a2b3c); // 深蓝背景
    this.container.addChild(bg);

    // 2. 标题
    const title = new PIXI.Text({
        text: '弹指足球',
        style: {
            fontFamily: 'Arial',
            fontSize: 100,
            fontWeight: 'bold',
            fill: ['#FFD700', '#FF8C00'], // 渐变金
            stroke: { color: '#FFFFFF', width: 6 },
            dropShadow: true,
            dropShadowColor: '#000000',
            dropShadowBlur: 4,
            dropShadowAngle: Math.PI / 6,
            dropShadowDistance: 6,
        }
    });
    title.anchor.set(0.5);
    title.position.set(designWidth / 2, designHeight * 0.3);
    this.container.addChild(title);

    // 3. 登录按钮
    const loginBtn = new Button({
      text: '开始游戏',
      width: 400,
      height: 120,
      color: 0x07c160,
      onClick: async () => {
        try {
            loginBtn.alpha = 0.5; // 禁用点击
            await AccountMgr.login();
            SceneManager.changeScene(MenuScene);
        } catch (err) {
            console.error(err);
            loginBtn.alpha = 1;
        }
      }
    });
    loginBtn.position.set(designWidth / 2 - 200, designHeight * 0.7);
    this.container.addChild(loginBtn);
  }
}