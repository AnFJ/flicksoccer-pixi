
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import GameScene from './GameScene.js';
import MenuScene from './MenuScene.js';
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import { getLevelConfig } from '../config/LevelConfig.js';
import Platform from '../managers/Platform.js';

export default class LevelSelectScene extends BaseScene {
    constructor() {
        super();
        this.scrollContainer = null;
        
        // 滚动状态
        this.isDragging = false; // 是否触发了拖拽逻辑
        this.isTouching = false; // 手指是否按下
        this.touchStartY = 0;    // 按下时的Y坐标
        this.lastY = 0;          // 上一帧的Y坐标
        this.minY = 0;           // 滚动下限
        this.maxY = 0;           // 滚动上限
        this.animating = false;  // 是否正在执行回弹动画
    }

    onEnter() {
        super.onEnter();
        const { designWidth, designHeight } = GameConfig;

        // 1. 背景
        const bg = new PIXI.Graphics();
        bg.beginFill(0x2c3e50);
        bg.drawRect(0, 0, designWidth, designHeight);
        bg.endFill();
        this.container.addChild(bg);

        // 2. 标题
        const title = new PIXI.Text('选择关卡', {
            fontFamily: 'Arial', fontSize: 60, fill: 0xFFD700, fontWeight: 'bold'
        });
        title.anchor.set(0.5);
        title.position.set(designWidth / 2, 80);
        this.container.addChild(title);

        // 3. 返回按钮
        const backBtn = new Button({
            text: '返回', width: 160, height: 60, color: 0x95a5a6,
            onClick: () => SceneManager.changeScene(MenuScene)
        });
        backBtn.position.set(50, 50);
        this.container.addChild(backBtn);

        // 4. 当前进度信息
        const currentLevel = AccountMgr.userInfo.level || 1;
        const infoText = new PIXI.Text(`当前进度: 第 ${currentLevel} 关`, {
            fontFamily: 'Arial', fontSize: 32, fill: 0xffffff
        });
        infoText.anchor.set(1, 0.5);
        infoText.position.set(designWidth - 50, 80);
        this.container.addChild(infoText);

        // 5. 创建滚动区域
        this.createLevelGrid(designWidth, designHeight, currentLevel);
    }

    createLevelGrid(w, h, unlockedLevel) {
        // 遮罩区域 (可视窗口)
        const maskY = 150;
        const maskH = h - 150;
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawRect(0, maskY, w, maskH);
        mask.endFill();
        this.container.addChild(mask);

        // 内容容器
        this.scrollContainer = new PIXI.Container();
        this.scrollContainer.position.set(0, maskY);
        this.scrollContainer.mask = mask;
        this.container.addChild(this.scrollContainer);

        // 网格配置
        const cols = 5;
        const btnSize = 180;
        const gapX = (w - (cols * btnSize)) / (cols + 1);
        const gapY = 50;
        const startY = 50;

        const totalLevels = 99;

        for (let i = 1; i <= totalLevels; i++) {
            const row = Math.floor((i - 1) / cols);
            const col = (i - 1) % cols;

            const x = gapX + col * (btnSize + gapX) + btnSize/2;
            const y = startY + row * (btnSize + gapY) + btnSize/2;

            const isLocked = i > unlockedLevel;
            const config = getLevelConfig(i);
            
            this.createLevelButton(i, x, y, btnSize, isLocked, config);
        }

        // 计算滚动边界
        const totalRows = Math.ceil(totalLevels / cols);
        const contentHeight = startY + totalRows * (btnSize + gapY);
        // 内容高度如果小于视口，minY = 0；否则允许向上滚动 (y < 0)
        // 注意：scrollContainer 初始 y = maskY。
        // 内容坐标是相对于 scrollContainer 的 (0,0) 开始的。
        // 我们移动的是 scrollContainer 的 y 坐标。
        // 初始位置 scrollContainer.y = maskY 显示内容的顶部。
        // 向上滚动：scrollContainer.y 减小。
        // 最底部：显示内容底部。内容底部坐标 = contentHeight。
        // 视口底部坐标 = maskY + maskH。
        // scrollContainer.y + contentHeight = maskY + maskH
        // minScrollY = maskY + maskH - contentHeight
        
        // 我们这里的 scrollContainer 初始放在 (0, maskY)，即 y=150。
        // 如果我们改变 scrollContainer.y：
        // 顶部边界：y = 150 (初始位置)
        // 底部边界：y = 150 - (contentHeight - maskH)
        
        this.maxY = maskY;
        this.minY = Math.min(maskY, maskY - (contentHeight - maskH));

        // 添加交互事件
        this.initScrolling(w, h);
    }

