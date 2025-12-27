
import * as PIXI from 'pixi.js';

export default class Button extends PIXI.Container {
  /**
   * @param {Object} options
   * @param {string} options.text 按钮文字
   * @param {number} options.width 宽
   * @param {number} options.height 高
   * @param {number} options.color 背景色 (Hex) - 仅在没有 texture 时生效
   * @param {PIXI.Texture} options.texture 背景图片纹理 (可选)
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
      fontSize: 32,      // 默认字号
      textColor: 0xFFFFFF, // 默认文字颜色
      onClick: () => {}
    }, options);

    this.init();
  }

  init() {
    const { width, height, color, texture, text, fontSize, textColor, onClick } = this.options;

    // 1. 背景层
    if (texture) {
        // 使用图片背景
        this.bg = new PIXI.Sprite(texture);
        this.bg.width = width;
        this.bg.height = height;
        // Sprite 默认 anchor 是 (0,0)，与 Graphics 绘制逻辑 (从0,0开始画) 一致
    } else {
        // 使用纯色绘图背景
        this.bg = new PIXI.Graphics();
        this.drawBg(color);
    }
    
    this.addChild(this.bg);

    // 2. 文字层
    // 为了适配图片按钮，通常增加描边和阴影效果更好看
    this.label = new PIXI.Text(text, { 
      fontFamily: 'Arial',
      fontSize: fontSize,
      fill: textColor,
      align: 'center',
      fontWeight: 'bold',
      // 添加描边以确保在任何图片背景上都清晰
      stroke: 0x000000,
      strokeThickness: 4,
      // 添加投影增加立体感
      dropShadow: true,
      dropShadowColor: 0x000000,
      dropShadowBlur: 2,
      dropShadowAngle: Math.PI / 6,
      dropShadowDistance: 3
    });
    
    this.label.anchor.set(0.5);
    // 居中放置
    this.label.position.set(width / 2, height / 2);
    this.addChild(this.label);

    // 3. 交互设置
    this.interactive = true; 
    this.buttonMode = true;  // 鼠标悬停显示手型

    this.on('pointerdown', () => this.onPress());
    this.on('pointerup', () => this.onRelease());
    this.on('pointerupoutside', () => this.onRelease(false));
  }

  drawBg(color) {
    if (this.bg instanceof PIXI.Graphics) {
        this.bg.clear();
        this.bg.beginFill(color);
        this.bg.drawRoundedRect(0, 0, this.options.width, this.options.height, 20);
        this.bg.endFill();
    }
  }

  onPress() {
    this.alpha = 0.8;
    // 缩放中心点调整逻辑：
    // 因为 bg 是左上角对齐(0,0)，直接缩放会向右下角偏移。
    // 为了简化，这里我们只改变透明度和位置偏移，或者临时设置 pivot
    
    // 简单的按压效果：整体缩小一点点，通过调整 Scale
    // 先设置 Pivot 为中心点，这样缩放才是居中的
    this.pivot.set(this.options.width / 2, this.options.height / 2);
    this.position.x += this.options.width / 2;
    this.position.y += this.options.height / 2;
    
    this.scale.set(0.95);
  }

  onRelease(trigger = true) {
    this.alpha = 1;
    this.scale.set(1);
    
    // 恢复位置 (因为 onPress 修改了 pivot 和 position)
    // 实际上更简单的做法是这里重置 scale 即可，
    // 因为 pointerup 时我们会重置状态，但如果我们要保持 transform 干净：
    this.pivot.set(0, 0);
    this.position.x -= this.options.width / 2;
    this.position.y -= this.options.height / 2;

    if (trigger) {
      this.options.onClick();
    }
  }
}
