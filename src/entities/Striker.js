
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Striker {
  constructor(x, y, radius, teamId) {
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
    
    // --- 核心修改：交互优化 ---
    this.view.interactive = true; 
    // 关闭子元素交互，统一由 Container 处理
    this.view.interactiveChildren = false; 
    
    // [修改] 扩大点击区域为半径的 1.6 倍，让手指更容易点中
    this.view.hitArea = new PIXI.Circle(0, 0, this.radius * 1.6);
    
    // 绑定实体引用
    this.view.entity = this;
    
    // --- 绘制阴影 (使用 Canvas 渐变纹理) ---
    const shadow = this.createShadowSprite();
    // 设置偏移量，制造悬浮感
    shadow.position.set(GameConfig.visuals.shadowOffset, GameConfig.visuals.shadowOffset); 
    this.view.addChild(shadow);

    // --- 新增：选中光圈 (Glow Ring) ---
    // 放在阴影之后，本体之前
    this.glow = this.createGlowGraphics();
    this.glow.visible = false; 
    this.glow.alpha = 0; // 初始透明度为0，用于淡入效果
    this.view.addChild(this.glow);

    // 动画目标透明度
    this.targetGlowAlpha = 0; 

    // --- 绘制本体 ---
    const textureKey = teamId === TeamId.LEFT ? 'striker_red' : 'striker_blue';
    const texture = ResourceManager.get(textureKey);

    if (texture) {
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = this.radius * 2;
        sprite.height = this.radius * 2;
        this.view.addChild(sprite);
    } else {
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

  /**
   * 创建光圈图形
   */
  createGlowGraphics() {
    const g = new PIXI.Graphics();
    const r = this.radius * 1.3; // 比本体稍大
    const color = 0x00FFFF; // 青色光圈
    
    // 混合模式：叠加高亮
    g.blendMode = PIXI.BLEND_MODES.ADD;

    // 1. 静态光晕
    g.lineStyle(2, color, 0.3);
    g.drawCircle(0, 0, r);
    
    // 2. 旋转的断开圆环 (3段)
    const segments = 3;
    const gap = 0.5; // 弧度间隙
    const arcLen = (Math.PI * 2) / segments - gap;
    
    g.lineStyle(4, color, 0.8);
    for (let i = 0; i < segments; i++) {
        const start = i * ((Math.PI * 2) / segments);
        // 必须 moveTo 到起点，否则会连线
        g.moveTo(Math.cos(start) * r, Math.sin(start) * r);
        g.arc(0, 0, r, start, start + arcLen);
    }
    
    // 3. 内部白色亮圈
    g.lineStyle(1, 0xFFFFFF, 0.6);
    g.drawCircle(0, 0, r - 5);

    return g;
  }

  /**
   * 设置高亮状态 (淡入/淡出)
   * @param {boolean} active 
   */
  setHighlight(active) {
    // 设置目标透明度，具体的动画在 update 中执行
    this.targetGlowAlpha = active ? 1 : 0;
  }

  /**
   * [核心优化] 使用 Canvas 生成真实的柔边阴影纹理
   */
  createShadowSprite() {
    const r = this.radius;
    // 留出足够的 Padding 给模糊边缘
    const padding = 20; 
    const size = (r + padding) * 2;
    
    // 尝试创建 Canvas
    if (typeof document !== 'undefined' && document.createElement) {
        try {
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            
            // 使用 shadowBlur 来实现完美的高斯模糊阴影
            // 这种方式比径向渐变更像“投影”
            ctx.shadowColor = "rgba(0, 0, 0, 0.4)"; // 阴影颜色
            ctx.shadowBlur = 25; // 模糊半径
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
            
            ctx.fillStyle = "rgba(0, 0, 0, 0.4)"; // 实体颜色 (半透明)
            
            ctx.beginPath();
            // 画一个比本体略小的圆，让模糊效果向外扩散
            ctx.arc(size/2, size/2, r - 5, 0, Math.PI * 2);
            ctx.fill();

            const sprite = new PIXI.Sprite(PIXI.Texture.from(canvas));
            sprite.anchor.set(0.5);
            return sprite;

        } catch (e) {
            console.warn('Canvas shadow generation failed:', e);
        }
    }

    // 兜底：如果无法使用 Canvas，回退到简单的 Graphics
    const g = new PIXI.Graphics();
    g.beginFill(0x000000, 0.4);
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
    
    // 手动构建五角星路径
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
    g.lineTo(cx, cy - outerRadius); // Close loop
    g.endFill();
  }

  update(deltaMS = 16.66) {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      this.view.rotation = this.body.angle;
    }

    const dtRatio = deltaMS / 16.66;

    // --- 光圈动画逻辑 ---
    if (this.glow) {
        // 1. 透明度渐变 (Lerp)
        const fadeSpeed = 0.1 * dtRatio; // 渐变速度
        if (Math.abs(this.glow.alpha - this.targetGlowAlpha) > 0.01) {
            this.glow.alpha += (this.targetGlowAlpha - this.glow.alpha) * fadeSpeed;
        } else {
            this.glow.alpha = this.targetGlowAlpha;
        }

        // 2. 显隐优化：透明度过低时直接隐藏，节省渲染开销
        this.glow.visible = this.glow.alpha > 0.01;

        // 3. 只有可见时才进行旋转计算
        if (this.glow.visible) {
            this.glow.rotation += 0.015 * dtRatio; // 缓慢旋转
        }
    }
  }
}
