
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
    // 这种方式比 Body.create({ parts }) 更稳定，避免了复杂形状的碰撞计算错误
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
    // 微调：让物理墙壁稍微向球门内部“入侵” 2px，确保物体在视觉碰到线之前就被物理挡住，避免视觉上的“穿线”
    const visualOverlap = 2; 
    
    // 计算位置
    let backWallX;
    if (isLeft) {
        // 左球门，开口朝右，后墙在左侧
        // 视觉左边缘: x - w/2
        // 物理中心: 视觉边缘 - 墙厚的一半 + 重叠修正
        backWallX = (x - w/2) - wallThick/2 + visualOverlap;
    } else {
        // 右球门，开口朝左，后墙在右侧
        // 视觉右边缘: x + w/2
        // 物理中心: 视觉边缘 + 墙厚的一半 - 重叠修正
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

    // 2. Pixi 视图
    this.view = new PIXI.Container();
    this.drawVisuals(w, h, isLeft, postRadius);
    this.view.position.set(x, y);
  }

  drawVisuals(w, h, isLeft, postRadius) {
    const g = new PIXI.Graphics();
    
    const netColor = 0xFFFFFF;
    const postColor = 0xDDDDDD;
    const teamColor = isLeft ? 0xe74c3c : 0x3498db; 

    const gridSpacing = 20;
    const left = -w/2;
    const right = w/2;
    const top = -h/2;
    const bottom = h/2;

    // 绘制网格
    g.beginPath();
    for (let i = top; i <= bottom; i += gridSpacing) {
        g.moveTo(left, i);
        g.lineTo(right, i);
    }
    for (let i = left; i <= right; i += gridSpacing) {
        g.moveTo(i, top);
        g.lineTo(i, bottom);
    }
    g.stroke({ width: 1, color: netColor, alpha: 0.3 });

    // 背景
    g.rect(left, top, w, h);
    g.fill({ color: teamColor, alpha: 0.1 });

    // 门框
    g.beginPath();
    if (isLeft) {
        g.moveTo(right, top);
        g.lineTo(left, top);
        g.lineTo(left, bottom);
        g.lineTo(right, bottom);
    } else {
        g.moveTo(left, top);
        g.lineTo(right, top);
        g.lineTo(right, bottom);
        g.lineTo(left, bottom);
    }
    g.stroke({ width: 6, color: 0xFFFFFF });

    // 门柱
    const openX = isLeft ? right : left;
    g.circle(openX, top, postRadius + 2);
    g.fill(postColor);
    g.stroke({ width: 2, color: 0x888888 });

    g.circle(openX, bottom, postRadius + 2);
    g.fill(postColor);
    g.stroke({ width: 2, color: 0x888888 });

    // 进球线
    g.beginPath();
    g.moveTo(openX, top);
    g.lineTo(openX, bottom);
    g.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.5 });

    this.view.addChild(g);
  }

  update() {}
}
