
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Ball {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} themeId [新增] 主题ID 1-3
   */
  constructor(x, y, themeId = 1) {
    this.radius = GameConfig.dimensions.ballDiameter / 2;
    
    this.baseFrictionAir = GameConfig.physics.ballFrictionAir;
    this.baseFriction = 0.05; 

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

    // C. 闪电拖尾
    this.lightningTrail = new PIXI.Graphics();
    this.lightningTrail.blendMode = PIXI.BLEND_MODES.ADD; 
    this.view.addChild(this.lightningTrail);

    // D. 火焰特效容器
    this.fireContainer = new PIXI.Container();
    this.view.addChild(this.fireContainer);

    // E. 足球本体
    // [修改] 根据 themeId 获取纹理
    let texKey = 'ball_texture'; // 默认
    if (themeId && themeId > 1) {
        texKey = `ball_texture_${themeId}`;
    }
    const rawBallTex = ResourceManager.get(texKey) || ResourceManager.get('ball_texture'); 
    
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

    this.textureScale = 0.36; // 纹理缩放，根据实际素材调整
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

    this.moveAngle = 0;
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

      if (speed > 0.1) {
          const targetAngle = Math.atan2(velocity.y, velocity.x);
          let diff = targetAngle - this.moveAngle;
          
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          
          const turnSpeed = 0.15 * dtRatio;
          this.moveAngle += diff * turnSpeed;
      }

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

      // --- 2. 拖尾显隐控制 ---
      this.updateFireParticlesState();

      if (this.skillStates.fire) {
          this.trail.visible = false;
          this.lightningTrail.clear();
          if (speed > 0.1) {
              this.spawnFireParticles(speed, this.moveAngle);
          }
      } else {
          this.fireContainer.removeChildren();
          
          if (this.skillStates.lightning && speed > 0.5) {
              this.updateLightningTrail(speed, this.moveAngle);
              this.trail.visible = false;
          } else {
              this.lightningTrail.clear();
              if (speed > 0.2) { 
                  this.trail.rotation = this.moveAngle;

                  const maxLen = this.radius * 8; 
                  const lenFactor = 12.0; 
                  const targetWidth = Math.min(speed * lenFactor, maxLen);
                  
                  this.trail.width += (targetWidth - this.trail.width) * 0.2 * dtRatio;
                  
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

  updateLightningTrail(speed, moveAngle) {
    const g = this.lightningTrail;
    g.clear();

    const len = Math.min(speed * 18, 180); 
    const angle = moveAngle + Math.PI; 
    
    const segments = Math.max(Math.floor(len / 12), 2); 
    
    const getLightningPoints = (amp) => {
        const points = [{x: 0, y: 0}]; 
        for (let i = 1; i <= segments; i++) {
            const ratio = i / segments;
            const dist = len * ratio;
            
            const jitter = (Math.random() - 0.5) * amp;
            
            const px = Math.cos(angle) * dist + Math.cos(angle + Math.PI/2) * jitter;
            const py = Math.sin(angle) * dist + Math.sin(angle + Math.PI/2) * jitter;
            points.push({x: px, y: py});
        }
        return points;
    };

    const glowPoints = getLightningPoints(25); 
    g.lineStyle(12, 0x0055FF, 0.3); 
    g.moveTo(0, 0);
    for (let i = 1; i < glowPoints.length; i++) {
        g.lineTo(glowPoints[i].x, glowPoints[i].y);
    }

    const corePoints = getLightningPoints(20); 
    g.lineStyle(3, 0xFFFFFF, 0.9); 
    g.moveTo(0, 0);
    for (let i = 1; i < corePoints.length; i++) {
        g.lineTo(corePoints[i].x, corePoints[i].y);
    }
    
    if (Math.random() > 0.6) {
        const branchStartIdx = Math.floor(Math.random() * (segments / 2));
        if (corePoints[branchStartIdx]) {
            const startP = corePoints[branchStartIdx];
            g.lineStyle(2, 0x00FFFF, 0.6); 
            g.moveTo(startP.x, startP.y);
            
            const branchLen = 40 + Math.random() * 30;
            const branchAngle = angle + (Math.random() - 0.5) * 1.5; 
            
            const bx = startP.x + Math.cos(branchAngle) * branchLen;
            const by = startP.y + Math.sin(branchAngle) * branchLen;
            
            const midX = (startP.x + bx) / 2 + (Math.random()-0.5) * 15;
            const midY = (startP.y + by) / 2 + (Math.random()-0.5) * 15;
            
            g.lineTo(midX, midY);
            g.lineTo(bx, by);
        }
    }
  }

  spawnFireParticles(speed, moveAngle) {
      const intensity = Math.min(speed, 12) / 12;
      const angle = moveAngle + Math.PI; 

      const spawnCount = Math.floor(speed * 0.8) + 1;

      for (let i = 0; i < spawnCount; i++) {
          const p = new PIXI.Graphics();
          const isGold = Math.random() > 0.4;
          const color = isGold ? 0xFFD700 : 0xFF4500; 
          const size = (6 + Math.random() * 8) * intensity;
          
          p.beginFill(color, (0.4 + Math.random() * 0.4) * intensity);
          p.drawCircle(0, 0, size);
          p.endFill();
          
          const offsetAngle = Math.random() * Math.PI * 2;
          const offsetR = Math.random() * this.radius * 0.8;
          p.x = Math.cos(offsetAngle) * offsetR;
          p.y = Math.sin(offsetAngle) * offsetR;
          
          const spread = 0.5; 
          const pAngle = angle + (Math.random() - 0.5) * spread;
          const pSpeed = speed * (0.2 + Math.random() * 0.3);
          
          p.vx = Math.cos(pAngle) * pSpeed;
          p.vy = Math.sin(pAngle) * pSpeed;
          p.alphaDecay = 0.03 + Math.random() * 0.04;
          
          this.fireContainer.addChild(p);
      }
  }

  updateFireParticlesState() {
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

  updateFireEffect(speed, moveAngle) {
      this.spawnFireParticles(speed, moveAngle);
      this.updateFireParticlesState();
  }
}
