
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Ball {
  constructor(x, y) {
    this.radius = GameConfig.dimensions.ballDiameter / 2;
    
    // 基础物理参数备份，用于技能结束后恢复
    this.baseFrictionAir = GameConfig.physics.ballFrictionAir;
    this.baseFriction = 0.05; // Matter 默认值 approx

    const bodyOptions = {
      frictionAir: this.baseFrictionAir,
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
    
    // --- 渲染顺序：阴影 -> 拖尾 -> 技能特效(底) -> 足球本体 -> 技能特效(顶) ---

    // A. 阴影 
    const shadow = this.createShadowGraphics();
    shadow.position.set(GameConfig.visuals.shadowOffset || 5, GameConfig.visuals.shadowOffset || 5);
    shadow.alpha = 0.8; 
    this.view.addChild(shadow);

    // B. 常规拖尾特效 (Trail Effect)
    this.trailTexture = this.generateTrailTexture();
    this.trail = new PIXI.Sprite(this.trailTexture);
    this.trail.anchor.set(1, 0.5); 
    this.trail.position.set(0, 0); 
    this.trail.alpha = 0; 
    this.trail.height = this.radius * 1.6; 
    this.view.addChild(this.trail);

    // C. 闪电拖尾 (Skill: Super Force)
    this.lightningTrail = new PIXI.Graphics();
    this.view.addChild(this.lightningTrail);

    // D. 火焰特效容器 (Skill: Unstoppable)
    this.fireContainer = new PIXI.Container();
    this.view.addChild(this.fireContainer);

    // E. 足球本体 (Ball)
    const rawBallTex = ResourceManager.get('ball_texture'); 
    const rawOverlayTex = ResourceManager.get('ball_overlay');
    const texture = rawBallTex || this.generateProceduralPattern();
    const overlayTexture = rawOverlayTex || this.generateProceduralOverlay();

    const ballContainer = new PIXI.Container();
    this.view.addChild(ballContainer);

    // 创建遮罩
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawCircle(0, 0, this.radius);
    mask.endFill();
    ballContainer.addChild(mask);
    ballContainer.mask = mask;

    this.textureScale = 0.18; 
    this.ballTexture = new PIXI.TilingSprite(
        texture,
        this.radius * 4,
        this.radius * 4
    );
    this.ballTexture.anchor.set(0.5);
    this.ballTexture.tileScale.set(this.textureScale);
    this.ballTexture.tint = 0xdddddd; 
    ballContainer.addChild(this.ballTexture);

    const overlay = new PIXI.Sprite(overlayTexture);
    overlay.anchor.set(0.5);
    overlay.width = this.radius * 2;
    overlay.height = this.radius * 2;
    this.view.addChild(overlay);

    // --- 状态变量 ---
    this.skillStates = {
        lightning: false,
        fire: false,
        fireTimer: 0,
        fireMaxDuration: 0
    };
  }

  /**
   * 激活/关闭 闪电特效 (大力水手)
   */
  setLightningMode(active) {
      this.skillStates.lightning = active;
      this.trail.visible = !active; // 互斥：闪电开启时隐藏普通拖尾
      if (!active) this.lightningTrail.clear();
  }

  /**
   * 激活 无敌战车 (3秒不减速 + 火焰)
   * @param {number} duration 持续时间 ms
   */
  activateUnstoppable(duration) {
      this.skillStates.fire = true;
      this.skillStates.fireMaxDuration = duration;
      this.skillStates.fireTimer = duration;
      
      // 移除物理阻尼
      this.body.frictionAir = 0;
      this.body.friction = 0;
  }

  createShadowGraphics() {
    const g = new PIXI.Graphics();
    const r = this.radius;
    const steps = 5;
    const maxR = r * 1.3; 
    const alphaPerStep = 0.15; 
    for (let i = 0; i < steps; i++) {
        const ratio = i / steps; 
        const currentR = maxR * (1 - ratio);
        if (currentR <= 0) break;
        g.beginFill(0x000000, alphaPerStep);
        g.drawCircle(0, 0, currentR);
        g.endFill();
    }
    g.beginFill(0x000000, 0.2);
    g.drawCircle(0, 0, r * 0.8);
    g.endFill();
    return g;
  }

  generateTrailTexture() {
    // ... (保持原有逻辑) ...
    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const w = 256;
            const h = 64;
            const canvas = document.createElement('canvas');
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
        } catch (e) {}
    }
    return PIXI.Texture.WHITE;
  }

  generateProceduralPattern() { /* ... 保持不变 ... */ return PIXI.Texture.WHITE; }
  drawHex(ctx, x, y, r) { /* ... 保持不变 ... */ }
  generateProceduralOverlay() { /* ... 保持不变 ... */ return PIXI.Texture.EMPTY; }

  update() {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      
      this.ballTexture.rotation = this.body.angle;

      const velocity = this.body.velocity;
      const speed = Matter.Vector.magnitude(velocity);

      // --- 1. 无敌战车物理逻辑 ---
      // Pixi update 频率可能高于物理步长，但这里做倒计时和状态恢复是安全的
      // 注意：这里用的是每一帧的时间，需要准确的 deltaMS，但 update 接口目前没传 delta
      // 简单起见，假设 60fps，每帧 ~16ms
      if (this.skillStates.fire) {
          this.skillStates.fireTimer -= 16.66;
          
          // 保持无摩擦
          this.body.frictionAir = 0;
          this.body.friction = 0;

          if (this.skillStates.fireTimer <= 0) {
              // 时间到，恢复物理
              this.skillStates.fire = false;
              this.body.frictionAir = this.baseFrictionAir;
              this.body.friction = this.baseFriction;
          }
      }

      // --- 2. 闪电拖尾更新 ---
      if (this.skillStates.lightning && speed > 0.5) {
          this.updateLightningTrail(velocity, speed);
      } else {
          this.lightningTrail.clear();
      }

      // --- 3. 火焰特效更新 ---
      if (this.skillStates.fire) {
          this.updateFireEffect(speed);
      } else {
          this.fireContainer.removeChildren();
      }

      // --- 4. 普通拖尾更新 (仅当没开启闪电时) ---
      if (!this.skillStates.lightning) {
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
      }

      // --- 5. 纹理滚动 ---
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

  updateLightningTrail(vel, speed) {
    const g = this.lightningTrail;
    g.clear();
    
    // 闪电颜色：青白
    g.lineStyle(4, 0x00FFFF, 0.8);
    
    // 反向计算拖尾路径
    const segments = 5;
    const len = Math.min(speed * 15, 150);
    const angle = Math.atan2(vel.y, vel.x) + Math.PI; // 反向
    
    g.moveTo(0, 0); // 从球心开始

    let currentX = 0;
    let currentY = 0;

    for (let i = 1; i <= segments; i++) {
        const dist = (len / segments) * i;
        // 添加随机抖动
        const jitter = (Math.random() - 0.5) * 20; 
        
        const tx = Math.cos(angle) * dist + Math.cos(angle + Math.PI/2) * jitter;
        const ty = Math.sin(angle) * dist + Math.sin(angle + Math.PI/2) * jitter;
        
        g.lineTo(tx, ty);
    }
  }

  updateFireEffect(speed) {
      // 简单模拟：随机生成几个红黄圆圈，向后飘
      // 由于没有复杂的粒子系统，这里每帧创建几个 Graphics 并在自身 update 中销毁
      // 为了性能，我们只维持几个常驻的子节点并改变它们属性，或者简单的随机绘制
      
      // 这里采用简单的每帧重绘法（适合少量粒子）
      // 实际上更好的做法是独立的粒子系统，但为了不增加太多文件，这里做个简易版
      
      // 燃烧强度跟剩余时间和速度有关
      const intensity = Math.min(speed, 10) / 10 * (this.skillStates.fireTimer / this.skillStates.fireMaxDuration);
      
      if (Math.random() > 0.3) { // 限制生成频率
          const p = new PIXI.Graphics();
          const color = Math.random() > 0.5 ? 0xFF4500 : 0xFFD700; // 红橙或金黄
          const size = (5 + Math.random() * 10) * intensity;
          
          p.beginFill(color, 0.6 * intensity);
          p.drawCircle(0, 0, size);
          p.endFill();
          
          // 随机位置（在球体表面）
          const offsetAngle = Math.random() * Math.PI * 2;
          const offsetR = Math.random() * this.radius;
          p.x = Math.cos(offsetAngle) * offsetR;
          p.y = Math.sin(offsetAngle) * offsetR;
          
          this.fireContainer.addChild(p);

          // 简单的粒子动画逻辑挂载
          p.vx = (Math.random() - 0.5) * 2;
          p.vy = (Math.random() - 0.5) * 2 - 2; // 向上飘
          p.life = 20; // 帧
          
          // 这种动态挂载 update 方法在 Pixi 里不会自动执行，需要我们手动遍历更新
      }

      // 更新所有粒子
      for (let i = this.fireContainer.children.length - 1; i >= 0; i--) {
          const p = this.fireContainer.children[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= 0.05;
          p.scale.x *= 0.9;
          p.scale.y *= 0.9;
          if (p.alpha <= 0) {
              this.fireContainer.removeChild(p);
          }
      }
  }
}
