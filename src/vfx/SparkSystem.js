
import * as PIXI from 'pixi.js';

/**
 * 单个火星粒子
 */
class Spark extends PIXI.Graphics {
    constructor() {
        super();
        this.active = false;
        this.vx = 0;
        this.vy = 0;
        this.life = 0;
        this.maxLife = 0;
        
        // 绘制一个白色的小圆形或菱形
        this.beginFill(0xFFFFFF);
        this.drawCircle(0, 0, 4); // 基础半径4
        this.endFill();
    }

    reset(x, y, speed, angle, scale, life) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.scale.set(scale);
        this.alpha = 1;
        this.life = life;
        this.maxLife = life;
        this.active = true;
        this.visible = true;
    }

    update(dt) {
        if (!this.active) return;

        // 移动
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        // 阻力 (减速)
        this.vx *= 0.92;
        this.vy *= 0.92;

        this.life -= dt;

        // 生命周期动画
        const ratio = this.life / this.maxLife;
        this.alpha = ratio; // 慢慢变透明
        this.scale.set(this.scale.x * 0.95); // 慢慢变小

        if (this.life <= 0 || this.alpha < 0.01) {
            this.active = false;
            this.visible = false;
        }
    }
}

/**
 * 火星特效管理器
 */
export default class SparkSystem extends PIXI.Container {
    constructor() {
        super();
        this.pool = [];
        this.maxParticles = 50; // 最大同时存在的粒子数
        
        // 预创建粒子池
        for (let i = 0; i < this.maxParticles; i++) {
            const p = new Spark();
            p.visible = false;
            p.active = false;
            this.addChild(p);
            this.pool.push(p);
        }
    }

    /**
     * 发射火星
     * @param {number} x 发射点X
     * @param {number} y 发射点Y
     * @param {number} intensity 碰撞强度 (通常 0~20)
     */
    emit(x, y, intensity) {
        // 根据强度决定粒子数量 (3 ~ 12个)
        const count = Math.min(Math.floor(intensity * 0.8) + 3, 15);
        
        // 根据强度决定粒子基础大小 (0.3 ~ 1.0)
        const baseScale = Math.min(Math.max(intensity * 0.05, 0.3), 1.2);

        for (let i = 0; i < count; i++) {
            const p = this.getFreeParticle();
            if (!p) break;

            // 随机角度 (0 ~ 360)
            const angle = Math.random() * Math.PI * 2;
            
            // 随机速度 (强度越大，炸得越开)
            const speed = (Math.random() * 0.5 + 0.5) * (intensity * 0.8); 
            
            // 随机生命周期 (15 ~ 30 帧)
            const life = 15 + Math.random() * 15;

            // 随机大小扰动
            const scale = baseScale * (0.5 + Math.random() * 0.8);

            p.reset(x, y, speed, angle, scale, life);
        }
    }

    getFreeParticle() {
        // 找一个不活跃的粒子
        for (const p of this.pool) {
            if (!p.active) return p;
        }
        // 如果池子满了，强制复用第一个（最早生成的），形成循环覆盖
        // 或者简单地返回 null 忽略本次发射（为了性能）
        return this.pool[0]; 
    }

    /**
     * @param {number} deltaMS 
     */
    update(deltaMS) {
        // 转换 deltaMS 到 帧率系数 (60fps = 1.0)
        const dt = deltaMS / 16.66;

        for (const p of this.pool) {
            if (p.active) {
                p.update(dt);
            }
        }
    }
}
