
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
    const shadow = this.createShadowSprite();
    shadow.position.set(GameConfig.visuals.shadowOffset - 5, GameConfig.visuals.shadowOffset - 5);
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

    // E. 足球本体
    const rawBallTex = ResourceManager.get('ball_texture'); 
    const texture = rawBallTex || this.generateProceduralPattern();
    const overlayTexture = this.generateProceduralOverlay();

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

  setLightningMode(active) {
      this.skillStates.lightning = active;
      if (!active) this.lightningTrail.clear();
  }

  activateUnstoppable(duration) {
      this.skillStates.fire = true;
      this.skillStates.fireMaxDuration = duration;
      this.skillStates.fireTimer = duration;
      
      this.body.frictionAir = 0;
      this.body.friction = 0;
  }

  createShadowSprite() {
    const r = this.radius;
    const size = r * 2.8; 
    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const cx = size / 2;
            const cy = size / 2;
            const grd = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * 1.5);
            grd.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
            grd.addColorStop(0.5, 'rgba(0, 0, 0, 0.3)');
            grd.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grd;
            ctx.fillRect(0, 0, size, size);
            const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
            sprite.anchor.set(0.5);
            return sprite;
        } catch(e) {}
    }
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.4);
    g.drawCircle(0, 0, r);
    g.endFill();
    return g;
  }

  generateTrailTexture() {
    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const w = 256, h = 64;
            const canvas = document.createElement('canvas');
            canvas.width = w; canvas.height = h;
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

  generateProceduralPattern() { return PIXI.Texture.WHITE; }
  generateProceduralOverlay() { return PIXI.Texture.EMPTY; }

  update(deltaMS = 16.66) {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      this.ballTexture.rotation = this.body.angle;

      const velocity = this.body.velocity;
      const speed = Matter.Vector.magnitude(velocity);
      const dtRatio = deltaMS / 16.66;

      // --- 1. 无敌战车状态逻辑 ---
      if (this.skillStates.fire) {
          this.skillStates.fireTimer -= deltaMS;
          this.body.frictionAir = 0;
          this.body.friction = 0;

          if (this.skillStates.fireTimer <= 0) {
              this.skillStates.fire = false;
              this.body.frictionAir = this.baseFrictionAir;
              this.body.friction = this.baseFriction;
          }
      }

      // --- 2. 拖尾显隐控制 (优先级: 火焰 > 闪电 > 普通) ---
      if (this.skillStates.fire && speed > 0.5) {
          // 激活火焰拖尾
          this.updateFireEffect(velocity, speed);
          this.trail.visible = false;
          this.lightningTrail.clear();
      } else {
          this.fireContainer.removeChildren();
          
          if (this.skillStates.lightning && speed > 0.5) {
              this.updateLightningTrail(velocity, speed);
              this.trail.visible = false;
          } else {
              this.lightningTrail.clear();
              // 普通拖尾
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
      }

      // 纹理滚动
      if (speed > 0.01) {
          const angle = -this.body.angle; 
          const cos = Math.cos(angle), sin = Math.sin(angle);
          const localVx = velocity.x * cos - velocity.y * sin;
          const localVy = velocity.x * sin + velocity.y * cos;
          this.ballTexture.tilePosition.x += localVx * dtRatio * 0.5;
          this.ballTexture.tilePosition.y += localVy * dtRatio * 0.5;
      }
    }
  }

  updateLightningTrail(vel, speed) {
    const g = this.lightningTrail;
    g.clear();
    g.lineStyle(4, 0x00FFFF, 0.8);
    const segments = 5, len = Math.min(speed * 15, 150), angle = Math.atan2(vel.y, vel.x) + Math.PI;
    let currX = 0, currY = 0;
    g.moveTo(0, 0);
    for (let i = 1; i <= segments; i++) {
        const dist = (len / segments) * i;
        const jitter = (Math.random() - 0.5) * 20; 
        const tx = Math.cos(angle) * dist + Math.cos(angle + Math.PI/2) * jitter;
        const ty = Math.sin(angle) * dist + Math.sin(angle + Math.PI/2) * jitter;
        g.lineTo(tx, ty);
    }
  }

  updateFireEffect(vel, speed) {
      // 燃烧强度
      const intensity = Math.min(speed, 12) / 12;
      const angle = Math.atan2(vel.y, vel.x) + Math.PI; // 反方向

      // 每帧生成更多的粒子以形成连续拖尾
      const spawnCount = Math.floor(speed * 0.8) + 1;

      for (let i = 0; i < spawnCount; i++) {
          const p = new PIXI.Graphics();
          const isGold = Math.random() > 0.4;
          const color = isGold ? 0xFFD700 : 0xFF4500; 
          const size = (6 + Math.random() * 8) * intensity;
          
          p.beginFill(color, (0.4 + Math.random() * 0.4) * intensity);
          p.drawCircle(0, 0, size);
          p.endFill();
          
          // 在球体范围内随机起始，但在拖尾方向上加权
          const offsetAngle = Math.random() * Math.PI * 2;
          const offsetR = Math.random() * this.radius * 0.8;
          p.x = Math.cos(offsetAngle) * offsetR;
          p.y = Math.sin(offsetAngle) * offsetR;
          
          // 初始速度：反方向喷射感
          const spread = 0.5; // 扩散度
          const pAngle = angle + (Math.random() - 0.5) * spread;
          const pSpeed = speed * (0.2 + Math.random() * 0.3);
          
          p.vx = Math.cos(pAngle) * pSpeed;
          p.vy = Math.sin(pAngle) * pSpeed;
          p.alphaDecay = 0.03 + Math.random() * 0.04;
          
          this.fireContainer.addChild(p);
      }

      // 更新粒子
      for (let i = this.fireContainer.children.length - 1; i >= 0; i--) {
          const p = this.fireContainer.children[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.alphaDecay;
          p.scale.x *= 0.94;
          p.scale.y *= 0.94;
          if (p.alpha <= 0 || p.scale.x < 0.1) {
              this.fireContainer.removeChild(p);
          }
      }
  }
}
