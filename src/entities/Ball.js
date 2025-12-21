
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory } from '../constants.js';
import { GameConfig } from '../config.js';

export default class Ball {
  constructor(x, y) {
    // 读取配置中的直径
    this.radius = GameConfig.dimensions.ballDiameter / 2;
    
    // 1. 物理刚体
    this.body = Matter.Bodies.circle(x, y, this.radius, {
      frictionAir: GameConfig.physics.ballFrictionAir,
      restitution: GameConfig.physics.ballRestitution,
      density: GameConfig.physics.ballDensity,
      label: 'Ball',
      collisionFilter: {
        category: CollisionCategory.BALL,
        mask: CollisionCategory.WALL | CollisionCategory.STRIKER | CollisionCategory.GOAL
      }
    });
    this.body.entity = this;

    // 2. Pixi 视图容器
    this.view = new PIXI.Container();
    
    // --- 层级 A: 投射阴影 (Shadow) ---
    // 永远在最底层，且稍微偏移
    this.shadowGraphics = new PIXI.Graphics();
    this.shadowGraphics.ellipse(0, 0, this.radius * 1.1, this.radius * 1.1);
    this.shadowGraphics.fill({ color: 0x000000, alpha: 0.3 });
    this.shadowGraphics.position.set(4, 4);
    this.view.addChild(this.shadowGraphics);

    // --- 层级 B: 旋转容器 (Rotating Container) ---
    // 只有这个容器会随物理引擎旋转，模拟滚动
    this.rotateContainer = new PIXI.Container();
    this.view.addChild(this.rotateContainer);

    // B1. 球体底色 (白色)
    const base = new PIXI.Graphics();
    base.circle(0, 0, this.radius);
    base.fill(0xFFFFFF);
    base.stroke({ width: 1, color: 0xCCCCCC }); // 淡淡的描边
    this.rotateContainer.addChild(base);

    // B2. 足球花纹 (黑块)
    // 绘制三个大五边形/六边形，分布在不同位置，确保旋转时能看到明显的黑白交替
    const patterns = new PIXI.Graphics();
    patterns.fill(0x222222);
    
    // 中心大块
    this.drawPolygon(patterns, 0, 0, 5, this.radius * 0.45);
    // 侧边块 (模拟球体侧面)
    this.drawPolygon(patterns, this.radius * 0.7, this.radius * 0.7, 5, this.radius * 0.35);
    this.drawPolygon(patterns, -this.radius * 0.7, -this.radius * 0.5, 5, this.radius * 0.35);
    this.drawPolygon(patterns, 0, -this.radius * 0.8, 5, this.radius * 0.3);
    
    this.rotateContainer.addChild(patterns);

    // --- 层级 C: 球体曲面阴影 (Inner Shadow / Shading) ---
    // 这是一个覆盖在球体上的径向渐变或半透明圆环，让球看起来是鼓起来的
    // 注意：这个层级加在 view 上，不随 rotateContainer 旋转！
    const shading = new PIXI.Graphics();
    // 绘制一个内部阴影，模拟球体边缘变暗
    shading.circle(0, 0, this.radius);
    shading.fill({ color: 0xFFFFFF, alpha: 0.0 }); // 占位填充，实际靠 stroke 或 gradient
    shading.stroke({ width: 4, color: 0x000000, alpha: 0.15, alignment: 1 }); // 内描边效果
    this.view.addChild(shading);

    // --- 层级 D: 高光 (Highlight) ---
    // 模拟光源反射，位置固定，绝对不旋转，这是产生 3D 感的关键
    this.highlight = new PIXI.Graphics();
    // 主高光
    this.highlight.ellipse(-this.radius * 0.35, -this.radius * 0.35, this.radius * 0.35, this.radius * 0.25);
    this.highlight.fill({ color: 0xFFFFFF, alpha: 0.5 });
    this.highlight.rotation = -Math.PI / 4;
    
    // 次高光 (小点)
    const subHighlight = new PIXI.Graphics();
    subHighlight.circle(-this.radius * 0.15, -this.radius * 0.55, 3);
    subHighlight.fill({ color: 0xFFFFFF, alpha: 0.4 });
    
    this.view.addChild(this.highlight);
    this.view.addChild(subHighlight);
  }

  drawPolygon(g, x, y, sides, size) {
    const path = [];
    for (let i = 0; i < sides; i++) {
        const angle = (i * (360 / sides)) * (Math.PI / 180);
        path.push(x + Math.cos(angle) * size);
        path.push(y + Math.sin(angle) * size);
    }
    g.poly(path);
    g.fill(0x222222);
  }

  update() {
    if (this.body && this.view) {
      // 1. 同步位置 (整个 View 移动)
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      
      // 2. 同步旋转 (只有花纹层旋转！)
      // 这样高光和阴影会保持静止，产生“球在滚但光没动”的真实 3D 效果
      this.rotateContainer.rotation = this.body.angle;
    }
  }
}
