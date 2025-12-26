
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';

export default class AdBoard extends PIXI.Container {
  /**
   * @param {number} width 宽
   * @param {number} height 高
   * @param {number} index 索引(用于决定颜色和倾斜方向)
   */
  constructor(width, height, index) {
    super();
    this.boardWidth = width;
    this.boardHeight = height;
    this.index = index;
    
    this.bgGraphics = null;     // 背景层
    this.imageSprite = null;    // 图片层
    this.placeholderText = null;// 占位文字
    this.borderGraphics = null; // 边框层(最上层)

    this.init();
    
    // 初始化后立即开始异步加载图片，不阻塞主线程
    this.loadRemoteImage();
  }

  init() {
    const w = this.boardWidth;
    const h = this.boardHeight;
    const colors = GameConfig.visuals.ui.adBoardColors;
    const color = colors[this.index % colors.length];

    // 1. 背景层 (包含阴影和底色)
    this.bgGraphics = new PIXI.Graphics();
    // 阴影
    this.bgGraphics.beginFill(0x000000, 0.4);
    this.bgGraphics.drawRect(-w/2 + 10, -h/2 + 10, w, h);
    this.bgGraphics.endFill();
    // 板子主体底色
    this.bgGraphics.beginFill(color);
    this.bgGraphics.drawRect(-w/2, -h/2, w, h);
    this.bgGraphics.endFill();
    
    this.addChild(this.bgGraphics);

    // 2. 占位文字 (默认显示，图片加载成功后隐藏)
    const textStr = this.index === 0 ? "PLAY\nNOW" : "SOCCER\nGAME";
    this.placeholderText = new PIXI.Text(textStr, {
        fontFamily: 'Arial Black', fontSize: 30, fill: 0xffffff, align: 'center',
        dropShadow: true, dropShadowBlur: 2
    });
    this.placeholderText.anchor.set(0.5);
    this.addChild(this.placeholderText);

    // 3. 边框层 (始终在最上层)
    this.borderGraphics = new PIXI.Graphics();
    this.borderGraphics.lineStyle(4, 0xffffff, 0.8);
    // 绘制在内部，留出一点边距
    this.borderGraphics.drawRect(-w/2 + 10, -h/2 + 10, w - 20, h - 20);
    this.addChild(this.borderGraphics);

    // 4. 设置倾斜角度
    // 假设 index 0 是左边，1 是右边
    this.rotation = this.index === 0 ? 0.05 : -0.05;
  }

  async loadRemoteImage() {
    const urls = GameConfig.visuals.ui.adImages;
    if (!urls || urls.length === 0) return;

    // 根据索引轮询获取 URL
    const url = urls[this.index % urls.length];
    if (!url) return;

    try {
        // 异步加载纹理
        const texture = await PIXI.Texture.fromURL(url);
        
        // 如果组件已经被销毁，停止后续操作
        // @ts-ignore
        if (this._destroyed) return;

        // 创建 Sprite
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);

        // 设置尺寸填满内框 (保留20px边框空间)
        sprite.width = this.boardWidth - 20;
        sprite.height = this.boardHeight - 20;

        // 插入层级：背景之上，边框之下
        // 现在的 children 顺序是: [0:Bg, 1:Text, 2:Border]
        // 我们想让 Sprite 盖住 Bg，但在 Text(如果还显示) 和 Border 之下，或者直接替换 Text
        
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
