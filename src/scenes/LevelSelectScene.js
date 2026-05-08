
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import GameScene from './GameScene.js';
import MenuScene from './MenuScene.js';
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import BackButton from '../ui/BackButton.js'; // [新增]
import { GameConfig } from '../config.js';
import { getLevelConfig } from '../config/LevelConfig.js';
import Platform from '../managers/Platform.js';
import { LevelRewards } from '../config/RewardConfig.js'; 
import ResourceManager from '../managers/ResourceManager.js'; 
import { SkillType, LIVE_FLICK_LEVELS } from '../constants.js'; 
import LiveFlickScene from '../subpackages/live_flick/scenes/LiveFlickScene.js';
import ThemeSelectionDialog from '../ui/ThemeSelectionDialog.js'; // [新增]

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
        this.backBtn = null;
        this.prevBtn = null;
        this.nextBtn = null;
        this.pageIndicator = null;
        this.titleText = null;
        this.infoText = null;
    }

    onEnter() {
        super.onEnter();
        const { designWidth, designHeight } = GameConfig;

        this._douyinGridAd = null;
        // [新增] 针对抖音平台，在关卡选择页添加侧边推荐位
        if (Platform.env === 'douyin') {
            setTimeout(() => {
                const provider = Platform.getProvider();
                if (!provider) return;
                const info = provider.getSystemInfoSync();
                const adW = 100;
                this._douyinGridAd = Platform.showGridGamePanel("6bjmaip4fufcml5m7c", {
                    gridCount: "one",
                    size: "small",
                    position: {
                        top: (info.windowHeight - adW) / 2,
                        left: info.windowWidth - adW + 30
                    }
                });
            }, 100);
        }

        // 1. 背景 (使用球场图 + 遮罩)
        const bgTex = ResourceManager.get('bg_result_field'); // 复用已有的纯净球场背景资源
        if (bgTex) {
            const bg = new PIXI.Sprite(bgTex);
            bg.anchor.set(0.5);
            bg.position.set(designWidth / 2, designHeight / 2);
            
            // Cover 模式适配：优先填满屏幕
            const scale = Math.max(designWidth / bg.texture.width, designHeight / bg.texture.height);
            bg.scale.set(scale);
            
            this.container.addChild(bg);
        } else {
            // 兜底纯色
            const bg = new PIXI.Graphics();
            bg.beginFill(0x2c3e50);
            bg.drawRect(0, 0, designWidth, designHeight);
            bg.endFill();
            this.container.addChild(bg);
        }

        // 添加深色半透明遮罩，确保关卡按钮和文字清晰可见
        const overlay = new PIXI.Graphics();
        overlay.beginFill(0x000000, 0.6); // 60% 透明度黑色
        overlay.drawRect(0, 0, designWidth, designHeight);
        overlay.endFill();
        this.container.addChild(overlay);

        // 2. 标题
        this.titleText = new PIXI.Text('选择关卡', {
            fontFamily: 'Arial', fontSize: 60, fill: 0xFFD700, fontWeight: 'bold'
        });
        this.titleText.anchor.set(0.5);
        this.titleText.position.set(designWidth / 2, 80);
        this.container.addChild(this.titleText);

        // 3. 返回按钮 (使用 BackButton 组件)
        this.backBtn = new BackButton({
            text: '返回',
            onClick: () => SceneManager.changeScene(MenuScene)
        });
        this.container.addChild(this.backBtn);

        // 4. 当前进度信息
        const currentProgress = AccountMgr.userInfo.level || 1;
        this.infoText = new PIXI.Text(`当前进度: 第 ${currentProgress} 关`, {
            fontFamily: 'Arial', fontSize: 32, fill: 0xffffff
        });
        this.infoText.anchor.set(1, 0.5);
        // infoText 的位置也需要在 alignUI 中根据安全区域调整
        this.container.addChild(this.infoText);

        // 5. 初始化网格容器 (位于标题下方，分页栏上方)
        this.gridContainer = new PIXI.Container();
        this.container.addChild(this.gridContainer);

        // 6. 创建分页控制栏 (底部)
        this.createPaginationUI(designWidth, designHeight);

        // 7. 自动跳转到最新进度所在的页
        const targetPage = Math.floor((currentProgress - 1) / this.itemsPerPage);
        this.currentPage = Math.min(Math.max(0, targetPage), this.totalPages - 1);
        
        // 8. 执行首次布局对齐和渲染
        this.alignUI();
        this.renderPage(this.currentPage);
    }

    onExit() {
        super.onExit();
        if (this._douyinGridAd) {
            console.log('[LevelSelectScene] Destroying Douyin Grid Ad');
            this._douyinGridAd.destroy();
            this._douyinGridAd = null;
        }
    }

    // [新增] 响应屏幕尺寸变化
    onResize(width, height) {
        this.alignUI();
        this.renderPage(this.currentPage);
    }

    // [新增] UI 贴边适配逻辑
    alignUI() {
        if (!this.app) return;
        
        const margin = 20; // 边距
        const { designWidth } = GameConfig;

        // 1. 自动适配返回按钮
        if (this.backBtn) {
            this.backBtn.updateLayout();
        }

        // 计算屏幕边界在场景坐标系下的位置
        const globalTopLeft = new PIXI.Point(margin, margin);
        const localTopLeft = this.container.toLocal(globalTopLeft);

        const globalTopRight = new PIXI.Point(this.app.screen.width - margin, margin);
        const localTopRight = this.container.toLocal(globalTopRight);

        // 3. 调整进度信息位置 (右上角)
        if (this.infoText) {
            this.infoText.position.set(localTopRight.x, localTopRight.y + 30);
        }

        // 4. 调整标题 (始终水平居中)
        const centerX = (localTopLeft.x + localTopRight.x) / 2;
        if (this.titleText) {
            this.titleText.x = centerX;
        }
        
        // 5. 调整底部分页按钮 (确保不溢出屏幕)
        if (this.prevBtn && this.nextBtn && this.pageIndicator) {
            const footerY = GameConfig.designHeight - 100;
            const safeCenter = centerX;
            
            // 页码居中
            this.pageIndicator.x = safeCenter;
            
            // [修正] 按钮均匀分布
            const btnSpacing = 260; 
            
            // Button 的锚点在左上角，所以需要减去一半宽度来居中
            this.prevBtn.x = safeCenter - btnSpacing - this.prevBtn.options.width / 2;
            this.nextBtn.x = safeCenter + btnSpacing - this.nextBtn.options.width / 2;
            
            // 确保不超出屏幕左/右边界
            if (this.prevBtn.x < localTopLeft.x + 50) this.prevBtn.x = localTopLeft.x + 50;
            if (this.nextBtn.x > localTopRight.x - 50 - this.nextBtn.options.width) this.nextBtn.x = localTopRight.x - 50 - this.nextBtn.options.width;
        }
    }

    createPaginationUI(w, h) {
        const footerY = h - 100; // 底部位置

        // 上一页按钮
        this.prevBtn = new Button({
            text: '上一页', width: 200, height: 80, color: 0x3498db,
            onClick: () => this.changePage(-1)
        });
        // 初始位置，会被 alignUI 覆盖
        this.prevBtn.position.set(w / 2 - 220, footerY - 40);
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
        this.nextBtn.position.set(w / 2 + 220, footerY - 40);
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
        if (!this.app) return;

        // 1. 更新 UI 状态
        this.pageIndicator.text = `${pageIndex + 1} / ${this.totalPages}`;
        
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

        // 4. 网格布局动态计算 (核心优化)
        const { designHeight } = GameConfig;
        
        // 计算当前可视宽度
        const globalLeft = 0;
        const globalRight = this.app.screen.width;
        // 转换为场景局部坐标
        const localLeftX = this.container.toLocal(new PIXI.Point(globalLeft, 0)).x;
        const localRightX = this.container.toLocal(new PIXI.Point(globalRight, 0)).x;
        
        // 可视区域宽度 (带有一定内边距)
        const padding = 80;
        const visibleWidth = (localRightX - localLeftX) - padding * 2;
        const visibleCenterX = (localLeftX + localRightX) / 2;

        const btnSize = 160;
        const gapX = 36; 
        const gapY = 80; // [修改] 纵向间距再次增加，解决密集感
        
        // 计算 8 列所需的总宽度
        const contentWidthNeeded = this.cols * btnSize + (this.cols - 1) * gapX;
        
        // 决定是否需要缩放
        let scale = 1;
        if (contentWidthNeeded > visibleWidth) {
            scale = visibleWidth / contentWidthNeeded;
        }
        
        // 设置网格容器缩放和位置
        this.gridContainer.scale.set(scale);
        
        // Y 轴位置区间：标题下方 (150) 到 底部按钮上方 (designHeight - 150)
        const topY = 150;
        const bottomY = designHeight - 150;
        const availH = bottomY - topY;
        
        const contentHeightNeeded = this.rows * btnSize + (this.rows - 1) * gapY;
        
        // [修正] 计算左上角起始点
        // startY: 内容垂直居中后的顶部 Y 坐标 (相对于 gridContainer 的 Y=0)
        // gridContainer.y 是 0
        const startY = topY + (availH - contentHeightNeeded) / 2;

        // [修正] startX: 内容的左边缘 X 坐标 (相对于 gridContainer 的 CenterX)
        const startX = -contentWidthNeeded / 2;
        
        this.gridContainer.position.set(visibleCenterX, 0); 

        // 5. 循环创建按钮
        for (let i = startLevel; i <= endLevel; i++) {
            const localIdx = i - startLevel;
            const row = Math.floor(localIdx / this.cols);
            const col = localIdx % this.cols;

            // 计算的是按钮 左上角 的坐标
            const x = startX + col * (btnSize + gapX);
            const y = startY + row * (btnSize + gapY);

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
        // x, y 是网格单元的 左上角 坐标 (相对于 gridContainer)
        
        const currentProgress = AccountMgr.userInfo.level || 1;
        let color = 0x3498db; // 默认蓝色
        let stateType = 'locked'; 
        
        const isLiveFlick = LIVE_FLICK_LEVELS.includes(level);

        if (isLocked) {
            color = 0x7f8c8d; // 灰色 (锁定)
            stateType = 'locked';
        } else if (level === currentProgress) {
            color = 0xF1C40F; // 黄色 (当前进行中)
            stateType = 'current';
        } else {
            if (isLiveFlick) {
                color = 0x9b59b6; // 紫色 (实况弹指)
            } else {
                color = (level % 10 === 0) ? 0xe74c3c : 0x3498db; // 红色(BOSS) 或 蓝色 (已通关)
            }
            stateType = 'cleared';
        }

        const textStr = isLocked ? '🔒' : level.toString();
        const hasReward = !!LevelRewards[level];
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
                    // [修改] 点击关卡先弹出阵型选择
                    const startGame = () => {
                        if (isLiveFlick) {
                            // 实况弹指关卡
                            Platform.showToast('正在加载玩法...');
                            Platform.loadSubpackage('live_flick').then(() => {
                                SceneManager.changeScene(LiveFlickScene, { level: level });
                            }).catch(e => {
                                console.error(e);
                                Platform.showToast('加载失败，请重试');
                            });
                        } else {
                            // [修改] 将选择的阵型ID传给 GameScene
                            const formationId = AccountMgr.userInfo.theme.formationId || 0;
                            SceneManager.changeScene(GameScene, { 
                                mode: 'pve', 
                                level: level,
                                formationId: formationId 
                            });
                        }
                    };

                    const dialog = new ThemeSelectionDialog(() => {}, {
                        title: '选择阵型',
                        confirmText: '开始比赛',
                        defaultTab: 3, // 默认打开阵型Tab
                        // bgImage: 'bg_result_field', // [修改] 移除自定义背景，使用默认背景
                        onConfirm: startGame
                    });
                    this.container.addChild(dialog);
                } else {
                    Platform.showToast(`请先通关第 ${level-1} 关`);
                }
            }
        });
        
        // Button 的锚点是 top-left，直接设置位置
        btn.position.set(x, y);

        if (hasDesc) {
            if (btn.label) {
                btn.label.y -= 20;
            }
            const descText = new PIXI.Text(config.description, {
                fontFamily: 'Arial', fontSize: 18, fill: 0xffffff, fontWeight: 'bold',
                dropShadow: true, dropShadowBlur: 2
            });
            descText.anchor.set(0.5);
            descText.position.set(0, 35); // 相对按钮中心
            btn.inner.addChild(descText);
        } else if (isLiveFlick) {
            // [新增] 实况弹指模式文案
            if (btn.label) {
                btn.label.y -= 20;
            }
            const liveText = new PIXI.Text("实况弹指", {
                fontFamily: 'Arial', fontSize: 24, fill: 0xFFD700, fontWeight: 'bold',
                dropShadow: true, dropShadowBlur: 2
            });
            liveText.anchor.set(0.5);
            liveText.position.set(0, 35);
            btn.inner.addChild(liveText);
        }

        this.gridContainer.addChild(btn);

        if (hasReward) {
            const reward = LevelRewards[level];
            // [修正] 奖励位置对齐
            // x + size/2: 按钮水平中心
            // y + size: 按钮底部边缘
            this.createRewardPreview(this.gridContainer, x + size/2, y + size + 25, reward, stateType);
        }
    }

    createRewardPreview(parent, centerX, topY, reward, stateType) {
        // [修改] 重构居中逻辑，使用容器自适应宽度
        const container = new PIXI.Container();
        container.position.set(centerX, topY); 
        
        let labelStr = "";
        let labelColor = 0xFFFFFF;
        let isDimmed = false;

        if (stateType === 'cleared') {
            labelStr = "已解锁"; labelColor = 0x2ecc71;
        } else if (stateType === 'current') {
            labelStr = "可解锁"; labelColor = 0xF1C40F;
        } else {
            labelStr = "待解锁"; labelColor = 0xAAAAAA; isDimmed = true;
        }

        const label = new PIXI.Text(labelStr, {
            fontSize: 18, fill: labelColor, fontWeight: 'bold'
        });
        label.anchor.set(0, 0.5); 
        label.position.set(0, 0); // 先放在容器左侧

        let iconDisplay = null;
        let targetSize = 40; 

        if (reward.type === 'field') targetSize = 60;

        if (reward.type === 'ball') {
            const radius = targetSize / 2;
            const texKey = reward.id === 1 ? 'ball_texture' : `ball_texture_${reward.id}`;
            const tex = ResourceManager.get(texKey);
            if (tex) {
                const ball = new PIXI.TilingSprite(tex, radius * 4, radius * 4);
                ball.anchor.set(0.5);
                ball.tileScale.set(0.8);
                ball.width = targetSize;
                ball.height = targetSize;
                const mask = new PIXI.Graphics().beginFill(0xffffff).drawCircle(0, 0, radius).endFill();
                ball.mask = mask;
                iconDisplay = new PIXI.Container();
                iconDisplay.addChild(mask, ball);
            }
        } else {
            let tex = null;
            if (reward.type === 'striker') tex = ResourceManager.get(`striker_red_${reward.id}`);
            else if (reward.type === 'field') tex = ResourceManager.get(`field_${reward.id}`);
            else if (reward.type === 'skill') {
                const map = { [SkillType.SUPER_AIM]: 'skill_aim_bg', [SkillType.UNSTOPPABLE]: 'skill_unstoppable_bg', [SkillType.SUPER_FORCE]: 'skill_force_bg' };
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

        // 组合内容
        const contentContainer = new PIXI.Container();
        contentContainer.addChild(label);

        if (iconDisplay) {
            if (isDimmed) {
                if (iconDisplay.tint !== undefined) iconDisplay.tint = 0x555555;
                else if (iconDisplay.children) iconDisplay.children.forEach(c => { if(c.tint!==undefined) c.tint=0x555555; });
            }
            const gap = 8;
            iconDisplay.position.set(label.width + gap + targetSize / 2, 0);
            contentContainer.addChild(iconDisplay);
        } else {
            // 如果没有图标，追加文字描述
            const fallback = new PIXI.Text(` ${reward.name}`, {fontSize: 14, fill: 0xffffff});
            fallback.anchor.set(0, 0.5);
            fallback.position.set(label.width, 0);
            contentContainer.addChild(fallback);
        }

        // [核心] 将内容整体居中
        const totalW = contentContainer.width;
        contentContainer.x = -totalW / 2;
        container.addChild(contentContainer);

        parent.addChild(container);
    }
}
