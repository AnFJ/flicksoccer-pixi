
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

export default class FoosballGameScene extends BaseScene {
    constructor() {
        super();
        this.physics = new FoosballPhysics();
        this.layout = new GameLayout(this);
        this.ball = null;
        this.rods = [];
        this.scores = [0, 0];
        
        // 触摸跟踪: Map<pointerId, { rod: FoosballRod, lastY: number }>
        this.activeTouches = new Map(); 
        
        // [新增] 调试绘图对象
        this.debugGraphics = null;
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
            bg.width = fieldW; bg.height = fieldH;
            this.layout.layers.bg.addChild(bg);
        }
        
        if (frameTex) {
            const frame = new PIXI.Sprite(frameTex);
            frame.anchor.set(0.5); frame.position.set(cx, cy);
            frame.width = fieldW * 1.15; frame.height = fieldH * 1.25;
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
        
        // [核心优化] 从配置文件读取物理参数
        const ballCfg = FoosballConfig.ball;
        this.ball.body.restitution = ballCfg.restitution; 
        this.ball.body.frictionAir = ballCfg.frictionAir;
        this.ball.body.friction = ballCfg.friction;
        
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
        const id = e.data.identifier;
        const touchData = this.activeTouches.get(id);
        
        if (!touchData) return;

        // 同样转换为 Local Space
        const localPos = this.container.toLocal(e.data.global);
        const currentY = localPos.y;
        
        const dy = currentY - touchData.lastY;

        // 移动对应的杆子 (系数可以根据手感微调，现在是在同一坐标系下，1.0 是 1:1 跟随)
        // [修改] 之前是 1.5，导致玩家感觉滑得太快（比手指快30-50%）。现在改为 1.0，实现 1:1 精准跟随。
        touchData.rod.moveTo(touchData.rod.y + dy * 1.0);
        
        touchData.lastY = currentY;
    }

    onTouchEnd(e) {
        const id = e.data.identifier;
        this.activeTouches.delete(id);
    }

    update(delta) {
        this.physics.update(16.66);
        if (this.ball) this.ball.update(delta);
        this.rods.forEach(r => r.update());
        this.updateAI();
        this.checkGoal();
        
        // [新增] 更新调试视图
        if (FoosballConfig.debug) {
            this.renderDebugView();
        }
    }

    updateAI() {
        if (!this.ball) return;
        const bPos = this.ball.body.position;
        
        // AI 控制蓝方杆子 (Team 1)
        // 蓝方在右侧，向左进攻
        this.rods.filter(r => r.teamId === 1).forEach(r => {
            const diff = bPos.y - r.y;
            // [优化] 全场跟随：无论球在哪里，AI 都尝试将杆子移动到球的 Y 轴
            // 原先可能有限制，现在放开，让 AI 即使球在身后也能对齐进行拦截/回踢
            if (Math.abs(diff) > 5) {
                // 简单的反应延迟/平滑移动
                r.moveTo(r.y + Math.sign(diff) * 4);
            }
            
            // 射门逻辑
            const distanceX = r.x - bPos.x; // 杆子X - 球X
            
            // 情况 A: 球在杆子前方 (左侧) 且距离合适 -> 正常射门 (Forward Kick)
            // 蓝方在右，球在左边就是前方。 bPos.x < r.x, so distanceX > 0
            if (distanceX > 0 && distanceX < 120 && Math.abs(diff) < 50) {
                if (Math.random() < 0.08) r.kick(1); // 向前踢
            }
            
            // 情况 B: 球在杆子后方 (右侧) 且非常贴近 -> 背后击球 (Back Kick)
            // 模拟 360 度旋转击球，或者用后脚跟磕球
            // distanceX < 0 means ball is to the right
            else if (distanceX < 0 && distanceX > -50 && Math.abs(diff) < 50) {
                // 触发几率稍微低一点，避免鬼畜
                if (Math.random() < 0.05) r.kick(-1); // 向后踢
            }
        });
    }

    checkGoal() {
        const bx = this.ball.body.position.x;
        const rect = this.layout.fieldRect;
        if (bx < rect.x) this.onGoal(1);
        else if (bx > rect.x + rect.w) this.onGoal(0);
    }

    onGoal(teamId) {
        this.scores[teamId]++;
        this.scoreText.text = `${this.scores[0]} - ${this.scores[1]}`;
        Platform.showToast(teamId === 0 ? "红方得分！" : "蓝方得分！");
        this.resetBall();
    }

    resetBall() {
        const { x, y, w, h } = this.layout.fieldRect;
        Matter.Body.setPosition(this.ball.body, { x: x + w/2, y: y + h/2 });
        Matter.Body.setVelocity(this.ball.body, { x: 0, y: 0 });
    }

    onExit() {
        this.physics.clear();
        super.onExit();
    }
}
