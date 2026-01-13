
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Ball {
  // [新增] 静态纹理缓存，全局复用
  static cachedTextures = {
      trail: null,
      overlay: null
  };

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

    // [新增] 视觉插值用的状态记录
    this.renderState = {
        x: x,
        y: y,
        angle: 0
    };

    // 2. 视图容器
    this.view = new PIXI.Container();
    
    // A. 阴影 (优化版：使用通用图片)
    const shadow = this.createShadowSprite();
    shadow.position.set(GameConfig.visuals.shadowOffset, GameConfig.visuals.shadowOffset);
    this.view.addChild(shadow);

    // [核心优化] 轨迹历史记录
    this.pathHistory = [];
    this.maxPathLen = 50; 
    this.lastRecordPos = { x: x, y: y }; 
    this.historyRecordThreshold = 2; 

    // B. 常规拖尾特效 (SimpleRope)
    // [优化] 使用缓存纹理
    this.trailTexture = this.getTrailTexture();
    
    // Rope 的段数
    this.ropeSegmentCount = 20;
    this.ropePoints = [];
    for (let i = 0; i < this.ropeSegmentCount; i++) {
        this.ropePoints.push(new PIXI.Point(0, 0));
    }
    
    this.trailRope = new PIXI.SimpleRope(this.trailTexture, this.ropePoints);
    this.trailRope.blendMode = PIXI.BLEND_MODES.ADD;
    this.trailRope.alpha = 0; 
    this.view.addChild(this.trailRope);

    // C. 闪电拖尾
    this.lightningTrail = new PIXI.Graphics();
    this.lightningTrail.blendMode = PIXI.BLEND_MODES.ADD; 
    this.view.addChild(this.lightningTrail);

    // D. 火焰特效容器
    this.fireContainer = new PIXI.Container();
    this.view.addChild(this.fireContainer);

    // E. 足球本体容器
    this.ballContainer = new PIXI.Container();
    this.view.addChild(this.ballContainer);

    // [关键] 创建遮罩
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawCircle(0, 0, this.radius);
    mask.endFill();
    this.ballContainer.addChild(mask);
    this.ballContainer.mask = mask;

    // 纹理
    let texKey = 'ball_texture';
    if (themeId && themeId > 1) {
        texKey = `ball_texture_${themeId}`;
    }
    const rawBallTex = ResourceManager.get(texKey) || ResourceManager.get('ball_texture'); 
    const texture = rawBallTex || PIXI.Texture.WHITE; // 兜底
    
    this.textureScale = 0.36; 
    this.ballTexture = new PIXI.TilingSprite(
        texture,
        this.radius * 4,
        this.radius * 4
    );
    this.ballTexture.anchor.set(0.5);
    this.ballTexture.tileScale.set(this.textureScale);
    this.ballTexture.tint = 0xdddddd; 
    
    // 将纹理加入容器
    this.ballContainer.addChild(this.ballTexture);

    // [优化] 光影蒙版 (Overlay) - 使用缓存
    const overlayTexture = this.getOverlayTexture();
    if (overlayTexture) {
        const overlay = new PIXI.Sprite(overlayTexture);
        overlay.anchor.set(0.5);
        overlay.width = this.radius * 2;
        overlay.height = this.radius * 2;
        overlay.scale.set(1.01);
        this.ballContainer.addChild(overlay);
    }

    // --- 状态变量 ---
    this.skillStates = {
        lightning: false,
        fire: false,
        fireTimer: 0,
        fireMaxDuration: 0
    };

    this.moveAngle = 0;
    this.prevPos = { x: x, y: y };
  }


  // --- 资源创建与缓存方法 ---

  createShadowSprite() {
      // [性能优化] 使用通用阴影贴图
      const texture = ResourceManager.get('shadow');

      let sprite;
      sprite = new PIXI.Sprite(texture);
      sprite.anchor.set(0.5);

      // 足球阴影尺寸设定 (半径的2.4倍，略大于球体)
      const scaleSize = this.radius * 2 * 1.3; 
      sprite.width = scaleSize;
      sprite.height = scaleSize;

      sprite.blendMode = PIXI.BLEND_MODES.MULTIPLY;
      sprite.alpha = 0.9;
      return sprite;
  }

  getTrailTexture() {
      if (Ball.cachedTextures.trail) return Ball.cachedTextures.trail;

      if (typeof document !== 'undefined' && document.createElement) {
          try {
              const w = 256, h = 64; 
              const canvas = document.createElement('canvas');
              canvas.width = w; canvas.height = h;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                  const grad = ctx.createLinearGradient(0, 0, w, 0);
                  grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)'); 
                  grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)'); 
                  grad.addColorStop(1, 'rgba(255, 255, 255, 0.9)');  
                  ctx.fillStyle = grad;
                  ctx.beginPath();
                  ctx.moveTo(0, h/2 - h*0.4); 
                  ctx.bezierCurveTo(w * 0.2, h * 0.1, w * 0.6, h * 0.45, w, h/2);
                  ctx.bezierCurveTo(w * 0.6, h * 0.55, w * 0.2, h * 0.9, 0, h/2 + h*0.4);
                  ctx.fill();
                  const tex = PIXI.Texture.from(canvas);
                  Ball.cachedTextures.trail = tex;
                  return tex;
              }
          } catch (e) {}
      }
      return PIXI.Texture.WHITE;
  }

  getOverlayTexture() {
      if (Ball.cachedTextures.overlay) return Ball.cachedTextures.overlay;

      if (typeof document !== 'undefined' && document.createElement) {
          try {
              const size = this.radius * 2;
              const canvas = document.createElement('canvas');
              canvas.width = size;
              canvas.height = size;
              const ctx = canvas.getContext('2d');
              const cx = size / 2;
              const cy = size / 2;
              const r = this.radius;

              if (ctx) {
                  const shadowGrad = ctx.createRadialGradient(cx, cy, r * 0.65, cx, cy, r);
                  shadowGrad.addColorStop(0, 'rgba(0,0,0,0)');
                  shadowGrad.addColorStop(0.8, 'rgba(0,0,0,0.2)');
                  shadowGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
                  ctx.fillStyle = shadowGrad;
                  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();

                  const hx = cx - r * 0.25; 
                  const hy = cy - r * 0.25;
                  const hlGrad = ctx.createRadialGradient(hx, hy, 0, hx, hy, r * 0.5);
                  hlGrad.addColorStop(0, 'rgba(255,255,255,0.7)'); 
                  hlGrad.addColorStop(0.3, 'rgba(255,255,255,0.2)');
                  hlGrad.addColorStop(1, 'rgba(255,255,255,0)');
                  ctx.fillStyle = hlGrad;
                  ctx.beginPath(); ctx.arc(hx, hy, r * 0.5, 0, Math.PI * 2); ctx.fill();

                  const rx = cx + r * 0.2;
                  const ry = cy + r * 0.2;
                  const rimGrad = ctx.createRadialGradient(rx, ry, r * 0.4, rx, ry, r * 0.8);
                  rimGrad.addColorStop(0, 'rgba(255,255,255,0)');
                  rimGrad.addColorStop(0.8, 'rgba(255,255,255,0.1)'); 
                  rimGrad.addColorStop(1, 'rgba(255,255,255,0)');
                  ctx.save();
                  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
                  ctx.fillStyle = rimGrad; ctx.fillRect(0, 0, size, size);
                  ctx.restore();

                  const tex = PIXI.Texture.from(canvas);
                  Ball.cachedTextures.overlay = tex;
                  return tex;
              }
          } catch (e) { }
      }
      return null;
  }

  // --- 逻辑方法 ---

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

  resetStates() {
      this.skillStates.fire = false;
      this.skillStates.lightning = false;
      this.skillStates.fireTimer = 0;
      
      if (this.body) {
          this.body.frictionAir = this.baseFrictionAir;
          this.body.friction = this.baseFriction;
      }
      
      this.lightningTrail.clear();
      this.fireContainer.removeChildren();
      this.trailRope.visible = false;
  }

  saveRenderState() {
      if (this.body) {
          this.renderState.x = this.body.position.x;
          this.renderState.y = this.body.position.y;
          this.renderState.angle = this.body.angle;
      }
  }

  update(deltaMS = 16.66, alpha = 1.0) {
    if (this.body && this.view) {
      const currX = this.body.position.x;
      const currY = this.body.position.y;
      const currAngle = this.body.angle;

      const prevX = this.renderState.x;
      const prevY = this.renderState.y;
      const prevAngle = this.renderState.angle;

      const renderX = prevX + (currX - prevX) * alpha;
      const renderY = prevY + (currY - prevY) * alpha;
      const renderAngle = prevAngle + (currAngle - prevAngle) * alpha;

      this.view.position.x = renderX;
      this.view.position.y = renderY;
      
      this.ballContainer.rotation = renderAngle;

      const velocity = this.body.velocity;
      const speed = Matter.Vector.magnitude(velocity);
      
      if (Math.abs(this.body.angularVelocity) > 0.001) {
          Matter.Body.setAngularVelocity(this.body, this.body.angularVelocity * 0.92);
      } else if (this.body.angularVelocity !== 0) {
          Matter.Body.setAngularVelocity(this.body, 0);
      }

      if (speed > 0.1) {
          const targetAngle = Math.atan2(velocity.y, velocity.x);
          let diff = targetAngle - this.moveAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          const turnSpeed = 0.15 * (deltaMS / 16.66);
          this.moveAngle += diff * turnSpeed;
      }

      const dx = renderX - this.prevPos.x;
      const dy = renderY - this.prevPos.y;
      const distMoved = Math.sqrt(dx * dx + dy * dy);

      if (distMoved > 0.05) {
          const angle = -renderAngle; 
          const cos = Math.cos(angle), sin = Math.sin(angle);
          
          const localDx = dx * cos - dy * sin;
          const localDy = dx * sin + dy * cos;
          
          this.ballTexture.tilePosition.x += localDx * 0.5;
          this.ballTexture.tilePosition.y += localDy * 0.5;
          
          if (Math.abs(this.ballTexture.tilePosition.x) > 10000) this.ballTexture.tilePosition.x %= this.ballTexture.texture.width;
          if (Math.abs(this.ballTexture.tilePosition.y) > 10000) this.ballTexture.tilePosition.y %= this.ballTexture.texture.height;
      }

      this.prevPos.x = renderX;
      this.prevPos.y = renderY;

      this.updatePathHistory(renderX, renderY);

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

      this.updateFireParticlesState();

      if (this.skillStates.fire) {
          this.trailRope.visible = false;
          this.lightningTrail.clear();
          if (speed > 0.1) {
              this.spawnFireParticles(speed, this.moveAngle);
          }
      } else {
          this.fireContainer.removeChildren();
          
          if (this.skillStates.lightning && speed > 0.5) {
              this.updateLightningTrail(speed);
              this.trailRope.visible = false;
          } else {
              this.lightningTrail.clear();
              if (speed > 0.5) { 
                  this.updateRopeTrail(speed);
                  this.trailRope.scale.y = 0.5; 
                  this.trailRope.alpha = Math.min((speed - 0.5) * 0.1, 0.8);
                  this.trailRope.visible = true;
              } else {
                  this.trailRope.visible = false;
              }
          }
      }
    }
  }

  updatePathHistory(curX, curY) {
      const dist = Math.sqrt(Math.pow(curX - this.lastRecordPos.x, 2) + Math.pow(curY - this.lastRecordPos.y, 2));
      
      if (dist > this.historyRecordThreshold || this.pathHistory.length === 0) {
          this.pathHistory.unshift({ x: curX, y: curY });
          if (this.pathHistory.length > this.maxPathLen) {
              this.pathHistory.pop();
          }
          this.lastRecordPos = { x: curX, y: curY };
      } else {
          if (this.pathHistory.length > 0) {
              this.pathHistory[0] = { x: curX, y: curY };
          }
      }
  }

  getResampledPath(speed) {
      if (this.pathHistory.length < 2) return [];

      const targetLength = Math.min(speed * 12, 150); 
      const segmentLen = targetLength / (this.ropeSegmentCount - 1);

      const resultPoints = [];
      const currentX = this.view.position.x; 
      const currentY = this.view.position.y;

      resultPoints.push({ x: 0, y: 0 });

      let historyIndex = 0;
      let consumedDistInSegment = 0; 
      
      for (let i = 1; i < this.ropeSegmentCount; i++) {
          let distanceToTravel = segmentLen;
          let foundPoint = null;

          while (historyIndex < this.pathHistory.length - 1) {
              const p1 = this.pathHistory[historyIndex];
              const p2 = this.pathHistory[historyIndex + 1];
              
              const segDist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
              const remainingDistInHistorySeg = segDist - consumedDistInSegment;

              if (remainingDistInHistorySeg >= distanceToTravel) {
                  const t = (consumedDistInSegment + distanceToTravel) / segDist;
                  const targetX = p1.x + (p2.x - p1.x) * t;
                  const targetY = p1.y + (p2.y - p1.y) * t;
                  
                  foundPoint = { x: targetX - currentX, y: targetY - currentY };
                  
                  consumedDistInSegment += distanceToTravel;
                  break; 
              } else {
                  distanceToTravel -= remainingDistInHistorySeg;
                  consumedDistInSegment = 0;
                  historyIndex++;
              }
          }

          if (foundPoint) {
              resultPoints.push(foundPoint);
          } else {
              const last = this.pathHistory[this.pathHistory.length - 1];
              resultPoints.push({ x: last.x - currentX, y: last.y - currentY });
          }
      }
      
      return resultPoints;
  }

  updateRopeTrail(speed) {
      const smoothPoints = this.getResampledPath(speed);
      if (smoothPoints.length === 0) return;

      for (let i = 0; i < this.ropePoints.length; i++) {
          const p = this.ropePoints[i];
          if (i < smoothPoints.length) {
              p.x = smoothPoints[i].x;
              p.y = smoothPoints[i].y;
          } else {
              const last = smoothPoints[smoothPoints.length - 1];
              p.x = last.x;
              p.y = last.y;
          }
      }
  }

  updateLightningTrail(speed) {
    const g = this.lightningTrail;
    g.clear();

    const points = this.getResampledPath(speed);
    if (points.length < 2) return;

    this.drawLightningBranch(g, points, 15, 0.3, 0x0055FF, 12); 
    this.drawLightningBranch(g, points, 5, 0.9, 0xFFFFFF, 3);   

    for (let i = 1; i < points.length - 1; i++) {
        if (Math.random() > 0.7) { 
            const startP = points[i];
            const prevP = points[i-1];
            const dx = startP.x - prevP.x;
            const dy = startP.y - prevP.y;
            const angle = Math.atan2(dy, dx);
            const branchAngle = angle + (Math.random() - 0.5) * 1.5; 
            const branchLen = 30 + Math.random() * 40;
            const endX = startP.x + Math.cos(branchAngle) * branchLen;
            const endY = startP.y + Math.sin(branchAngle) * branchLen;
            const midX = (startP.x + endX) / 2 + (Math.random() - 0.5) * 10;
            const midY = (startP.y + endY) / 2 + (Math.random() - 0.5) * 10;
            const branchPath = [startP, {x: midX, y: midY}, {x: endX, y: endY}];
            this.drawLightningBranch(g, branchPath, 3, 0.6, 0x00FFFF, 2);
        }
    }
  }

  drawLightningBranch(g, pts, amp, alpha, color, width) {
        g.lineStyle(width, color, alpha);
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
            const p1 = pts[i-1];
            const p2 = pts[i];
            const midX = (p1.x + p2.x) / 2;
            const midY = (p1.y + p2.y) / 2;
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 5) {
                const nx = -dy / len;
                const ny = dx / len;
                const jitter = (Math.random() - 0.5) * amp;
                g.lineTo(midX + nx * jitter, midY + ny * jitter);
            }
            g.lineTo(p2.x, p2.y);
        }
  }

  spawnFireParticles(speed, moveAngle) {
      const vx = this.body.velocity.x;
      const vy = this.body.velocity.y;
      const steps = Math.ceil(speed / 5); 
      for (let s = 0; s < steps; s++) {
          const t = s / steps;
          const spawnX = -vx * t; 
          const spawnY = -vy * t; 
          const p = new PIXI.Graphics();
          const isGold = Math.random() > 0.4;
          const color = isGold ? 0xFFD700 : 0xFF4500; 
          const intensity = Math.min(speed, 12) / 12;
          const size = (6 + Math.random() * 8) * intensity;
          p.beginFill(color, (0.4 + Math.random() * 0.4) * intensity);
          p.drawCircle(0, 0, size);
          p.endFill();
          const offsetAngle = Math.random() * Math.PI * 2;
          const offsetR = Math.random() * this.radius * 0.6;
          p.x = spawnX + Math.cos(offsetAngle) * offsetR;
          p.y = spawnY + Math.sin(offsetAngle) * offsetR;
          const angle = moveAngle + Math.PI; 
          const spread = 0.6; 
          const pAngle = angle + (Math.random() - 0.5) * spread;
          const pSpeed = speed * (0.1 + Math.random() * 0.2); 
          p.vx = Math.cos(pAngle) * pSpeed;
          p.vy = Math.sin(pAngle) * pSpeed;
          p.vx += vx * 0.1;
          p.vy += vy * 0.1;
          p.alphaDecay = 0.015 + Math.random() * 0.02;
          this.fireContainer.addChild(p);
      }
  }

  updateFireParticlesState() {
      for (let i = this.fireContainer.children.length - 1; i >= 0; i--) {
          const p = this.fireContainer.children[i];
          p.x += p.vx;
          p.y += p.vy;
          p.alpha -= p.alphaDecay;
          p.scale.x *= 0.96;
          p.scale.y *= 0.96;
          if (p.alpha <= 0 || p.scale.x < 0.1) {
              this.fireContainer.removeChild(p);
          }
      }
  }

  // [新增] 销毁方法
  destroy() {
      // 只需要清理逻辑相关引用，显示对象由 Scene 统一 destroy
      this.body = null;
      // 注意：不要销毁 Ball.cachedTextures，因为它们是全局共享的
  }
}
