
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

    // 用户信息 (左上角，包含等级)
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

    // 初始对齐
    this.alignUserInfo();
  }

  // 响应屏幕尺寸变化
  onResize(width, height) {
      this.alignUserInfo();
  }

  alignUserInfo() {
      if (!this.userInfoContainer) return;
      
      const margin = 40; // 距离屏幕边缘的距离
      
      // 获取屏幕左上角的全局坐标 + margin
      const globalPos = new PIXI.Point(margin, margin);
      
      // 转换为容器内的局部坐标
      // this.container 可能被缩放或平移，toLocal 会自动处理这些变换
      const localPos = this.container.toLocal(globalPos);
      
      this.userInfoContainer.position.set(localPos.x, localPos.y);
  }

  createUserInfo(user) {
    this.userInfoContainer = new PIXI.Container();
    const container = this.userInfoContainer;
    
    // --- 1. 头像区域 ---
    const radius = 60; // 稍微加大一点
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
             if (this.container.destroyed) return;
             
             const sprite = new PIXI.Sprite(tex);
             
             sprite.anchor.set(0.5);
             sprite.position.set(radius, radius);

             // 智能缩放 (Cover模式)
             const scale = (radius * 2) / Math.min(tex.width, tex.height);
             sprite.scale.set(scale);
             
             // 遮罩
             const mask = new PIXI.Graphics();
             mask.beginFill(0xffffff);
             mask.drawCircle(radius, radius, radius);
             mask.endFill();
             
             sprite.mask = mask;
             
             // 分离遮罩层级
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
    const textX = radius * 2 + 30;
    const textStartY = 10;
    
    // 昵称
    const nameText = new PIXI.Text(user.nickname, {
        fontFamily: 'Arial', fontSize: 40, fill: 0xFFD700, fontWeight: 'bold',
        dropShadow: true, dropShadowBlur: 2
    });
    nameText.position.set(textX, textStartY);
    container.addChild(nameText);

    // --- 3. 等级和金币 (第二行) ---
    // 等级背景
    const levelBg = new PIXI.Graphics();
    levelBg.beginFill(0x3498db); // 蓝色
    levelBg.drawRoundedRect(0, 0, 100, 40, 10);
    levelBg.endFill();
    levelBg.position.set(textX, textStartY + 60);
    container.addChild(levelBg);

    // 等级文字
    const levelText = new PIXI.Text(`Lv.${user.level}`, {
        fontFamily: 'Arial', fontSize: 24, fill: 0xFFFFFF, fontWeight: 'bold'
    });
    levelText.anchor.set(0.5);
    // 居中显示在背景中
    levelText.position.set(textX + 50, textStartY + 80); 
    container.addChild(levelText);

    // 金币文字 (放在等级右边)
    const coinsText = new PIXI.Text(`💰 ${user.coins}`, {
        fontFamily: 'Arial', fontSize: 32, fill: 0xffffff
    });
    coinsText.position.set(textX + 120, textStartY + 62);
    container.addChild(coinsText);

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
