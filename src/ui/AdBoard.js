
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import Platform from '../managers/Platform.js';
import AdManager from '../managers/AdManager.js';

export default class AdBoard extends PIXI.Container {
  /**
   * @param {number} width 宽
   * @param {number} height 高
   * @param {number} index 索引 (0:左侧, 1:右侧)
   */
  constructor(width, height, index) {
    super();
    this.boardWidth = width;
    this.boardHeight = height;
    this.index = index;
    this.positionTag = index === 0 ? 'left' : 'right';
    
    this.currentAdData = null; // 当前正在展示的广告配置项

    this.bgGraphics = null;     // 背景层
    this.imageSprite = null;    // 图片层
    this.placeholderText = null;// 占位文字
    this.borderGraphics = null; // 边框层(最上层)

    this.init();
    
    // 初始展示默认广告
    this.updateAd('default');
  }

  init() {
    const w = this.boardWidth;
    const h = this.boardHeight;
    const colors = GameConfig.visuals.ui.adBoardColors;
    const color = colors[this.index % colors.length];

    // 1. 背景层
    this.bgGraphics = new PIXI.Graphics();
    this.bgGraphics.beginFill(0x000000, 0.3);
    this.bgGraphics.drawRect(-w/2 + 5, -h/2 + 5, w, h);
    this.bgGraphics.endFill();

    this.bgGraphics.beginFill(color);
    this.bgGraphics.drawRect(-w/2, -h/2, w, h);
    this.bgGraphics.endFill();
    this.addChild(this.bgGraphics);

    // 2. 占位文字
    const textStr = this.index === 0 ? "广\n告\n位" : "精\n选";
    this.placeholderText = new PIXI.Text(textStr, {
        fontFamily: 'Arial Black', fontSize: 32, fill: 0xffffff, align: 'center',
        dropShadow: true, dropShadowBlur: 2, lineHeight: 40
    });
    this.placeholderText.anchor.set(0.5);
    this.addChild(this.placeholderText);

    // 3. 边框层
    this.borderGraphics = new PIXI.Graphics();
    this.borderGraphics.lineStyle(4, 0xffffff, 0.8, 0); 
    this.borderGraphics.drawRect(-w/2, -h/2, w, h);
    this.addChild(this.borderGraphics);

    this.rotation = 0;
  }

  /**
   * 根据触发器更新广告内容
   * @param {string} trigger 
   */
  async updateAd(trigger) {
      // 1. 获取新配置
      const adData = AdManager.getAd(trigger, this.positionTag);
      
      // 如果没有任何动态配置
      if (!AdManager.hasAnyConfig() && !adData) {
          // 这里可以执行旧的兜底逻辑
      }

      // 如果配置没变（图片链接一致），则不需要更新
      if (this.currentAdData && adData && this.currentAdData.imageUrl === adData.imageUrl) {
          return;
      }

      this.currentAdData = adData;
      
      if (adData && adData.imageUrl) {
          await this.loadRemoteImage(adData.imageUrl);
      } else {
          // 如果没有动态配置，尝试回退到本地 Config 兜底 (旧逻辑)
          const localConfigs = GameConfig.visuals.ui.adBoardConfig || [];
          const localData = localConfigs[this.index % localConfigs.length];
          if (localData && localData.imageUrl) {
              await this.loadRemoteImage(localData.imageUrl);
              this.currentAdData = localData;
          }
      }

      this.initInteraction();
  }

  initInteraction() {
      // 重置交互
      this.interactive = false;
      this.buttonMode = false;
      this.removeAllListeners('pointerdown');
      this.removeAllListeners('pointerup');
      this.removeAllListeners('pointerupoutside');

      // 只要有动态配置或静态跳转配置
      const appId = this.currentAdData?.appId || this.currentAdData?.targetAppId;
      if (appId) {
          this.interactive = true;
          this.buttonMode = true;

          this.on('pointerdown', () => { this.scale.set(0.95); });
          this.on('pointerup', () => {
              this.scale.set(1.0);
              Platform.navigateToMiniProgram(appId, this.currentAdData.path);
          });
          this.on('pointerupoutside', () => { this.scale.set(1.0); });
      }
  }

  async loadRemoteImage(url) {
    try {
        const texture = await PIXI.Texture.fromURL(url);
        if (this._destroyed) return;

        // 清理旧图片
        if (this.imageSprite) {
            this.removeChild(this.imageSprite);
            this.imageSprite.destroy();
        }

        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = this.boardWidth;
        sprite.height = this.boardHeight;

        if (this.placeholderText) {
            this.placeholderText.visible = false;
        }

        this.imageSprite = sprite;
        const borderIndex = this.getChildIndex(this.borderGraphics);
        this.addChildAt(sprite, borderIndex);

        console.log(`[AdBoard] Updated ad image: ${url}`);
    } catch (e) {
        console.warn(`[AdBoard] Failed to load ad: ${url}`, e);
    }
  }
}
