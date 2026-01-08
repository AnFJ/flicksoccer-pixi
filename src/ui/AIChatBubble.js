
import * as PIXI from 'pixi.js';

export default class AIChatBubble extends PIXI.Container {
    constructor() {
        super();
        this.bg = null;
        this.text = null;
        this.timer = null;
        
        this.init();
        this.visible = false;
    }

    init() {
        this.bg = new PIXI.Graphics();
        this.addChild(this.bg);

        this.text = new PIXI.Text('', {
            fontFamily: 'Arial',
            fontSize: 24,
            fill: 0x333333,
            wordWrap: true,
            wordWrapWidth: 300,
            align: 'center',
            lineHeight: 30
        });
        this.text.anchor.set(0.5);
        this.addChild(this.text);
    }

    /**
     * 显示文本
     * @param {string} msg 
     */
    show(msg) {
        if (!msg) return;
        
        // 1. 设置文本
        this.text.text = msg;
        
        // 2. 动态计算背景尺寸
        const paddingX = 30;
        const paddingY = 20;
        const w = Math.max(100, this.text.width + paddingX * 2);
        const h = Math.max(60, this.text.height + paddingY * 2);
        const arrowH = 15; // 箭头高度
        
        this.bg.clear();
        
        // 阴影 (向下偏移)
        this.bg.beginFill(0x000000, 0.2);
        this.bg.drawRoundedRect(-w/2 + 4, arrowH + 4, w, h, 15);
        this.bg.endFill();

        // 主体 (白色)
        this.bg.beginFill(0xFFFFFF);
        
        // 绘制向上箭头 (Tip at 0,0)
        // 箭头底边在 y = arrowH
        this.bg.moveTo(0, 0);
        this.bg.lineTo(-12, arrowH); // 左底角
        this.bg.lineTo(12, arrowH);  // 右底角
        this.bg.lineTo(0, 0);
        
        // 绘制气泡矩形 (在箭头下方)
        this.bg.drawRoundedRect(-w/2, arrowH, w, h, 15);
        this.bg.endFill();

        // 调整文本位置：位于气泡矩形中心
        // 矩形中心 Y = arrowH + h/2
        this.text.position.set(0, arrowH + h/2);

        // 3. 动画效果
        this.visible = true;
        this.alpha = 0;
        this.scale.set(0.5);
        
        // 简单的弹入动画
        let t = 0;
        const animateIn = () => {
            t += 0.1;
            if (t >= 1) {
                this.alpha = 1;
                this.scale.set(1);
            } else {
                this.alpha = t;
                // 弹性效果
                const s = 1 + Math.sin(t * Math.PI) * 0.1;
                this.scale.set(s);
                requestAnimationFrame(animateIn);
            }
        };
        animateIn();

        // 4. 定时消失
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            this.hide();
        }, 3000);
    }

    hide() {
        this.visible = false;
    }
}
