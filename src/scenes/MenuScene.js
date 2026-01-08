
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import GameScene from './GameScene.js';
import LobbyScene from './LobbyScene.js';
import LevelSelectScene from './LevelSelectScene.js'; 
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';
import Platform from '../managers/Platform.js'; 
import InventoryView from '../ui/InventoryView.js'; 
import ThemeSelectionDialog from '../ui/ThemeSelectionDialog.js'; 
import MessageDialog from '../ui/MessageDialog.js'; 
import EventBus from '../managers/EventBus.js';
import { Events } from '../constants.js'; // [新增] 引入 Events
import ResultScene from './ResultScene.js'; 
export default class MenuScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;
    const user = AccountMgr.userInfo;

    this.checkInBtn = null;
    this.shakeTimer = 9000;

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
    
    // 1. PVE
    const pveBtn = new Button({ 
        ...btnConfig,
        text: `单人闯关`, 
        onClick: () => {
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

    // [新增] 监听数据刷新事件
    EventBus.on(Events.USER_DATA_REFRESHED, this.refreshUI, this);
  }

  // [新增] 刷新 UI 数据
  refreshUI() {
      if (this.destroyed) return;
      const user = AccountMgr.userInfo;
      
      // 刷新金币
      if (this.coinsText) {
          this.coinsText.text = `💰 ${user.coins}`;
      }
      
      // 刷新等级
      if (this.levelText) {
          this.levelText.text = `Lv.${user.level}`;
      }

      // 刷新昵称 (如果后台变了)
      if (this.nameText) {
          this.nameText.text = user.nickname;
      }

      // 如果需要刷新头像，这里也可以处理，但头像加载较重通常不频繁变动
  }

  // 响应屏幕尺寸变化
  onResize(width, height) {
      this.alignUserInfo();
  }
  
  onExit() {
      super.onExit();
      // [新增] 移除监听
      EventBus.off(Events.USER_DATA_REFRESHED, this.refreshUI, this);
  }

  update(delta) {
      // 签到按钮动效: 间隔10秒左右晃动
      if (this.checkInBtn && this.checkInBtn.parent && this.checkInBtn.visible) {
          this.shakeTimer += delta;
          const interval = 10000; // 10秒
          const shakeDuration = 900; // [修改] 晃动时长 600 -> 900 (+50%)
          
          if (this.shakeTimer >= interval) {
              if (this.shakeTimer < interval + shakeDuration) {
                  // 晃动中
                  const t = this.shakeTimer - interval;
                  // 频率 0.03, 幅度 0.15弧度 (约8.5度)
                  this.checkInBtn.rotation = Math.sin(t * 0.03) * 0.15;
              } else {
                  // 晃动结束，重置
                  this.checkInBtn.rotation = 0;
                  this.shakeTimer = 0;
              }
          }
      }
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
    const btnRadius = avatarRadius * 0.8; 
    const btnDiameter = btnRadius * 2;
    const btnGap = 50; 
    
    let currentY = avatarRadius * 2 + 20 + btnRadius; 
    const btnX = avatarRadius; 

    // 1. 游戏圈
    const socialBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_social', '查看游戏圈', 0x00AABB, () => {
        Platform.handleSocialAction();
    });
    container.addChild(socialBtn);
    currentY += btnDiameter + btnGap;

    // 2. 背包
    const bagBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_bag', '我的背包', 0x8E44AD, () => {
        const bagView = new InventoryView(() => {
            if (this.coinsText) {
                this.coinsText.text = `💰 ${AccountMgr.userInfo.coins}`;
            }
        });
        this.container.addChild(bagView);
    });
    container.addChild(bagBtn);
    currentY += btnDiameter + btnGap;

    // 3. 主题
    const themeBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_theme', '主题装扮', 0xF39C12, () => {
        const themeDialog = new ThemeSelectionDialog(() => {
        });
        this.container.addChild(themeDialog);
    });
    container.addChild(themeBtn);
    currentY += btnDiameter + btnGap;

    // 4. 每日签到
    if (!AccountMgr.isCheckedInToday()) {
        this.checkInBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_checkin', '签到有奖', 0xFF5722, () => {
            this.handleDailyCheckIn(this.checkInBtn);
        });
        container.addChild(this.checkInBtn);
    }

    // --- 右侧用户信息文字 ---
    const textX = avatarRadius * 2 + 30;
    const textStartY = 10;
    
    const nameText = new PIXI.Text(user.nickname, {
        fontFamily: 'Arial', fontSize: 40, fill: 0xFFD700, fontWeight: 'bold',
        dropShadow: true, dropShadowBlur: 2
    });
    nameText.position.set(textX, textStartY);
    this.nameText = nameText; // 保存引用
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
    this.levelText = levelText; // 保存引用
    container.addChild(levelText);

    const coinsText = new PIXI.Text(`💰 ${user.coins}`, {
        fontFamily: 'Arial', fontSize: 32, fill: 0xffffff
    });
    coinsText.position.set(textX + 120, textStartY + 62);
    this.coinsText = coinsText; // 保存引用
    container.addChild(coinsText);

    this.container.addChild(container);
  }

  createIconBtn(radius, x, y, textureKey, label, fallbackColor, onClick) {
    const btn = new PIXI.Container();
    btn.position.set(x, y);

    const tex = ResourceManager.get(textureKey);

    if (tex) {
        const sprite = new PIXI.Sprite(tex);
        sprite.anchor.set(0.5);
        sprite.width = radius * 2;
        sprite.height = radius * 2;
        btn.addChild(sprite);
    } else {
        const bg = new PIXI.Graphics();
        bg.beginFill(0xFFFFFF);
        bg.drawCircle(0, 0, radius);
        bg.endFill();
        bg.beginFill(fallbackColor);
        bg.drawCircle(0, 0, radius - 3);
        bg.endFill();
        btn.addChild(bg);

        const char = label.charAt(0);
        const centerText = new PIXI.Text(char, {
            fontFamily: 'Arial', fontSize: radius * 0.9, fill: 0xFFFFFF, fontWeight: 'bold'
        });
        centerText.anchor.set(0.5);
        btn.addChild(centerText);
    }

    const labelText = new PIXI.Text(label, {
        fontFamily: 'Arial', fontSize: 24, fill: 0xFFFFFF, fontWeight: 'bold',
        dropShadow: true, dropShadowBlur: 2, dropShadowColor: 0x000000
    });
    labelText.anchor.set(0.5);
    labelText.position.set(0, radius + 25);
    btn.addChild(labelText);

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

  async handleDailyCheckIn(btn) {
      if (btn) btn.interactive = false;
      let success = false;
      try {
          success = await Platform.showInterstitialAd();
      } catch (err) {
          success = false;
      }
      
      let reward = success ? 100 : 50;
      let title = "签到成功";
      let msg = success ? "恭喜你！\n获得每日签到奖励 100 金币" : "广告加载失败，发送保底奖励 50 金币";

      AccountMgr.performCheckIn(reward);

      const dialog = new MessageDialog(title, msg, () => {
          if (this.coinsText) {
              this.coinsText.text = `💰 ${AccountMgr.userInfo.coins}`;
          }
      });
      this.container.addChild(dialog);

      if (btn && btn.parent) {
          btn.parent.removeChild(btn);
      }
      this.checkInBtn = null; // 停止晃动动画
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
