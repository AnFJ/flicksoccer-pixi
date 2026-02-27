
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import GameScene from './GameScene.js';
import LobbyScene from './LobbyScene.js';
import LevelSelectScene from './LevelSelectScene.js'; 
import FoosballMenuScene from '../subpackages/foosball/scenes/FoosballMenuScene.js'; 
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';
import Platform from '../managers/Platform.js'; 
import InventoryView from '../ui/InventoryView.js'; 
import ThemeSelectionDialog from '../ui/ThemeSelectionDialog.js'; 
import MessageDialog from '../ui/MessageDialog.js'; 
import LotteryDialog from '../ui/LotteryDialog.js'; 
import { drawLottery } from '../config/LotteryConfig.js'; 
import EventBus from '../managers/EventBus.js';
import { Events } from '../constants.js'; 

import UserBehaviorMgr from '../managers/UserBehaviorMgr.js';

import LiveFlickScene from '../subpackages/live_flick/scenes/LiveFlickScene.js';

export default class MenuScene extends BaseScene {
  onEnter() {
    super.onEnter();
    UserBehaviorMgr.log('SYSTEM', '进入菜单页');
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

    // 用户信息 (内部会包含新的德式桌球图片按钮)
    this.createUserInfo(user);

    // 按钮组
    const btnTexture = ResourceManager.get('btn_menu');
    const btnX = designWidth * 0.75;
    
    // 调整布局以容纳 3 个主要按钮 (移除了德式桌球按钮)
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
            UserBehaviorMgr.log('GAME', '进入单人模式');
            SceneManager.changeScene(LevelSelectScene);
        } 
    });
    pveBtn.position.set(btnX - 210, startY);
    this.container.addChild(pveBtn);
    
    // 2. 本地双人
    const pvpLocalBtn = new Button({ 
        ...btnConfig,
        text: '本地双人', 
        onClick: () => {
            this.handleModeEntry('local_pvp', () => {
                UserBehaviorMgr.log('GAME', '进入本地双人');
                SceneManager.changeScene(GameScene, { mode: 'pvp_local' });
            });
        } 
    });
    pvpLocalBtn.position.set(btnX - 210, startY + gap);
    this.container.addChild(pvpLocalBtn);
    this.updateLockStatus(pvpLocalBtn, 'local_pvp');

    // 3. 网络对战
    const pvpOnlineBtn = new Button({
        ...btnConfig, 
        text: `网络对战`,
        onClick: () => {
            if (AccountMgr.userInfo.coins >= entryFee) {
                this.handleModeEntry('online_pvp', () => {
                    UserBehaviorMgr.log('GAME', '进入网络对战');
                    SceneManager.changeScene(LobbyScene);
                });
            } else {
                Platform.showToast(`金币不足，需要${entryFee}金币`);
            }
        } 
    });
    pvpOnlineBtn.position.set(btnX - 200, startY + gap * 2);
    this.container.addChild(pvpOnlineBtn);
    this.updateLockStatus(pvpOnlineBtn, 'online_pvp');

    this.alignUserInfo();

    // 监听数据刷新事件
    EventBus.on(Events.USER_DATA_REFRESHED, this.refreshUI, this);

    // [新增] 检查并展示每日插屏广告
    Platform.checkAndShowDailyInterstitial();

    // [新增] 延迟预加载分包，提升后续体验
    setTimeout(() => {
        if (this.destroyed) return;
        // 预加载实况弹指
        Platform.loadSubpackage('live_flick').catch(() => {});
        // 预加载德式桌球
        Platform.loadSubpackage('foosball').then(() => {
            // 德式桌球还需要加载资源
            ResourceManager.loadFoosballResources().catch(() => {});
        }).catch(() => {});
    }, 1000);
  }

  handleModeEntry(modeKey, onSuccess) {
      if (AccountMgr.isModeUnlocked(modeKey)) {
          onSuccess();
      } else {
          const dialog = new MessageDialog(
              "解锁玩法", 
              "观看一次视频，今日无限畅玩该模式！", 
              async () => {
                  let adUnitId = "";
                  if (modeKey === 'local_pvp') {
                      adUnitId = GameConfig.adConfig[Platform.env].rewardedVideo['unlock_mode_local'] || GameConfig.adConfig[Platform.env].rewardedVideo['unlock_mode'];
                  } else if (modeKey === 'online_pvp') {
                      adUnitId = GameConfig.adConfig[Platform.env].rewardedVideo['unlock_mode_online'] || GameConfig.adConfig[Platform.env].rewardedVideo['unlock_mode'];
                  } else {
                      adUnitId = GameConfig.adConfig[Platform.env].rewardedVideo['unlock_mode'];
                  }
                  
                  const success = await Platform.showRewardedVideoAd(adUnitId);
                  if (success) {
                      AccountMgr.unlockMode(modeKey);
                      UserBehaviorMgr.log('GAME', '解锁模式成功', { mode: modeKey });
                      Platform.showToast("解锁成功！今日免费畅玩");
                      this.refreshLockIcons();
                      onSuccess();
                  } else {
                      UserBehaviorMgr.log('GAME', '解锁模式失败', { mode: modeKey });
                  }
              }
          );
          this.container.addChild(dialog);
      }
  }

  updateLockStatus(btn, modeKey) {
      const existingLock = btn.inner.getChildByName('lockIcon');
      if (existingLock) {
          btn.inner.removeChild(existingLock);
      }

      if (!AccountMgr.isModeUnlocked(modeKey)) {
          const lockContainer = new PIXI.Container();
          lockContainer.name = 'lockIcon';
          
          const bg = new PIXI.Graphics();
          bg.beginFill(0xF1C40F);
          bg.lineStyle(2, 0xFFFFFF);
          bg.drawCircle(0, 0, 24);
          bg.endFill();
          
          const icon = new PIXI.Graphics();
          icon.beginFill(0x333333);
          icon.moveTo(-5, -8);
          icon.lineTo(8, 0);
          icon.lineTo(-5, 8);
          icon.endFill();

          lockContainer.addChild(bg, icon);
          lockContainer.position.set(btn.options.width / 2 - 140, -btn.options.height / 2 + 65);
          
          btn.inner.addChild(lockContainer);
      }
  }

  refreshLockIcons() {
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

  refreshUI() {
      if (this.destroyed) return;
      const user = AccountMgr.userInfo;
      if (this.coinsText) this.coinsText.text = `💰 ${user.coins}`;
      if (this.levelText) this.levelText.text = `Lv.${user.level}`;
      if (this.nameText) this.nameText.text = user.nickname;
      this.refreshLockIcons();
      // [修复] 刷新头像
      this.updateAvatar(user.avatarUrl, user.nickname);
  }

  onResize(width, height) {
      this.alignUserInfo();
  }
  
  onExit() {
      super.onExit();
      EventBus.off(Events.USER_DATA_REFRESHED, this.refreshUI, this);
      Platform.hideGameAds();
  }

  update(delta) {
      if (this.checkInBtn && this.checkInBtn.parent && this.checkInBtn.visible) {
          this.shakeTimer += delta;
          const interval = 10000; 
          const shakeDuration = 900; 
          
          if (this.shakeTimer >= interval) {
              if (this.shakeTimer < interval + shakeDuration) {
                  const t = this.shakeTimer - interval;
                  this.checkInBtn.rotation = Math.sin(t * 0.03) * 0.15;
              } else {
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
    this.avatarContainer = new PIXI.Container();
    const avatarContainer = this.avatarContainer;

    // [新增] 允许点击头像更新资料
    avatarContainer.interactive = true;
    avatarContainer.buttonMode = true;
    avatarContainer.on('pointerup', () => {
        UserBehaviorMgr.log('PROFILE', '点击头像');
        // [修改] 允许所有环境尝试更新资料 (Web环境会模拟)
        Platform.showToast("正在获取头像...");
        
        Platform.getUserProfile().then((userInfo) => {
            if (userInfo) {
                AccountMgr.updateUserProfile({
                    nickName: userInfo.nickName,
                    avatarUrl: userInfo.avatarUrl
                });
                UserBehaviorMgr.log('PROFILE', '更新头像成功');
                Platform.showToast("资料更新成功");
                EventBus.emit(Events.USER_DATA_REFRESHED);
            } else {
                UserBehaviorMgr.log('PROFILE', '更新头像失败', { reason: 'cancel_or_fail' });
                Platform.showToast("获取失败或取消");
            }
        }).catch(err => {
            UserBehaviorMgr.log('PROFILE', '更新头像失败', { reason: err.message });
            console.error("Get user profile error:", err);
            Platform.showToast("获取失败");
        });
    });

    const bg = new PIXI.Graphics();
    bg.beginFill(0xFFFFFF);
    bg.drawCircle(avatarRadius, avatarRadius, avatarRadius + 4); 
    bg.endFill();
    bg.beginFill(0x95a5a6);
    bg.drawCircle(avatarRadius, avatarRadius, avatarRadius); 
    bg.endFill();
    avatarContainer.addChild(bg);

    // [修改] 使用统一方法加载头像
    this.updateAvatar(user.avatarUrl, user.nickname);
    
    container.addChild(avatarContainer);

    const btnRadius = avatarRadius * 0.8; 
    const btnDiameter = btnRadius * 2;
    const btnGap = 50; 
    
    let currentY = avatarRadius * 2 + 20 + btnRadius; 
    const btnX = avatarRadius; 

    const socialBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_social', '查看游戏圈', 0x00AABB, () => {
        UserBehaviorMgr.log('SOCIAL', '点击朋友圈');
        Platform.handleSocialAction();
    });
    container.addChild(socialBtn);
    currentY += btnDiameter + btnGap;

    const bagBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_bag', '我的背包', 0x8E44AD, () => {
        UserBehaviorMgr.log('INVENTORY', '点击背包');
        const bagView = new InventoryView(() => {
            if (this.coinsText) {
                this.coinsText.text = `💰 ${AccountMgr.userInfo.coins}`;
            }
        });
        this.container.addChild(bagView);
    });
    container.addChild(bagBtn);
    currentY += btnDiameter + btnGap;

    const themeBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_theme', '主题装扮', 0xF39C12, () => {
        UserBehaviorMgr.log('THEME', '点击主题');
        const themeDialog = new ThemeSelectionDialog(() => {
        });
        this.container.addChild(themeDialog);
    });
    container.addChild(themeBtn);
    currentY += btnDiameter + btnGap;

    if (!AccountMgr.isCheckedInToday()) {
        this.checkInBtn = this.createIconBtn(btnRadius, btnX, currentY, 'icon_checkin', '每日一抽', 0xFF5722, () => {
            UserBehaviorMgr.log('CHECKIN', '点击每日一抽');
            this.handleDailyCheckIn(this.checkInBtn);
        });
        container.addChild(this.checkInBtn);
    }

    const textX = avatarRadius * 2 + 30;
    const textStartY = 10;
    
    const nameText = new PIXI.Text(user.nickname, {
        fontFamily: 'Arial', fontSize: 40, fill: 0xFFD700, fontWeight: 'bold',
        dropShadow: true, dropShadowBlur: 2
    });
    nameText.position.set(textX, textStartY);
    this.nameText = nameText; 
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
    this.levelText = levelText; 
    container.addChild(levelText);

    const coinsText = new PIXI.Text(`💰 ${user.coins}`, {
        fontFamily: 'Arial', fontSize: 32, fill: 0xffffff
    });
    coinsText.position.set(textX + 120, textStartY + 62);
    this.coinsText = coinsText; 
    container.addChild(coinsText);

    // [新增] 在信息栏右侧添加纯图片的德式桌球入口按钮
    const foosballIconTex = ResourceManager.get('foosball_icon_btn');
    if (foosballIconTex && user.level >= 50) {
        const foosballIconBtn = new PIXI.Sprite(foosballIconTex);
        foosballIconBtn.anchor.set(0, 0.5);
        // 位置设定：位于金币文本右侧约 120px -> 改为更远，避免与实况弹指重叠
        foosballIconBtn.position.set(textX + 550, textStartY + 45);
        
        // 设置尺寸，假设图片较大，缩小到合适高度 (约 80px)
        const targetH = 140;
        foosballIconBtn.scale.set(targetH / foosballIconTex.height);
        
        foosballIconBtn.interactive = true;
        foosballIconBtn.buttonMode = true;
        
        foosballIconBtn.on('pointerdown', () => foosballIconBtn.scale.set((targetH / foosballIconTex.height) * 0.9));
        foosballIconBtn.on('pointerupoutside', () => foosballIconBtn.scale.set(targetH / foosballIconTex.height));
        foosballIconBtn.on('pointerup', async () => {
            foosballIconBtn.scale.set(targetH / foosballIconTex.height);
            UserBehaviorMgr.log('GAME', '进入德式桌球');
            
            // [优化] 如果分包已加载，直接进入，不显示 loading
            if (!Platform.isSubpackageLoaded('foosball')) {
                Platform.showToast('正在加载玩法...');
            }

            try {
                await Platform.loadSubpackage('foosball');
                await ResourceManager.loadFoosballResources();
                SceneManager.changeScene(FoosballMenuScene);
            } catch (e) {
                console.error(e);
                Platform.showToast('加载失败，请重试');
            }
        });

        // 加上“新”的小红点提示
        const dot = new PIXI.Graphics().beginFill(0xFF0000).drawCircle(foosballIconBtn.width - 10, -foosballIconBtn.height/2 + 10, 8).endFill();
        foosballIconBtn.addChild(dot);

        container.addChild(foosballIconBtn);
    }

    // [新增] 实况弹指入口按钮
    const liveFlickIconTex = ResourceManager.get('live_flick_icon_btn') || ResourceManager.get('foosball_icon_btn'); // Fallback
    if (liveFlickIconTex) {
        const liveFlickIconBtn = new PIXI.Sprite(liveFlickIconTex);
        liveFlickIconBtn.anchor.set(0, 0.5);
        // 位置设定：位于德式桌球前面
        liveFlickIconBtn.position.set(textX + 300, textStartY + 45);
        
        const targetH = 140;
        liveFlickIconBtn.scale.set(targetH / liveFlickIconTex.height);
        
        liveFlickIconBtn.interactive = true;
        liveFlickIconBtn.buttonMode = true;
        
        liveFlickIconBtn.on('pointerdown', () => liveFlickIconBtn.scale.set((targetH / liveFlickIconTex.height) * 0.9));
        liveFlickIconBtn.on('pointerupoutside', () => liveFlickIconBtn.scale.set(targetH / liveFlickIconTex.height));
        liveFlickIconBtn.on('pointerup', async () => {
            liveFlickIconBtn.scale.set(targetH / liveFlickIconTex.height);
            UserBehaviorMgr.log('GAME', '进入实况弹指');
            
            // [优化] 如果分包已加载，直接进入，不显示 loading
            if (!Platform.isSubpackageLoaded('live_flick')) {
                Platform.showToast('正在加载玩法...');
            }
            
            try {
                await Platform.loadSubpackage('live_flick');
                SceneManager.changeScene(LiveFlickScene);
            } catch (e) {
                console.error(e);
                Platform.showToast('加载失败，请重试');
            }
        });

        // 加上“新”的小红点提示
        const dot = new PIXI.Graphics().beginFill(0xFF0000).drawCircle(liveFlickIconBtn.width - 10, -liveFlickIconBtn.height/2 + 10, 8).endFill();
        liveFlickIconBtn.addChild(dot);

        container.addChild(liveFlickIconBtn);
    }

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
          // [回滚] 应用户要求，每日一抽使用插屏广告 (Interstitial)
          // 获取配置中的插屏广告ID (这里复用 startup 或 game_over 的 ID)
          const adConfig = GameConfig.adConfig[Platform.env];
          // 优先使用 startup 的 ID，确保 ID 存在
          const adUnitId = adConfig && adConfig.interstitial ? adConfig.interstitial.startup : null;
          
          if (adUnitId) {
              // 调用插屏广告接口
              success = await Platform.showInterstitialAd(adUnitId);
          } else {
              // 容错：如果是Web环境且无ID，尝试调用模拟；否则视为失败
              if (Platform.env === 'web') {
                  success = await Platform.showInterstitialAd('mock-daily-draw');
              } else {
                  console.warn('Daily check-in ad ID missing');
                  // 如果没有 ID，暂时允许通过（或者你可以设置为 false 禁止领取）
                  // 这里设置为 true 避免完全无法测试
                  success = true; 
              }
          }
      } catch (err) {
          console.warn('Ad show error', err);
          success = false;
      }
      
      // 插屏广告显示并关闭后，即视为成功
      if (success) {
          const prize = drawLottery();
          UserBehaviorMgr.log('CHECKIN', '抽奖成功', { prizeType: prize.type, prizeValue: prize.value });
          const lotteryDialog = new LotteryDialog(prize, () => {
              AccountMgr.processLotteryReward(prize);
              this.refreshUI();
              if (btn && btn.parent) {
                  btn.parent.removeChild(btn);
              }
              this.checkInBtn = null;
          });
          this.container.addChild(lotteryDialog);
      } else {
          // 如果广告加载失败（比如没网或无填充），给予保底提示或奖励
          Platform.showToast("广告加载异常，获得保底奖励: 50 金币");
          AccountMgr.addCoins(50, true);
          AccountMgr.performCheckIn(0); 
          
          if (btn && btn.parent) {
              btn.parent.removeChild(btn);
          }
          this.checkInBtn = null;
          this.refreshUI();
      }
  }


  updateAvatar(avatarUrl, nickname) {
      if (!this.avatarContainer) return;
      
      const radius = 60;
      
      // 清除旧头像内容 (保留背景)
      const oldContent = this.avatarContainer.getChildByName('avatar_content');
      if (oldContent) {
          this.avatarContainer.removeChild(oldContent);
          oldContent.destroy({ children: true });
      }

      const contentContainer = new PIXI.Container();
      contentContainer.name = 'avatar_content';
      this.avatarContainer.addChild(contentContainer);

      if (avatarUrl) {
          PIXI.Texture.fromURL(avatarUrl).then(tex => {
              if (contentContainer.destroyed) return;
              
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
              contentContainer.addChild(sprite);
              contentContainer.addChild(mask);
          }).catch(() => {
              this.createDefaultAvatar(contentContainer, nickname, radius);
          });
      } else {
          this.createDefaultAvatar(contentContainer, nickname, radius);
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
