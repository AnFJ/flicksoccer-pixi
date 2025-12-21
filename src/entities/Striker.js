import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';

export default class Striker {
  /**
   * @param {number} x 
   * @param {number} y 
   * @param {number} radius 
   * @param {number} teamId 
   */
  constructor(x, y, radius, teamId) {
    this.teamId = teamId;
    this.radius = radius;
    
    // 1. 创建物理刚体
    this.body = Matter.Bodies.circle(x, y, radius, {
      frictionAir: GameConfig.physics.frictionAir,
      restitution: GameConfig.physics.restitution,
      label: 'Striker',
      collisionFilter: {
        category: CollisionCategory.STRIKER,
        mask: CollisionCategory.WALL | CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    });

    // 绑定反向引用
    this.body.entity = this;

    // 2. 创建 Pixi 视图
    this.view = new PIXI.Container();
    const graphics = new PIXI.Graphics();
    
    // 根据队伍设置颜色
    const color = teamId === TeamId.LEFT ? 0xFF0000 : 0x0000FF;
    
    // 绘制棋子 (简单的圆柱体俯视效果)
    graphics.circle(0, 0, radius);
    graphics.fill(color);
    graphics.stroke({ width: 4, color: 0xFFFFFF });
    
    // 添加一个内部圆环增加立体感
    graphics.circle(0, 0, radius * 0.7);
    graphics.stroke({ width: 2, color: 0xFFFFFF, alpha: 0.5 });

    this.view.addChild(graphics);
  }

  /**
   * 每帧同步物理位置到渲染节点
   */
  update() {
    if (this.body && this.view) {
      this.view.position.x = this.body.position.x;
      this.view.position.y = this.body.position.y;
      this.view.rotation = this.body.angle;
    }
  }
}