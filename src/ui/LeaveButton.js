
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from '../scenes/MenuScene.js';
import AudioManager from '../managers/AudioManager.js';

export default class LeaveButton extends PIXI.Container {
  /**
   * @param {PIXI.Application} app Pixi应用实例
   * @param {PIXI.Container} parentContainer 父容器
   * @param {Function} [onClick] 可选的自定义点击回调
   */
  constructor(app, parentContainer, onClick = null) {
    super();
    this.app = app;
    this.parentContext = parentContainer;
    this.customOnClick = onClick;
    
    this.initVisuals();
    this.initInteraction();
    this.alignToScreenBottomLeft();
  }

  initVisuals() {
    const btnSize = 100;

    // 按钮背景
    const bg = new PIXI.Graphics();
    
    // 红色系作为离开/退出按钮
    const mainColor = 0xe74c3c; 
    const shadowColor = 0xc0392b;

    // 阴影
    bg.beginFill(shadowColor);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2 + 6, btnSize, btnSize, 20);
    bg.endFill();
    
    // 实体
    bg.beginFill(mainColor);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 20);
    bg.endFill();
    
    // 高光
    bg.beginFill(0xffffff, 0.2);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize/2, 20);
    bg.endFill();

    // 离开图标 (大门 + 箭头)
    const icon = new PIXI.Graphics();
    icon.beginFill(0xffffff);
    
    // 1. 门框 (左、上、下)
    // 左竖条
    icon.drawRect(-18, -25, 6, 50);
    // 上横条 (短一点，表示开口)
    icon.drawRect(-18, -25, 24, 6);
    // 下横条
    icon.drawRect(-18, 19, 24, 6);
    
    // 2. 箭头 ->
    // 箭身
    icon.drawRect(-2, -4, 18, 8);
    // 箭头头部 (三角形)
    // 顶点(28, 0), 底边中心(16,0), 上下宽
    icon.drawPolygon([
        16, -12, // 上
        16, 12,  // 下
        28, 0    // 尖
    ]);

    icon.endFill();

    this.addChild(bg, icon);
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
        } else {
            SceneManager.changeScene(MenuScene);
        }
    });

    this.on('pointerupoutside', () => {
        this.scale.set(1);
    });
  }

  /**
   * 将按钮定位到屏幕可视区域的左下角
   */
  alignToScreenBottomLeft() {
    if (!this.app || !this.parentContext) return;

    const btnSize = 100;
    const screenMargin = 30; // 屏幕边距

    // 1. 获取屏幕可视区域左下角的全局坐标
    // 视觉中心 = Margin + 半径
    const globalX = screenMargin + btnSize / 4;
    const globalY = this.app.screen.height - screenMargin;
    
    // 2. 将全局坐标转换为父容器内部的局部坐标
    const localPos = this.parentContext.toLocal(new PIXI.Point(globalX, globalY));
    
    this.position.set(localPos.x, localPos.y);
  }
}
