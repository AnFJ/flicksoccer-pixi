
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
        this.gridContainer = null; // 存放关卡按钮的容器
        
        // 分页状态
        this.currentPage = 0;
        this.totalLevels = 99;
        
        // 布局配置：3行8列 = 24个/页
        this.cols = 8;
        this.rows = 3;
        this.itemsPerPage = this.cols * this.rows;
        this.totalPages = Math.ceil(this.totalLevels / this.itemsPerPage);

        // UI 引用
        this.prevBtn = null;
        this.nextBtn = null;
        this.pageIndicator = null;
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
        const currentProgress = AccountMgr.userInfo.level || 1;
        const infoText = new PIXI.Text(`当前进度: 第 ${currentProgress} 关`, {
            fontFamily: 'Arial', fontSize: 32, fill: 0xffffff
        });
        infoText.anchor.set(1, 0.5);
        infoText.position.set(designWidth - 50, 80);
        this.container.addChild(infoText);

        // 5. 初始化网格容器 (位于标题下方，分页栏上方)
        this.gridContainer = new PIXI.Container();
        // 简单定位，具体位置在 renderPage 里根据布局计算，这里设置一个起始 Y
        this.gridContainer.position.set(0, 150);
        this.container.addChild(this.gridContainer);

        // 6. 创建分页控制栏 (底部)
        this.createPaginationUI(designWidth, designHeight);

        // 7. 渲染第一页
        // 自动跳转到最新进度所在的页
        const targetPage = Math.floor((currentProgress - 1) / this.itemsPerPage);
        this.currentPage = Math.min(Math.max(0, targetPage), this.totalPages - 1);
        
        this.renderPage(this.currentPage);
    }

    createPaginationUI(w, h) {
        const footerY = h - 100; // 底部位置

        // 上一页按钮
        this.prevBtn = new Button({
            text: '上一页', width: 200, height: 80, color: 0x3498db,
            onClick: () => this.changePage(-1)
        });
        this.prevBtn.position.set(w / 2 - 300, footerY - 40);
        this.container.addChild(this.prevBtn);

        // 页码文字
        this.pageIndicator = new PIXI.Text(`1 / ${this.totalPages}`, {
            fontFamily: 'Arial', fontSize: 40, fill: 0xffffff, fontWeight: 'bold'
        });
        this.pageIndicator.anchor.set(0.5);
        this.pageIndicator.position.set(w / 2, footerY);
        this.container.addChild(this.pageIndicator);

        // 下一页按钮
        this.nextBtn = new Button({
            text: '下一页', width: 200, height: 80, color: 0x3498db,
            onClick: () => this.changePage(1)
        });
        this.nextBtn.position.set(w / 2 + 100, footerY - 40); // 按钮宽200，中心偏移
        this.container.addChild(this.nextBtn);
    }

    changePage(delta) {
        const newPage = this.currentPage + delta;
        if (newPage >= 0 && newPage < this.totalPages) {
            this.currentPage = newPage;
            this.renderPage(this.currentPage);
        }
    }

    renderPage(pageIndex) {
        // 1. 更新 UI 状态
        this.pageIndicator.text = `${pageIndex + 1} / ${this.totalPages}`;
        
        // 控制按钮显隐或样式 (这里简单用透明度表示禁用)
        this.prevBtn.alpha = pageIndex === 0 ? 0.5 : 1;
        this.prevBtn.interactive = pageIndex !== 0;
        
        this.nextBtn.alpha = pageIndex === this.totalPages - 1 ? 0.5 : 1;
        this.nextBtn.interactive = pageIndex !== this.totalPages - 1;

        // 2. 清空容器
        this.gridContainer.removeChildren();

        // 3. 计算本页的关卡范围
        const startLevel = pageIndex * this.itemsPerPage + 1;
        const endLevel = Math.min(startLevel + this.itemsPerPage - 1, this.totalLevels);
        
        const unlockedProgress = AccountMgr.userInfo.level || 1;

        // 4. 网格布局计算
        const { designWidth, designHeight } = GameConfig;
        const gridW = designWidth;
        // 可用高度 = 总高 - 顶部(150) - 底部(150)
        const availH = designHeight - 300; 
        
        const btnSize = 160;
        // 计算间距
        const gapX = (gridW - (this.cols * btnSize)) / (this.cols + 1);
        const gapY = (availH - (this.rows * btnSize)) / (this.rows + 1);

        // 5. 循环创建按钮
        for (let i = startLevel; i <= endLevel; i++) {
            // 在本页内的索引 (0 ~ itemsPerPage-1)
            const localIdx = i - startLevel;
            
            const row = Math.floor(localIdx / this.cols);
            const col = localIdx % this.cols;

            const x = gapX + col * (btnSize + gapX) + btnSize/2;
            const y = gapY + row * (btnSize + gapY) + btnSize/2;

            const isLocked = i > unlockedProgress;
            const config = getLevelConfig(i);

            this.createLevelButton(i, x, y, btnSize, isLocked, config);
        }

        // 6. 简单的切换动画
        this.gridContainer.alpha = 0;
        const fade = () => {
            if (!this.gridContainer) return;
            this.gridContainer.alpha += 0.1;
            if (this.gridContainer.alpha < 1) {
                requestAnimationFrame(fade);
            }
        };
        fade();
    }

    createLevelButton(level, x, y, size, isLocked, config) {
        // x, y 是网格单元的中心点
        // Button 默认左上角对齐，需要偏移
        const btnX = x - size / 2;
        const btnY = y - size / 2;

        const color = isLocked ? 0x7f8c8d : (level % 10 === 0 ? 0xe74c3c : 0x3498db); // BOSS关红色
        const textStr = isLocked ? '🔒' : level.toString();
        
        const btn = new Button({
            text: textStr,
            width: size,
            height: size,
            color: color,
            fontSize: isLocked ? 50 : 60,
            fontFamily: 'Arial Black',
            textColor: 0xffffff,
            onClick: () => {
                if (!isLocked) {
                    SceneManager.changeScene(GameScene, { mode: 'pve', level: level });
                } else {
                    Platform.showToast(`请先通关第 ${level-1} 关`);
                }
            }
        });
        
        btn.position.set(btnX, btnY);

        // 描述 (例如 "教学")
        if (!isLocked && config.description && (level <= 10 || level % 10 === 0)) {
            // 稍微上移主数字
            if (btn.label) {
                btn.label.y -= 20;
            }

            const descText = new PIXI.Text(config.description, {
                fontFamily: 'Arial', fontSize: 18, fill: 0xffffff, fontWeight: 'bold',
                dropShadow: true, dropShadowBlur: 2
            });
            descText.anchor.set(0.5);
            descText.position.set(size / 2, size / 2 + 35);
            btn.addChild(descText);
        }

        this.gridContainer.addChild(btn);
    }

    // 移除滚动相关的方法
    onScrollStart(e) {}
    onScrollMove(e) {}
    onScrollEnd(e) {}
    animateBounce() {}
}
