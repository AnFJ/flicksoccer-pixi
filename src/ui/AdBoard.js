
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import Platform from '../managers/Platform.js';

export default class AdBoard extends PIXI.Container {
  /**
   * @param {number} width 宽
   * @param {number} height 高
   * @param {number} index 索引(用于决定颜色)
   */
  constructor(width, height, index) {
    super();
    this.boardWidth = width;
    this.boardHeight = height;
    this.index = index;
    
    // 从配置中获取对应的广告数据
    const adConfig = GameConfig.visuals.ui.adBoardConfig || [];
    this.adData = adConfig[index % adConfig.length];

    this.bgGraphics = null;     // 背景层
    this.imageSprite = null;    // 图片层
    this.placeholderText = null;// 占位文字
    this.borderGraphics = null; // 边框层(最上层)

    this.init();
    
    // 初始化后立即开始异步加载图片，不阻塞主线程
    this.loadRemoteImage();
    
    // 初始化交互
    this.initInteraction();
  }

  init() {
    const w = this.boardWidth;
    const h = this.boardHeight;
    const colors = GameConfig.visuals.ui.adBoardColors;
    const color = colors[this.index % colors.length];

    // 1. 背景层 (严格填充 w * h)
    this.bgGraphics = new PIXI.Graphics();
    
    // 简单的阴影 (向右下偏移一点点)
    this.bgGraphics.beginFill(0x000000, 0.3);
    this.bgGraphics.drawRect(-w/2 + 5, -h/2 + 5, w, h);
    this.bgGraphics.endFill();

    // 板子主体底色
    this.bgGraphics.beginFill(color);
    this.bgGraphics.drawRect(-w/2, -h/2, w, h);
    this.bgGraphics.endFill();
    
    this.addChild(this.bgGraphics);

    // 2. 占位文字 (默认显示，图片加载成功后隐藏)
    // 竖排文字处理
    const textStr = this.index === 0 ? "广\n告\n位" : "精\n选";
    this.placeholderText = new PIXI.Text(textStr, {
        fontFamily: 'Arial Black', fontSize: 32, fill: 0xffffff, align: 'center',
        dropShadow: true, dropShadowBlur: 2, lineHeight: 40
    });
    this.placeholderText.anchor.set(0.5);
    this.addChild(this.placeholderText);

    // 3. 边框层 (始终在最上层，严格贴合边缘)
    this.borderGraphics = new PIXI.Graphics();
    // 边框画在内部，避免增加实际尺寸
    this.borderGraphics.lineStyle(4, 0xffffff, 0.8, 0); 
    this.borderGraphics.drawRect(-w/2, -h/2, w, h);
    this.addChild(this.borderGraphics);

    // [优化] 移除旋转，保持竖直状态以适配 Banner/Custom 广告
    this.rotation = 0;
  }

  initInteraction() {
      // 如果配置了 AppID，说明这是个可跳转的广告位
      if (this.adData && this.adData.targetAppId) {
          this.interactive = true;
          this.buttonMode = true; // 鼠标手型(Web有效)

          this.on('pointerdown', () => {
              this.scale.set(0.95);
          });

          this.on('pointerup', () => {
              this.scale.set(1.0);
              // 执行跳转
              Platform.navigateToMiniProgram(this.adData.targetAppId, this.adData.path);
          });
          
          this.on('pointerupoutside', () => {
              this.scale.set(1.0);
          });
      }
  }

  async loadRemoteImage() {
    if (!this.adData || !this.adData.imageUrl) return;
    const url = this.adData.imageUrl;

    try {
        // 异步加载纹理
        const texture = await PIXI.Texture.fromURL(url);
        
        // 如果组件已经被销毁，停止后续操作
        // @ts-ignore
        if (this._destroyed) return;

        // 创建 Sprite
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);

        // [优化] 设置尺寸填满整个广告牌，不留边距
        sprite.width = this.boardWidth;
        sprite.height = this.boardHeight;

        // 插入层级：背景之上，边框之下
        // 现在的 children 顺序是: [0:Bg, 1:Text, 2:Border]
        
        // 隐藏占位文字
        if (this.placeholderText) {
            this.placeholderText.visible = false;
        }

        this.imageSprite = sprite;
        
        // 找到 borderGraphics 的索引，确保插入在它之前
        const borderIndex = this.getChildIndex(this.borderGraphics);
        this.addChildAt(sprite, borderIndex);

        console.log(`[AdBoard] Loaded ad image: ${url}`);

    } catch (e) {
        // 加载失败静默处理，保持显示占位文字
        console.warn(`[AdBoard] Failed to load ad image: ${url}`, e);
    }
  }
}
