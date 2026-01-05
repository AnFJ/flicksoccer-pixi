
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId, NetMsg, SkillType } from '../constants.js';
import AudioManager from '../managers/AudioManager.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import Platform from '../managers/Platform.js'; 

/**
 * InputController 负责玩家的触摸交互和射门指令生成
 * [更新] 支持技能逻辑
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

        // [本地] 瞄准线图形
        this.aimGraphics = new PIXI.Graphics();
        
        // [网络] 远程瞄准线图形
        this.remoteAimGraphics = new PIXI.Graphics();

        // [网络] 瞄准同步节流
        this.lastAimSyncTime = 0;
        // [修改] 使用配置的同步间隔
        this.aimSyncInterval = GameConfig.network.aimSyncInterval; 
        
        // [网络] 远程瞄准状态
        this.remoteAimData = {
            active: false,
            startPos: { x:0, y:0 },
            vector: { x:0, y:0 },
            entityId: null
        };
    }

    init() {
        // UI层级：先画远程的，再画本地的，防止遮挡
        this.scene.layout.layers.ui.addChild(this.remoteAimGraphics);
        this.scene.layout.layers.ui.addChild(this.aimGraphics);
        
        this.scene.container.interactive = true;
        this.scene.container.on('pointerdown', this.onPointerDown, this);
        this.scene.container.on('pointermove', this.onPointerMove, this);
        this.scene.container.on('pointerup', this.onPointerUp, this);
        this.scene.container.on('pointerupoutside', this.onPointerUp, this);
    }

    onPointerDown(e) {
        if (this.scene.isGamePaused) return;
        if (this.scene.isMoving || this.scene.isGameOver || this.scene.isLoading) return;
        
        // 权限校验
        // 1. 联网对战：必须是自己的回合
        if (this.scene.gameMode === 'pvp_online' && this.scene.turnMgr.currentTurn !== this.scene.myTeamId) return;
        
        // 2. [修复] PVE模式：如果是 AI 回合 (Right/Blue)，则禁止玩家操作
        // 玩家执 Left/Red
        if (this.scene.gameMode === 'pve' && this.scene.turnMgr.currentTurn === TeamId.RIGHT) return;

        const local = this.scene.container.toLocal(e.data.global);
        const pointerId = e.data.identifier; // 使用更稳定的 identifier (Touch ID)

        // 检查是否已经是拖拽状态 (处理双指/多指)
        if (this.isDragging && this.selectedBody) {
            // [修复] 只有当是一个新的触摸点 ID 时，才启用双指操控
            // 防止同一个触摸点触发多次 down 事件导致逻辑错乱
            if (pointerId !== this.aimingPointerId) {
                this.aimingPointerId = pointerId;
                this.isDualControl = true;
                this.controlStartPos = { x: local.x, y: local.y };
                this.baseAimVector = { ...this.aimVector };
            }
            return;
        }

        const striker = this._findStrikerAt(e.target, local);
        if (striker && striker.teamId === this.scene.turnMgr.currentTurn) {
            this.selectedBody = striker.body;
            this.selectedEntityId = striker.id;
            this.isDragging = true;
            this.aimingPointerId = pointerId;
            this.dragStartPos = { x: striker.body.position.x, y: striker.body.position.y };
            this.aimVector = { x: 0, y: 0 };
            
            // 重置双指状态
            this.isDualControl = false;
            
            if (this.scene.gameMode === 'pvp_online') {
                NetworkMgr.send({
                    type: NetMsg.AIM_START,
                    payload: { 
                        id: this.selectedEntityId, 
                        startPos: this.dragStartPos 
                    }
                });
                this.lastAimSyncTime = 0;
            }
        }
    }

    _findStrikerAt(target, local) {
        let node = target;
        while (node && node !== this.scene.container) {
            if (node.entity && node.entity.teamId !== undefined) return node.entity;
            node = node.parent;
        }
        const bodies = this.scene.physics.queryPoint(local.x, local.y);
        const strikerBody = bodies.find(b => b.label === 'Striker');
        if (strikerBody) return strikerBody.entity;

        const searchRadius = GameConfig.dimensions.strikerDiameter * 0.8;
        let closest = null;
        let minDist = searchRadius;
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
        // 使用 identifier 匹配
        if (!this.isDragging || !this.selectedBody || e.data.identifier !== this.aimingPointerId) return;
        
        const local = this.scene.container.toLocal(e.data.global);
        
        if (this.isDualControl) {
            // 双指/微调模式：向量随手指移动增量变化 (直接操控)
            const dx = local.x - this.controlStartPos.x;
            const dy = local.y - this.controlStartPos.y;
            this.aimVector = { x: this.baseAimVector.x + dx, y: this.baseAimVector.y + dy };
        } else {
            // 单指模式：反向弹射 (Slingshot)
            // 向量 = 起点 - 当前点
            this.aimVector = { x: this.dragStartPos.x - local.x, y: this.dragStartPos.y - local.y };
        }
        
        // 检查是否激活了超距瞄准
        const useSuperAim = this.scene.skillMgr && this.scene.skillMgr.isActive(SkillType.SUPER_AIM);
        
        this._drawAimingLine(this.aimGraphics, this.dragStartPos, this.aimVector, useSuperAim);

        if (this.scene.gameMode === 'pvp_online') {
            const now = Date.now();
            if (now - this.lastAimSyncTime > this.aimSyncInterval) {
                this.lastAimSyncTime = now;
                NetworkMgr.send({
                    type: NetMsg.AIM_UPDATE,
                    payload: { vector: this.aimVector }
                });
            }
        }
    }

    onPointerUp(e) {
        if (this.isDragging && this.selectedBody && e.data.identifier === this.aimingPointerId) {
            const dist = Math.sqrt(this.aimVector.x**2 + this.aimVector.y**2);
            
            if (this.scene.gameMode === 'pvp_online') {
                NetworkMgr.send({ type: NetMsg.AIM_END });
            }

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
        
        let multiplier = GameConfig.gameplay.forceMultiplier;
        
        // --- 1. 获取当前激活的技能 ---
        // 我们将这些状态打包进 MOVE 消息，确保远程端也能复现
        const usedSkills = {}; 

        if (this.scene.skillMgr) {
            if (this.scene.skillMgr.isActive(SkillType.SUPER_FORCE)) {
                multiplier *= GameConfig.gameplay.skills.superForce.multiplier;
                usedSkills[SkillType.SUPER_FORCE] = true;
                
                // 本地特效
                if (this.scene.ball) this.scene.ball.setLightningMode(true);
                Platform.showToast("大力水手触发！");
            }
            
            if (this.scene.skillMgr.isActive(SkillType.UNSTOPPABLE)) {
                usedSkills[SkillType.UNSTOPPABLE] = true;
                
                // 本地特效
                if (this.scene.ball) this.scene.ball.activateUnstoppable(GameConfig.gameplay.skills.unstoppable.duration);
                Platform.showToast("无敌战车触发！");
            }
        }

        const force = {
            x: Math.cos(angle) * effectiveDist * multiplier,
            y: Math.sin(angle) * effectiveDist * multiplier
        };

        // --- 2. 消耗技能 (UI重置) ---
        if (this.scene.skillMgr) this.scene.skillMgr.consumeSkills();

        // --- 3. 发送网络消息 (携带技能数据) ---
        if (this.scene.gameMode === 'pvp_online') {
            // 注意：因为采用了缓冲同步，MOVE 消息现在主要作为一个“开始信号”
            // 对方收到 MOVE 后并不会模拟力，而是等待接收 Trajectory 数据
            // 但 force 和 skills 仍然传递过去，用于 UI 显示或可能的预测校验
            NetworkMgr.send({
                type: NetMsg.MOVE,
                payload: { 
                    id: this.selectedEntityId, 
                    force: force,
                    skills: usedSkills
                }
            });
        }
        
        // 本地立即应用力，开始模拟
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

    handleRemoteAim(type, payload) {
        if (this.isDragging) return;

        if (type === NetMsg.AIM_START) {
            this.remoteAimData.active = true;
            this.remoteAimData.entityId = payload.id;
            this.remoteAimData.startPos = payload.startPos;
            this.remoteAimData.vector = { x: 0, y: 0 };
            this.remoteAimGraphics.clear();
        } else if (type === NetMsg.AIM_UPDATE) {
            if (this.remoteAimData.active) {
                this.remoteAimData.vector = payload.vector;
                this._drawAimingLine(this.remoteAimGraphics, this.remoteAimData.startPos, this.remoteAimData.vector, false); // 远程不显示超距线，防止作弊感太强
            }
        } else if (type === NetMsg.AIM_END) {
            this.remoteAimData.active = false;
            this.remoteAimGraphics.clear();
        }
    }

    _drawAimingLine(g, startPos, vector, isSuperAim) {
        g.clear();
        
        const dist = Math.sqrt(vector.x**2 + vector.y**2);
        if (dist < 40) return;

        const maxDist = GameConfig.gameplay.maxDragDistance;
        const d = Math.min(dist, maxDist);
        const angle = Math.atan2(vector.y, vector.x);
        const { x: sx, y: sy } = startPos;
        const r = GameConfig.dimensions.strikerDiameter / 2;

        // --- 1. 始终绘制基础瞄准箭头 ---
        
        // 拖拽圈 (手指位置)
        g.lineStyle(2, 0xFFFFFF, 0.1);
        g.beginFill(0x000000, 0.05);
        g.drawCircle(sx, sy, r + d);
        g.endFill();

        // 反向虚线 (拉绳)
        const backAngle = angle + Math.PI;
        const gap = 30;     
        const dotSize = 8;  
        g.lineStyle(0);
        g.beginFill(0xFFFFFF, 0.3);
        for (let currDist = 10; currDist < d; currDist += gap) {
             const bx = sx + Math.cos(backAngle) * (r + currDist);
             const by = sy + Math.sin(backAngle) * (r + currDist);
             g.drawCircle(bx, by, dotSize);
        }
        g.endFill();
        
        // 终点光圈 (手指接触点)
        const fingerX = sx + Math.cos(backAngle) * (r + d);
        const fingerY = sy + Math.sin(backAngle) * (r + d);
        g.lineStyle(2, 0xFFFFFF, 0.5);
        g.beginFill(0xFFFFFF, 0.1);
        g.drawCircle(fingerX, fingerY, 25);
        g.endFill();

        // 前方箭头 (指示方向)
        const cos = Math.cos(angle), sin = Math.sin(angle);
        const fx = sx + cos * r, fy = sy + sin * r;
        const tx = fx + cos * d, ty = fy + sin * d; // 长度随力度

        g.lineStyle(16, 0xFF4500, 0.3);
        g.moveTo(fx, fy);
        g.lineTo(tx - cos * 20, ty - sin * 20);
        g.lineStyle(8, 0xFFD700, 1.0);
        g.moveTo(fx, fy);
        g.lineTo(tx - cos * 20, ty - sin * 20);

        // 箭头头部
        const hSize = 40;
        const p1x = tx + cos * 5, p1y = ty + sin * 5;
        const p2x = tx - hSize * Math.cos(angle - Math.PI/6), p2y = ty - hSize * Math.sin(angle - Math.PI/6);
        const p3x = tx - hSize * Math.cos(angle + Math.PI/6), p3y = ty - hSize * Math.sin(angle + Math.PI/6);
        
        g.lineStyle(3, 0x8B4513);
        g.beginFill(0xFF4500);
        g.drawPolygon([p1x, p1y, p2x, p2y, p3x, p3y]);
        g.endFill();

        // --- 2. 如果开启超级瞄准，额外绘制折线轨迹 ---
        if (isSuperAim) {
            // 从箭头尖端附近开始绘制，或者从棋子中心开始绘制
            this._drawSuperAimLine(g, sx, sy, angle, this.selectedEntityId);
        }
    }

    /**
     * 超级瞄准：射线检测与折线绘制
     * [更新] 支持检测足球和敌方棋子
     */
    _drawSuperAimLine(g, startX, startY, angle, ignoredId) {
        // 配置
        const maxBounces = 3;
        const totalDist = GameConfig.gameplay.skills.superAim.distance;
        let remainingDist = totalDist;
        
        // 从棋子边缘稍微靠外一点开始，避免一开始就撞到自己
        const r = GameConfig.dimensions.strikerDiameter / 2;
        let currX = startX + Math.cos(angle) * (r + 5);
        let currY = startY + Math.sin(angle) * (r + 5);
        let currAngle = angle;
        
        g.lineStyle(4, 0x9b59b6, 0.8); // 紫色虚线

        const { x, y, w, h } = this.scene.layout.fieldRect;
        const bounds = {
            minX: x, maxX: x + w,
            minY: y, maxY: y + h
        };

        // 收集所有障碍物 (球 + 其他棋子)
        const targets = [];
        if (this.scene.ball) targets.push(this.scene.ball);
        if (this.scene.strikers) {
            this.scene.strikers.forEach(s => {
                if (s.id !== ignoredId) targets.push(s);
            });
        }

        for (let b = 0; b <= maxBounces; b++) {
            let dx = Math.cos(currAngle);
            let dy = Math.sin(currAngle);
            
            let bestDist = remainingDist;
            let hitNormal = null; 

            // --- 1. 检测墙壁 (Box Raycast) ---
            // 垂直墙
            if (dx !== 0) {
                const targetX = dx > 0 ? bounds.maxX : bounds.minX;
                const d = (targetX - currX) / dx;
                if (d > 0 && d < bestDist) {
                    const yAtHit = currY + dy * d;
                    if (yAtHit >= bounds.minY && yAtHit <= bounds.maxY) {
                        bestDist = d;
                        hitNormal = { x: dx > 0 ? -1 : 1, y: 0 };
                    }
                }
            }
            // 水平墙
            if (dy !== 0) {
                const targetY = dy > 0 ? bounds.maxY : bounds.minY;
                const d = (targetY - currY) / dy;
                if (d > 0 && d < bestDist) {
                    const xAtHit = currX + dx * d;
                    if (xAtHit >= bounds.minX && xAtHit <= bounds.maxX) {
                        bestDist = d;
                        hitNormal = { x: 0, y: dy > 0 ? -1 : 1 };
                    }
                }
            }

            // --- 2. 检测实体 (Circle Raycast) ---
            for (const t of targets) {
                if (!t.body) continue;
                
                const cx = t.body.position.x;
                const cy = t.body.position.y;
                // 球半径或棋子半径
                const radius = t.radius || (t.label === 'Ball' ? GameConfig.dimensions.ballDiameter/2 : GameConfig.dimensions.strikerDiameter/2);

                const lx = cx - currX;
                const ly = cy - currY;
                // 投影长度
                const tca = lx * dx + ly * dy;
                if (tca < 0) continue; // 目标在射线背面

                const d2 = (lx*lx + ly*ly) - (tca*tca);
                if (d2 > radius*radius) continue; // 射线未穿过圆

                const thc = Math.sqrt(radius*radius - d2);
                const t0 = tca - thc; // 入射点距离

                if (t0 > 0 && t0 < bestDist) {
                    bestDist = t0;
                    
                    // 计算法线：(HitPoint - Center) / Radius
                    const hitX = currX + dx * t0;
                    const hitY = currY + dy * t0;
                    hitNormal = {
                        x: (hitX - cx) / radius,
                        y: (hitY - cy) / radius
                    };
                }
            }

            // 绘制当前段线
            const endX = currX + dx * bestDist;
            const endY = currY + dy * bestDist;
            
            g.moveTo(currX, currY);
            g.lineTo(endX, endY);
            
            // 撞击点画个小圈
            g.beginFill(0x9b59b6);
            g.drawCircle(endX, endY, 4);
            g.endFill();

            remainingDist -= bestDist;
            if (remainingDist <= 0 || !hitNormal) break;

            // --- 计算反射向量 ---
            // R = D - 2*(D·N)*N
            const dot = dx * hitNormal.x + dy * hitNormal.y;
            const rx = dx - 2 * dot * hitNormal.x;
            const ry = dy - 2 * dot * hitNormal.y;

            currAngle = Math.atan2(ry, rx);
            
            // 稍微偏移起点，防止再次判定碰撞
            currX = endX + rx * 0.1;
            currY = endY + ry * 0.1;
        }
    }
}
