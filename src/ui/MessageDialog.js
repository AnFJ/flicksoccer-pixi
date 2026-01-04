
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';

export default class MessageDialog extends PIXI.Container {
  /**
   * @param {string} title 标题
   * @param {string} message 内容
   * @param {Function} onConfirm 确认回调
   */
  constructor(title, message, onConfirm) {
    super();
    this.init(title, message, onConfirm);
  }

  init(title, message, onConfirm) {
    const { designWidth, designHeight } = GameConfig;
    
    // 1. 全屏遮罩 (阻挡点击)
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x000000, 0.6);
    overlay.drawRect(0, 0, designWidth, designHeight);
    overlay.interactive = true;
    this.addChild(overlay);

    // 2. 弹窗背景
    const boxW = 660;
    const boxH = 440;
    const box = new PIXI.Graphics();
    box.beginFill(0xFFFFFF);
    box.drawRoundedRect(-boxW/2, -boxH/2, boxW, boxH, 20);
    box.endFill();
    box.position.set(designWidth/2, designHeight/2);
    this.addChild(box);

    // 3. 标题
    const titleText = new PIXI.Text(title, {
        fontFamily: 'Arial', fontSize: 48, fill: 0x333333, fontWeight: 'bold'
    });
    titleText.anchor.set(0.5);
    titleText.position.set(0, -120);
    box.addChild(titleText);

    // 4. 内容
    const msgText = new PIXI.Text(message, {
        fontFamily: 'Arial', fontSize: 32, fill: 0x666666, 
        align: 'center', wordWrap: true, wordWrapWidth: 500
    });
    msgText.anchor.set(0.5);
    msgText.position.set(0, 0);
    box.addChild(msgText);

    // 5. 确认按钮
    const btnW = 200;
    const btn = new Button({
        text: '确定', width: btnW, height: 80, color: 0x2ecc71,
        onClick: () => {
            if (this.parent) {
                this.parent.removeChild(this);
            }
            if (onConfirm) onConfirm();
        }
    });
    // [修复] 按钮居中: x = -width/2
    btn.position.set(-btnW / 2, 120);
    box.addChild(btn);
  }
}
