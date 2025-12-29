
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId, NetMsg } from '../constants.js';
import AudioManager from '../managers/AudioManager.js';
import NetworkMgr from '../managers/NetworkMgr.js';

/**
 * InputController 负责玩家的触摸交互和射门指令生成
 */
export default class InputController {
    constructor(scene) {
        this.scene = scene;
        
        this.isDragging = false;
        this.selectedBody = null;
        this.selectedEntityId = null;
        this.aimingPointerId = null;
        
        // 拖拽数据
        this.dragStartPos = { x: 0, y: 0 };
        this.aimVector = { x: 0, y: 0 };
        
        // 双指操控支持
        this.isDualControl = false;
        this.controlStartPos = { x: 0, y: 0 };
        this.baseAimVector = { x: 0, y: 0 };

        this.aimGraphics = new PIXI.Graphics();
    }

    init() {
        this.scene.layout.layers.ui.addChild(this.aimGraphics);
        
        this.scene.container.interactive = true;
        this.scene.container.on('pointerdown', this.onPointerDown, this);
        this.scene.container.on('pointermove', this.onPointerMove, this);
        this.scene.container.on('pointerup', this.onPointerUp, this);
        this.scene.container.on('pointerupoutside', this.onPointerUp, this);
    }

    onPointerDown(e) {
        // 新增：如果游戏处于全局暂停状态 (如等待掉线重连)，禁止输入
        if (this.scene.isGamePaused) return;

        if (this.scene.isMoving || this.scene.isGameOver || this.scene.isLoading) return;
        
        // 权限校验：联网模式只能操作自己，单机模式只能操作当前回合方
        if (this.scene.gameMode === 'pvp_online' && this.scene.turnMgr.currentTurn !== this.scene.myTeamId) return;
        if (this.scene.gameMode === 'pve' && this.scene.turnMgr.currentTurn === TeamId.LEFT) return;

        const local = this.scene.container.toLocal(e.data.global);
        const pointerId = e.id;

        // 如果已经在拖动，支持第二根手指微调
        if (this.isDragging && this.selectedBody) {
            this.aimingPointerId = pointerId;
            this.isDualControl = true;
            this.controlStartPos = { x: local.x, y: local.y };
            this.baseAimVector = { ...this.aimVector };
            return;
        }

        // 查找选中的棋子
        const striker = this._findStrikerAt(e.target, local);
        if (striker && striker.teamId === this.scene.turnMgr.currentTurn) {
            this.selectedBody = striker.body;
            this.selectedEntityId = striker.id;
            this.isDragging = true;
            this.aimingPointerId = pointerId;
            this.dragStartPos = { x: striker.body.position.x, y: striker.body.position.y };
            this.aimVector = { x: 0, y: 0 };
        }
    }

    _findStrikerAt(target, local) {
        // 1. 优先尝试 UI 层级查找 (依赖 Striker.js 的 hitArea)
        let node = target;
        while (node && node !== this.scene.container) {
            if (node.entity && node.entity.teamId !== undefined) return node.entity;
            node = node.parent;
        }

        // 2. 尝试物理引擎点查询 (精确匹配物理刚体)
        const bodies = this.scene.physics.queryPoint(local.x, local.y);
        const strikerBody = bodies.find(b => b.label === 'Striker');
        if (strikerBody) return strikerBody.entity;

        // 3. [新增] 距离容错查询 (模糊匹配)
        // 如果以上都没选中，检测点击点周围是否有棋子。
        // 容错半径设为棋子直径的 0.8 倍 (即半径的1.6倍)
        const searchRadius = GameConfig.dimensions.strikerDiameter * 0.8;
        
        let closest = null;
        let minDist = searchRadius;

        // 遍历当前场景的所有棋子
        if (this.scene.strikers) {
            for (const s of this.scene.strikers) {
                const dx = local.x - s.body.position.x;
                const dy = local.y - s.body.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                
                if (dist < minDist) {
                    minDist = dist;
                    closest = s;
                }
            }
        }
        
        return closest;
    }

    onPointerMove(e) {
        if (!this.isDragging || !this.selectedBody || e.id !== this.aimingPointerId) return;
        
        const local = this.scene.container.toLocal(e.data.global);
        
        if (this.isDualControl) {
            const dx = local.x - this.controlStartPos.x;
            const dy = local.y - this.controlStartPos.y;
            this.aimVector = { x: this.baseAimVector.x + dx, y: this.baseAimVector.y + dy };
        } else {
            this.aimVector = { x: this.dragStartPos.x - local.x, y: this.dragStartPos.y - local.y };
        }
        
        this._drawAimingLine();
    }

