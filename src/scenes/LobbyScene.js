
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import Button from '../ui/Button.js';
import AccountMgr from '../managers/AccountMgr.js';
import { GameConfig } from '../config.js';

export default class LobbyScene extends BaseScene {
  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    // 1. 背景
    const bg = new PIXI.Graphics();
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    // 2. 玩家信息区域 (左上角)
    this.createUserInfo();

    // 3. 占位提示文字
    const text = new PIXI.Text(
        '联机大厅功能\n开发中...',
        { fontFamily: 'Arial', fontSize: 60, fill: 0xffffff, align: 'center' }
    );
    text.anchor.set(0.5);
    text.position.set(designWidth / 2, designHeight / 2);
    this.container.addChild(text);

    // 4. 返回按钮
    const backBtn = new Button({
      text: '返回',
      width: 200,
      height: 80,
      color: 0x95a5a6,
      onClick: () => SceneManager.changeScene(MenuScene)
    });
    backBtn.position.set(designWidth / 2 - 100, designHeight * 0.7);
    this.container.addChild(backBtn);
  }

  /**
   * 创建玩家信息栏 (头像 + 等级 + 昵称 + 金币)
   */
  createUserInfo() {
      const user = AccountMgr.userInfo;
      const container = new PIXI.Container();
      
      // 定位到左上角 (带一点边距)
      const margin = 50;
      container.position.set(margin, margin);

      // --- 头像区域 ---
      const avatarRadius = 60;
      const avatarContainer = new PIXI.Container();

      // 1. 头像外框/背景
      const bg = new PIXI.Graphics();
      bg.beginFill(0xFFFFFF);
      bg.drawCircle(avatarRadius, avatarRadius, avatarRadius + 4); // 白色描边
      bg.endFill();
      bg.beginFill(0x95a5a6);
      bg.drawCircle(avatarRadius, avatarRadius, avatarRadius); // 灰色底
      bg.endFill();
      avatarContainer.addChild(bg);

      // 2. 头像图片
      if (user.avatarUrl) {
          PIXI.Texture.fromURL(user.avatarUrl).then(texture => {
               if (this.container.destroyed) return; // 防止场景销毁后回调报错

               const sprite = new PIXI.Sprite(texture);
               sprite.width = avatarRadius * 2;
               sprite.height = avatarRadius * 2;
               
               // 圆形遮罩
               const mask = new PIXI.Graphics();
               mask.beginFill(0xffffff);
               mask.drawCircle(avatarRadius, avatarRadius, avatarRadius);
               mask.endFill();
               
               sprite.mask = mask;
               sprite.addChild(mask);
               avatarContainer.addChild(sprite);
          }).catch(e => {
              console.warn('[Lobby] Avatar load failed, using default.');
              this.createDefaultAvatarText(avatarContainer, user.nickname, avatarRadius);
          });
      } else {
          this.createDefaultAvatarText(avatarContainer, user.nickname, avatarRadius);
      }
      container.addChild(avatarContainer);

      // --- 文本信息区域 ---
      const textStartX = avatarRadius * 2 + 30;
      const textStartY = 10;

      // 3. 昵称
      const nameText = new PIXI.Text(user.nickname, {
          fontFamily: 'Arial', 
          fontSize: 40, 
          fontWeight: 'bold', 
          fill: 0xFFD700, // 金色
          dropShadow: true,
          dropShadowDistance: 2
      });
      nameText.position.set(textStartX, textStartY);
      container.addChild(nameText);

      // 4. 等级和金币 (第二行)
      // 等级背景
      const levelBg = new PIXI.Graphics();
      levelBg.beginFill(0x3498db); // 蓝色
      levelBg.drawRoundedRect(0, 0, 100, 40, 10);
      levelBg.endFill();
      levelBg.position.set(textStartX, textStartY + 60);
      container.addChild(levelBg);

      const levelText = new PIXI.Text(`Lv.${user.level}`, {
          fontFamily: 'Arial', fontSize: 24, fill: 0xFFFFFF, fontWeight: 'bold'
      });
      levelText.anchor.set(0.5);
      levelText.position.set(textStartX + 50, textStartY + 80);
      container.addChild(levelText);

      // 金币文字
      const coinsText = new PIXI.Text(`💰 ${user.coins}`, {
          fontFamily: 'Arial', fontSize: 32, fill: 0xFFFFFF
      });
      coinsText.position.set(textStartX + 120, textStartY + 62);
      container.addChild(coinsText);

      this.container.addChild(container);
  }

  createDefaultAvatarText(container, name, radius) {
      const char = (name || 'G').charAt(0).toUpperCase();
      const text = new PIXI.Text(char, {
          fontFamily: 'Arial', fontSize: 60, fontWeight: 'bold', fill: 0xFFFFFF
      });
      text.anchor.set(0.5);
      text.position.set(radius, radius);
      container.addChild(text);
  }
}
