
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import GameScene from './GameScene.js';
import LobbyScene from './LobbyScene.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';
import Platform from '../managers/Platform.js'; // 需要引入 Platform 用来显示 Toast

export default class MenuScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;
    const user = AccountMgr.userInfo;

    // [新增] 进入主页时展示 Banner 广告
    Platform.showBannerAd();

    // 1. 背景 (优先使用图片，失败则回退到纯色)
    const bgTex = ResourceManager.get('main_bg');
    if (bgTex) {
        const bg = new PIXI.Sprite(bgTex);
        bg.anchor.set(0.5);
        // 高度适配：让背景高度填满屏幕设计高度
        bg.height = designHeight;
        // 保持宽高比
        bg.scale.x = bg.scale.y; 
        
        // 居中显示
        bg.position.set(designWidth / 2, designHeight / 2);
        
        // 稍微压暗，突出前景UI
        bg.tint = 0xCCCCCC; 
        
        this.container.addChild(bg);
    } else {
        const bg = new PIXI.Graphics();
        bg.beginFill(0x2c3e50);
        bg.drawRect(0, 0, designWidth, designHeight);
        bg.endFill();
        this.container.addChild(bg);
    }

    // 用户信息 (左上角，包含等级)
    this.createUserInfo(user);

    // 标题
    const btnTexture = ResourceManager.get('btn_menu');

    // 按钮组 (右侧垂直排列)
    // 稍微调整布局，因为图片按钮可能视觉重心更重
    const btnX = designWidth * 0.75;
    const startY = designHeight * 0.35;
    const gap = 160; // 图片按钮通常较大，增加间距

    // 通用按钮配置
    const btnConfig = {
        width: 560,  // 稍微加大宽度
        height: 144, // 稍微加大高度以容纳图片细节
        texture: btnTexture, // 传入图片纹理
        color: 0x3498db,     // 兜底颜色 (如果图片没加载)
        fontSize: 50,        // 字号加大
        textColor: 0xFFFFFF  // 白色文字配合大多数游戏按钮背景都好看
    };
    const entryFee = GameConfig.gameplay.economy.entryFee;
    // 1. PVE 按钮
    const pveBtn = new Button({ 
        ...btnConfig,
        text: `单人挑战 (门票${entryFee})`, 
        onClick: () => {
            // PVE 模式：仅检查余额，结算时再扣费
            if (AccountMgr.userInfo.coins >= entryFee) {
                SceneManager.changeScene(GameScene, { mode: 'pve' });
            } else {
                Platform.showToast(`金币不足，需要${entryFee}金币`);
            }
        } 
    });
    pveBtn.position.set(btnX - 210, startY);
    
    const pvpLocalBtn = new Button({ 
        ...btnConfig,
        text: '本地双人', 
        onClick: () => SceneManager.changeScene(GameScene, { mode: 'pvp_local' }) 
    });
    pvpLocalBtn.position.set(btnX - 210, startY + gap);

    const pvpOnlineBtn = new Button({
        ...btnConfig, 
        text: `网络对战 (门票${entryFee})`,
        onClick: () => {
            // 网络对战：仅检查余额
            if (AccountMgr.userInfo.coins >= entryFee) {
                SceneManager.changeScene(LobbyScene);
            } else {
                Platform.showToast(`金币不足，需要${entryFee}金币`);
            }
        } 
    });
    pvpOnlineBtn.position.set(btnX - 200, startY + gap * 2);

    this.container.addChild(pveBtn, pvpLocalBtn, pvpOnlineBtn);

    // 初始对齐
    this.alignUserInfo();
  }

  // 响应屏幕尺寸变化
  onResize(width, height) {
      this.alignUserInfo();
  }
  
  // [新增] 离开场景时隐藏 Banner 广告 (防止遮挡游戏画面)
  onExit() {
      super.onExit();
      Platform.hideBannerAd();
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

    // --- [新增] 社交按钮 (朋友圈风格图标) ---
    // 放在头像下方
    const socialBtn = new PIXI.Container();
    const btnRadius = 40;
    const btnX = radius;
    const btnY = radius * 2 + 65; // 头像底部是 radius*2，再往下一点

    // 1. 白色圆底
    const sBg = new PIXI.Graphics();
    sBg.beginFill(0xFFFFFF);
    sBg.drawCircle(0, 0, btnRadius);
    sBg.endFill();
    // 2. 灰色边框
    sBg.lineStyle(2, 0xDDDDDD);
    sBg.drawCircle(0, 0, btnRadius);
    socialBtn.addChild(sBg);

    // 3. 绘制图标 (模拟多彩光圈/朋友圈图标)
    const icon = new PIXI.Graphics();
    const iconR = btnRadius * 0.6;
    const strokeW = 4;
    // 简化版：画一个彩色的圆环
    // 红
    icon.lineStyle(strokeW, 0xFF5252);
    icon.arc(0, 0, iconR, 0, Math.PI * 0.5);
    // 绿
    icon.lineStyle(strokeW, 0x4CAF50);
    icon.arc(0, 0, iconR, Math.PI * 0.5, Math.PI);
    // 蓝
    icon.lineStyle(strokeW, 0x2196F3);
    icon.arc(0, 0, iconR, Math.PI, Math.PI * 1.5);
    // 黄
    icon.lineStyle(strokeW, 0xFFC107);
    icon.arc(0, 0, iconR, Math.PI * 1.5, Math.PI * 2);

    socialBtn.addChild(icon);
    
    // 交互逻辑
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
    // ------------------------------------

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
