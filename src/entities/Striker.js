
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';

export default class Striker {
  constructor(x, y, radius, teamId) {
    this.teamId = teamId;
    this.radius = GameConfig.dimensions.strikerDiameter / 2;
    const thickness = GameConfig.visuals.strikerThickness;

    // 1. 物理刚体
    this.body = Matter.Bodies.circle(x, y, this.radius, {
      frictionAir: GameConfig.physics.frictionAir,
      restitution: GameConfig.physics.restitution,
      label: 'Striker',
      collisionFilter: {
        category: CollisionCategory.STRIKER,
        mask: CollisionCategory.WALL | CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    });
    this.body.entity = this;

    // 2. Pixi 视图
    this.view = new PIXI.Container();
    
    // 颜色配置
    // 红方: 表面红色，侧边深红
    // 蓝方: 表面蓝色，侧边深蓝
    // 或者模仿 Soccer Stars: 侧面是统一的金属银色/灰色，表面是贴纸
    const mainColor = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db;
    const sideColor = 0x95a5a6; // 统一用金属灰作为底座
    const starColor = 0xFFFFFF; // 星星颜色

    const graphics = new PIXI.Graphics();

    // --- 绘制阴影 (贴地) ---
    graphics.ellipse(0, thickness + 5, this.radius * 1.1, this.radius * 1.1);
    graphics.fill({ color: 0x000000, alpha: 0.3 });

    // --- 绘制圆柱体侧壁 (下层圆) ---
    // 为了产生厚度感，我们在 y + thickness 的位置画一个圆，然后向上延伸
    // 简单做法：画一个深色圆在下方
    graphics.circle(0, thickness, this.radius);
    graphics.fill(sideColor);
    // 侧边高光 (让圆柱看起来有金属光泽)
    graphics.arc(0, thickness, this.radius, 0.1, Math.PI - 0.1);
    graphics.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });

    // --- 绘制顶面 (上层圆) ---
    // 位于 (0, 0)
    graphics.circle(0, 0, this.radius);
    graphics.fill(mainColor);
    
    // 顶面边缘高光 (倒角效果)
    graphics.circle(0, 0, this.radius - 2);
    graphics.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.3 });

    // --- 绘制中间的星星 ---
    this.drawStar(graphics, 0, 0, 5, this.radius * 0.5, this.radius * 0.25, starColor);

    this.view.addChild(graphics);
  }

  /**
   * 绘制星星
   */
  drawStar(g, cx, cy, spikes, outerRadius, innerRadius, color) {
    let rot = Math.PI / 2 * 3;
    let x = cx;
    let y = cy;
    let step = Math.PI / spikes;

    g.beginPath();
    g.moveTo(cx, cy - outerRadius);
    
    const path = [];
    for (let i = 0; i < spikes; i++) {
        x = cx + Math.cos(rot) * outerRadius;
        y = cy + Math.sin(rot) * outerRadius;
        path.push(x, y);
        rot += step;

        x = cx + Math.cos(rot) * innerRadius;
        y = cy + Math.sin(rot) * innerRadius;
        path.push(x, y);
        rot += step;
    }
    g.poly(path);
    g.fill(color);
    g.stroke({ width: 2, color: 0x000000, alpha: 0.2 });
  }

  update() {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      
      // 棋子旋转时，整体旋转。
      // 虽然物理上圆柱体旋转侧面应该不动，但在俯视游戏中，
      // 让整个纹理旋转会显得更有动感，且能看清星星在转。
      this.view.rotation = this.body.angle;
    }
  }
}
