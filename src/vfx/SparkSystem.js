
import * as PIXI from 'pixi.js';

// [优化] 全局共享的粒子纹理，避免每个粒子单独绘制 Graphics
let sharedParticleTexture = null;

function getParticleTexture() {
    if (sharedParticleTexture) return sharedParticleTexture;

    // 创建一个 16x16 的白色圆形纹理 (半径8，高清一点)
    // 实际显示时可以通过 scale 缩放
    if (typeof document !== 'undefined' && document.createElement) {
        const size = 16;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#FFFFFF';
        ctx.beginPath();
        ctx.arc(size/2, size/2, size/2, 0, Math.PI * 2);
        ctx.fill();
        sharedParticleTexture = PIXI.Texture.from(canvas);
    } else {
        // 兜底方案
        sharedParticleTexture = PIXI.Texture.WHITE;
    }
    return sharedParticleTexture;
}

/**
 * 单个火星粒子
 * [优化] 继承 Sprite 而非 Graphics
 */
class Spark extends PIXI.Sprite {
    constructor() {
        super(getParticleTexture());
        this.anchor.set(0.5); // 设置锚点在中心
        
        this.active = false;
        this.vx = 0;
        this.vy = 0;
        this.life = 0;
        this.maxLife = 0;
        
        // 原始逻辑 drawCircle(0,0,4) 半径为4，直径8
        // 现在的纹理直径为 16
        // 所以默认 scale 应该是 0.5 才能保持原大小
        this.baseScaleMult = 0.5;
        this.scale.set(this.baseScaleMult);
    }

    reset(x, y, speed, angle, scale, life) {
        this.x = x;
        this.y = y;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        
        // 叠加基础缩放比例
        const finalScale = scale * this.baseScaleMult;
        this.scale.set(finalScale);
        
        // [修复] 重置时确保 alpha 为 1
        this.alpha = 1;
        this.life = life;
        this.maxLife = life;
        this.active = true;
        this.visible = true;
        this.currentScale = finalScale; // 记录当前缩放用于update递减
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
        
        // 慢慢变小
        this.currentScale *= 0.95;
        this.scale.set(this.currentScale);

        // [核心修复] 当粒子死亡时，强制 alpha = 0
        // ParticleContainer 往往忽略 visible 属性，必须通过 alpha=0 来隐藏
        if (this.life <= 0 || this.alpha < 0.01) {
            this.alpha = 0; 
            this.active = false;
            this.visible = false;
        }
    }
}

/**
 * 火星特效管理器
 * [性能优化] 继承 ParticleContainer 以批量渲染
 */
export default class SparkSystem extends PIXI.ParticleContainer {
    constructor() {
        // 容量 50，启用 scale, position, alpha 变换
        super(50, {
            scale: true,
            position: true,
            rotation: false, // 火花使用圆形，不需要旋转
            uvs: false,
            alpha: true
        });

        this.pool = [];
        this.maxParticles = 50; // 最大同时存在的粒子数
        
        // 预创建粒子池
        for (let i = 0; i < this.maxParticles; i++) {
            const p = new Spark();
            // 初始完全隐藏
            p.alpha = 0;
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
