
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

    // A. 阴影 (使用 Graphics 多层叠加模拟渐变，确保兼容性)
    const shadow = this.createShadowGraphics();
    // 阴影稍微偏移，模拟顶光源
    shadow.position.set(4, 4);
    // 整体稍微透明一点
    shadow.alpha = 0.6; 
    
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
   * 使用 Graphics 绘制多层同心圆来模拟柔和阴影
   * 这种方法不依赖 Canvas API，在所有环境都能显示
   */
  createShadowGraphics() {
    const g = new PIXI.Graphics();
    const r = this.radius;
    
    // 从外向内绘制，模拟渐变
    // 阴影整体比球稍微大一点点 (1.3倍)
    
    // 第1层：最外圈，非常淡
    g.circle(0, 0, r * 1.3);
    g.fill({ color: 0x000000, alpha: 0.1 });

    // 第2层
    g.circle(0, 0, r * 1.1);
    g.fill({ color: 0x000000, alpha: 0.1 });

    // 第3层
    g.circle(0, 0, r * 0.9);
    g.fill({ color: 0x000000, alpha: 0.1 });

    // 第4层：核心，较黑
    g.circle(0, 0, r * 0.7);
    g.fill({ color: 0x000000, alpha: 0.2 });
    
    // 第5层：最核心接触点
    g.circle(0, 0, r * 0.5);
    g.fill({ color: 0x000000, alpha: 0.2 });

    return g;
  }

  generateTrailTexture() {
    // 拖尾特效如果是 Web 环境依然用 Canvas，如果不行可以考虑后续换成 Graphics
    // 这里为了保持特性先保留 Canvas 方式，如果拖尾也不显示请告知
    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const w = 256;
            const h = 64;
            const canvas = document.createElement('canvas');
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
            console.warn("Trail canvas generation failed", e);
        }
    }
    return PIXI.Texture.WHITE; // 降级
  }

  generateProceduralPattern() {
    // 简易纹理降级处理：如果 Canvas 失败，返回白色
    if (typeof document === 'undefined') return PIXI.Texture.WHITE;
    const size = 256;
    const canvas = document.createElement('canvas');
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
    const size = 128;
    const canvas = document.createElement('canvas');
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
