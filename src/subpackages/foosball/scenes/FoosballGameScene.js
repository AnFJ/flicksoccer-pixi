
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import BaseScene from '../../../scenes/BaseScene.js';
import SceneManager from '../../../managers/SceneManager.js';
import FoosballMenuScene from './FoosballMenuScene.js';
import FoosballPhysics from '../systems/FoosballPhysics.js';
import FoosballRod from '../entities/FoosballRod.js';
import GameLayout from '../../../core/GameLayout.js';
import { GameConfig } from '../../../config.js';
import { FoosballConfig } from '../config/FoosballConfig.js';
import Button from '../../../ui/Button.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import Platform from '../../../managers/Platform.js';
import Ball from '../../../entities/Ball.js';
import GoalBanner from '../../../ui/GoalBanner.js'; // 复用主包的 GoalBanner

export default class FoosballGameScene extends BaseScene {
    constructor() {
        super();
        this.physics = new FoosballPhysics();
        this.layout = new GameLayout(this);
        this.ball = null;
        this.rods = [];
        this.scores = [0, 0];
        
        // 游戏状态
        this.isGameOver = false;
        this.isGoalProcessing = false; // [新增] 进球处理锁，防止重复计分
        
        // 触摸跟踪: Map<pointerId, { rod: FoosballRod, lastY: number }>
        this.activeTouches = new Map(); 
        
        // [新增] 调试绘图对象
        this.debugGraphics = null;
        
        // UI
        this.scoreText = null;
        this.goalBanner = null;
    }

    onEnter() {
        super.onEnter();
        const { designWidth, designHeight } = GameConfig;

        // 挂载层级
        this.container.addChild(this.layout.layers.bg);
        this.container.addChild(this.layout.layers.game);
        this.container.addChild(this.layout.layers.over);
        this.container.addChild(this.layout.layers.ui);

        this.physics.init();
        this.setupPitchArea(designWidth, designHeight);
        this.setupFoosballVisuals(designWidth, designHeight);
        this.createBall();
        this.createRods();
        this.createUI(designWidth, designHeight);
        
        // [新增] 初始化调试视图
        if (FoosballConfig.debug) {
            this.createDebugView();
        }

        this.container.interactive = true;
        this.container.on('pointerdown', this.onTouchStart, this);
        this.container.on('pointermove', this.onTouchMove, this);
        this.container.on('pointerup', this.onTouchEnd, this);
        this.container.on('pointerupoutside', this.onTouchEnd, this);
        
        // 播放开场音效
        Platform.showToast('比赛开始！率先进5球获胜');
    }

    // [新增] 创建调试图层
    createDebugView() {
        this.debugGraphics = new PIXI.Graphics();
        // 放在最上层，确保不被遮挡
        this.container.addChild(this.debugGraphics);
        console.log('[Foosball] Debug view enabled');
    }

    // [新增] 实时渲染调试线框
    renderDebugView() {
        if (!this.debugGraphics || !this.physics.engine) return;

        const g = this.debugGraphics;
        g.clear();

        // 获取物理世界所有刚体
        const bodies = Matter.Composite.allBodies(this.physics.engine.world);

        bodies.forEach(body => {
            let color = 0xFFFFFF;
            let alpha = 0.3;
            let stroke = 2;

            if (body.label === 'FoosballPlayer') {
                color = 0x00FF00; // 棋子：绿色
                alpha = 0.5;
            } else if (body.label && body.label.includes('Wall')) {
                color = 0xFFFF00; // 墙壁：黄色
                alpha = 0.3;
            } else if (body.label === 'Ball') {
                color = 0xFF0000; // 足球：红色
                alpha = 0.6;
            } else {
                return; // 其他物体不画，或者用默认白色
            }

            g.lineStyle(stroke, color);
            g.beginFill(color, alpha);

            // 根据顶点绘制，这样旋转的物体也能正确显示
            if (body.vertices && body.vertices.length > 0) {
                g.moveTo(body.vertices[0].x, body.vertices[0].y);
                for (let i = 1; i < body.vertices.length; i++) {
                    g.lineTo(body.vertices[i].x, body.vertices[i].y);
                }
                g.closePath(); // 闭合路径
            }
            g.endFill();
        });
    }

    setupPitchArea(w, h) {
        const pitchW = FoosballConfig.pitch.width;
        const pitchH = FoosballConfig.pitch.height;
        this.layout.fieldRect = {
            x: (w - pitchW) / 2,
            y: (h - pitchH) / 2 + 30,
            w: pitchW,
            h: pitchH
        };
        this.layout._createPhysicsWalls();
    }

