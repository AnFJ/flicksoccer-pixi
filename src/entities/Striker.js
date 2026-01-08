
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Striker {
  constructor(x, y, radius, teamId, themeId = 1) {
    this.teamId = teamId;
    this.radius = GameConfig.dimensions.strikerDiameter / 2;
    const thickness = GameConfig.visuals.strikerThickness;

    const bodyOptions = {
      frictionAir: GameConfig.physics.frictionAir,
      restitution: GameConfig.physics.restitution,
      density: GameConfig.physics.strikerDensity, 
      label: 'Striker',
      collisionFilter: {
        category: CollisionCategory.STRIKER,
        mask: CollisionCategory.WALL | CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    };

    if (GameConfig.physics.strikerFixedRotation) {
      bodyOptions.inertia = Infinity; 
    }

    this.body = Matter.Bodies.circle(x, y, this.radius, bodyOptions);
    this.body.entity = this;

    // 1. 根视图 (不再整体旋转，保证阴影方向固定)
    this.view = new PIXI.Container();
    this.view.interactive = true; 
    this.view.interactiveChildren = false; 
    this.view.hitArea = new PIXI.Circle(0, 0, this.radius * 1.6);
    this.view.entity = this;
    
    // 2. 阴影 (固定在底层，不随棋子自转)
    const shadow = this.createShadowSprite();
    shadow.position.set(GameConfig.visuals.shadowOffset, GameConfig.visuals.shadowOffset); 
    this.view.addChild(shadow);

    // 3. 选中光圈 (通常也是不随自转的)
    this.glow = this.createGlowGraphics();
    this.glow.visible = false; 
    this.glow.alpha = 0; 
    this.view.addChild(this.glow);
    this.targetGlowAlpha = 0; 

    // 4. 棋子主体容器 (只有这个容器会随物理刚体旋转)
    this.mainContainer = new PIXI.Container();
    this.view.addChild(this.mainContainer);

    // 遮罩 (解决边缘锯齿)
    const mask = new PIXI.Graphics();
    mask.beginFill(0xffffff);
    mask.drawCircle(0, 0, this.radius);
    mask.endFill();
    this.mainContainer.addChild(mask);
    this.mainContainer.mask = mask;

    // 绘制本体
    const colorKey = teamId === TeamId.LEFT ? 'red' : 'blue';
    const textureKey = `striker_${colorKey}_${themeId}`;
    const texture = ResourceManager.get(textureKey) || ResourceManager.get(`striker_${colorKey}`);

    if (texture) {
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = this.radius * 2;
        sprite.height = this.radius * 2;
        this.mainContainer.addChild(sprite);
    } else {
        // Fallback: 矢量绘制
        const mainColor = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db;
        const sideColor = 0x95a5a6; 
        const starColor = 0xFFFFFF; 

        const graphics = new PIXI.Graphics();
        
        graphics.beginFill(sideColor);
        graphics.drawCircle(0, thickness, this.radius);
        graphics.endFill();
        
        graphics.lineStyle(2, 0xffffff, 0.3);
        graphics.arc(0, thickness, this.radius, 0.1, Math.PI - 0.1);
        
        graphics.lineStyle(0); 
        graphics.beginFill(mainColor);
        graphics.drawCircle(0, 0, this.radius);
        graphics.endFill();
        
        graphics.lineStyle(3, 0xFFFFFF, 0.3);
        graphics.drawCircle(0, 0, this.radius - 2);
        graphics.endFill(); 

        this.drawStar(graphics, 0, 0, 5, this.radius * 0.5, this.radius * 0.25, starColor);
        
        this.mainContainer.addChild(graphics);
    }

    // 5. 光影蒙版 (Overlay)
    // 放入 mainContainer 以受遮罩影响
    const overlayTex = this.createLightingOverlay();
    if (overlayTex) {
        this.overlay = new PIXI.Sprite(overlayTex);
        this.overlay.anchor.set(0.5);
        this.overlay.width = this.radius * 2;
        this.overlay.height = this.radius * 2;
        // 稍微放大一点消除缝隙
        this.overlay.scale.set(1.01);
        this.mainContainer.addChild(this.overlay);
    }
  }

  createGlowGraphics() {
    const g = new PIXI.Graphics();
    const r = this.radius * 1.3; 
    const color = 0x00FFFF; 
    
    g.blendMode = PIXI.BLEND_MODES.ADD;

    g.lineStyle(2, color, 0.3);
    g.drawCircle(0, 0, r);
    
    const segments = 3;
    const gap = 0.5; 
    const arcLen = (Math.PI * 2) / segments - gap;
    
    g.lineStyle(4, color, 0.8);
    for (let i = 0; i < segments; i++) {
        const start = i * ((Math.PI * 2) / segments);
        g.moveTo(Math.cos(start) * r, Math.sin(start) * r);
        g.arc(0, 0, r, start, start + arcLen);
    }
    
    g.lineStyle(1, 0xFFFFFF, 0.6);
    g.drawCircle(0, 0, r - 5);

    return g;
  }

  setHighlight(active) {
    this.targetGlowAlpha = active ? 1 : 0;
  }

  createShadowSprite() {
    const r = this.radius;
    const blurPadding = 16; 
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
                const grad = ctx.createRadialGradient(cx, cy, r * 0.3, cx, cy, r + blurPadding * 0.9);
                
                grad.addColorStop(0, 'rgba(0, 0, 0, 0.75)'); 
                grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.45)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');   

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, r + blurPadding, 0, Math.PI * 2);
                ctx.fill();

                const texture = PIXI.Texture.from(canvas);
                const sprite = new PIXI.Sprite(texture);
                sprite.anchor.set(0.5);
                sprite.scale.set(1.05); 
                sprite.blendMode = PIXI.BLEND_MODES.MULTIPLY;

                return sprite;
            }
        } catch(e) {}
    }

    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.4);
    g.drawCircle(0, 0, r);
    g.endFill();
    g.blendMode = PIXI.BLEND_MODES.MULTIPLY;
    return g;
  }

  createLightingOverlay() {
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
                  // 1. 边缘高光 (Bevel)
                  const ringGrad = ctx.createLinearGradient(0, 0, size, size);
                  ringGrad.addColorStop(0, 'rgba(255,255,255,0.9)');
                  ringGrad.addColorStop(0.4, 'rgba(255,255,255,0.1)');
                  ringGrad.addColorStop(0.6, 'rgba(0,0,0,0.1)');
                  ringGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
                  
                  ctx.strokeStyle = ringGrad;
                  ctx.lineWidth = 4;
                  ctx.beginPath();
                  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
                  ctx.stroke();

                  // 2. 顶部高光 (Glossy Highlight)
                  const grad = ctx.createLinearGradient(0, 0, 0, size * 0.6);
                  grad.addColorStop(0, 'rgba(255,255,255,0.5)');
                  grad.addColorStop(1, 'rgba(255,255,255,0)');
                  
                  ctx.fillStyle = grad;
                  ctx.beginPath();
                  ctx.ellipse(cx, r * 0.4, r * 0.75, r * 0.35, 0, 0, Math.PI * 2);
                  ctx.fill();

                  // 3. 底部阴影 (Ambient Shadow)
                  const botGrad = ctx.createLinearGradient(0, size*0.5, 0, size);
                  botGrad.addColorStop(0, 'rgba(0,0,0,0)');
                  botGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
                  
                  ctx.fillStyle = botGrad;
                  ctx.beginPath();
                  ctx.arc(cx, cy, r, 0, Math.PI * 2);
                  ctx.fill();

                  return PIXI.Texture.from(canvas);
              }
          } catch(e) {}
      }
      return null;
  }

  drawStar(g, cx, cy, spikes, outerRadius, innerRadius, color) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    g.lineStyle(2, 0x000000, 0.2);
    g.beginFill(color);
    
    g.moveTo(cx, cy - outerRadius);
    
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        g.lineTo(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        g.lineTo(x, y);
        rot += step;
    }
    g.lineTo(cx, cy - outerRadius); 
    g.endFill();
  }

  update(deltaMS = 16.66) {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      
      // [关键修改]
      // 以前：this.view.rotation = this.body.angle; (导致阴影乱转)
      // 现在：只旋转 mainContainer，阴影保持不动
      if (this.mainContainer) {
          this.mainContainer.rotation = this.body.angle;
      }

      // overlay 需要反向旋转以保持高光固定
      // 现在的参照系是 mainContainer，所以取反 mainContainer 的旋转即可
      if (this.overlay && this.mainContainer) {
          this.overlay.rotation = -this.mainContainer.rotation;
      }
    }

    const dtRatio = deltaMS / 16.66;

    if (this.glow) {
        const fadeSpeed = 0.1 * dtRatio; 
        if (Math.abs(this.glow.alpha - this.targetGlowAlpha) > 0.01) {
            this.glow.alpha += (this.targetGlowAlpha - this.glow.alpha) * fadeSpeed;
        } else {
            this.glow.alpha = this.targetGlowAlpha;
        }

        this.glow.visible = this.glow.alpha > 0.01;

        if (this.glow.visible) {
            this.glow.rotation += 0.015 * dtRatio; 
        }
    }
  }
}
