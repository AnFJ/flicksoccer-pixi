
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import { LotteryPrizes } from '../config/LotteryConfig.js';
import ResourceManager from '../managers/ResourceManager.js';
import AccountMgr from '../managers/AccountMgr.js';
import Platform from '../managers/Platform.js';

export default class LotteryDialog extends PIXI.Container {
    /**
     * @param {Object} targetPrize 已经随机好的奖品对象
     * @param {Function} onComplete 动画结束回调
     */
    constructor(targetPrize, onComplete) {
        super();
        this.targetPrize = targetPrize;
        this.onComplete = onComplete;
        
        this.items = []; // 存储8个格子对象
        this.highlight = null; // 高亮框
        this.currentIndex = 0; // 当前亮起的索引 (0-7)
        
        // 动画参数
        this.isSpinning = false;
        this.timer = 0;
        this.speed = 0; // 切换间隔(ms)
        this.state = 'accel'; // accel, constant, decel, stop
        this.steps = 0; // 已走的步数
        
        // 计算目标索引
        this.targetIndex = LotteryPrizes.findIndex(p => p.id === targetPrize.id);
        if (this.targetIndex === -1) this.targetIndex = 0;

        this.init();
        
        // 自动开始
        setTimeout(() => this.startSpin(), 500);
    }

    init() {
        const { designWidth, designHeight } = GameConfig;

        // 1. 遮罩
        const overlay = new PIXI.Graphics();
        overlay.beginFill(0x000000, 0.85);
        overlay.drawRect(0, 0, designWidth, designHeight);
        overlay.interactive = true;
        this.addChild(overlay);

        // 2. 背景板
        const panelW = 800;
        const panelH = 800;
        const panel = new PIXI.Graphics();
        panel.beginFill(0x2c3e50);
        panel.lineStyle(6, 0xF1C40F); // 金边
        panel.drawRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 40);
        panel.endFill();
        panel.position.set(designWidth/2, designHeight/2);
        this.addChild(panel);

        // 3. 标题
        const title = new PIXI.Text('每日幸运抽奖', {
            fontFamily: 'Arial Black', fontSize: 60, fill: 0xFFD700,
            dropShadow: true, dropShadowBlur: 4
        });
        title.anchor.set(0.5);
        title.position.set(0, -panelH/2 + 70);
        panel.addChild(title);

        // 4. 九宫格布局
        // 索引映射:
        // 0 1 2
        // 7 C 3
        // 6 5 4
        // 对应的网格坐标 (col, row):
        const posMap = [
            {c:0, r:0}, {c:1, r:0}, {c:2, r:0},
            {c:2, r:1},
            {c:2, r:2}, {c:1, r:2}, {c:0, r:2},
            {c:0, r:1}
        ];

        const itemSize = 180;
        const gap = 20;
        const gridW = itemSize * 3 + gap * 2;
        const startX = -gridW / 2 + itemSize / 2;
        const startY = -gridW / 2 + itemSize / 2 + 50; // 稍微下移

        // 创建奖品格子
        LotteryPrizes.forEach((prize, index) => {
            if (index >= 8) return; // 只有8个格子
            const pos = posMap[index];
            
            const itemX = startX + pos.c * (itemSize + gap);
            const itemY = startY + pos.r * (itemSize + gap);

            const item = this.createItem(prize, itemSize);
            item.position.set(itemX, itemY);
            panel.addChild(item);
            this.items.push(item);
        });

        // 创建中心 Logo
        const centerLogo = new PIXI.Container();
        centerLogo.position.set(startX + 1 * (itemSize + gap), startY + 1 * (itemSize + gap));
        
        const logoBg = new PIXI.Graphics();
        logoBg.beginFill(0xe74c3c);
        logoBg.drawRoundedRect(-itemSize/2, -itemSize/2, itemSize, itemSize, 20);
        logoBg.endFill();
        
        const logoText = new PIXI.Text('GOOD\nLUCK', {
            fontFamily: 'Arial Black', fontSize: 40, fill: 0xffffff, align: 'center'
        });
        logoText.anchor.set(0.5);
        
        centerLogo.addChild(logoBg, logoText);
        panel.addChild(centerLogo);

        // 5. 高亮框 (初始化在索引0)
        this.highlight = new PIXI.Graphics();
        this.highlight.lineStyle(8, 0x00FF00); // 亮绿色边框
        this.highlight.beginFill(0xFFFFFF, 0.2);
        this.highlight.drawRoundedRect(-itemSize/2 - 5, -itemSize/2 - 5, itemSize + 10, itemSize + 10, 25);
        this.highlight.endFill();
        this.highlight.visible = true;
        
        const firstPos = posMap[0];
        this.highlight.position.set(
            startX + firstPos.c * (itemSize + gap), 
            startY + firstPos.r * (itemSize + gap)
        );
        panel.addChild(this.highlight);
        
