
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
        // 气泡背景 (圆角矩形 + 小三角)
        // 默认向右开口，因为 AI 在右边，气泡显示在 AI 头像的左下方或正下方
        // 这里设计为：气泡主体在上方，小三角指向下方 (类似漫画气泡)
        
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
        
        this.bg.clear();
        
        // 阴影
        this.bg.beginFill(0x000000, 0.2);
        this.bg.drawRoundedRect(-w/2 + 4, -h/2 + 4, w, h, 15);
        this.bg.endFill();

        // 主体 (白色)
        this.bg.beginFill(0xFFFFFF);
        this.bg.drawRoundedRect(-w/2, -h/2, w, h, 15);
        
        // 小三角 (指向右上方，因为挂载在 AI 头像的左下/下方)
        // 假设气泡在头像的左侧，三角指向右边
        // Triangle tip
        const tipX = w/2 + 10;
        const tipY = -10;
        
        this.bg.moveTo(w/2, -20);
        this.bg.lineTo(tipX, tipY); // Tip
        this.bg.lineTo(w/2, 0);
        
        this.bg.endFill();

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
