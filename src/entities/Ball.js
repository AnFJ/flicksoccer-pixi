
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory } from '../constants.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class Ball {
  constructor(x, y) {
    this.radius = GameConfig.dimensions.ballDiameter / 2;
    
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

    this.view = new PIXI.Container();
    
    const texture = ResourceManager.get('ball');
    const shadowTexture = ResourceManager.get('shadow');

    // --- 层级 A: 阴影 ---
    if (shadowTexture) {
        const shadow = new PIXI.Sprite(shadowTexture);
        shadow.anchor.set(0.5);
        shadow.width = this.radius * 2.5;
        shadow.height = this.radius * 2.5;
        shadow.position.set(3, 3);
        shadow.alpha = 0.4;
        this.view.addChild(shadow);
    } else {
        const g = new PIXI.Graphics();
        g.ellipse(0, 0, this.radius * 1.1, this.radius * 1.1);
        g.fill({ color: 0x000000, alpha: 0.3 });
        g.position.set(4, 4);
        this.view.addChild(g);
    }

    // --- 层级 B: 旋转容器 (球体) ---
    this.rotateContainer = new PIXI.Container();
    this.view.addChild(this.rotateContainer);

    if (texture) {
        // 使用图片
        const sprite = new PIXI.Sprite(texture);
        sprite.anchor.set(0.5);
        sprite.width = this.radius * 2;
        sprite.height = this.radius * 2;
        this.rotateContainer.addChild(sprite);
        
        // 如果用图片，通常不需要手动加高光(图片自带)，除非你想做动态光照
    } else {
        // 降级：绘制矢量图 (原逻辑)
        const base = new PIXI.Graphics();
        base.circle(0, 0, this.radius);
        base.fill(0xFFFFFF);
        base.stroke({ width: 1, color: 0xCCCCCC }); 
        this.rotateContainer.addChild(base);

        const patterns = new PIXI.Graphics();
        patterns.fill(0x222222);
        this.drawPolygon(patterns, 0, 0, 5, this.radius * 0.45);
        this.drawPolygon(patterns, this.radius * 0.7, this.radius * 0.7, 5, this.radius * 0.35);
        this.drawPolygon(patterns, -this.radius * 0.7, -this.radius * 0.5, 5, this.radius * 0.35);
        this.drawPolygon(patterns, 0, -this.radius * 0.8, 5, this.radius * 0.3);
        this.rotateContainer.addChild(patterns);

        // 高光层 (仅在矢量模式下添加，避免覆盖图片细节)
        const highlight = new PIXI.Graphics();
        highlight.ellipse(-this.radius * 0.35, -this.radius * 0.35, this.radius * 0.35, this.radius * 0.25);
        highlight.fill({ color: 0xFFFFFF, alpha: 0.5 });
        highlight.rotation = -Math.PI / 4;
        this.view.addChild(highlight);
        
        // 内部阴影
        const shading = new PIXI.Graphics();
        shading.circle(0, 0, this.radius);
        shading.fill({ color: 0xFFFFFF, alpha: 0.0 });
        shading.stroke({ width: 4, color: 0x000000, alpha: 0.15, alignment: 1 });
        this.view.addChild(shading);
    }
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
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      this.rotateContainer.rotation = this.body.angle;
    }
  }
}
