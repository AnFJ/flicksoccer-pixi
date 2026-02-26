import * as PIXI from 'pixi.js';
import { GameConfig } from '../../../config.js';
import { TeamId, SkillType } from '../../../constants.js';
import AudioManager from '../../../managers/AudioManager.js';

export default class LiveFlickInput {
    constructor(scene) {
        this.scene = scene;
        
        this.isDragging = false;
        this.selectedBody = null;
        this.selectedEntityId = null;
        this.aimingPointerId = null;
        
        this.dragStartPos = { x: 0, y: 0 };
        this.aimVector = { x: 0, y: 0 };
        
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

    _getPointerId(e) {
        if (e.data && e.data.identifier !== undefined) {
            return e.data.identifier;
        }
        return e.id;
    }

    onPointerDown(e) {
        if (this.scene.isGamePaused || this.scene.isGameOver || this.scene.isLoading) return;

        const local = this.scene.container.toLocal(e.data.global);
        const pointerId = this._getPointerId(e);

        if (this.isDragging && this.selectedBody) {
            if (pointerId !== this.aimingPointerId && pointerId !== undefined) {
                this.aimingPointerId = pointerId;
                this.isDualControl = true;
                this.controlStartPos = { x: local.x, y: local.y };
                this.baseAimVector = { ...this.aimVector };
            }
            return;
        }

        const striker = this._findStrikerAt(e.target, local);
        // Only allow dragging if it's player's team and striker is ready
        if (striker && striker.teamId === TeamId.LEFT && striker.isReady) {
            this.selectedBody = striker.body;
            this.selectedEntityId = striker.id;
            this.isDragging = true;
            this.aimingPointerId = pointerId;
            this.dragStartPos = { x: striker.body.position.x, y: striker.body.position.y };
            this.aimVector = { x: 0, y: 0 };
            this.isDualControl = false;
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
        const pointerId = this._getPointerId(e);

        if (!this.isDragging || !this.selectedBody || pointerId !== this.aimingPointerId) return;
        
        const local = this.scene.container.toLocal(e.data.global);
        
        if (this.isDualControl) {
            const dx = local.x - this.controlStartPos.x;
            const dy = local.y - this.controlStartPos.y;
            this.aimVector = { x: this.baseAimVector.x + dx, y: this.baseAimVector.y + dy };
        } else {
            this.aimVector = { x: this.dragStartPos.x - local.x, y: this.dragStartPos.y - local.y };
        }
        
        const useSuperAim = this.scene.skillMgr && this.scene.skillMgr.isActive(SkillType.SUPER_AIM);
        this._drawAimingLine(this.aimGraphics, this.dragStartPos, this.aimVector, useSuperAim);
    }

    onPointerUp(e) {
        const pointerId = this._getPointerId(e);

        if (this.isDragging && this.selectedBody && pointerId === this.aimingPointerId) {
            const dist = Math.sqrt(this.aimVector.x**2 + this.aimVector.y**2);
            
            if (dist > 10) {
                this.executeFlick(this.selectedBody, this.aimVector, TeamId.LEFT);
            }
            
            this.isDragging = false;
            this.selectedBody = null;
            this.selectedEntityId = null;
            this.aimingPointerId = null;
            this.aimGraphics.clear();
        }
    }

    executeFlick(body, vector, teamId) {
        const maxForce = GameConfig.physics.maxForce;
        const forceMultiplier = GameConfig.physics.forceMultiplier;
        
        let fx = vector.x * forceMultiplier;
        let fy = vector.y * forceMultiplier;
        
        const forceMag = Math.sqrt(fx*fx + fy*fy);
        if (forceMag > maxForce) {
            fx = (fx / forceMag) * maxForce;
            fy = (fy / forceMag) * maxForce;
        }

        // Apply skill modifiers
        if (this.scene.skillMgr) {
            if (this.scene.skillMgr.isActive(SkillType.SUPER_FORCE)) {
                fx *= 1.5;
                fy *= 1.5;
                this.scene.skillMgr.consumeSkill(SkillType.SUPER_FORCE);
            }
            if (this.scene.skillMgr.isActive(SkillType.UNSTOPPABLE)) {
                body.mass *= 5;
                setTimeout(() => {
                    if (body) body.mass /= 5;
                }, 3000);
                this.scene.skillMgr.consumeSkill(SkillType.UNSTOPPABLE);
            }
            if (this.scene.skillMgr.isActive(SkillType.SUPER_AIM)) {
                this.scene.skillMgr.consumeSkill(SkillType.SUPER_AIM);
            }
        }

        AudioManager.playSFX('kick');
        this.scene.physics.applyForce(body, { x: fx, y: fy });
        
        // Start cooldown
        if (body.entity && body.entity.startCooldown) {
            body.entity.startCooldown();
        }

        this.scene.onActionFired(teamId);
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

        // --- 2. 如果开启超级瞄准，绘制红外线激光 ---
        if (isSuperAim) {
            this._drawSuperAimLine(g, sx, sy, angle, this.selectedEntityId);
        }
    }

    _drawSuperAimLine(g, startX, startY, angle, ignoredId) {
        const maxBounces = 3;
        const totalDist = GameConfig.gameplay.skills.superAim.distance;
        let remainingDist = totalDist;
        
        const r = GameConfig.dimensions.strikerDiameter / 2;
        let currX = startX + Math.cos(angle) * (r + 5);
        let currY = startY + Math.sin(angle) * (r + 5);
        let currAngle = angle;
        
        const { x, y, w, h } = this.scene.layout.fieldRect;
        const bounds = {
            minX: x, maxX: x + w,
            minY: y, maxY: y + h
        };

        const targets = [];
        if (this.scene.ball) targets.push(this.scene.ball);
        if (this.scene.strikers) {
            this.scene.strikers.forEach(s => {
                if (s.id !== ignoredId) targets.push(s);
            });
        }

        const laserColorCore = 0xFFFFFF; 
        const laserColorInner = 0xFFCCCC; 
        const laserColorOuter = 0xFF0000; 

        for (let b = 0; b <= maxBounces; b++) {
            let dx = Math.cos(currAngle);
            let dy = Math.sin(currAngle);
            
            let bestDist = remainingDist;
            let hitNormal = null; 

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

            for (const t of targets) {
                if (!t.body) continue;
                
                const cx = t.body.position.x;
                const cy = t.body.position.y;
                const radius = t.radius || (t.label === 'Ball' ? GameConfig.dimensions.ballDiameter/2 : GameConfig.dimensions.strikerDiameter/2);

                const lx = cx - currX;
                const ly = cy - currY;
                const tca = lx * dx + ly * dy;
                if (tca < 0) continue; 

                const d2 = (lx*lx + ly*ly) - (tca*tca);
                if (d2 > radius*radius) continue; 

                const thc = Math.sqrt(radius*radius - d2);
                const t0 = tca - thc; 

                if (t0 > 0 && t0 < bestDist) {
                    bestDist = t0;
                    
                    const hitX = currX + dx * t0;
                    const hitY = currY + dy * t0;
                    hitNormal = {
                        x: (hitX - cx) / radius,
                        y: (hitY - cy) / radius
                    };
                }
            }

            const endX = currX + dx * bestDist;
            const endY = currY + dy * bestDist;
            
            g.lineStyle(8, laserColorOuter, 0.2); 
            g.moveTo(currX, currY);
            g.lineTo(endX, endY);

            g.lineStyle(4, laserColorOuter, 0.6); 
            g.moveTo(currX, currY);
            g.lineTo(endX, endY);

            g.lineStyle(1.5, laserColorInner, 0.9); 
            g.moveTo(currX, currY);
            g.lineTo(endX, endY);

            g.lineStyle(0); 
            
            g.beginFill(laserColorOuter, 0.5); 
            g.drawCircle(endX, endY, 7);
            g.endFill();
            
            g.beginFill(laserColorCore, 1.0);
            g.drawCircle(endX, endY, 3);
            g.endFill();

            remainingDist -= bestDist;
            if (remainingDist <= 0 || !hitNormal) break;

            const dot = dx * hitNormal.x + dy * hitNormal.y;
            const rx = dx - 2 * dot * hitNormal.x;
            const ry = dy - 2 * dot * hitNormal.y;

            currAngle = Math.atan2(ry, rx);
            
            currX = endX + rx * 0.1;
            currY = endY + ry * 0.1;
        }
    }
}
