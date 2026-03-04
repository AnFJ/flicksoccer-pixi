import * as PIXI from 'pixi.js';
import Striker from '../../../entities/Striker.js';
import { LiveFlickConfig } from '../config/LiveFlickConfig.js';

export default class LiveStriker extends Striker {
    constructor(x, y, radius, teamId, themeId = 1) {
        super(x, y, radius, teamId, themeId);
        
        this.cooldown = 0; // 0 means ready
        this.maxCooldown = LiveFlickConfig.cooldownTime;
        
        // 记录当前携带的技能 (将在撞击足球时传递)
        this.activeSkill = null;

        // Create progress ring
        this.progressRing = new PIXI.Graphics();
        this.view.addChild(this.progressRing);
        
        // Hide original glow, we will manage it ourselves
        this.glow.visible = false;
        this.glow.alpha = 0;
        
        this.isReady = true;
        this.blinkTimer = 0;
    }

    startCooldown() {
        this.cooldown = this.maxCooldown;
        this.isReady = false;
        this.glow.visible = false;
        this.glow.alpha = 0;
        // 技能是一次性的，发射后如果没有撞到球，在冷却开始时也应该重置吗？
        // 或者保留直到撞球？通常射门动作结束（冷却开始）意味着一次机会用完了。
        // 但为了防止没撞到球技能就没了，可以保留 activeSkill 直到撞击或停止？
        // 简化逻辑：每次发射消耗技能道具，赋予 activeSkill。如果没撞到球，技能就浪费了。
        // 所以这里不需要清除，碰撞检测里清除。或者在停止时清除。
    }

    update(delta, alpha) {
        super.update(delta, alpha);
        
        // Update cooldown
        if (this.cooldown > 0) {
            const speed = this.body.speed;
            const angularSpeed = Math.abs(this.body.angularVelocity);
            
            if (speed < 0.1 && angularSpeed < 0.1) {
                this.cooldown -= delta;
                if (this.cooldown <= 0) {
                    this.cooldown = 0;
                    this.isReady = true;
                    // 棋子停稳后，清除未使用的技能状态
                    this.activeSkill = null;
                }
            }
        }

        this.drawProgressRing(delta);
    }

    drawProgressRing(delta) {
        this.progressRing.clear();
        
        // [修改] 缩小提示圈半径 (1.3 -> 1.15)
        const r = this.radius * 1.15;
        
        if (this.isReady) {
            // Blink effect
            this.blinkTimer += delta;
            const blinkAlpha = (Math.sin(this.blinkTimer * 0.01) + 1) / 2; // 0 to 1
            
            this.progressRing.lineStyle(4, 0x00FFFF, 0.3 + blinkAlpha * 0.7);
            this.progressRing.drawCircle(0, 0, r);
            
            // Draw the segments like original glow
            const segments = 3;
            const gap = 0.5; 
            const arcLen = (Math.PI * 2) / segments - gap;
            this.progressRing.lineStyle(4, 0x00FFFF, 0.8 * (0.5 + blinkAlpha * 0.5));
            for (let i = 0; i < segments; i++) {
                const start = i * ((Math.PI * 2) / segments) + this.blinkTimer * 0.002; // Rotate slightly
                this.progressRing.moveTo(Math.cos(start) * r, Math.sin(start) * r);
                this.progressRing.arc(0, 0, r, start, start + arcLen);
            }
        } else {
            // Draw cooldown progress (counter-clockwise fill)
            const ratio = 1 - (this.cooldown / this.maxCooldown);
            
            // Background ring
            this.progressRing.lineStyle(4, 0x555555, 0.5);
            this.progressRing.drawCircle(0, 0, r);
            
            // Progress arc
            if (ratio > 0) {
                // [修改] 颜色渐变逻辑: 黄 -> 绿 -> 蓝
                let color;
                if (ratio < 0.5) {
                    // 0.0 - 0.5: 黄(FFFF00) -> 绿(00FF00)
                    const t = ratio * 2; 
                    color = this.lerpColor(0xFFFF00, 0x00FF00, t);
                } else {
                    // 0.5 - 1.0: 绿(00FF00) -> 蓝(0088FF)
                    const t = (ratio - 0.5) * 2;
                    color = this.lerpColor(0x00FF00, 0x0088FF, t);
                }

                this.progressRing.lineStyle(4, color, 0.8);
                const startAngle = -Math.PI / 2; // Start from top
                const endAngle = startAngle - (Math.PI * 2 * ratio); // Counter-clockwise
                this.progressRing.arc(0, 0, r, startAngle, endAngle, true); // true for anticlockwise
            }
        }
    }

    // [新增] 颜色插值辅助函数
    lerpColor(c1, c2, t) {
        const r1 = (c1 >> 16) & 0xFF;
        const g1 = (c1 >> 8) & 0xFF;
        const b1 = c1 & 0xFF;

        const r2 = (c2 >> 16) & 0xFF;
        const g2 = (c2 >> 8) & 0xFF;
        const b2 = c2 & 0xFF;

        const r = Math.round(r1 + (r2 - r1) * t);
        const g = Math.round(g1 + (g2 - g1) * t);
        const b = Math.round(b1 + (b2 - b1) * t);

        return (r << 16) | (g << 8) | b;
    }
}