    setupFoosballVisuals(w, h) {
        const { x, y, w: fieldW, h: fieldH } = this.layout.fieldRect;
        const cx = w / 2, cy = y + fieldH / 2;
        const bgTex = ResourceManager.get('fb_bg');
        const frameTex = ResourceManager.get('fb_table_frame');

        if (bgTex) {
            const bg = new PIXI.Sprite(bgTex);
            bg.anchor.set(0.5); bg.position.set(cx, cy);
            bg.width = fieldW * 1.1; bg.height = fieldH * 1.1;
            this.layout.layers.bg.addChild(bg);
        }
        
        if (frameTex) {
            const frame = new PIXI.Sprite(frameTex);
            frame.anchor.set(0.5); frame.position.set(cx, cy - 10);
            frame.width = fieldW * 1.32; frame.height = fieldH * 1.2;
            this.layout.layers.over.addChild(frame);
        }

        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(x, y, fieldW, fieldH).endFill();
        this.layout.layers.game.addChild(mask);
        this.layout.layers.game.mask = mask;
    }

    createRods() {
        const { x, y, w, h } = this.layout.fieldRect;
        
        // [修改] 不再在这里计算统一的 constraints
        // 而是将 fieldRect 传入 Rod，让每根杆子根据自己的球员数量计算
        const step = w / (FoosballConfig.rod.count + 1);

        FoosballConfig.rod.layout.forEach((cfg, index) => {
            const rodX = x + step * (index + 1);
            // 传入 this.layout.fieldRect
            const rod = new FoosballRod(this, rodX, cfg.teamId, cfg.puppets, this.layout.fieldRect);
            this.rods.push(rod);
        });
    }

    createBall() {
        const { x, y, w, h } = this.layout.fieldRect;
        this.ball = new Ball(x + w/2, y + h/2, 1);
        
        // [核心优化] 从配置文件读取物理参数 (包括密度)
        const ballCfg = FoosballConfig.ball;
        
        // 设置基本物理属性
        this.ball.body.restitution = ballCfg.restitution; 
        this.ball.body.frictionAir = ballCfg.frictionAir;
        this.ball.body.friction = ballCfg.friction;
        
        // [新增] 显式设置密度 (这会自动重新计算质量 mass = density * area)
        Matter.Body.setDensity(this.ball.body, ballCfg.density);
        
        this.physics.add(this.ball.body);
        this.layout.layers.game.addChild(this.ball.view);
    }

    createUI(w, h) {
        // 1. 比分板
        const style = { fontFamily: 'Arial Black', fontSize: 80, fill: 0xFFD700, stroke: 0x000000, strokeThickness: 10 };
        this.scoreText = new PIXI.Text('0 - 0', style);
        this.scoreText.anchor.set(0.5);
        this.scoreText.position.set(w / 2, 80);
        this.layout.layers.ui.addChild(this.scoreText);

        // [新增] 进球横幅 (复用主包组件)
        this.goalBanner = new GoalBanner();
        this.layout.layers.ui.addChild(this.goalBanner);

        // 2. 退出按钮 (左上)
        const exitBtn = new Button({
            text: '退出', width: 140, height: 60, color: 0xe74c3c,
            onClick: () => SceneManager.changeScene(FoosballMenuScene)
        });
        exitBtn.position.set(40, 40);
        this.layout.layers.ui.addChild(exitBtn);

        // 3. 射门按钮 (右下)
        const btnRadius = 70;
        const shootBtn = new PIXI.Container();
        shootBtn.position.set(w - 120, h - 120);

        const btnBg = new PIXI.Graphics();
        btnBg.lineStyle(4, 0xffffff);
        btnBg.beginFill(0xe74c3c); // 红色按钮
        btnBg.drawCircle(0, 0, btnRadius);
        btnBg.endFill();
        
        // 简单的“靴子/脚”图标或者文字
        const btnText = new PIXI.Text('射门', {
            fontFamily: 'Arial Black', fontSize: 36, fill: 0xffffff
        });
        btnText.anchor.set(0.5);

        shootBtn.addChild(btnBg, btnText);
        shootBtn.interactive = true;
        shootBtn.buttonMode = true;

        // 绑定射门事件
        shootBtn.on('pointerdown', (e) => {
            e.stopPropagation(); // 阻止事件穿透到场景导致误触移动
            shootBtn.scale.set(0.9);
            this.onKickButtonPress();
        });
        shootBtn.on('pointerup', () => shootBtn.scale.set(1));
        shootBtn.on('pointerupoutside', () => shootBtn.scale.set(1));

        this.layout.layers.ui.addChild(shootBtn);
    }