    createLevelButton(level, x, y, size, isLocked, config) {
        const btn = new PIXI.Container();
        btn.position.set(x, y);

        // 背景
        const bg = new PIXI.Graphics();
        const color = isLocked ? 0x7f8c8d : (level % 10 === 0 ? 0xe74c3c : 0x3498db); // BOSS关红色
        
        bg.beginFill(color);
        bg.drawRoundedRect(-size/2, -size/2, size, size, 20);
        bg.endFill();
        
        // 阴影
        bg.beginFill(0x000000, 0.2);
        bg.drawRoundedRect(-size/2, -size/2 + 10, size, size, 20);
        bg.endFill();

        btn.addChild(bg);

        if (isLocked) {
            const lockText = new PIXI.Text('🔒', { fontSize: 60 });
            lockText.anchor.set(0.5);
            btn.addChild(lockText);
        } else {
            // 关卡数字
            const numText = new PIXI.Text(level.toString(), {
                fontFamily: 'Arial Black', fontSize: 60, fill: 0xffffff
            });
            numText.anchor.set(0.5);
            numText.position.set(0, -20);
            btn.addChild(numText);

            // 描述 (例如 "教学")
            if (config.description && (level <= 10 || level % 10 === 0)) {
                const descText = new PIXI.Text(config.description, {
                    fontFamily: 'Arial', fontSize: 20, fill: 0xffffff, fontWeight: 'bold'
                });
                descText.anchor.set(0.5);
                descText.position.set(0, 40);
                btn.addChild(descText);
            }

            // 交互
            btn.interactive = true;
            btn.buttonMode = true;
            btn.on('pointertap', () => {
                // 只有在没有触发拖动逻辑时才进入关卡
                if (!this.isDragging) {
                    SceneManager.changeScene(GameScene, { mode: 'pve', level: level });
                }
            });
        }

        this.scrollContainer.addChild(btn);
    }

    initScrolling(w, h) {
        // 设置容器为可交互，确保点击空白处也能触发
        this.container.interactive = true;
        this.container.hitArea = new PIXI.Rectangle(0, 0, w, h);

        this.container.on('pointerdown', this.onScrollStart, this);
        this.container.on('pointermove', this.onScrollMove, this);
        this.container.on('pointerup', this.onScrollEnd, this);
        this.container.on('pointerupoutside', this.onScrollEnd, this);
    }

    onScrollStart(e) {
        this.animating = false; // 停止回弹动画
        this.isTouching = true;
        this.isDragging = false; // 重置拖拽标记
        this.touchStartY = e.data.global.y;
        this.lastY = e.data.global.y;
    }

    onScrollMove(e) {
        if (!this.isTouching) return;

        const currentY = e.data.global.y;
        const delta = currentY - this.lastY;
        this.lastY = currentY;

        // 判断是否超过阈值，判定为拖拽
        if (!this.isDragging) {
            if (Math.abs(currentY - this.touchStartY) > 10) {
                this.isDragging = true;
            }
        }

        if (this.isDragging) {
            // 移动容器
            let effectiveDelta = delta;
            
            // 边界阻尼效果：超出边界时移动变慢
            if (this.scrollContainer.y > this.maxY || this.scrollContainer.y < this.minY) {
                effectiveDelta *= 0.5;
            }
            
            this.scrollContainer.y += effectiveDelta;
        }
    }

    onScrollEnd(e) {
        this.isTouching = false;
        
        // 只有拖拽结束时才触发回弹
        // 如果只是点击（isDragging=false），不需要回弹逻辑，也不需要修正位置（因为没动）
        if (this.isDragging) {
            this.animateBounce();
        }
        
        // 注意：这里不要立即把 isDragging 设为 false，
        // 因为 Button 的 pointertap 事件可能在 pointerup 之后触发，
        // 需要保留状态让按钮判断是否是拖拽释放。
        // 下一次 pointerdown 会重置它。
    }

    animateBounce() {
        // 计算目标位置（限制在边界内）
        let targetY = this.scrollContainer.y;
        if (targetY > this.maxY) targetY = this.maxY;
        if (targetY < this.minY) targetY = this.minY;

        // 如果需要回弹
        if (targetY !== this.scrollContainer.y) {
            this.animating = true;
            const startY = this.scrollContainer.y;
            const diff = targetY - startY;
            const duration = 300; // ms
            const startTime = Date.now();

            const tick = () => {
                if (!this.animating || this.isTouching) return;

                const now = Date.now();
                const progress = Math.min((now - startTime) / duration, 1);
                
                // Ease Out Quad
                const ease = progress * (2 - progress);
                
                this.scrollContainer.y = startY + diff * ease;

                if (progress < 1) {
                    requestAnimationFrame(tick);
                } else {
                    this.animating = false;
                }
            };
            requestAnimationFrame(tick);
        }
    }
}