    onPointerUp(e) {
        if (this.isDragging && this.selectedBody && e.id === this.aimingPointerId) {
            const dist = Math.sqrt(this.aimVector.x**2 + this.aimVector.y**2);
            if (dist > 40) {
                this._executeShoot(dist);
            }
            this.reset();
        }
    }

    _executeShoot(dist) {
        const maxDist = GameConfig.gameplay.maxDragDistance;
        const effectiveDist = Math.min(dist, maxDist);
        const angle = Math.atan2(this.aimVector.y, this.aimVector.x);
        const force = {
            x: Math.cos(angle) * effectiveDist * GameConfig.gameplay.forceMultiplier,
            y: Math.sin(angle) * effectiveDist * GameConfig.gameplay.forceMultiplier
        };

        if (this.scene.gameMode === 'pvp_online') {
            NetworkMgr.send({
                type: NetMsg.MOVE,
                payload: { id: this.selectedEntityId, force: force }
            });
        }
        
        Matter.Body.applyForce(this.selectedBody, this.selectedBody.position, force);
        this.scene.onActionFired();
    }

    reset() {
        this.aimGraphics.clear();
        this.isDragging = false;
        this.selectedBody = null;
        this.aimingPointerId = null;
        this.isDualControl = false;
    }

    _drawAimingLine() {
        const g = this.aimGraphics;
        g.clear();
        
        const dist = Math.sqrt(this.aimVector.x**2 + this.aimVector.y**2);
        if (dist < 40) return;

        const maxDist = GameConfig.gameplay.maxDragDistance;
        const d = Math.min(dist, maxDist);
        const angle = Math.atan2(this.aimVector.y, this.aimVector.x);
        const { x: sx, y: sy } = this.dragStartPos;
        const r = GameConfig.dimensions.strikerDiameter / 2;

        // 1. 绘制最大拖拽范围圆圈 (淡淡的背景圆)
        g.lineStyle(2, 0xFFFFFF, 0.1);
        g.beginFill(0x000000, 0.05);
        g.drawCircle(sx, sy, r + maxDist);
        g.endFill();

        // 2. 绘制反向虚线 (拖拽方向 - 手指拉弹弓的感觉)
        const backAngle = angle + Math.PI;
        const gap = 30;     // 点间距
        const dotSize = 8;  // 点半径
        
        g.lineStyle(0);
        g.beginFill(0xFFFFFF, 0.3); // 半透明白点

        // 从棋子边缘外一点开始画
        for (let currDist = 10; currDist < d; currDist += gap) {
             const bx = sx + Math.cos(backAngle) * (r + currDist);
             const by = sy + Math.sin(backAngle) * (r + currDist);
             g.drawCircle(bx, by, dotSize);
        }
        g.endFill();
        
        // 绘制拖拽终点的大光圈 (手指位置)
        const fingerX = sx + Math.cos(backAngle) * (r + d);
        const fingerY = sy + Math.sin(backAngle) * (r + d);
        g.lineStyle(2, 0xFFFFFF, 0.5);
        g.beginFill(0xFFFFFF, 0.1);
        g.drawCircle(fingerX, fingerY, 25);
        g.endFill();


        // 3. 绘制前方箭头 (射出方向)
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const fx = sx + cos * r, fy = sy + sin * r;
        const tx = fx + cos * d, ty = fy + sin * d;

        // 箭身 (渐变色很难在Graphics lineStyle里做，用纯色代替，模拟发光)
        // 外发光
        g.lineStyle(16, 0xFF4500, 0.3); // 橙红色光晕
        g.moveTo(fx, fy);
        g.lineTo(tx - cos * 20, ty - sin * 20);

        // 实体线
        g.lineStyle(8, 0xFFD700, 1.0); // 金色实线
        g.moveTo(fx, fy);
        g.lineTo(tx - cos * 20, ty - sin * 20);

        // 箭头头部
        const hSize = 40;
        const p1x = tx + cos * 5, p1y = ty + sin * 5;
        const p2x = tx - hSize * Math.cos(angle - Math.PI/6), p2y = ty - hSize * Math.sin(angle - Math.PI/6);
        const p3x = tx - hSize * Math.cos(angle + Math.PI/6), p3y = ty - hSize * Math.sin(angle + Math.PI/6);
        
        g.lineStyle(3, 0x8B4513); // 深褐描边
        g.beginFill(0xFF4500);    // 橙红填充
        g.drawPolygon([p1x, p1y, p2x, p2y, p3x, p3y]);
        g.endFill();
    }
}
