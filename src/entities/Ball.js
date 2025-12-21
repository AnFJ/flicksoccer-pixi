import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory } from '../constants.js';
import { GameConfig } from '../config.js';

export default class Ball {
  constructor(x, y) {
    // 足球直径 41 (半径 20.5)
    this.radius = 20.5;
    
    // 1. 物理刚体
    this.body = Matter.Bodies.circle(x, y, this.radius, {
      frictionAir: 0.015,  // 足球阻力比棋子略小，滚动更远
      restitution: 0.9,    // 弹性较高
      density: 0.001,      // 密度适中
      label: 'Ball',
      collisionFilter: {
        category: CollisionCategory.BALL,
        mask: CollisionCategory.WALL | CollisionCategory.STRIKER | CollisionCategory.GOAL
      }
    });
    this.body.entity = this;

    // 2. Pixi 视图
    this.view = new PIXI.Container();
    
    // 绘制足球图案 (简单的黑白设计)
    const g = new PIXI.Graphics();
    
    // 白色底
    g.circle(0, 0, this.radius);
    g.fill(0xFFFFFF);
    g.stroke({ width: 2, color: 0x000000 });

    // 中间画个五边形模拟足球纹理
    g.moveTo(0, -10);
    g.poly([5, -5, 8, 5, 0, 10, -8, 5, -5, -5], true);
    g.fill(0x000000);

    this.view.addChild(g);
  }

  update() {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      this.view.rotation = this.body.angle;
    }
  }
}