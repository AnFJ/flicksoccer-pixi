import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';

export default class Striker {
  /**
   * @param {number} x 
   * @param {number} y 
   * @param {number} radius - 注意：如果传入了 radius 则使用传入的，否则使用配置
   * @param {number} teamId 
   */
  constructor(x, y, radius, teamId) {
    this.teamId = teamId;
    // 优先使用 Config，如果构造函数没传或者需要强制覆盖
    this.radius = GameConfig.dimensions.strikerDiameter / 2;
    
    // 1. 创建物理刚体
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

    // 2. 创建 Pixi 视图
    this.view = new PIXI.Container();
    const graphics = new PIXI.Graphics();
    
    // 根据队伍设置颜色
    const color = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db; // 红 vs 蓝
    
    // 绘制棋子
    graphics.circle(0, 0, this.radius);
    graphics.fill(color);
    graphics.stroke({ width: 4, color: 0xFFFFFF });
    
    // 内部圆环
    graphics.circle(0, 0, this.radius * 0.7);
    graphics.stroke({ width: 2, color: 0xFFFFFF, alpha: 0.5 });
    
    // 中心点装饰
    graphics.circle(0, 0, 5);
    graphics.fill(0xffffff);

    this.view.addChild(graphics);
  }

  update() {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      this.view.rotation = this.body.angle;
    }
  }
}