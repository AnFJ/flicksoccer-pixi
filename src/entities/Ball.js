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
      frictionAir: GameConfig.physics.ballFrictionAir, // 使用配置中的阻尼
      restitution: GameConfig.physics.ballRestitution, // 使用配置中的弹性
      density: GameConfig.physics.ballDensity,         // 使用配置中的密度
      label: 'Ball',
      collisionFilter: {
        category: CollisionCategory.BALL,
        mask: CollisionCategory.WALL | CollisionCategory.STRIKER | CollisionCategory.GOAL
      }
    });
    this.body.entity = this;

    // 2. Pixi 视图
    this.view = new PIXI.Container();
    
    const g = new PIXI.Graphics();
    
    // 白色底
    g.circle(0, 0, this.radius);
    g.fill(0xFFFFFF);
    g.stroke({ width: 2, color: 0x000000 });

    // 足球纹理
    g.moveTo(0, -this.radius * 0.5);
    // 画个简易五边形
    const r = this.radius * 0.4;
    g.poly([
        r * Math.cos(0), r * Math.sin(0),
        r * Math.cos(72 * Math.PI/180), r * Math.sin(72 * Math.PI/180),
        r * Math.cos(144 * Math.PI/180), r * Math.sin(144 * Math.PI/180),
        r * Math.cos(216 * Math.PI/180), r * Math.sin(216 * Math.PI/180),
        r * Math.cos(288 * Math.PI/180), r * Math.sin(288 * Math.PI/180)
    ], true);
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