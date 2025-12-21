
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
    // 墙壁厚度
    const wallThick = 10;

    // 1. 构建物理结构 (Parts)
    const isLeft = ownerTeamId === TeamId.LEFT;
    
    // 根据左右球门决定开口方向
    // 左边球门：开口朝右，墙壁在左、上、下
    // 右边球门：开口朝左，墙壁在右、上、下
    
    const parts = [];

    // --- A. 进球感应区 (Sensor) ---
    // 放在球门内部中心
    const sensor = Matter.Bodies.rectangle(x, y, w * 0.8, h * 0.8, {
      isStatic: true,
      isSensor: true, // 只检测不碰撞
      label: 'GoalSensor', // 专门的 Label 用于计分
      render: { visible: false },
      collisionFilter: {
        category: CollisionCategory.GOAL,
        mask: CollisionCategory.BALL // 只检测球
      }
    });
    sensor.entity = this; // 绑定实体引用用于计分
    parts.push(sensor);

    // --- B. 实体墙壁 (Net Walls) ---
    // 墙壁用于兜住球和棋子，防止飞出屏幕
    // 它们属于 WALL 类型
    const wallOptions = {
      isStatic: true,
      label: 'GoalNet',
      render: { visible: false },
      restitution: 0.2, // 网兜比较软，弹性低
      collisionFilter: {
        category: CollisionCategory.WALL,
        mask: CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    };

    // 上墙 (Top)
    parts.push(Matter.Bodies.rectangle(x, y - h/2 - wallThick/2, w, wallThick, wallOptions));
    // 下墙 (Bottom)
    parts.push(Matter.Bodies.rectangle(x, y + h/2 + wallThick/2, w, wallThick, wallOptions));
    
    // 后墙 (Back) - 左球门的后墙在左侧，右球门的后墙在右侧
    const backWallX = isLeft ? (x - w/2 - wallThick/2) : (x + w/2 + wallThick/2);
    parts.push(Matter.Bodies.rectangle(backWallX, y, wallThick, h + wallThick*2, wallOptions));

    // --- C. 门柱 (Posts) ---
    // 位于开口处的两个角，坚硬，高反弹
    const postOptions = {
      isStatic: true,
      label: 'GoalPost',
      restitution: 1.0, // 门柱很硬
      render: { visible: false },
      collisionFilter: {
        category: CollisionCategory.WALL,
        mask: CollisionCategory.BALL | CollisionCategory.STRIKER
      }
    };

    // 开口X坐标
    const openX = isLeft ? (x + w/2) : (x - w/2);
    
    // 上门柱
    parts.push(Matter.Bodies.circle(openX, y - h/2, postRadius, postOptions));
    // 下门柱
    parts.push(Matter.Bodies.circle(openX, y + h/2, postRadius, postOptions));

    // 组合成一个刚体
    this.body = Matter.Body.create({
      parts: parts,
      isStatic: true
    });

    // 2. Pixi 视图
    this.view = new PIXI.Container();
    this.drawVisuals(w, h, isLeft, postRadius);
    this.view.position.set(x, y);
  }

  drawVisuals(w, h, isLeft, postRadius) {
    const g = new PIXI.Graphics();
    
    // 颜色定义
    const netColor = 0xFFFFFF;
    const postColor = 0xDDDDDD;
    const teamColor = isLeft ? 0xe74c3c : 0x3498db; // 红/蓝

    // 坐标系：基于 Container 中心 (0,0) 即球门中心
    
    // --- 1. 绘制网格 (Net Pattern) ---
    g.beginPath();
    // 绘制网格线
    const gridSpacing = 20;
    
    // 裁剪区域 (球门内部)
    const left = -w/2;
    const right = w/2;
    const top = -h/2;
    const bottom = h/2;

    // 绘制横线
    for (let i = top; i <= bottom; i += gridSpacing) {
        g.moveTo(left, i);
        g.lineTo(right, i);
    }
    // 绘制竖线
    for (let i = left; i <= right; i += gridSpacing) {
        g.moveTo(i, top);
        g.lineTo(i, bottom);
    }
    g.stroke({ width: 1, color: netColor, alpha: 0.3 });

    // --- 2. 绘制网兜背景 (半透明) ---
    g.rect(left, top, w, h);
    g.fill({ color: teamColor, alpha: 0.1 }); // 淡淡的队伍色

    // --- 3. 绘制门框 (U型结构) ---
    // 很粗的白线表示门框底座
    g.beginPath();
    if (isLeft) {
        // [ shape
        g.moveTo(right, top);
        g.lineTo(left, top);
        g.lineTo(left, bottom);
        g.lineTo(right, bottom);
    } else {
        // ] shape
        g.moveTo(left, top);
        g.lineTo(right, top);
        g.lineTo(right, bottom);
        g.lineTo(left, bottom);
    }
    g.stroke({ width: 6, color: 0xFFFFFF });

    // --- 4. 绘制门柱 (Posts) ---
    const openX = isLeft ? right : left;
    
    // 上门柱
    g.circle(openX, top, postRadius + 2);
    g.fill(postColor);
    g.stroke({ width: 2, color: 0x888888 });

    // 下门柱
    g.circle(openX, bottom, postRadius + 2);
    g.fill(postColor);
    g.stroke({ width: 2, color: 0x888888 });

    // --- 5. 绘制进球线 (Goal Line) ---
    g.beginPath();
    g.moveTo(openX, top);
    g.lineTo(openX, bottom);
    g.stroke({ width: 3, color: 0xFFFFFF, alpha: 0.5 }); // 半透明白线

    this.view.addChild(g);
  }

  update() {
    // 静态物体无需更新位置
  }
}
