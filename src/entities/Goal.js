
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

    // --- 物理参数优化 ---
    // 1. Y轴偏移：让网兜比门柱更"宽"，防止侧面蹭到
    const netOffsetY = 20; 
    
    // 2. X轴缩进：让网兜侧壁不接触球门线，必须进门了才会碰到。
    // 球半径约20px，缩进25px确保球在门线上绝对碰不到网兜
    const netRetractX = 25; 

    // 创建一个 Composite 来容纳所有独立部件
    this.body = Matter.Composite.create();

    const isLeft = ownerTeamId === TeamId.LEFT;

    // --- A. 进球感应区 (Sensor) ---
    // Sensor 保持原位，确保过线就算进球
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
      restitution: 0.0, // 无弹性
      friction: 1.0,    // 高摩擦
      frictionStatic: 1.0,
      collisionFilter: {
        category: CollisionCategory.WALL,
        mask: CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    };

    // 计算侧壁的几何形状 (缩进后的)
    let sideWallW = w - netRetractX;
    let sideWallX;

    if (isLeft) {
        sideWallX = x - netRetractX / 2;
    } else {
        sideWallX = x + netRetractX / 2;
    }

    // 上墙 (Top)
    const topWallY = y - h/2 - wallThick/2 - netOffsetY;
    const topWall = Matter.Bodies.rectangle(sideWallX, topWallY, sideWallW, wallThick, wallOptions);
    Matter.Composite.add(this.body, topWall);
    
    // 下墙 (Bottom)
    const bottomWallY = y + h/2 + wallThick/2 + netOffsetY;
    const bottomWall = Matter.Bodies.rectangle(sideWallX, bottomWallY, sideWallW, wallThick, wallOptions);
    Matter.Composite.add(this.body, bottomWall);
    
    // 后墙 (Back) - 位置不变
    const visualOverlap = 2; 
    let backWallX;
    if (isLeft) {
        backWallX = (x - w/2) - wallThick/2 + visualOverlap;
    } else {
        backWallX = (x + w/2) + wallThick/2 - visualOverlap;
    }
    const backWallH = h + wallThick*2 + netOffsetY*2;
    const backWall = Matter.Bodies.rectangle(backWallX, y, wallThick, backWallH, wallOptions);
    Matter.Composite.add(this.body, backWall);

    // --- C. 门柱 (Posts) ---
    // 门柱在球门线上，位置不变
    const postOptions = {
      isStatic: true,
      label: 'GoalPost',
      restitution: 1.0, // 门柱高弹性
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

    // --- D. 调试视图 (适配 Pixi v7) ---
    this.view = null;
    if (GameConfig.debug && GameConfig.debug.showGoalZones) {
        this.view = new PIXI.Container();
        
        // 1. 绘制感应区 (半透明黄色)
        const g = new PIXI.Graphics();
        g.beginFill(0xFFFF00, 0.4);
        g.drawRect(x - (w*0.8)/2, y - (h*0.8)/2, w*0.8, h*0.8);
        g.endFill();
        
        // 2. 绘制网兜墙壁 (半透明红色)
        g.beginFill(0xFF0000, 0.3);
        // 上墙
        g.drawRect(sideWallX - sideWallW/2, topWallY - wallThick/2, sideWallW, wallThick);
        // 下墙
        g.drawRect(sideWallX - sideWallW/2, bottomWallY - wallThick/2, sideWallW, wallThick);
        // 后墙
        g.drawRect(backWallX - wallThick/2, y - backWallH/2, wallThick, backWallH);
        g.endFill();
        
        // 3. 门柱 (白色)
        g.beginFill(0xFFFFFF);
        g.drawCircle(openX, y - h/2, postRadius);
        g.drawCircle(openX, y + h/2, postRadius);
        g.endFill();

        this.view.addChild(g);
    }
  }
}
