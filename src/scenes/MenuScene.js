
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
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    // 用户信息 (左上角)
    this.createUserInfo(user);

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

    const pveBtn = new Button({ 
        text: '单人挑战 (AI)', 
        width: 400, height: 90, color: 0x3498db, 
        onClick: () => SceneManager.changeScene(GameScene, { mode: 'pve' }) 
    });
    pveBtn.position.set(btnX - 200, startY);
    
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

  createUserInfo(user) {
    const container = new PIXI.Container();
    const margin = 50; // 边距
    container.position.set(margin, margin);

    // --- 1. 头像区域 ---
    const radius = 50;
    const avatarContainer = new PIXI.Container();

    // 边框和背景
    const bg = new PIXI.Graphics();
    bg.beginFill(0xFFFFFF);
    bg.drawCircle(radius, radius, radius + 4); // 白边
    bg.endFill();
    bg.beginFill(0x95a5a6);
    bg.drawCircle(radius, radius, radius); // 灰底
    bg.endFill();
    avatarContainer.addChild(bg);

    // 加载图片
    if (user.avatarUrl) {
         PIXI.Texture.fromURL(user.avatarUrl).then(tex => {
             // 防止异步回来场景已销毁
             if (this.container.destroyed) return;
             
             const sprite = new PIXI.Sprite(tex);
             
             // 关键修改 1: 设置锚点为中心，位置为圆心
             sprite.anchor.set(0.5);
             sprite.position.set(radius, radius);

             // 关键修改 2: 智能缩放 (Object-fit: Cover)
             // 找出宽和高中较小的一边，计算缩放比，确保填满圆形
             const scale = (radius * 2) / Math.min(tex.width, tex.height);
             sprite.scale.set(scale);
             
             // 遮罩
             const mask = new PIXI.Graphics();
             mask.beginFill(0xffffff);
             mask.drawCircle(radius, radius, radius);
             mask.endFill();
             
             sprite.mask = mask;
             
             // 关键修改 3: 遮罩添加给 container，而不是 sprite 的子节点
             // 这样遮罩的坐标系是独立的，不会被 sprite 的 scale 影响
             avatarContainer.addChild(sprite);
             avatarContainer.addChild(mask);
             
         }).catch(() => {
             this.createDefaultAvatar(avatarContainer, user.nickname, radius);
         });
    } else {
        this.createDefaultAvatar(avatarContainer, user.nickname, radius);
    }
    container.addChild(avatarContainer);

    // --- 2. 文本区域 ---
    const textX = radius * 2 + 25;
    
    // 昵称
    const nameText = new PIXI.Text(user.nickname, {
        fontFamily: 'Arial', fontSize: 36, fill: 0xFFD700, fontWeight: 'bold',
        dropShadow: true, dropShadowBlur: 2
    });
    nameText.position.set(textX, 10);

    // 金币
    const coinsText = new PIXI.Text(`💰 ${user.coins}`, {
        fontFamily: 'Arial', fontSize: 30, fill: 0xffffff
    });
    coinsText.position.set(textX, 60);

    container.addChild(nameText, coinsText);

    this.container.addChild(container);
  }

  createDefaultAvatar(container, name, radius) {
      const char = (name || 'G').charAt(0).toUpperCase();
      const text = new PIXI.Text(char, {
          fontFamily: 'Arial', fontSize: 50, fill: 0xffffff, fontWeight: 'bold'
      });
      text.anchor.set(0.5);
      text.position.set(radius, radius);
      container.addChild(text);
  }
}
