
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
import LotteryDialog from '../ui/LotteryDialog.js'; // [新增]
import { drawLottery } from '../config/LotteryConfig.js'; // [新增]
import EventBus from '../managers/EventBus.js';
import { Events } from '../constants.js'; 
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
    
    // 1. PVE (无需解锁)
    const pveBtn = new Button({ 
        ...btnConfig,
        text: `单人闯关`, 
        onClick: () => {
            SceneManager.changeScene(LevelSelectScene);
        } 
    });
    pveBtn.position.set(btnX - 210, startY);
    this.container.addChild(pveBtn);
    
    // 2. 本地双人 (需每日解锁)
    const pvpLocalBtn = new Button({ 
        ...btnConfig,
        text: '本地双人', 
        onClick: () => {
            this.handleModeEntry('local_pvp', () => {
                SceneManager.changeScene(GameScene, { mode: 'pvp_local' });
            });
        } 
    });
    pvpLocalBtn.position.set(btnX - 210, startY + gap);
    this.container.addChild(pvpLocalBtn);
    
    // 检查并添加锁图标
    this.updateLockStatus(pvpLocalBtn, 'local_pvp');

    // 3. 网络对战 (需每日解锁)
    const pvpOnlineBtn = new Button({
        ...btnConfig, 
        text: `网络对战`,
        onClick: () => {
            if (AccountMgr.userInfo.coins >= entryFee) {
                this.handleModeEntry('online_pvp', () => {
                    SceneManager.changeScene(LobbyScene);
                });
            } else {
                Platform.showToast(`金币不足，需要${entryFee}金币`);
            }
        } 
    });
    pvpOnlineBtn.position.set(btnX - 200, startY + gap * 2);
    this.container.addChild(pvpOnlineBtn);

    // 检查并添加锁图标
    this.updateLockStatus(pvpOnlineBtn, 'online_pvp');

    this.alignUserInfo();

    // [新增] 监听数据刷新事件
    EventBus.on(Events.USER_DATA_REFRESHED, this.refreshUI, this);
  }

  /**
   * [新增] 处理模式入口逻辑（含广告锁）
   * @param {string} modeKey 
   * @param {Function} onSuccess 
   */
  handleModeEntry(modeKey, onSuccess) {
      if (AccountMgr.isModeUnlocked(modeKey)) {
          // 已解锁，直接进入
          onSuccess();
      } else {
          // 未解锁，弹窗提示看广告
          const dialog = new MessageDialog(
              "解锁玩法", 
              "观看一次视频，今日无限畅玩该模式！", 
              async () => {
                  const adUnitId = GameConfig.adConfig[Platform.env].rewardedVideo['unlock_mode'] || "";
                  const success = await Platform.showRewardedVideoAd(adUnitId);
                  if (success) {
                      AccountMgr.unlockMode(modeKey);
                      Platform.showToast("解锁成功！今日免费畅玩");
                      // 刷新按钮状态
                      this.refreshLockIcons();
                      // 进入
                      onSuccess();
                  }
              }
          );
          // 修改 MessageDialog 的确认按钮文字会更友好，这里默认是 "确定"
          this.container.addChild(dialog);
      }
  }

  /**
   * [新增] 更新按钮上的锁图标
   */
  updateLockStatus(btn, modeKey) {
      // 如果已存在锁图标，先移除
      const existingLock = btn.inner.getChildByName('lockIcon');
      if (existingLock) {
          btn.inner.removeChild(existingLock);
      }

      // 如果未解锁，添加图标
      if (!AccountMgr.isModeUnlocked(modeKey)) {
          const lockContainer = new PIXI.Container();
          lockContainer.name = 'lockIcon';
          
          // 黄色背景圆
          const bg = new PIXI.Graphics();
          bg.beginFill(0xF1C40F);
          bg.lineStyle(2, 0xFFFFFF);
          bg.drawCircle(0, 0, 24);
          bg.endFill();
          
          // 播放三角形 (代表看视频)
          const icon = new PIXI.Graphics();
          icon.beginFill(0x333333);
          icon.moveTo(-5, -8);
          icon.lineTo(8, 0);
          icon.lineTo(-5, 8);
          icon.endFill();

          lockContainer.addChild(bg, icon);
          // 放置在按钮右上角区域 (相对于中心)
          lockContainer.position.set(btn.options.width / 2 - 140, -btn.options.height / 2 + 65);
          
          btn.inner.addChild(lockContainer);
      }
  }

  /**
   * [新增] 刷新所有按钮的锁状态
   */
  refreshLockIcons() {
      // 遍历容器子对象寻找按钮 (简单起见，按添加顺序或文本内容找，这里简化假设)
      // 在实际项目中最好保存按钮引用。这里我们简单重新 update 所有可能带锁的按钮
      this.container.children.forEach(child => {
          if (child instanceof Button) {
              if (child.options.text.includes('本地双人')) {
                  this.updateLockStatus(child, 'local_pvp');
              } else if (child.options.text.includes('网络对战')) {
                  this.updateLockStatus(child, 'online_pvp');
              }
          }
      });
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
      
      // 刷新解锁状态
      this.refreshLockIcons();
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
          const shakeDuration = 900; 
          
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
        return
        let resultParms = {
            "winner": 0,
            "gameMode": "pve",
            "currentLevel": 2,
            "score": {
                "0": 1,
                "1": 2
            },
            "stats": {
                "0": {
                    "shots": 9,
                    "skills": {
                        "super_force": 7
                    }
                },
                "1": {
                    "shots": 8,
                    "skills": {}
                },
                "startTime": 1768366353347,
                "endTime": 1768366440828
            },
            "players": [],
            "myTeamId": 0,
            "roomId": null
        };
        SceneManager.changeScene(ResultScene, resultParms);

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
        this.checkInBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_checkin', '每日一抽', 0xFF5722, () => {
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
      
      // 1. 播放广告
      let success = false;
      try {
          success = await Platform.showInterstitialAd();
      } catch (err) {
          success = false;
      }
      
      // 2. 广告结束后显示抽奖盘
      if (success) {
          // 抽取奖品 (逻辑层)
          const prize = drawLottery();
          
          // 显示抽奖弹窗
          const lotteryDialog = new LotteryDialog(prize, () => {
              // 动画结束后发放奖励并刷新 UI
              AccountMgr.processLotteryReward(prize);
              this.refreshUI();
              
              // 移除签到按钮
              if (btn && btn.parent) {
                  btn.parent.removeChild(btn);
              }
              this.checkInBtn = null;
          });
          
          this.container.addChild(lotteryDialog);
      } else {
          // 广告失败，给保底奖励
          Platform.showToast("广告加载失败，获得保底奖励: 50 金币");
          AccountMgr.addCoins(50, true);
          AccountMgr.performCheckIn(0); // 记录签到
          
          if (btn && btn.parent) {
              btn.parent.removeChild(btn);
          }
          this.checkInBtn = null;
          this.refreshUI();
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
