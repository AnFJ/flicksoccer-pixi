
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import BaseScene from '../../../scenes/BaseScene.js';
import SceneManager from '../../../managers/SceneManager.js';
import FoosballMenuScene from './FoosballMenuScene.js';
import FoosballPhysics from '../systems/FoosballPhysics.js';
import FoosballRod from '../entities/FoosballRod.js';
import GameLayout from '../../../core/GameLayout.js'; // 复用布局类
import { GameConfig } from '../../../config.js';
import Button from '../../../ui/Button.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import Platform from '../../../managers/Platform.js';
import Ball from '../../../entities/Ball.js'; // 复用球类
import { CollisionCategory } from '../../../constants.js';

export default class FoosballGameScene extends BaseScene {
    constructor() {
        super();
        this.physics = new FoosballPhysics();
        this.layout = new GameLayout(this); // 复用 GameLayout 创建球场
        this.ball = null;
        this.rods = []; // 存储所有滑杆
        this.scores = [0, 0];
        
        // 触摸控制状态
        this.activeTouchId = null;
        this.lastTouchY = 0;
        this.controlZoneX = 0; // 左半屏分界线
    }

    onEnter() {
        super.onEnter();
        const { designWidth, designHeight } = GameConfig;

        this.physics.init();
        
        // 1. 初始化球场 (使用现有 GameLayout 构建基础层级)
        // GameLayout 会创建默认的草地背景和物理墙，我们需要在视觉上覆盖它们
        this.layout.init(1); 
        
        // [核心新增] 设置桌上足球专属视觉 (背景、边框、遮罩)
        this.setupFoosballVisuals(designWidth, designHeight);
        
        // 2. 创建足球
        this.createBall();

        // 3. 创建滑杆阵型
        // 场地范围
        const fieldRect = this.layout.fieldRect;
        // [修改] 限制杆子的移动范围，防止碰到上下墙壁
        const frameThickness = 80; 
        const minY = fieldRect.y + frameThickness;
        const maxY = fieldRect.y + fieldRect.h - frameThickness;
        const constraints = { minY, maxY };
        
        const cX = fieldRect.x + fieldRect.w / 2;
        const step = fieldRect.w / 8; 

        // --- 红方 (左侧，玩家控制) ---
        // 门将 (1人)
        this.createRod(cX - 3.5 * step, 0, 1, constraints); 
        // 后卫 (2人)
        this.createRod(cX - 2.0 * step, 0, 2, constraints);
        // 前锋 (3人)
        this.createRod(cX - 0.3 * step, 0, 3, constraints);

        // --- 蓝方 (右侧，AI控制) ---
        // 门将
        this.createRod(cX + 3.5 * step, 1, 1, constraints);
        // 后卫
        this.createRod(cX + 2.0 * step, 1, 2, constraints);
        // 前锋
        this.createRod(cX + 0.3 * step, 1, 3, constraints);

        // 4. UI
        this.createUI(designWidth, designHeight);

        // 5. 输入监听
        this.controlZoneX = designWidth / 2; // 左半屏控制
        this.container.interactive = true;
        this.container.on('pointerdown', this.onTouchStart, this);
        this.container.on('pointermove', this.onTouchMove, this);
        this.container.on('pointerup', this.onTouchEnd, this);
        this.container.on('pointerupoutside', this.onTouchEnd, this);
    }

    /**
     * [新增] 设置桌上足球视觉
     */
    setupFoosballVisuals(w, h) {
        // 1. 清理 GameLayout 默认生成的背景和上层装饰
        this.layout.layers.bg.removeChildren();
        this.layout.layers.over.removeChildren();

        const cx = w / 2;
        const cy = h / 2;

        const bgTex = ResourceManager.get('fb_bg');
        const frameTex = ResourceManager.get('fb_table_frame');

        // 计算统一的缩放比例
        // 优先以边框为准来适配屏幕，留出一点边距
        let scale = 1;
        if (frameTex) {
            const scaleX = w / frameTex.width;
            const scaleY = h / frameTex.height;
            scale = Math.min(scaleX, scaleY);
        } else if (bgTex) {
            const scaleX = w / bgTex.width;
            const scaleY = h / bgTex.height;
            scale = Math.min(scaleX, scaleY);
        }

        // 2. 添加桌台背景 (fb_bg)
        if (bgTex) {
            const bg = new PIXI.Sprite(bgTex);
            bg.anchor.set(0.5);
            bg.position.set(cx, cy);
            // [优化] 背景稍微放大一点点 (1.05)，防止边框内侧露馅
            bg.scale.set(scale * 1.05); 
            this.layout.layers.bg.addChild(bg);
        } else {
            // 兜底绿色
            const g = new PIXI.Graphics();
            g.beginFill(0x27ae60);
            g.drawRect(0, 0, w, h);
            g.endFill();
            this.layout.layers.bg.addChild(g);
        }

        // 3. 添加桌台边框 (fb_table_frame)
        if (frameTex) {
            const frame = new PIXI.Sprite(frameTex);
            frame.anchor.set(0.5);
            frame.position.set(cx, cy); 
            frame.scale.set(scale);
            
            this.layout.layers.over.addChild(frame);

            // 4. 创建遮罩 (Mask)
            // 遮罩区域应该对应边框的"内胆"区域，防止球和杆子穿模到边框木头上
            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            
            // [适配说明] 这里的系数 0.88 和 0.80 是假设边框厚度占比。
            // 如果你的边框图片较厚，请减小这些数值 (如 0.85, 0.75)
            // 如果你的边框图片很薄，请增大这些数值
            const innerW = frameTex.width * scale * 0.88;
            const innerH = frameTex.height * scale * 0.80;
            
            // 绘制圆角矩形遮罩
            mask.drawRoundedRect(-innerW/2, -innerH/2, innerW, innerH, 20);
            mask.endFill();
            mask.position.set(cx, cy);
            
            // 将遮罩应用到游戏层
            this.layout.layers.game.addChild(mask);
            this.layout.layers.game.mask = mask;
        }
    }

