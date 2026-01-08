
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Striker {
  /**
   * @param {number} x
   * @param {number} y
   * @param {number} radius
   * @param {number} teamId
   * @param {number} themeId [新增] 主题ID 1-7
   */
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

    // 1. 物理刚体
    this.body = Matter.Bodies.circle(x, y, this.radius, bodyOptions);
    this.body.entity = this;

    // 2. Pixi 视图
    this.view = new PIXI.Container();
    this.view.interactive = true; 
    this.view.interactiveChildren = false; 
    this.view.hitArea = new PIXI.Circle(0, 0, this.radius * 1.6);
    this.view.entity = this;
    
    // --- 绘制阴影 (优化版) ---
    const shadow = this.createShadowSprite();
    shadow.position.set(GameConfig.visuals.shadowOffset, GameConfig.visuals.shadowOffset); 
    this.view.addChild(shadow);

    // --- 选中光圈 ---
    this.glow = this.createGlowGraphics();
    this.glow.visible = false; 
    this.glow.alpha = 0; 
    this.view.addChild(this.glow);

    this.targetGlowAlpha = 0; 

    // --- 绘制本体 [修改] 根据 themeId 获取 ---
    const colorKey = teamId === TeamId.LEFT ? 'red' : 'blue';
    const textureKey = `striker_${colorKey}_${themeId}`;
    const texture = ResourceManager.get(textureKey) || ResourceManager.get(`striker_${colorKey}`); // 回退

    if (texture) {
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = this.radius * 2;
        sprite.height = this.radius * 2;
        this.view.addChild(sprite);
    } else {
        // Fallback: 矢量绘制
        const mainColor = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db;
        const sideColor = 0x95a5a6; 
        const starColor = 0xFFFFFF; 

        const graphics = new PIXI.Graphics();
        
        // 侧面
        graphics.beginFill(sideColor);
        graphics.drawCircle(0, thickness, this.radius);
        graphics.endFill();
        
        // 侧面高光
        graphics.lineStyle(2, 0xffffff, 0.3);
        graphics.arc(0, thickness, this.radius, 0.1, Math.PI - 0.1);
        
        // 顶面
        graphics.lineStyle(0); // 清除描边
        graphics.beginFill(mainColor);
        graphics.drawCircle(0, 0, this.radius);
        graphics.endFill();
        
        // 内圈装饰
        graphics.lineStyle(3, 0xFFFFFF, 0.3);
        graphics.drawCircle(0, 0, this.radius - 2);
        graphics.endFill(); 

        this.drawStar(graphics, 0, 0, 5, this.radius * 0.5, this.radius * 0.25, starColor);
        
        this.view.addChild(graphics);
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
    // [优化] 同样使用 Canvas 纹理生成柔和阴影，避免实时 BlurFilter 导致闪烁
    const r = this.radius;
    const blurPadding = 12; // 棋子的阴影稍硬一点
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
                const grad = ctx.createRadialGradient(cx, cy, r * 0.5, cx, cy, r + blurPadding);
                
                grad.addColorStop(0, 'rgba(0, 0, 0, 0.5)'); 
                grad.addColorStop(0.5, 'rgba(0, 0, 0, 0.35)'); 
                grad.addColorStop(1, 'rgba(0, 0, 0, 0)');   

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(cx, cy, r + blurPadding, 0, Math.PI * 2);
                ctx.fill();

                const texture = PIXI.Texture.from(canvas);
                const sprite = new PIXI.Sprite(texture);
                sprite.anchor.set(0.5);
                // 棋子阴影稍大一点
                sprite.scale.set(1.05); 
                return sprite;
            }
        } catch(e) {
            console.warn('Canvas shadow creation failed', e);
        }
    }

    // 兜底
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.35);
    g.drawCircle(0, 0, r);
    g.endFill();
    return g;
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
      this.view.rotation = this.body.angle;
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
