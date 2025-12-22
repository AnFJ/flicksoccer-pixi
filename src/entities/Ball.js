
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

    // 如果配置了固定旋转，设置惯性为无穷大 (通常足球不需要开启这个，开启后物理旋转为0)
    if (GameConfig.physics.ballFixedRotation) {
      bodyOptions.inertia = Infinity;
    }

    // 1. 物理刚体
    this.body = Matter.Bodies.circle(x, y, this.radius, bodyOptions);
    this.body.entity = this;

    // 2. 视图容器
    this.view = new PIXI.Container();
    
    // --- 核心改动：使用 TilingSprite 实现 3D 滚动 ---
    
    // A. 准备纹理
    const rawBallTex = ResourceManager.get('ball_texture'); 
    const rawOverlayTex = ResourceManager.get('ball_overlay');

    const texture = rawBallTex || this.generateProceduralPattern();
    const overlayTexture = rawOverlayTex || this.generateProceduralOverlay();

    // B. 创建阴影 (在地上的影子)
    const shadowTex = ResourceManager.get('shadow');
    if (shadowTex) {
        const shadow = new PIXI.Sprite(shadowTex);
        shadow.anchor.set(0.5);
        shadow.width = this.radius * 2.4;
        shadow.height = this.radius * 2.4;
        shadow.alpha = 0.4;
        shadow.position.set(4, 4);
        this.view.addChild(shadow);
    } else {
        const g = new PIXI.Graphics();
        g.ellipse(0, 0, this.radius * 1.0, this.radius * 1.0);
        g.fill({ color: 0x000000, alpha: 0.3 });
        g.position.set(4, 4);
        this.view.addChild(g);
    }

    // C. 创建滚动球体容器
    const ballContainer = new PIXI.Container();
    this.view.addChild(ballContainer);

    // D. 遮罩 (Mask) - 把矩形的纹理切成圆形
    const mask = new PIXI.Graphics();
    mask.circle(0, 0, this.radius);
    mask.fill(0xffffff);
    ballContainer.addChild(mask);
    ballContainer.mask = mask;

    // E. 滚动纹理 (TilingSprite)
    // 纹理大小设为球体直径的 2 倍以上，保证平铺效果
    // [优化] 针对高清贴图，大幅缩小纹理比例，确保球面上能看到完整的格子
    this.textureScale = 0.18; 
    
    this.ballTexture = new PIXI.TilingSprite({
        texture: texture,
        width: this.radius * 4,
        height: this.radius * 4
    });
    this.ballTexture.anchor.set(0.5);
    this.ballTexture.tileScale.set(this.textureScale);
    
    // [优化] 将纹理稍微压暗一点 (0xdddddd)，这样白色的高光层(Overlay)才能显现出来，增加立体感
    this.ballTexture.tint = 0xdddddd; 
    
    ballContainer.addChild(this.ballTexture);

    // F. 光影遮罩 (Overlay) - 永远盖在最上面
    const overlay = new PIXI.Sprite(overlayTexture);
    overlay.anchor.set(0.5);
    overlay.width = this.radius * 2;
    overlay.height = this.radius * 2;
    this.view.addChild(overlay);
  }

  /**
   * 程序化生成足球表面纹理 (备用)
   */
  generateProceduralPattern() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
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

  /**
   * 程序化生成光影遮罩
   */
  generateProceduralOverlay() {
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2;

    // 1. 边缘阴影 (增强立体感)
    const shadowGrad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r);
    shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
    shadowGrad.addColorStop(0.7, 'rgba(0,0,0,0.1)');
    shadowGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = shadowGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // 2. 顶部高光 (增强材质感)
    const hlR = r * 0.7;
    const hlX = cx - r * 0.2;
    const hlY = cy - r * 0.2;
    const hlGrad = ctx.createRadialGradient(hlX, hlY, 0, hlX, hlY, hlR);
    hlGrad.addColorStop(0, 'rgba(255,255,255,0.9)'); // 强高光
    hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hlGrad;
    ctx.beginPath();
    ctx.arc(hlX, hlY, hlR, 0, Math.PI * 2);
    ctx.fill();

    return PIXI.Texture.from(canvas);
  }

  update() {
    if (this.body && this.view) {
      // 1. 同步位置
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      
      // 2. 同步旋转
      this.ballTexture.rotation = this.body.angle;

      const velocity = this.body.velocity;
      const speed = Matter.Vector.magnitude(velocity);

      if (speed > 0.01) {
          // 3. 计算纹理滚动
          const angle = -this.body.angle; 
          const cos = Math.cos(angle);
          const sin = Math.sin(angle);

          // 将世界坐标系速度 映射到 纹理局部坐标系
          const localVx = velocity.x * cos - velocity.y * sin;
          const localVy = velocity.x * sin + velocity.y * cos;

          // 滚动系数
          const moveFactor = 0.5; 

          // [修复] 使用 += 而不是 -=
          // 因为球向前滚时，顶部的表面也是向前移动的，所以纹理偏移量应该增加
          this.ballTexture.tilePosition.x += localVx * moveFactor;
          this.ballTexture.tilePosition.y += localVy * moveFactor;
      }
    }
  }
}
