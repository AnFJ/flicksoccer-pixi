import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';

export default class Goal {
  /**
   * @param {number} x 中心X
   * @param {number} y 中心Y
   * @param {number} w 宽
   * @param {number} h 高
   * @param {number} ownerTeamId 所属队伍ID (谁在防守这个球门)
   */
  constructor(x, y, w, h, ownerTeamId) {
    this.ownerTeamId = ownerTeamId; // TeamId.LEFT (0) 或 TeamId.RIGHT (1)
    
    // 1. 物理刚体 (Sensor)
    // isSensor: true 表示只检测碰撞，不产生物理阻挡
    this.body = Matter.Bodies.rectangle(x, y, w, h, {
      isStatic: true,
      isSensor: true, 
      label: 'Goal',
      collisionFilter: {
        category: CollisionCategory.GOAL,
        mask: CollisionCategory.BALL // 只检测球
      }
    });
    this.body.entity = this;

    // 2. Pixi 视图 (调试用，或者画网格)
    this.view = new PIXI.Graphics();
    
    // 半透明网格区域
    const color = ownerTeamId === TeamId.LEFT ? 0xFF0000 : 0x0000FF;
    this.view.rect(-w/2, -h/2, w, h);
    this.view.fill({ color: color, alpha: 0.3 });
    this.view.stroke({ width: 2, color: color, alpha: 0.8 });
    
    // 设置位置
    this.view.position.set(x, y);
  }

  update() {
    // 静态物体不需要每帧更新位置
  }
}