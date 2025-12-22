
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
    
    // --- 绘制高质量柔滑阴影 ---
    // 使用高密度 Graphics 叠加
    const shadow = this.createShadowGraphics();
    shadow.position.set(GameConfig.visuals.shadowOffset || 5, GameConfig.visuals.shadowOffset || 5); 
    shadow.alpha = 0.8; 
    
    this.view.addChild(shadow);

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
        graphics.circle(0, thickness, this.radius);
        graphics.fill(sideColor);
        graphics.arc(0, thickness, this.radius, 0.1, Math.PI - 0.1);
        graphics.stroke({ width: 2, color: 0xffffff, alpha: 0.3 });
        graphics.circle(0, 0, this.radius);
        graphics.fill(mainColor);
        graphics.circle(0, 0, this.radius - 2);
        graphics.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.3 });
        this.drawStar(graphics, 0, 0, 5, this.radius * 0.5, this.radius * 0.25, starColor);
        
        this.view.addChild(graphics);
    }
  }

  /**
   * 使用 30 层同心圆叠加，消除波纹感
   */
  createShadowGraphics() {
    const g = new PIXI.Graphics();
    const r = this.radius;
    
    // 棋子比较扁平，阴影扩散范围适中
    const steps = 30;
    const maxR = r * 1.1; 
    const alphaPerStep = 0.05; // 每一层很淡，叠加起来就黑了，且边缘非常柔和

    for (let i = 0; i < steps; i++) {
        const ratio = i / steps; 
        const currentR = maxR * (1 - ratio);
        
        if (currentR <= 0) break;

        g.circle(0, 0, currentR);
        g.fill({ color: 0x000000, alpha: alphaPerStep });
    }

    // 棋子底部的接触阴影
    g.circle(0, 0, r * 0.9);
    g.fill({ color: 0x000000, alpha: 0.1 });

    return g;
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