    onKickButtonPress() {
        if (this.isGameOver) return;

        // 逻辑：
        // 1. 如果玩家正在按住某些杆子（activeTouches），则只让这些杆子踢球
        // 2. 如果玩家没有按住任何杆子，则全队一起踢球（方便操作）
        
        const myActiveRods = new Set();
        this.activeTouches.forEach(data => {
            if (data.rod && data.rod.teamId === 0) {
                myActiveRods.add(data.rod);
            }
        });

        if (myActiveRods.size > 0) {
            myActiveRods.forEach(rod => rod.kick());
        } else {
            // 兜底：所有红方杆子踢球
            this.rods.filter(r => r.teamId === 0).forEach(r => r.kick());
        }
    }

    onTouchStart(e) {
        if (this.isGameOver) return;

        const id = e.data.identifier;
        
        // [修复] 将全局屏幕坐标转换为场景内部坐标 (Local Space)
        // 解决因屏幕适配缩放导致的点击位置错乱问题
        const localPos = this.container.toLocal(e.data.global);

        // 寻找距离点击位置最近的、属于我方(Team 0)的杆子
        const myRods = this.rods.filter(r => r.teamId === 0);
        let targetRod = null;
        let minDst = Infinity;
        // 使用场景设计尺寸下的阈值
        const threshold = 120; 

        myRods.forEach(r => {
            // 在同一坐标系下对比 X 轴距离
            const dist = Math.abs(r.x - localPos.x);
            if (dist < threshold && dist < minDst) {
                minDst = dist;
                targetRod = r;
            }
        });

        if (targetRod) {
            this.activeTouches.set(id, {
                rod: targetRod,
                lastY: localPos.y // 记录 Local Y
            });
        }
    }

    onTouchMove(e) {
        if (this.isGameOver) return;

        const id = e.data.identifier;
        const touchData = this.activeTouches.get(id);
        
        if (!touchData) return;

        // 同样转换为 Local Space
        const localPos = this.container.toLocal(e.data.global);
        const currentY = localPos.y;
        
        const dy = currentY - touchData.lastY;

        // 移动对应的杆子 (系数可以根据手感微调，现在是在同一坐标系下，1.0 是 1:1 跟随)
        touchData.rod.moveTo(touchData.rod.y + dy * 1.0);
        
        touchData.lastY = currentY;
    }

    onTouchEnd(e) {
        const id = e.data.identifier;
        this.activeTouches.delete(id);
    }

    update(delta) {
        if (!this.isGameOver) {
            this.physics.update(16.66);
            if (this.ball) this.ball.update(delta);
            this.rods.forEach(r => r.update());
            this.updateAI();
            this.checkGoal();
        }
        
        // [新增] 更新调试视图
        if (FoosballConfig.debug) {
            this.renderDebugView();
        }
        
        if (this.goalBanner) this.goalBanner.update(delta);
    }

    updateAI() {
        if (!this.ball) return;
        const bPos = this.ball.body.position;
        const bVel = this.ball.body.velocity; // [新增] 获取速度
        
        // AI 控制蓝方杆子 (Team 1)
        // 蓝方在右侧，向左进攻 (Goal at Left)
        this.rods.filter(r => r.teamId === 1).forEach(r => {
            const diff = bPos.y - r.y;
            
            // [优化] 1. 移动预判
            // 加上球的垂直速度分量，预判 0.2s 后的位置
            let targetY = bPos.y + bVel.y * 12;
            
            const moveDiff = targetY - r.y;

            if (Math.abs(moveDiff) > 5) {
                // 移动速度随距离增加，更加灵敏
                const speed = Math.min(Math.abs(moveDiff) * 0.25, 10);
                r.moveTo(r.y + Math.sign(moveDiff) * speed);
            }
            
            // 2. 射门/击球逻辑
            // distanceX = 杆子X - 球X
            // Team1(蓝) 在右，向左攻。前方是 -X 方向。
            // 球在左(前): bPos.x < r.x => distanceX > 0
            // 球在右(后): bPos.x > r.x => distanceX < 0
            const distanceX = r.x - bPos.x; 
            const absDiffY = Math.abs(diff);
            
            // Y轴只要大概对齐就开始尝试击球
            if (absDiffY < 60) {
                
                // [情况 A] 正常射门 (Forward Kick)
                // 范围: 球在前方 0 ~ 130px
                if (distanceX > 0 && distanceX < 130) {
                    // 基础概率 0.08，球速越快越容易触发激进反应
                    let chance = 0.08 + Math.abs(bVel.x) * 0.02;
                    if (Math.random() < chance) r.kick(1); 
                }
                
                // [情况 B] 身后解围 (Back Kick)
                // 范围: 球在身后 0 ~ 140px (杆子最大后仰约 160px)
                // 之前的 -50 太小了，导致稍微过线 AI 就傻了
                else if (distanceX < 0 && distanceX > -140) {
                    // 离得越近越需要踢
                    let chance = 0.05;
                    if (distanceX > -60) chance = 0.2; // 贴身时高概率
                    
                    if (Math.random() < chance) r.kick(-1);
                }
            }
        });
    }

