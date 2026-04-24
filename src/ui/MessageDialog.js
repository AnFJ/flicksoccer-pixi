
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';

export default class MessageDialog extends PIXI.Container {
  /**
   * @param {string} title 标题
   * @param {string} message 内容
   * @param {Function} onConfirm 确认回调
   * @param {Function} onCancel 取消回调 (可选，若提供则显示取消按钮)
   * @param {string} confirmText 确认按钮文字 (默认: 确定)
   * @param {string} cancelText 取消按钮文字 (默认: 取消)
   */
  constructor(title, message, onConfirm, onCancel = null, confirmText = '确定', cancelText = '取消') {
    super();
    this.init(title, message, onConfirm, onCancel, confirmText, cancelText);
  }

  init(title, message, onConfirm, onCancel, confirmText, cancelText) {
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

    // 5. 按钮构造
    const btnW = 220;
    const btnH = 80;
    const gap = 40;

    if (onCancel) {
        // 双按钮模式
        const confirmBtn = new Button({
            text: confirmText, width: btnW, height: btnH, color: 0x2ecc71,
            onClick: () => {
                this.destroy();
                if (onConfirm) onConfirm();
            }
        });
        confirmBtn.position.set(gap / 2, 120);
        box.addChild(confirmBtn);

        const cancelBtn = new Button({
            text: cancelText, width: btnW, height: btnH, color: 0x95a5a6,
            onClick: () => {
                this.destroy();
                if (onCancel) onCancel();
            }
        });
        cancelBtn.position.set(-btnW - gap / 2, 120);
        box.addChild(cancelBtn);
    } else {
        // 单按钮模式 (保持原样但在文字上支持自定义)
        const btn = new Button({
            text: confirmText, width: btnW, height: btnH, color: 0x2ecc71,
            onClick: () => {
                this.destroy();
                if (onConfirm) onConfirm();
            }
        });
        btn.position.set(-btnW / 2, 120);
        box.addChild(btn);
    }
  }
}
