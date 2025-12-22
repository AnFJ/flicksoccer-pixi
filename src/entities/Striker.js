
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

    // 准备刚体配置
    const bodyOptions = {
      frictionAir: GameConfig.physics.frictionAir,
      restitution: GameConfig.physics.restitution,
      density: GameConfig.physics.strikerDensity, // [新增] 应用密度配置
      label: 'Striker',
      collisionFilter: {
        category: CollisionCategory.STRIKER,
        mask: CollisionCategory.WALL | CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    };

    // 如果配置了固定旋转，设置惯性为无穷大
    if (GameConfig.physics.strikerFixedRotation) {
      bodyOptions.inertia = Infinity; 
    }

    // 1. 物理刚体
    this.body = Matter.Bodies.circle(x, y, this.radius, bodyOptions);
    this.body.entity = this;

    // 2. Pixi 视图
    this.view = new PIXI.Container();
    
    // 尝试获取纹理
    const textureKey = teamId === TeamId.LEFT ? 'striker_red' : 'striker_blue';
    const texture = ResourceManager.get(textureKey);
    const shadowTexture = ResourceManager.get('shadow');

    // --- 绘制阴影 ---
    if (shadowTexture) {
        const shadow = new PIXI.Sprite(shadowTexture);
        shadow.anchor.set(0.5);
        shadow.width = this.radius * 2.4;
        shadow.height = this.radius * 2.4;
        shadow.position.set(5, 5); // 偏移
        shadow.alpha = 0.5;
        this.view.addChild(shadow);
    } else {
        // 降级阴影
        const g = new PIXI.Graphics();
        g.ellipse(0, thickness + 5, this.radius * 1.1, this.radius * 1.1);
        g.fill({ color: 0x000000, alpha: 0.3 });
        this.view.addChild(g);
    }

    // --- 绘制本体 ---
    if (texture) {
        // 使用图片 Sprite
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        // 调整大小匹配物理半径
        sprite.width = this.radius * 2;
        sprite.height = this.radius * 2;
        this.view.addChild(sprite);
    } else {
        // 降级：使用 Graphics 绘制 (原来的代码)
        const mainColor = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db;
        const sideColor = 0x95a5a6; 
        const starColor = 0xFFFFFF; 

        const graphics = new PIXI.Graphics();
        // 侧壁
        graphics.circle(0, thickness, this.radius);
        graphics.fill(sideColor);
        graphics.arc(0, thickness, this.radius, 0.1, Math.PI - 0.1);
        graphics.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
        // 顶面
        graphics.circle(0, 0, this.radius);
        graphics.fill(mainColor);
        graphics.circle(0, 0, this.radius - 2);
        graphics.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.3 });
        // 星星
        this.drawStar(graphics, 0, 0, 5, this.radius * 0.5, this.radius * 0.25, starColor);
        
        this.view.addChild(graphics);
    }
  }

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
      this.view.rotation = this.body.angle;
    }
  }
}
