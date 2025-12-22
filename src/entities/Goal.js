
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { CollisionCategory, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';

export default class Goal {
  /**
   * @param {number} x 中心X
   * @param {number} y 中心Y
   * @param {number} w 宽 (球门深度)
   * @param {number} h 高 (球门开口)
   * @param {number} ownerTeamId 所属队伍ID
   */
  constructor(x, y, w, h, ownerTeamId) {
    this.ownerTeamId = ownerTeamId;
    this.width = w;
    this.height = h;
    this.x = x;
    this.y = y;
    
    // 门柱半径
    const postRadius = 8;
    
    // 墙壁厚度 (非常厚，防止穿透)
    const wallThick = 200; 

    // 创建一个 Composite 来容纳所有独立部件
    this.body = Matter.Composite.create();

    const isLeft = ownerTeamId === TeamId.LEFT;

    // --- A. 进球感应区 (Sensor) ---
    const sensor = Matter.Bodies.rectangle(x, y, w * 0.8, h * 0.8, {
      isStatic: true,
      isSensor: true, // 传感器模式
      label: 'GoalSensor', 
      render: { visible: false },
      collisionFilter: {
        category: CollisionCategory.GOAL,
        mask: CollisionCategory.BALL // 只检测球
      }
    });
    sensor.entity = this; 
    Matter.Composite.add(this.body, sensor);

    // --- B. 实体墙壁 (Net Walls) ---
    const wallOptions = {
      isStatic: true,
      label: 'GoalNet',
      render: { visible: false },
      restitution: 0.1, // 低弹性，吸能
      friction: 0.8,    
      collisionFilter: {
        category: CollisionCategory.WALL,
        mask: CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    };

    // 上墙 (Top)
    const topWall = Matter.Bodies.rectangle(x, y - h/2 - wallThick/2, w + wallThick, wallThick, wallOptions);
    Matter.Composite.add(this.body, topWall);
    
    // 下墙 (Bottom)
    const bottomWall = Matter.Bodies.rectangle(x, y + h/2 + wallThick/2, w + wallThick, wallThick, wallOptions);
    Matter.Composite.add(this.body, bottomWall);
    
    // 后墙 (Back)
    const visualOverlap = 2; 
    let backWallX;
    if (isLeft) {
        backWallX = (x - w/2) - wallThick/2 + visualOverlap;
    } else {
        backWallX = (x + w/2) + wallThick/2 - visualOverlap;
    }
    const backWall = Matter.Bodies.rectangle(backWallX, y, wallThick, h + wallThick*2, wallOptions);
    Matter.Composite.add(this.body, backWall);

    // --- C. 门柱 (Posts) ---
    const postOptions = {
      isStatic: true,
      label: 'GoalPost',
      restitution: 1.0, 
      render: { visible: false },
      collisionFilter: {
        category: CollisionCategory.WALL,
        mask: CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    };

    const openX = isLeft ? (x + w/2) : (x - w/2);
    const post1 = Matter.Bodies.circle(openX, y - h/2, postRadius, postOptions);
    const post2 = Matter.Bodies.circle(openX, y + h/2, postRadius, postOptions);
    
    Matter.Composite.add(this.body, [post1, post2]);

    // 视觉由场景的前景层统一处理，此处不再创建 PIXI Container
    this.view = null;
  }
}