        // 绑定更新循环
        this.tickerFunc = (delta) => this.update(delta);
        PIXI.Ticker.shared.add(this.tickerFunc);
    }

    createItem(prize, size) {
        const container = new PIXI.Container();
        
        // 背景
        const bg = new PIXI.Graphics();
        bg.beginFill(0x34495e);
        bg.drawRoundedRect(-size/2, -size/2, size, size, 20);
        bg.endFill();
        container.addChild(bg);

        // 图标 (简化处理，绘制 Graphics 或 Sprite)
        this.drawIcon(container, prize.iconType);

        // 文字
        const text = new PIXI.Text(prize.name, {
            fontFamily: 'Arial', fontSize: 24, fill: 0xffffff, fontWeight: 'bold', align: 'center',
            wordWrap: true, wordWrapWidth: size - 10
        });
        text.anchor.set(0.5);
        text.position.set(0, size/2 - 30);
        container.addChild(text);

        return container;
    }

    drawIcon(parent, iconType) {
        // 根据 iconType 绘制不同的简易图标或加载图片
        const icon = new PIXI.Container();
        
        if (iconType.includes('coin')) {
            const g = new PIXI.Graphics();
            g.beginFill(0xFFD700);
            g.drawCircle(0, 0, 30);
            g.endFill();
            const t = new PIXI.Text('$', {fontSize: 30, fill: 0x000000});
            t.anchor.set(0.5);
            icon.addChild(g, t);
        } else if (iconType.includes('skill')) {
            // 尝试加载资源
            let texName = '';
            if (iconType === 'skill_aim') texName = 'skill_aim_bg';
            else if (iconType === 'skill_car') texName = 'skill_unstoppable_bg';
            else if (iconType === 'skill_force') texName = 'skill_force_bg';
            
            const tex = ResourceManager.get(texName);
            if (tex) {
                const sp = new PIXI.Sprite(tex);
                sp.width = sp.height = 70;
                sp.anchor.set(0.5);
                icon.addChild(sp);
            } else {
                // 兜底
                const g = new PIXI.Graphics().beginFill(0x9b59b6).drawCircle(0,0,30).endFill();
                icon.addChild(g);
            }
        } else if (iconType.includes('unlock')) {
            const g = new PIXI.Graphics();
            g.beginFill(0x3498db); // 蓝色
            g.drawRoundedRect(-30, -20, 60, 40, 10);
            g.endFill();
            const t = new PIXI.Text('🔓', {fontSize: 24});
            t.anchor.set(0.5);
            icon.addChild(g, t);
        }

        icon.y = -15;
        parent.addChild(icon);
    }

    startSpin() {
        this.isSpinning = true;
        this.speed = 300; // 初始慢
        this.state = 'accel';
        this.steps = 0;
        
        // 至少跑3圈 (8 * 3 = 24) + 目标偏移
        this.totalSteps = 24 + this.targetIndex;
    }

    update(delta) {
        if (!this.isSpinning) return;

        this.timer += PIXI.Ticker.shared.deltaMS;

        if (this.timer >= this.speed) {
            this.timer = 0;
            this.stepForward();
        }
    }

    stepForward() {
        // 1. 移动高亮
        this.currentIndex = (this.currentIndex + 1) % 8;
        const targetItem = this.items[this.currentIndex];
        this.highlight.position.set(targetItem.x, targetItem.y);
        
        // 播放音效 (轻微的)
        // AudioManager.playSFX('tick'); // 如果有的话

        this.steps++;

        // 2. 状态机控制速度
        const stepsLeft = this.totalSteps - this.steps;

        if (this.state === 'accel') {
            // 加速阶段
            this.speed = Math.max(50, this.speed - 30);
            if (this.speed <= 50) this.state = 'constant';
        } else if (this.state === 'constant') {
            // 匀速阶段
            if (stepsLeft <= 8) { // 剩最后一圈减速
                this.state = 'decel';
            }
        } else if (this.state === 'decel') {
            // 减速阶段
            this.speed += 40; // 慢慢变慢
            if (stepsLeft <= 0) {
                this.stop();
            }
        }
    }

    stop() {
        this.isSpinning = false;
        
        // 闪烁效果
        let blinkCount = 0;
        const blink = setInterval(() => {
            this.highlight.visible = !this.highlight.visible;
            blinkCount++;
            if (blinkCount > 5) {
                clearInterval(blink);
                this.highlight.visible = true;
                this.showResult();
            }
        }, 150);
    }

    showResult() {
        // 弹出结果
        Platform.showToast(`恭喜获得: ${this.targetPrize.name}`);
        
        // 稍等后关闭
        setTimeout(() => {
            if (this.onComplete) this.onComplete();
            this.close();
        }, 1500);
    }

    close() {
        PIXI.Ticker.shared.remove(this.tickerFunc);
        if (this.parent) this.parent.removeChild(this);
    }
}
