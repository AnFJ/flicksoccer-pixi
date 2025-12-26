
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
    // 关闭子元素交互：这意味着点击内部的 Sprite 或 Graphics 时，
    // 事件目标(target)会直接是 this.view 本身，而不是内部的子对象。
    this.view.interactiveChildren = false; 
    // 设置精确的点击区域，避免点击到阴影边缘导致误判
    this.view.hitArea = new PIXI.Circle(0, 0, this.radius);
    
    // 绑定实体引用
    this.view.entity = this;
    
    // --- 绘制阴影 ---
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
   * 性能优化：减少同心圆层数 (30 -> 5)
   * 之前 30 层在低端机上会导致严重的 Overdraw (过度绘制)，
   * 5 层对于移动端小游戏来说已经足够柔和。
   */
  createShadowGraphics() {
    const g = new PIXI.Graphics();
    const r = this.radius;
    
    // 优化：降低层数
    const steps = 5; 
    const maxR = r * 1.1; 
    const alphaPerStep = 0.15; // 稍微增加每层不透明度以补偿层数减少

    for (let i = 0; i < steps; i++) {
        const ratio = i / steps; 
        const currentR = maxR * (1 - ratio);
        
        if (currentR <= 0) break;

        g.beginFill(0x000000, alphaPerStep);
        g.drawCircle(0, 0, currentR);
        g.endFill();
    }

    // 底部接触阴影
    g.beginFill(0x000000, 0.2);
    g.drawCircle(0, 0, r * 0.9);
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

  update() {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      this.view.rotation = this.body.angle;
    }
  }
}
