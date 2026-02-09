
import * as PIXI from 'pixi.js';

export default class Button extends PIXI.Container {
  /**
   * @param {Object} options
   * @param {string} options.text 按钮文字
   * @param {number} options.width 宽
   * @param {number} options.height 高
   * @param {number} options.color 背景色 (Hex) - 仅在没有 texture 时生效
   * @param {PIXI.Texture} options.texture 背景图片纹理 (可选)
   * @param {string} options.fontFamily 字体 (可选，默认 Arial)
   * @param {number} options.fontSize 文字大小 (可选)
   * @param {number} options.textColor 文字颜色 (可选)
   * @param {Function} options.onClick 点击回调
   */
  constructor(options) {
    super();
    
    this.options = Object.assign({
      text: 'Button',
      width: 200,
      height: 80,
      color: 0x1E88E5,
      texture: null,     // 默认无图片
      fontFamily: 'Arial', 
      fontSize: 36,      
      textColor: 0xFFFFFF,
      onClick: () => {}
    }, options);

    this.inner = new PIXI.Container();
    this.addChild(this.inner);

    this.bg = null;
    this.label = null;

    this.init();
  }

  init() {
    const { width, height, color, texture, text, fontFamily, fontSize, textColor } = this.options;

    // 设置内部容器位置为中心，方便缩放
    this.inner.position.set(width / 2, height / 2);

    // 1. 背景层
    if (texture) {
        // 使用图片背景
        this.bg = new PIXI.Sprite(texture);
        this.bg.anchor.set(0.5); // 图片中心对齐
        this.bg.width = width;
        this.bg.height = height;
    } else {
        // 使用纯色绘图背景
        this.bg = new PIXI.Graphics();
        this.drawBg(color);
    }
    
    this.inner.addChild(this.bg);

    // 2. 文字层
    this.label = new PIXI.Text(text, { 
      fontFamily: fontFamily,
      fontSize: fontSize,
      fill: textColor,
      align: 'center',
      fontWeight: 'bold',
      stroke: 0x000000,
      strokeThickness: 4,
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 2,
      dropShadowAngle: Math.PI / 6,
      dropShadowDistance: 3
    });
    
    this.label.anchor.set(0.5);
    this.label.position.set(0, 0); // 也是居中
    this.inner.addChild(this.label);

    // 3. 交互设置 (绑定在最外层容器)
    this.interactive = true; 
    this.buttonMode = true;
    
    // 显式设置点击区域，确保点击判定稳定
    this.hitArea = new PIXI.Rectangle(0, 0, width, height);

    this.on('pointerdown', this.onPress, this);
    this.on('pointerup', this.onRelease, this);
    this.on('pointerupoutside', () => this.onRelease(false));
    
    // [修复] 移除 touch 事件，因为 Pixi 的 pointer 事件已经包含了 touch 支持
    // 同时绑定会导致 onClick 被触发两次
  }

  drawBg(color) {
    if (this.bg instanceof PIXI.Graphics) {
        const { width, height } = this.options;
        this.bg.clear();
        this.bg.beginFill(color);
        // 绘制相对于中心的矩形
        this.bg.drawRoundedRect(-width / 2, -height / 2, width, height, 20);
        this.bg.endFill();
        
        // [优化] 绘制完成后开启缓存
        this.bg.cacheAsBitmap = true;
    }
  }

  onPress(e) {
    // [修改] 移除 e.stopPropagation()
    // 允许事件冒泡到父容器 (如 ScrollContainer)，以便父容器能接收到 pointerdown 并重置滚动状态 (isDragging = false)
    
    this.inner.alpha = 0.8;
    this.inner.scale.set(0.95);
  }

  onRelease(e) {
    // 如果 e 是 boolean (来自箭头函数调用)，说明是 internal call
    const isEvent = e && e.data;
    const trigger = e !== false; // 如果传入 false 则不触发 click

    this.inner.alpha = 1;
    this.inner.scale.set(1);

    if (trigger) {
        if (this.options.onClick) {
            console.log('[Button] Click triggered:', this.options.text);
            this.options.onClick();
        }
    }
  }
}