    checkGoal() {
        if (this.isGameOver || this.isGoalProcessing) return; // [修复] 增加锁判断

        const bx = this.ball.body.position.x;
        const rect = this.layout.fieldRect;
        
        // 超出左边界 -> 蓝方(1)进球
        if (bx < rect.x - 20) this.onGoal(1);
        // 超出右边界 -> 红方(0)进球
        else if (bx > rect.x + rect.w + 20) this.onGoal(0);
    }

    onGoal(scoreTeamId) {
        this.isGoalProcessing = true; // [修复] 锁定状态

        this.scores[scoreTeamId]++;
        this.scoreText.text = `${this.scores[0]} - ${this.scores[1]}`;
        
        if (this.goalBanner) {
            const txt = scoreTeamId === 0 ? "红方得分!" : "蓝方得分!";
            this.goalBanner.play(txt);
        }

        // 检查胜负
        if (this.scores[scoreTeamId] >= FoosballConfig.gameplay.maxScore) {
            this.showGameOver(scoreTeamId);
        } else {
            // 继续比赛：延迟重置
            setTimeout(() => {
                if (!this.isGameOver) this.resetBall();
            }, 1500);
        }
    }

    showGameOver(winnerId) {
        this.isGameOver = true;
        
        const { designWidth, designHeight } = GameConfig;
        
        // 1. 半透明遮罩
        const overlay = new PIXI.Graphics();
        overlay.beginFill(0x000000, 0.7);
        overlay.drawRect(0, 0, designWidth, designHeight);
        overlay.interactive = true;
        this.layout.layers.ui.addChild(overlay);

        // 2. 结算面板
        const panel = new PIXI.Graphics();
        panel.beginFill(0xFFFFFF);
        panel.drawRoundedRect(-300, -200, 600, 400, 20);
        panel.endFill();
        panel.position.set(designWidth / 2, designHeight / 2);
        this.layout.layers.ui.addChild(panel);

        // 3. 标题
        const winColor = winnerId === 0 ? 0xe74c3c : 0x3498db;
        const titleStr = winnerId === 0 ? "红方获胜!" : "蓝方获胜!";
        const title = new PIXI.Text(titleStr, {
            fontFamily: 'Arial Black', fontSize: 60, fill: winColor, fontWeight: 'bold'
        });
        title.anchor.set(0.5);
        title.position.set(0, -100);
        panel.addChild(title);

        // 4. 最终比分
        const scoreStr = `${this.scores[0]} - ${this.scores[1]}`;
        const scoreDisplay = new PIXI.Text(scoreStr, {
            fontFamily: 'Arial', fontSize: 80, fill: 0x333333
        });
        scoreDisplay.anchor.set(0.5);
        scoreDisplay.position.set(0, 20);
        panel.addChild(scoreDisplay);

        // 5. 按钮
        // 再来一局
        const restartBtn = new Button({
            text: '再来一局', width: 220, height: 70, color: 0x2ecc71,
            onClick: () => SceneManager.changeScene(FoosballGameScene)
        });
        restartBtn.position.set(-240, 120);
        panel.addChild(restartBtn);

        // 返回菜单
        const menuBtn = new Button({
            text: '返回菜单', width: 220, height: 70, color: 0x95a5a6,
            onClick: () => SceneManager.changeScene(FoosballMenuScene)
        });
        menuBtn.position.set(20, 120);
        panel.addChild(menuBtn);
    }

    resetBall() {
        const { x, y, w, h } = this.layout.fieldRect;
        // 重置到中心
        Matter.Body.setPosition(this.ball.body, { x: x + w/2, y: y + h/2 });
        // 重置速度
        Matter.Body.setVelocity(this.ball.body, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(this.ball.body, 0);
        
        // [优化] 发球随机给一个小推力，防止死球
        const randDir = Math.random() > 0.5 ? 1 : -1;
        Matter.Body.setVelocity(this.ball.body, { x: randDir * 2, y: (Math.random()-0.5)*2 });

        this.isGoalProcessing = false; // [修复] 解锁
    }

    onExit() {
        this.physics.clear();
        super.onExit();
    }
}
