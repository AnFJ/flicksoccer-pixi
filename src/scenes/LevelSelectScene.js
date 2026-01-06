
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
import { LevelRewards } from '../config/RewardConfig.js'; // [新增]
import ResourceManager from '../managers/ResourceManager.js'; // [新增]
import { SkillType } from '../constants.js'; // [新增]

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
        const btnX = x - size / 2;
        const btnY = y - size / 2;

        const currentProgress = AccountMgr.userInfo.level || 1;
        let color = 0x3498db; // 默认蓝色
        let stateType = 'locked'; // 'cleared', 'current', 'locked'

        if (isLocked) {
            color = 0x7f8c8d; // 灰色 (锁定)
            stateType = 'locked';
        } else if (level === currentProgress) {
            color = 0xF1C40F; // 黄色 (当前进行中)
            stateType = 'current';
        } else {
            color = (level % 10 === 0) ? 0xe74c3c : 0x3498db; // 红色(BOSS) 或 蓝色 (已通关)
            stateType = 'cleared';
        }

        const textStr = isLocked ? '🔒' : level.toString();
        
        // 如果有关卡描述或奖励
        const hasReward = !!LevelRewards[level];
        // 如果有关卡描述 (例如 "教学")
        const hasDesc = !isLocked && config.description && (level <= 10 || level % 10 === 0);
        
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

        // 如果有关卡描述，显示在按钮内部
        if (hasDesc) {
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

        // [修改] 如果有奖励，在按钮外部下方展示，并根据状态显示不同提示
        if (hasReward) {
            const reward = LevelRewards[level];
            this.createRewardPreview(this.gridContainer, x, y + size/2 + 40, reward, stateType);
        }
    }

    // [修改] 创建奖励预览 (处理不同状态文案及图标大小)
    createRewardPreview(parent, x, y, reward, stateType) {
        const container = new PIXI.Container();
        container.position.set(x, y); 
        
        let labelStr = "";
        let labelColor = 0xFFFFFF;
        let isDimmed = false;

        // 根据状态设置文案和颜色
        if (stateType === 'cleared') {
            labelStr = "已解锁";
            labelColor = 0x2ecc71; // 绿色
        } else if (stateType === 'current') {
            labelStr = "完成可解锁";
            labelColor = 0xF1C40F; // 金色
        } else {
            labelStr = "待解锁";
            labelColor = 0xAAAAAA; // 灰色
            isDimmed = true;
        }

        // 1. 提示文字
        const label = new PIXI.Text(labelStr, {
            fontSize: 20, 
            fill: labelColor, 
            fontWeight: 'bold'
        });
        label.anchor.set(0, 0.5); // 左对齐

        // 2. 准备图标
        let iconDisplay = null;
        let targetSize = 46; // 默认图标尺寸

        // 特殊处理：球场图标放大 (放大约2倍)
        if (reward.type === 'field') {
            targetSize = 80;
        }

        if (reward.type === 'ball') {
            // 特殊处理足球：使用圆形遮罩渲染 + TilingSprite
            const radius = targetSize / 2;
            const texKey = reward.id === 1 ? 'ball_texture' : `ball_texture_${reward.id}`;
            const tex = ResourceManager.get(texKey);
            
            if (tex) {
                const ball = new PIXI.TilingSprite(tex, radius * 4, radius * 4);
                ball.anchor.set(0.5);
                ball.tileScale.set(0.8);
                ball.width = targetSize;
                ball.height = targetSize;
                
                const mask = new PIXI.Graphics();
                mask.beginFill(0xffffff);
                mask.drawCircle(0, 0, radius);
                mask.endFill();
                
                ball.mask = mask;
                
                iconDisplay = new PIXI.Container();
                iconDisplay.addChild(mask, ball);
            }
        } else {
            // 其他类型：普通 Sprite
            let tex = null;
            
            if (reward.type === 'striker') {
                tex = ResourceManager.get(`striker_red_${reward.id}`);
            } else if (reward.type === 'field') {
                tex = ResourceManager.get(`field_${reward.id}`);
            } else if (reward.type === 'skill') {
                const map = { 
                    [SkillType.SUPER_AIM]: 'skill_aim_bg', 
                    [SkillType.UNSTOPPABLE]: 'skill_unstoppable_bg', 
                    [SkillType.SUPER_FORCE]: 'skill_force_bg' 
                };
                tex = ResourceManager.get(map[reward.id]);
            }

            if (tex) {
                const sprite = new PIXI.Sprite(tex);
                sprite.anchor.set(0.5);
                const scale = Math.min(targetSize / tex.width, targetSize / tex.height);
                sprite.scale.set(scale);
                iconDisplay = sprite;
            }
        }

        // 3. 组装布局 (单行居中：文字 + 间距 + 图标)
        if (iconDisplay) {
            // 变暗逻辑 (仅针对待解锁状态)
            if (isDimmed) {
                if (iconDisplay instanceof PIXI.Sprite || iconDisplay instanceof PIXI.TilingSprite) {
                    iconDisplay.tint = 0x555555;
                } else if (iconDisplay instanceof PIXI.Container) {
                    iconDisplay.children.forEach(c => {
                        if (c.tint !== undefined && c !== iconDisplay.mask) c.tint = 0x555555;
                    });
                }
            }

            const gap = 10;
            const totalWidth = label.width + gap + targetSize;
            
            // 计算起始X，使得整体居中
            const startX = -totalWidth / 2;
            
            label.position.set(startX, 0);
            
            // 图标中心X
            const iconX = startX + label.width + gap + targetSize / 2;
            iconDisplay.position.set(iconX, 0);
            
            container.addChild(label, iconDisplay);
        } else {
            // 兜底文字
            const fallback = new PIXI.Text(`${labelStr} ${reward.name}`, {fontSize: 16, fill: 0xffffff});
            fallback.anchor.set(0.5);
            container.addChild(fallback);
        }

        parent.addChild(container);
    }

    // 移除滚动相关的方法
    onScrollStart(e) {}
    onScrollMove(e) {}
    onScrollEnd(e) {}
    animateBounce() {}
}
