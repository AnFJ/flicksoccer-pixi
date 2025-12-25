
import * as PIXI from 'pixi.js';

export default class Button extends PIXI.Container {
  /**
   * @param {Object} options
   * @param {string} options.text 按钮文字
   * @param {number} options.width 宽
   * @param {number} options.height 高
   * @param {number} options.color 背景色 (Hex)
   * @param {Function} options.onClick 点击回调
   */
  constructor(options) {
    super();
    
    this.options = Object.assign({
      text: 'Button',
      width: 200,
      height: 80,
      color: 0x1E88E5,
      onClick: () => {}
    }, options);

    this.init();
  }

  init() {
    const { width, height, color, text, onClick } = this.options;

    // 背景
    this.bg = new PIXI.Graphics();
    this.drawBg(color);
    this.addChild(this.bg);

    // 文字
    this.label = new PIXI.Text(text, { 
      fontFamily: 'Arial',
      fontSize: 32,
      fill: 0xFFFFFF,
      align: 'center'
    });
    this.label.anchor.set(0.5);
    this.label.position.set(width / 2, height / 2);
    this.addChild(this.label);

    // 交互设置 (Pixi v6 标准)
    this.interactive = true; 
    this.buttonMode = true;  // 鼠标悬停显示手型

    this.on('pointerdown', () => this.onPress());
    this.on('pointerup', () => this.onRelease());
    this.on('pointerupoutside', () => this.onRelease(false));
  }

  drawBg(color) {
    this.bg.clear();
    this.bg.beginFill(color);
    this.bg.drawRoundedRect(0, 0, this.options.width, this.options.height, 20);
    this.bg.endFill();
  }

  onPress() {
    this.alpha = 0.8;
    this.scale.set(0.95);
    this.position.x += this.options.width * 0.025;
    this.position.y += this.options.height * 0.025;
  }

  onRelease(trigger = true) {
    this.alpha = 1;
    this.scale.set(1);
    this.position.x -= this.options.width * 0.025;
    this.position.y -= this.options.height * 0.025;

    if (trigger) {
      this.options.onClick();
    }
  }
}
