import * as PIXI from 'pixi.js';
import Striker from '../../../entities/Striker.js';
import { LiveFlickConfig } from '../config/LiveFlickConfig.js';

export default class LiveStriker extends Striker {
    constructor(x, y, radius, teamId, themeId = 1) {
        super(x, y, radius, teamId, themeId);
        
        this.cooldown = 0; // 0 means ready
        this.maxCooldown = LiveFlickConfig.cooldownTime;
        
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
    }

    update(delta, alpha) {
        super.update(delta, alpha);
        
        // Update cooldown
        if (this.cooldown > 0) {
            // Only decrease cooldown if the striker is completely stopped
            // We check velocity and angular velocity
            const speed = this.body.speed;
            const angularSpeed = Math.abs(this.body.angularVelocity);
            
            if (speed < 0.1 && angularSpeed < 0.1) {
                this.cooldown -= delta;
                if (this.cooldown <= 0) {
                    this.cooldown = 0;
                    this.isReady = true;
                }
            }
        }

        this.drawProgressRing(delta);
    }

    drawProgressRing(delta) {
        this.progressRing.clear();
        
        const r = this.radius * 1.3;
        
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
                this.progressRing.lineStyle(4, 0x00FF00, 0.8);
                const startAngle = -Math.PI / 2; // Start from top
                const endAngle = startAngle - (Math.PI * 2 * ratio); // Counter-clockwise
                this.progressRing.arc(0, 0, r, startAngle, endAngle, true); // true for anticlockwise
            }
        }
    }
}
