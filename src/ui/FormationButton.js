
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import AudioManager from '../managers/AudioManager.js';

export default class FormationButton extends PIXI.Container {
  /**
   * @param {PIXI.Application} app Pixi应用实例
   * @param {PIXI.Container} parentContainer 父容器
   * @param {Function} [onClick] 点击回调
   */
  constructor(app, parentContainer, onClick = null) {
    super();
    this.app = app;
    this.parentContext = parentContainer;
    this.customOnClick = onClick;

    this.initVisuals();
    this.initInteraction();
    this.alignToScreenBottomRight();
  }

  initVisuals() {
    const btnSize = 100;

    // 1. 按钮背景
    const bg = new PIXI.Graphics();
    
    // 橘黄色调
    const mainColor = 0xF39C12; // 橙色
    const shadowColor = 0xD35400; // 深橙色

    // 阴影
    bg.beginFill(shadowColor);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2 + 6, btnSize, btnSize, 20);
    bg.endFill();

    // 实体
    bg.beginFill(mainColor);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 20);
    bg.endFill();

    // 顶部高光
    bg.beginFill(0xffffff, 0.2);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize/2, 20);
    bg.endFill();

    this.addChild(bg);

    // 2. 战术板图标 (白色线条)
    const icon = new PIXI.Graphics();
    icon.lineStyle(4, 0xFFFFFF, 1, 0.5); // 线宽4，白色，圆头端点

    // (1) 战术箭头 (曲线)
    // 起点(左下偏中) -> 控制点 -> 终点(右上偏中)
    icon.moveTo(-10, 15);
    icon.quadraticCurveTo(0, 0, 15, -20);

    // 箭头头部
    // 简单的两笔画
    icon.moveTo(15, -20);
    icon.lineTo(5, -18);
    icon.moveTo(15, -20);
    icon.lineTo(18, -10);

    // (2) 两个 "X" 标记 (代表队员/防守)
    // 左侧的 X
    this.drawCross(icon, -25, 0, 5);
    // 右下侧的 X
    this.drawCross(icon, 15, 20, 5);

    // (3) 一个 "O" 标记 (代表目标/球)
    // 右上侧的圆圈
    icon.drawCircle(22, -8, 5);

    this.addChild(icon);
  }

  // 辅助绘制 X
  drawCross(g, x, y, size) {
      g.moveTo(x - size, y - size);
      g.lineTo(x + size, y + size);
      g.moveTo(x + size, y - size);
      g.lineTo(x - size, y + size);
  }

  initInteraction() {
    this.interactive = true;
    this.buttonMode = true;

    this.on('pointerdown', () => {
        this.scale.set(0.9);
        AudioManager.playSFX('collision');
    });

    this.on('pointerup', () => {
        this.scale.set(1);
        if (this.customOnClick) {
            this.customOnClick();
        }
    });

    this.on('pointerupoutside', () => {
        this.scale.set(1);
    });
  }

  /**
   * 将按钮定位到屏幕可视区域的右下角
   */
  alignToScreenBottomRight() {
    if (!this.app || !this.parentContext) return;

    const btnSize = 100;
    const screenMargin = 30; // 屏幕边距

    // 1. 获取屏幕可视区域右下角的全局坐标
    // 视觉中心 = ScreenWidth - Margin - 半径
    const globalX = this.app.screen.width - screenMargin - btnSize / 4;
    const globalY = this.app.screen.height - screenMargin;

    // 2. 将全局坐标转换为父容器内部的局部坐标
    const localPos = this.parentContext.toLocal(new PIXI.Point(globalX, globalY));

    this.position.set(localPos.x, localPos.y);
  }
}
