
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
import InventoryView from '../ui/InventoryView.js'; // 新增
import MessageDialog from '../ui/MessageDialog.js'; // 新增

export default class MenuScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;
    const user = AccountMgr.userInfo;

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
    
    const avatarRadius = 60; 
    const avatarContainer = new PIXI.Container();

    // 头像背景
    const bg = new PIXI.Graphics();
    bg.beginFill(0xFFFFFF);
    bg.drawCircle(avatarRadius, avatarRadius, avatarRadius + 4); 
    bg.endFill();
    bg.beginFill(0x95a5a6);
    bg.drawCircle(avatarRadius, avatarRadius, avatarRadius); 
    bg.endFill();
    avatarContainer.addChild(bg);

    // 头像图片
    if (user.avatarUrl) {
         PIXI.Texture.fromURL(user.avatarUrl).then(tex => {
             if (this.container.destroyed) return;
             
             const sprite = new PIXI.Sprite(tex);
             sprite.anchor.set(0.5);
             sprite.position.set(avatarRadius, avatarRadius);
             const scale = (avatarRadius * 2) / Math.min(tex.width, tex.height);
             sprite.scale.set(scale);
             
             const mask = new PIXI.Graphics();
             mask.beginFill(0xffffff);
             mask.drawCircle(avatarRadius, avatarRadius, avatarRadius);
             mask.endFill();
             sprite.mask = mask;
             
             avatarContainer.addChild(sprite);
             avatarContainer.addChild(mask);
             
         }).catch(() => {
             this.createDefaultAvatar(avatarContainer, user.nickname, avatarRadius);
         });
    } else {
        this.createDefaultAvatar(avatarContainer, user.nickname, avatarRadius);
    }
    container.addChild(avatarContainer);

    // --- 左侧按钮布局 ---
    // 需求：按钮大小调整为头像尺寸的 80%
    const btnRadius = avatarRadius * 0.8; // 60 * 0.8 = 48 (直径96)
    const btnDiameter = btnRadius * 2;
    const btnGap = 20; // 按钮垂直间距
    
    // 起始 Y 坐标 (头像底部 + 间距 + 半径)
    let currentY = avatarRadius * 2 + 20 + btnRadius; 
    const btnX = avatarRadius; // 水平居中于头像

    // 1. 游戏圈 (社交)
    const socialBtn = this.createCircleBtn(btnRadius, btnX, currentY, 0x00AABB, '圈', () => {
        Platform.handleSocialAction();
    });
    container.addChild(socialBtn);
    currentY += btnDiameter + btnGap;

    // 2. 背包
    const bagBtn = this.createCircleBtn(btnRadius, btnX, currentY, 0x8E44AD, '包', () => {
        // 传入 onClose 回调，刷新金币显示
        const bagView = new InventoryView(() => {
            if (this.coinsText) {
                this.coinsText.text = `💰 ${AccountMgr.userInfo.coins}`;
            }
        });
        // 使用 this.container.addChild 添加到顶层
        this.container.addChild(bagView);
    });
    container.addChild(bagBtn);
    currentY += btnDiameter + btnGap;

    // 3. 每日签到 (如果未签到)
    if (!AccountMgr.isCheckedInToday()) {
        const checkInBtn = this.createCircleBtn(btnRadius, btnX, currentY, 0xFF5722, '签', () => {
            this.handleDailyCheckIn(checkInBtn);
        });
        container.addChild(checkInBtn);
    }

    // --- 右侧用户信息文字 ---
    const textX = avatarRadius * 2 + 30;
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
    // 保存引用方便刷新
    this.coinsText = coinsText; 
    container.addChild(coinsText);

    this.container.addChild(container);
  }

  /**
   * 创建圆形功能按钮 (支持自定义半径)
   */
  createCircleBtn(radius, x, y, color, char, onClick) {
    const btn = new PIXI.Container();
    
    const bg = new PIXI.Graphics();
    bg.beginFill(0xFFFFFF);
    bg.drawCircle(0, 0, radius);
    bg.endFill();
    bg.beginFill(color);
    bg.drawCircle(0, 0, radius - 3); // 稍微加粗一点描边效果
    bg.endFill();
    btn.addChild(bg);

    // 文字大小随半径缩放
    const fontSize = radius * 0.9; 
    const text = new PIXI.Text(char, {
        fontFamily: 'Arial', fontSize: fontSize, fill: 0xFFFFFF, fontWeight: 'bold'
    });
    text.anchor.set(0.5);
    btn.addChild(text);

    btn.position.set(x, y);
    btn.interactive = true;
    btn.buttonMode = true;
    
    btn.on('pointerdown', () => { btn.scale.set(0.9); });
    btn.on('pointerupoutside', () => { btn.scale.set(1.0); });
    btn.on('pointerup', () => { 
        btn.scale.set(1.0);
        if (onClick) onClick();
    });

    return btn;
  }

  /**
   * 处理签到逻辑
   */
  async handleDailyCheckIn(btn) {
      // 禁用按钮防止重复点击
      btn.interactive = false;

      let success = false;
      try {
          // 1. 尝试展示插屏广告
          success = await Platform.showInterstitialAd();
      } catch (err) {
          console.error("Show ad failed:", err);
          success = false;
      }
      
      let reward = 0;
      let title = "";
      let msg = "";

      if (success) {
          reward = 100;
          title = "签到成功";
          msg = "恭喜你！\n获得每日签到奖励 100 金币";
      } else {
          // 广告展示失败 (无填充或报错)，发保底
          reward = 50;
          title = "签到成功";
          msg = "广告加载失败，发送保底奖励 50 金币";
      }

      // 2. 执行加币和记录
      AccountMgr.performCheckIn(reward);

      // 3. 弹窗提示
      const dialog = new MessageDialog(title, msg, () => {
          // 4. 更新界面金币显示
          if (this.coinsText) {
              this.coinsText.text = `💰 ${AccountMgr.userInfo.coins}`;
          }
      });
      // 使用 this.container.addChild
      this.container.addChild(dialog);

      // 5. 隐藏按钮 (今日不再显示)
      if (btn && btn.parent) {
          btn.parent.removeChild(btn);
      }
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