    createRod(x, teamId, numPlayers, constraints) {
        const rod = new FoosballRod(this, x, teamId, numPlayers, constraints);
        this.rods.push(rod);
    }

    createBall() {
        const { x, y, w, h } = this.layout.fieldRect;
        // 球放在中心
        this.ball = new Ball(x + w/2, y + h/2, 1);
        
        // 调整球的物理属性以适应桌球手感
        // 摩擦力小，弹性大
        this.ball.body.frictionAir = 0.005; 
        this.ball.body.restitution = 0.9;
        this.ball.body.density = 0.001; // 轻一点
        
        this.physics.add(this.ball.body);
        this.layout.layers.game.addChild(this.ball.view);
    }

    createUI(w, h) {
        // 比分板
        const scoreStyle = { fontFamily: 'Arial Black', fontSize: 60, fill: 0xffffff, stroke: 0x000000, strokeThickness: 4 };
        this.scoreText = new PIXI.Text('0 - 0', scoreStyle);
        this.scoreText.anchor.set(0.5);
        this.scoreText.position.set(w / 2, 80);
        this.layout.layers.ui.addChild(this.scoreText);

        // 退出按钮
        const backBtn = new Button({
            text: '退出', width: 160, height: 60, color: 0x95a5a6,
            onClick: () => SceneManager.changeScene(FoosballMenuScene)
        });
        backBtn.position.set(40, 40);
        this.layout.layers.ui.addChild(backBtn);
        
        // 操作提示
        const hint = new PIXI.Text('拖动控制移动 · 点击射门', { fontSize: 24, fill: 0xcccccc });
        hint.anchor.set(0.5);
        hint.position.set(w/2, h - 50);
        this.layout.layers.ui.addChild(hint);
    }

    // --- 输入处理 ---
    onTouchStart(e) {
        const global = e.data.global;
        // 只有点击左半屏才有效 (控制红方)
        if (global.x < this.controlZoneX) {
            this.activeTouchId = e.data.identifier;
            this.lastTouchY = global.y;
            this.isTap = true;
            this.tapStartX = global.x;
            this.tapStartY = global.y;
        }
    }

    onTouchMove(e) {
        if (e.data.identifier !== this.activeTouchId) return;
        
        const global = e.data.global;
        const dy = global.y - this.lastTouchY;
        
        // 移动阈值
        if (Math.abs(global.y - this.tapStartY) > 10 || Math.abs(global.x - this.tapStartX) > 10) {
            this.isTap = false;
        }

        if (!this.isTap) {
            // 控制己方所有杆移动
            const myRods = this.rods.filter(r => r.teamId === 0);
            myRods.forEach(r => {
                r.moveTo(r.y + dy * 1.5); // 1.5倍灵敏度
            });
        }
        
        this.lastTouchY = global.y;
    }

    onTouchEnd(e) {
        if (e.data.identifier !== this.activeTouchId) return;
        
        if (this.isTap) {
            // 触发击球
            const myRods = this.rods.filter(r => r.teamId === 0);
            myRods.forEach(r => r.kick());
        }
        
        this.activeTouchId = null;
    }

    // --- 游戏循环 ---
    update(delta) {
        // 1. 物理更新
        this.physics.update(16.66);

        // 2. 实体更新
        this.ball.update(delta);
        this.rods.forEach(r => r.update());

        // 3. AI 逻辑 (控制蓝方)
        this.updateAI();

        // 4. 进球检测
        this.checkGoal();
        
        // 5. 出界重置 (防止球飞出墙外)
        const b = this.ball.body.position;
        const rect = this.layout.fieldRect;
        if (b.x < rect.x - 100 || b.x > rect.x + rect.w + 100 || b.y < rect.y - 100 || b.y > rect.y + rect.h + 100) {
            this.resetBall();
        }
    }

    updateAI() {
        const ballY = this.ball.body.position.y;
        const ballX = this.ball.body.position.x;
        
        const aiRods = this.rods.filter(r => r.teamId === 1);
        
        aiRods.forEach(r => {
            // Y 轴跟随
            const diff = ballY - r.y;
            const speed = 3; 
            if (Math.abs(diff) > speed) {
                r.moveTo(r.y + Math.sign(diff) * speed);
            }
            // 击球
            if (ballX < r.x && ballX > r.x - 60 && Math.abs(diff) < 30) {
                if (Math.random() < 0.1) r.kick();
            }
        });
    }

    checkGoal() {
        const bx = this.ball.body.position.x;
        const rect = this.layout.fieldRect;
        
        if (bx < rect.x) {
            this.onGoalScored(1);
        } else if (bx > rect.x + rect.w) {
            this.onGoalScored(0);
        }
    }

    onGoalScored(teamId) {
        this.scores[teamId]++;
        this.scoreText.text = `${this.scores[0]} - ${this.scores[1]}`;
        Platform.showToast(teamId === 0 ? "红方进球！" : "蓝方进球！");
        this.resetBall();
    }

    resetBall() {
        const { x, y, w, h } = this.layout.fieldRect;
        Matter.Body.setPosition(this.ball.body, { x: x + w/2, y: y + h/2 });
        Matter.Body.setVelocity(this.ball.body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(this.ball.body, 0);
    }

    onExit() {
        this.physics.clear();
        super.onExit();
    }
}
