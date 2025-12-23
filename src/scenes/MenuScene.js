
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

    const bg = new PIXI.Graphics();
    // Pixi v7 API
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    // 用户信息 (顶部右侧)
    this.createUserInfo(user, designWidth);

    // 标题
    const title = new PIXI.Text('弹指足球', {
        fontFamily: 'Arial', fontSize: 100, fill: 0xFFD700, stroke: 0xffffff, strokeThickness: 4 
    });
    title.anchor.set(0.5);
    title.position.set(designWidth / 4, designHeight / 2);
    this.container.addChild(title);

    // 按钮组 (右侧垂直排列)
    const btnX = designWidth * 0.7;
    const startY = designHeight * 0.35;
    const gap = 120;

    // 修改：传递 mode 参数
    const pveBtn = new Button({ 
        text: '单人挑战 (AI)', 
        width: 400, height: 90, color: 0x3498db, 
        onClick: () => SceneManager.changeScene(GameScene, { mode: 'pve' }) 
    });
    pveBtn.position.set(btnX - 200, startY);
    
    // 修改：传递 mode 参数
    const pvpLocalBtn = new Button({ 
        text: '本地双人', 
        width: 400, height: 90, color: 0x9b59b6, 
        onClick: () => SceneManager.changeScene(GameScene, { mode: 'pvp_local' }) 
    });
    pvpLocalBtn.position.set(btnX - 200, startY + gap);

    const pvpOnlineBtn = new Button({ text: '网络对战', width: 400, height: 90, color: 0xe67e22, onClick: () => SceneManager.changeScene(LobbyScene) });
    pvpOnlineBtn.position.set(btnX - 200, startY + gap * 2);

    this.container.addChild(pveBtn, pvpLocalBtn, pvpOnlineBtn);
  }

  createUserInfo(user, width) {
    const infoContainer = new PIXI.Container();
    
    const nameText = new PIXI.Text(
        `${user.nickname} | 💰 ${user.coins}`,
        { fontFamily: 'Arial', fontSize: 30, fill: 0xffffff }
    );
    nameText.anchor.set(1, 0.5);
    nameText.position.set(width - 40, 40);

    infoContainer.addChild(nameText);
    this.container.addChild(infoContainer);
  }
}
