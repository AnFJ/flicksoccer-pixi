
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import GameScene from './GameScene.js';
import LobbyScene from './LobbyScene.js';
import LevelSelectScene from './LevelSelectScene.js'; // 引入新场景
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';
import Platform from '../managers/Platform.js'; 

export default class MenuScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;
    const user = AccountMgr.userInfo;

    Platform.showBannerAd();

    // 1. 背景
    const bgTex = ResourceManager.get('main_bg');
    if (bgTex) {
        const bg = new PIXI.Sprite(bgTex);
        bg.anchor.set(0.5);
        bg.height = designHeight;
        bg.scale.x = bg.scale.y; 
        bg.position.set(designWidth / 2, designHeight / 2);
        bg.tint = 0xCCCCCC; 
        this.container.addChild(bg);
    } else {
        const bg = new PIXI.Graphics();
        bg.beginFill(0x2c3e50);
        bg.drawRect(0, 0, designWidth, designHeight);
        bg.endFill();
        this.container.addChild(bg);
    }

    // 用户信息
    this.createUserInfo(user);

    // 按钮组
    const btnTexture = ResourceManager.get('btn_menu');
    const btnX = designWidth * 0.75;
    const startY = designHeight * 0.35;
    const gap = 160; 

    const btnConfig = {
        width: 560,  
        height: 144, 
        texture: btnTexture, 
        color: 0x3498db,     
        fontSize: 50,        
        textColor: 0xFFFFFF  
    };
    const entryFee = GameConfig.gameplay.economy.entryFee;
    
    // 1. PVE 按钮 -> 跳转到关卡选择
    const pveBtn = new Button({ 
        ...btnConfig,
        text: `单人闯关`, 
        onClick: () => {
            // 进入关卡选择不需要扣费，进入具体关卡再扣或不扣(通常PVE按体力或免费)
            // 这里假设PVE免费或在GameScene处理
            SceneManager.changeScene(LevelSelectScene);
        } 
    });
    pveBtn.position.set(btnX - 210, startY);
    
    // 2. 本地双人
    const pvpLocalBtn = new Button({ 
        ...btnConfig,
        text: '本地双人', 
        onClick: () => SceneManager.changeScene(GameScene, { mode: 'pvp_local' }) 
    });
    pvpLocalBtn.position.set(btnX - 210, startY + gap);

    // 3. 网络对战
    const pvpOnlineBtn = new Button({
        ...btnConfig, 
        text: `网络对战 (门票${entryFee})`,
        onClick: () => {
            if (AccountMgr.userInfo.coins >= entryFee) {
                SceneManager.changeScene(LobbyScene);
            } else {
                Platform.showToast(`金币不足，需要${entryFee}金币`);
            }
        } 
    });
    pvpOnlineBtn.position.set(btnX - 200, startY + gap * 2);

    this.container.addChild(pveBtn, pvpLocalBtn, pvpOnlineBtn);

    this.alignUserInfo();
  }

  // 响应屏幕尺寸变化
  onResize(width, height) {
      this.alignUserInfo();
  }
  
  onExit() {
      super.onExit();
      Platform.hideBannerAd();
  }

  alignUserInfo() {
      if (!this.userInfoContainer) return;
      const margin = 40; 
      const globalPos = new PIXI.Point(margin, margin);
      const localPos = this.container.toLocal(globalPos);
      this.userInfoContainer.position.set(localPos.x, localPos.y);
  }

  createUserInfo(user) {
    this.userInfoContainer = new PIXI.Container();
    const container = this.userInfoContainer;
    
    const radius = 60; 
    const avatarContainer = new PIXI.Container();

    const bg = new PIXI.Graphics();
    bg.beginFill(0xFFFFFF);
    bg.drawCircle(radius, radius, radius + 4); 
    bg.endFill();
    bg.beginFill(0x95a5a6);
    bg.drawCircle(radius, radius, radius); 
    bg.endFill();
    avatarContainer.addChild(bg);

    if (user.avatarUrl) {
         PIXI.Texture.fromURL(user.avatarUrl).then(tex => {
             if (this.container.destroyed) return;
             
             const sprite = new PIXI.Sprite(tex);
             sprite.anchor.set(0.5);
             sprite.position.set(radius, radius);
             const scale = (radius * 2) / Math.min(tex.width, tex.height);
             sprite.scale.set(scale);
             
             const mask = new PIXI.Graphics();
             mask.beginFill(0xffffff);
             mask.drawCircle(radius, radius, radius);
             mask.endFill();
             sprite.mask = mask;
             
             avatarContainer.addChild(sprite);
             avatarContainer.addChild(mask);
             
         }).catch(() => {
             this.createDefaultAvatar(avatarContainer, user.nickname, radius);
         });
    } else {
        this.createDefaultAvatar(avatarContainer, user.nickname, radius);
    }
    container.addChild(avatarContainer);

    // 社交按钮
    const socialBtn = new PIXI.Container();
    const btnRadius = 24;
    const btnX = radius;
    const btnY = radius * 2 + 35; 

    const sBg = new PIXI.Graphics();
    sBg.beginFill(0xFFFFFF);
    sBg.drawCircle(0, 0, btnRadius);
    sBg.endFill();
    sBg.lineStyle(2, 0xDDDDDD);
    sBg.drawCircle(0, 0, btnRadius);
    socialBtn.addChild(sBg);

    const icon = new PIXI.Graphics();
    const iconR = btnRadius * 0.6;
    const strokeW = 4;
    icon.lineStyle(strokeW, 0xFF5252);
    icon.arc(0, 0, iconR, 0, Math.PI * 0.5);
    icon.lineStyle(strokeW, 0x4CAF50);
    icon.arc(0, 0, iconR, Math.PI * 0.5, Math.PI);
    icon.lineStyle(strokeW, 0x2196F3);
    icon.arc(0, 0, iconR, Math.PI, Math.PI * 1.5);
    icon.lineStyle(strokeW, 0xFFC107);
    icon.arc(0, 0, iconR, Math.PI * 1.5, Math.PI * 2);

    socialBtn.addChild(icon);
    
    socialBtn.position.set(btnX, btnY);
    socialBtn.interactive = true;
    socialBtn.buttonMode = true;
    
    socialBtn.on('pointerdown', () => { socialBtn.scale.set(0.9); });
    socialBtn.on('pointerupoutside', () => { socialBtn.scale.set(1.0); });
    socialBtn.on('pointerup', () => { 
        socialBtn.scale.set(1.0);
        Platform.handleSocialAction();
    });

    container.addChild(socialBtn);

    const textX = radius * 2 + 30;
    const textStartY = 10;
    
    const nameText = new PIXI.Text(user.nickname, {
        fontFamily: 'Arial', fontSize: 40, fill: 0xFFD700, fontWeight: 'bold',
        dropShadow: true, dropShadowBlur: 2
    });
    nameText.position.set(textX, textStartY);
    container.addChild(nameText);

    const levelBg = new PIXI.Graphics();
    levelBg.beginFill(0x3498db); 
    levelBg.drawRoundedRect(0, 0, 100, 40, 10);
    levelBg.endFill();
    levelBg.position.set(textX, textStartY + 60);
    container.addChild(levelBg);

    const levelText = new PIXI.Text(`Lv.${user.level}`, {
        fontFamily: 'Arial', fontSize: 24, fill: 0xFFFFFF, fontWeight: 'bold'
    });
    levelText.anchor.set(0.5);
    levelText.position.set(textX + 50, textStartY + 80); 
    container.addChild(levelText);

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
