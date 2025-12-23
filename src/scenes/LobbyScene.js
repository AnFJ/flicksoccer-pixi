
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';

export default class LobbyScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    const bg = new PIXI.Graphics();
    // Pixi v7 API
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    const text = new PIXI.Text(
        '联机大厅功能\n开发中...',
        { fontFamily: 'Arial', fontSize: 60, fill: 0xffffff, align: 'center' }
    );
    text.anchor.set(0.5);
    text.position.set(designWidth / 2, designHeight / 2);
    this.container.addChild(text);

    const backBtn = new Button({
      text: '返回',
      width: 200,
      height: 80,
      color: 0x95a5a6,
      onClick: () => SceneManager.changeScene(MenuScene)
    });
    backBtn.position.set(designWidth / 2 - 100, designHeight * 0.7);
    this.container.addChild(backBtn);
  }
}
