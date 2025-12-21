import Matter from 'matter-js';
import { GameConfig } from '../config.js';

export default class PhysicsEngine {
  constructor() {
    this.engine = null;
    this.runner = null;
  }

  init() {
    // 创建物理引擎，关闭重力
    this.engine = Matter.Engine.create({
      gravity: GameConfig.physics.gravity
    });

    // 创建运行器
    this.runner = Matter.Runner.create();
    
    console.log('[PhysicsEngine] Initialized');
  }

  /**
   * 每一帧更新物理世界
   * @param {number} delta - 时间增量 (ms)
   */
  update(delta) {
    if (this.engine) {
      Matter.Engine.update(this.engine, delta);
    }
  }

  /**
   * 添加物体到世界
   * @param {Matter.Body | Matter.Composite} body 
   */
  add(body) {
    Matter.World.add(this.engine.world, body);
  }

  /**
   * 获取点击位置下的物体
   * @param {number} x 
   * @param {number} y 
   * @returns {Matter.Body[]}
   */
  queryPoint(x, y) {
    const bodies = Matter.Composite.allBodies(this.engine.world);
    return Matter.Query.point(bodies, { x, y });
  }

  /**
   * 判断世界是否静止 (用于回合判定)
   */
  isSleeping() {
    const bodies = Matter.Composite.allBodies(this.engine.world);
    const VELOCITY_THRESHOLD = 0.1;
    
    // 过滤掉静态墙壁，检查所有动态物体速度
    return bodies.every(body => {
      if (body.isStatic) return true;
      return body.speed < VELOCITY_THRESHOLD && body.angularSpeed < VELOCITY_THRESHOLD;
    });
  }

  clear() {
    if (this.engine) {
      Matter.World.clear(this.engine.world, false);
      Matter.Engine.clear(this.engine);
    }
  }
}