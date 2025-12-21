import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import GameScene from './GameScene.js';
import LobbyScene from './LobbyScene.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';

export default class MenuScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;
    const user = AccountMgr.userInfo;

    // 背景
    const bg = new PIXI.Graphics();
    bg.rect(0, 0, designWidth, designHeight);
    bg.fill(0x2c3e50);
    this.container.addChild(bg);

    // 用户信息栏
    this.createUserInfo(user);

    // 按钮组
    const startY = designHeight * 0.4;
    const gap = 150;

    // 1. 单人模式
    const pveBtn = new Button({
      text: '单人挑战 (AI)',
      width: 500,
      height: 100,
      color: 0x3498db,
      onClick: () => {
        // 传递参数：单人模式
        SceneManager.changeScene(GameScene);
      }
    });
    pveBtn.position.set(designWidth / 2 - 250, startY);
    this.container.addChild(pveBtn);

    // 2. 本地双人
    const pvpLocalBtn = new Button({
      text: '本地双人',
      width: 500,
      height: 100,
      color: 0x9b59b6,
      onClick: () => {
        // 传递参数：本地双人 (这里简单起见共用 GameScene，实际可以通过构造函数传参区分模式)
        // 目前 GameScene 默认实现了双人逻辑，AI逻辑在 GameScene 中开启
        SceneManager.changeScene(GameScene); 
      }
    });
    pvpLocalBtn.position.set(designWidth / 2 - 250, startY + gap);
    this.container.addChild(pvpLocalBtn);

    // 3. 网络对战
    const pvpOnlineBtn = new Button({
      text: '网络对战',
      width: 500,
      height: 100,
      color: 0xe67e22,
      onClick: () => {
        SceneManager.changeScene(LobbyScene);
      }
    });
    pvpOnlineBtn.position.set(designWidth / 2 - 250, startY + gap * 2);
    this.container.addChild(pvpOnlineBtn);
  }

  createUserInfo(user) {
    const infoContainer = new PIXI.Container();
    
    // 头像框
    const avatarCircle = new PIXI.Graphics();
    avatarCircle.circle(0, 0, 60);
    avatarCircle.fill(0xcccccc);
    avatarCircle.position.set(100, 120);
    infoContainer.addChild(avatarCircle);

    // 昵称
    const nameText = new PIXI.Text({
        text: user.nickname,
        style: { fontFamily: 'Arial', fontSize: 40, fill: 0xffffff }
    });
    nameText.position.set(180, 80);
    infoContainer.addChild(nameText);

    // 金币
    const coinText = new PIXI.Text({
        text: `金币: ${user.coins}`,
        style: { fontFamily: 'Arial', fontSize: 32, fill: 0xf1c40f }
    });
    coinText.position.set(180, 140);
    infoContainer.addChild(coinText);

    this.container.addChild(infoContainer);
  }
}