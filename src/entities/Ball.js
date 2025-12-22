
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Ball {
  constructor(x, y) {
    this.radius = GameConfig.dimensions.ballDiameter / 2;
    
    const bodyOptions = {
      frictionAir: GameConfig.physics.ballFrictionAir,
      restitution: GameConfig.physics.ballRestitution,
      density: GameConfig.physics.ballDensity,
      label: 'Ball',
      collisionFilter: {
        category: CollisionCategory.BALL,
        mask: CollisionCategory.WALL | CollisionCategory.STRIKER | CollisionCategory.GOAL
      }
    };

    if (GameConfig.physics.ballFixedRotation) {
      bodyOptions.inertia = Infinity;
    }

    // 1. 物理刚体
    this.body = Matter.Bodies.circle(x, y, this.radius, bodyOptions);
    this.body.entity = this;

    // 2. 视图容器
    this.view = new PIXI.Container();
    
    // --- 渲染顺序：阴影 -> 拖尾 -> 足球本体 ---

    // A. 阴影 (使用高密度 Graphics 叠加模拟平滑渐变)
    const shadow = this.createShadowGraphics();
    // 阴影偏移量，模拟光照方向
    shadow.position.set(GameConfig.visuals.shadowOffset || 5, GameConfig.visuals.shadowOffset || 5);
    // 基础透明度
    shadow.alpha = 0.8; 
    
    this.view.addChild(shadow);

    // B. 空气拖尾特效 (Trail Effect)
    this.trailTexture = this.generateTrailTexture();
    this.trail = new PIXI.Sprite(this.trailTexture);
    
    this.trail.anchor.set(1, 0.5); 
    this.trail.position.set(0, 0); 
    this.trail.alpha = 0; 
    this.trail.height = this.radius * 1.6; 
    
    this.view.addChild(this.trail);

    // C. 足球本体 (Ball)
    const rawBallTex = ResourceManager.get('ball_texture'); 
    const rawOverlayTex = ResourceManager.get('ball_overlay');

    const texture = rawBallTex || this.generateProceduralPattern();
    const overlayTexture = rawOverlayTex || this.generateProceduralOverlay();

    const ballContainer = new PIXI.Container();
    this.view.addChild(ballContainer);

    const mask = new PIXI.Graphics();
    mask.circle(0, 0, this.radius);
    mask.fill(0xffffff);
    ballContainer.addChild(mask);
    ballContainer.mask = mask;

    this.textureScale = 0.18; 
    
    this.ballTexture = new PIXI.TilingSprite({
        texture: texture,
        width: this.radius * 4,
        height: this.radius * 4
    });
    this.ballTexture.anchor.set(0.5);
    this.ballTexture.tileScale.set(this.textureScale);
    this.ballTexture.tint = 0xdddddd; 
    
    ballContainer.addChild(this.ballTexture);

    const overlay = new PIXI.Sprite(overlayTexture);
    overlay.anchor.set(0.5);
    overlay.width = this.radius * 2;
    overlay.height = this.radius * 2;
    this.view.addChild(overlay);
  }

  /**
   * 使用 Graphics 绘制高密度同心圆来模拟完美的柔和阴影
   * 通过叠加 30 层极淡的圆，消除原本的 "同心圆波纹" 现象
   */
  createShadowGraphics() {
    const g = new PIXI.Graphics();
    const r = this.radius;
    
    // 配置参数
    const steps = 30; // 层数越多越平滑
    const maxR = r * 1.3; // 阴影最大扩散范围 (比球略大)
    const alphaPerStep = 0.05; // 每层的不透明度 (越低越柔和)

    // 从大到小绘制
    for (let i = 0; i < steps; i++) {
        const ratio = i / steps; // 0 ~ 1
        const currentR = maxR * (1 - ratio);
        
        if (currentR <= 0) break;

        g.circle(0, 0, currentR);
        g.fill({ color: 0x000000, alpha: alphaPerStep });
    }

    // 核心区域额外加深一点点，模拟接触阴影 (Contact Shadow)
    g.circle(0, 0, r * 0.8);
    g.fill({ color: 0x000000, alpha: 0.1 });

    return g;
  }

  generateTrailTexture() {
    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const w = 256;
            const h = 64;
            const canvas = document.createElement('canvas');
            // 简单的兼容性检查，防止在 adapter 占位符环境下报错
            if (!canvas.getContext) return PIXI.Texture.WHITE;
            
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                const grad = ctx.createLinearGradient(0, 0, w, 0);
                grad.addColorStop(0, 'rgba(255, 255, 255, 0)');     
                grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.2)'); 
                grad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');   
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.moveTo(0, h/2); 
                ctx.bezierCurveTo(w * 0.5, h * 0.1, w * 0.8, 0, w, 0);
                ctx.lineTo(w, h);
                ctx.bezierCurveTo(w * 0.8, h, w * 0.5, h * 0.9, 0, h/2);
                ctx.fill();
                return PIXI.Texture.from(canvas);
            }
        } catch (e) {
            // 忽略错误
        }
    }
    return PIXI.Texture.WHITE;
  }

  generateProceduralPattern() {
    if (typeof document === 'undefined') return PIXI.Texture.WHITE;
    try {
        const canvas = document.createElement('canvas');
        if (!canvas.getContext) return PIXI.Texture.WHITE;
        const size = 256;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return PIXI.Texture.WHITE;
        ctx.fillStyle = '#eeeeee';
        ctx.fillRect(0, 0, size, size);
        ctx.fillStyle = '#222222';
        this.drawHex(ctx, size/2, size/2, size/4);
        this.drawHex(ctx, 0, 0, size/4);
        this.drawHex(ctx, size, 0, size/4);
        this.drawHex(ctx, 0, size, size/4);
        this.drawHex(ctx, size, size, size/4);
        return PIXI.Texture.from(canvas);
    } catch(e) { return PIXI.Texture.WHITE; }
  }

  drawHex(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        ctx.lineTo(x + r * Math.cos(angle), y + r * Math.sin(angle));
    }
    ctx.closePath();
    ctx.fill();
  }

  generateProceduralOverlay() {
    if (typeof document === 'undefined') return PIXI.Texture.EMPTY;
    try {
        const canvas = document.createElement('canvas');
        if (!canvas.getContext) return PIXI.Texture.EMPTY;
        const size = 128;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return PIXI.Texture.EMPTY;
        const cx = size / 2;
        const cy = size / 2;
        const r = size / 2;
        const shadowGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
        shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
        shadowGrad.addColorStop(0.7, 'rgba(0,0,0,0.1)');
        shadowGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
        ctx.fillStyle = shadowGrad;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        return PIXI.Texture.from(canvas);
    } catch(e) { return PIXI.Texture.EMPTY; }
  }

  update() {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      
      this.ballTexture.rotation = this.body.angle;

      const velocity = this.body.velocity;
      const speed = Matter.Vector.magnitude(velocity);

      if (speed > 0.2) { 
          const moveAngle = Math.atan2(velocity.y, velocity.x);
          this.trail.rotation = moveAngle;
          const maxLen = this.radius * 8; 
          const lenFactor = 12.0; 
          const targetWidth = Math.min(speed * lenFactor, maxLen);
          this.trail.width = targetWidth;
          this.trail.alpha = Math.min((speed - 0.2) * 0.4, 0.8);
          this.trail.visible = true;
      } else {
          this.trail.visible = false;
      }

      if (speed > 0.01) {
          const angle = -this.body.angle; 
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);
          const localVx = velocity.x * cos - velocity.y * sin;
          const localVy = velocity.x * sin + velocity.y * cos;
          const moveFactor = 0.5; 
          this.ballTexture.tilePosition.x += localVx * moveFactor;
          this.ballTexture.tilePosition.y += localVy * moveFactor;
      }
    }
  }
}
