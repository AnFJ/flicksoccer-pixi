
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from '../scenes/MenuScene.js';
import AudioManager from '../managers/AudioManager.js';

export default class GameMenuButton extends PIXI.Container {
  /**
   * @param {PIXI.Application} app Pixi应用实例
   * @param {PIXI.Container} parentContainer 父容器
   * @param {Function} [onClick] 可选的自定义点击回调，如果不传则默认跳回 MenuScene
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
    const { visuals } = GameConfig;
    const btnSize = 100;

    // 按钮背景 (绿色圆角矩形)
    const bg = new PIXI.Graphics();
    
    // 阴影
    bg.beginFill(visuals.ui.menuBtnShadow);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2 + 6, btnSize, btnSize, 20);
    bg.endFill();
    
    // 实体
    bg.beginFill(visuals.ui.menuBtnColor);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 20);
    bg.endFill();
    
    // 高光
    bg.beginFill(0xffffff, 0.2);
    bg.drawRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize/2, 20);
    bg.endFill();

    // 汉堡图标 (三道横杠)
    const icon = new PIXI.Graphics();
    icon.beginFill(0xffffff);
    const w = 50;
    const h = 8;
    const gap = 16;
    icon.drawRoundedRect(-w/2, -h/2 - gap, w, h, 4);
    icon.drawRoundedRect(-w/2, -h/2, w, h, 4);
    icon.drawRoundedRect(-w/2, -h/2 + gap, w, h, 4);
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
    // 注意：app.screen.height 代表当前 Canvas/屏幕 的物理高度
    const globalX = screenMargin + btnSize / 4;
    const globalY = this.app.screen.height - screenMargin;
    
    // 2. 将全局坐标转换为父容器内部的局部坐标
    const localPos = this.parentContext.toLocal(new PIXI.Point(globalX, globalY));
    
    this.position.set(localPos.x, localPos.y);
  }
}
