
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
    
    // A. 阴影 (优化版：Canvas纹理 + 正片叠底)
    const shadow = this.createShadowSprite();
    shadow.position.set(GameConfig.visuals.shadowOffset, GameConfig.visuals.shadowOffset);
    this.view.addChild(shadow);

    // [核心优化] 轨迹历史记录
    this.pathHistory = [];
    this.maxPathLen = 50; 
    this.lastRecordPos = { x: x, y: y }; 
    this.historyRecordThreshold = 2; 

    // B. 常规拖尾特效 (SimpleRope)
    this.trailTexture = this.generateTrailTexture();
    
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
    // [修复] 保存引用以便在 update 中旋转整个容器，解决 TilingSprite 旋转偏心问题
    this.ballContainer = new PIXI.Container();
    this.view.addChild(this.ballContainer);

    // [关键] 创建遮罩，确保球体和光影层边缘完美对其
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
    const texture = rawBallTex || this.generateProceduralPattern();
    
    this.textureScale = 0.36; 
    this.ballTexture = new PIXI.TilingSprite(
        texture,
        this.radius * 4,
        this.radius * 4
    );
    this.ballTexture.anchor.set(0.5);
    this.ballTexture.tileScale.set(this.textureScale);
    this.ballTexture.tint = 0xdddddd; // 稍微暗一点，靠光影层提亮
    
    // 将纹理加入容器
    this.ballContainer.addChild(this.ballTexture);

    // [优化] 光影蒙版 (Overlay)
    const overlayTexture = this.generateProceduralOverlay();
    const overlay = new PIXI.Sprite(overlayTexture);
    overlay.anchor.set(0.5);
    overlay.width = this.radius * 2;
    overlay.height = this.radius * 2;
    // 稍微放大一点点以防计算误差导致的白边
    overlay.scale.set(1.01);
    
    this.ballContainer.addChild(overlay);

    // --- 状态变量 ---
    this.skillStates = {
        lightning: false,
        fire: false,
        fireTimer: 0,
        fireMaxDuration: 0
    };

    this.moveAngle = 0;
    
    // [修复] 记录上一帧的视图位置，用于计算纹理滚动增量
    this.prevPos = { x: x, y: y };
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
    const blurPadding = 20; 
    const size = (r + blurPadding) * 2;

    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            if (ctx) {
                const cx = size / 2;
                const cy = size / 2;
                const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r + blurPadding * 0.8);
                
                grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)'); 
                grad.addColorStop(0.4, 'rgba(0, 0, 0, 0.35)'); 
                grad.addColorStop(0.8, 'rgba(0, 0, 0, 0.05)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');   

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, r + blurPadding, 0, Math.PI * 2);
                ctx.fill();

                const texture = PIXI.Texture.from(canvas);
                const sprite = new PIXI.Sprite(texture);
                sprite.anchor.set(0.5);
                sprite.blendMode = PIXI.BLEND_MODES.MULTIPLY;
                
                return sprite;
            }
        } catch(e) {}
    }

    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.3);
    g.drawCircle(0, 0, r + 4);
    g.endFill();
    g.blendMode = PIXI.BLEND_MODES.MULTIPLY;
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
                grad.addColorStop(0, 'rgba(255, 255, 255, 0.1)'); // 尾巴尖端透明
                grad.addColorStop(0.4, 'rgba(255, 255, 255, 0.3)'); 
                grad.addColorStop(1, 'rgba(255, 255, 255, 0.9)'); // 头部不透明  
                
                ctx.fillStyle = grad;
                ctx.beginPath();
                // 流星形状
                ctx.moveTo(0, h/2 - h*0.4); 
                ctx.bezierCurveTo(w * 0.2, h * 0.1, w * 0.6, h * 0.45, w, h/2);
                ctx.bezierCurveTo(w * 0.6, h * 0.55, w * 0.2, h * 0.9, 0, h/2 + h*0.4);
                
                ctx.fill();
                return PIXI.Texture.from(canvas);
            }
        } catch (e) {}
    }
    return PIXI.Texture.WHITE;
  }

  generateProceduralPattern() { return PIXI.Texture.WHITE; }
  generateProceduralOverlay() {
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

                  return PIXI.Texture.from(canvas);
              }
          } catch (e) { }
      }
      return PIXI.Texture.EMPTY; 
  }

  update(deltaMS = 16.66) {
    if (this.body && this.view) {
      // 1. 同步位置
      const curX = this.body.position.x;
      const curY = this.body.position.y;
      
      this.view.position.x = curX;
      this.view.position.y = curY;
      
      // [修复] 旋转逻辑：不再旋转 ballTexture，而是旋转 ballContainer
      // 这样可以确保视觉中心点始终是 (0,0)，解决偏心摆动问题
      this.ballContainer.rotation = this.body.angle;

      // 2. 计算速度 (用于特效)
      const velocity = this.body.velocity;
      const speed = Matter.Vector.magnitude(velocity);
      
      // [修复] 自转物理阻尼：模拟草地对旋转的强摩擦力
      // MatterJS 默认摩擦力对角速度衰减不够，导致球停下来了还在转
      if (Math.abs(this.body.angularVelocity) > 0.001) {
          // 每一帧衰减 8%，让自转能符合直觉地快速停下
          Matter.Body.setAngularVelocity(this.body, this.body.angularVelocity * 0.92);
      } else if (this.body.angularVelocity !== 0) {
          // 低于阈值直接置零，防止微小抖动
          Matter.Body.setAngularVelocity(this.body, 0);
      }

      // 3. 更新移动角度 (用于特效方向)
      if (speed > 0.1) {
          const targetAngle = Math.atan2(velocity.y, velocity.x);
          let diff = targetAngle - this.moveAngle;
          while (diff < -Math.PI) diff += Math.PI * 2;
          while (diff > Math.PI) diff -= Math.PI * 2;
          const turnSpeed = 0.15 * (deltaMS / 16.66);
          this.moveAngle += diff * turnSpeed;
      }

      // 4. [核心修复] 纹理滚动计算
      // 使用“实际移动距离”而非“瞬时速度”来滚动纹理，消除抖动
      const dx = curX - this.prevPos.x;
      const dy = curY - this.prevPos.y;
      const distMoved = Math.sqrt(dx * dx + dy * dy);

      // 只有发生实质性移动时才更新纹理
      if (distMoved > 0.05) {
          // 将世界坐标系的位移 (dx, dy) 转换到球体的局部坐标系
          // 球体容器有旋转 (body.angle)，导致纹理坐标轴旋转，所以要逆向投影
          const angle = -this.body.angle; 
          const cos = Math.cos(angle), sin = Math.sin(angle);
          
          // 投影到局部轴
          const localDx = dx * cos - dy * sin;
          const localDy = dx * sin + dy * cos;
          
          // 更新 TilingSprite 的偏移
          this.ballTexture.tilePosition.x += localDx * 0.5;
          this.ballTexture.tilePosition.y += localDy * 0.5;
          
          // 防止数值过大导致精度丢失或抖动
          if (Math.abs(this.ballTexture.tilePosition.x) > 10000) this.ballTexture.tilePosition.x %= this.ballTexture.texture.width;
          if (Math.abs(this.ballTexture.tilePosition.y) > 10000) this.ballTexture.tilePosition.y %= this.ballTexture.texture.height;
      }

      // 更新上一帧位置
      this.prevPos.x = curX;
      this.prevPos.y = curY;

      // 5. 更新特效
      this.updatePathHistory();

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

  updatePathHistory() {
      const curX = this.body.position.x;
      const curY = this.body.position.y;
      
      const dist = Math.sqrt(Math.pow(curX - this.lastRecordPos.x, 2) + Math.pow(curY - this.lastRecordPos.y, 2));
      
      // 记录阈值：移动距离超过阈值才记录，防止静止时堆积
      if (dist > this.historyRecordThreshold || this.pathHistory.length === 0) {
          this.pathHistory.unshift({ x: curX, y: curY });
          if (this.pathHistory.length > this.maxPathLen) {
              this.pathHistory.pop();
          }
          this.lastRecordPos = { x: curX, y: curY };
      } else {
          // 实时更新第一个点，保证拖尾紧贴球体
          if (this.pathHistory.length > 0) {
              this.pathHistory[0] = { x: curX, y: curY };
          }
      }
  }

  /**
   * [核心算法优化] 重采样路径点
   * 无论历史点如何分布，通过距离插值生成均匀的 Rope 点
   * 解决转弯时拖尾拉伸、变形的问题
   */
  getResampledPath(speed) {
      if (this.pathHistory.length < 2) return [];

      // 1. 计算目标拖尾长度 (根据速度动态变化)
      // [调整] 减少空气拖尾长度 (系数 25->12, 上限 300->150)
      const targetLength = Math.min(speed * 12, 150); 
      
      // 每一段 Rope 的理想物理长度
      const segmentLen = targetLength / (this.ropeSegmentCount - 1);

      const resultPoints = [];
      const currentX = this.body.position.x;
      const currentY = this.body.position.y;

      // 第一个点总是当前球的位置 (局部坐标 0,0)
      resultPoints.push({ x: 0, y: 0 });

      // 开始沿路径回溯
      let historyIndex = 0;
      let consumedDistInSegment = 0; // 当前历史线段已经走过的距离
      
      // 我们需要找 N-1 个后续点
      for (let i = 1; i < this.ropeSegmentCount; i++) {
          let distanceToTravel = segmentLen;
          let foundPoint = null;

          // 在历史记录中寻找下一个距离点
          while (historyIndex < this.pathHistory.length - 1) {
              const p1 = this.pathHistory[historyIndex];
              const p2 = this.pathHistory[historyIndex + 1];
              
              // 计算这段历史记录的长度
              const segDist = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2));
              const remainingDistInHistorySeg = segDist - consumedDistInSegment;

              if (remainingDistInHistorySeg >= distanceToTravel) {
                  // 目标点在当前历史线段内 (插值)
                  const t = (consumedDistInSegment + distanceToTravel) / segDist;
                  const targetX = p1.x + (p2.x - p1.x) * t;
                  const targetY = p1.y + (p2.y - p1.y) * t;
                  
                  // 转换为局部坐标
                  foundPoint = { x: targetX - currentX, y: targetY - currentY };
                  
                  // 更新由于插值消耗的距离
                  consumedDistInSegment += distanceToTravel;
                  break; 
              } else {
                  // 走完这段历史还不够，继续下一段
                  distanceToTravel -= remainingDistInHistorySeg;
                  consumedDistInSegment = 0;
                  historyIndex++;
              }
          }

          if (foundPoint) {
              resultPoints.push(foundPoint);
          } else {
              // 历史记录耗尽了，剩下的点都聚在最后
              // 这通常发生在起步阶段
              const last = this.pathHistory[this.pathHistory.length - 1];
              resultPoints.push({ x: last.x - currentX, y: last.y - currentY });
          }
      }
      
      return resultPoints;
  }

  updateRopeTrail(speed) {
      const smoothPoints = this.getResampledPath(speed);
      
      // 将计算出的点赋给 Rope
      for (let i = 0; i < this.ropePoints.length; i++) {
          const p = this.ropePoints[i];
          if (i < smoothPoints.length) {
              p.x = smoothPoints[i].x;
              p.y = smoothPoints[i].y;
          } else {
              // 理论上 getResampledPath 会返回足够数量的点，这里兜底
              const last = smoothPoints[smoothPoints.length - 1];
              p.x = last.x;
              p.y = last.y;
          }
      }
  }

  updateLightningTrail(speed) {
    const g = this.lightningTrail;
    g.clear();

    // 同样使用重采样后的点，保证闪电路径和物理运动一致且平滑
    const points = this.getResampledPath(speed);
    if (points.length < 2) return;

    // 绘制主干
    this.drawLightningBranch(g, points, 15, 0.3, 0x0055FF, 12); // 外发光
    this.drawLightningBranch(g, points, 5, 0.9, 0xFFFFFF, 3);   // 内核

    // 绘制分叉
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

          // [调整] 增加火焰长度：减小 alphaDecay，让粒子存活时间翻倍 (原 0.03 -> 0.015)
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
          // [调整] 减缓缩放衰减，让粒子在更长的生命周期内慢慢变小 (原 0.94 -> 0.96)
          p.scale.x *= 0.96;
          p.scale.y *= 0.96;
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
