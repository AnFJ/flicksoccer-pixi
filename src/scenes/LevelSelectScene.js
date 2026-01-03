
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
        this.isDragging = false;
        this.lastY = 0;
        this.minY = 0;
        this.maxY = 0;
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
        this.minY = Math.min(0, maskH - contentHeight); // 最底部
        this.maxY = 0; // 最顶部

        // 添加交互事件
        this.initScrolling(w, h, maskY);
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
                if (!this.isDragging) { // 防止拖动时误触
                    SceneManager.changeScene(GameScene, { mode: 'pve', level: level });
                }
            });
        }

        this.scrollContainer.addChild(btn);
    }

    initScrolling(w, h, topOffset) {
        const area = new PIXI.Graphics();
        area.beginFill(0x000000, 0); // 透明点击区
        area.drawRect(0, topOffset, w, h - topOffset);
        area.endFill();
        area.interactive = true;
        this.container.addChildAt(area, 0); // 放在底层

        area.on('pointerdown', (e) => {
            this.isDragging = true;
            this.lastY = e.data.global.y;
            this.dragDist = 0; // 记录拖动距离判断是点击还是拖动
        });

        area.on('pointermove', (e) => {
            if (this.isDragging) {
                const currentY = e.data.global.y;
                const dy = currentY - this.lastY;
                this.lastY = currentY;
                this.scrollContainer.y += dy;
                this.dragDist += Math.abs(dy);

                // 简单的边界阻尼
                if (this.scrollContainer.y > this.maxY) this.scrollContainer.y = this.maxY;
                if (this.scrollContainer.y < this.minY) this.scrollContainer.y = this.minY;
            }
        });

        const endDrag = () => {
            this.isDragging = false;
        };

        area.on('pointerup', endDrag);
        area.on('pointerupoutside', endDrag);
    }
}
