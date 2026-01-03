
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
      gravity: GameConfig.physics.gravity,
      // 提高迭代次数以提升精度，减少穿墙
      positionIterations: 8, 
      velocityIterations: 6
    });

    console.log('[PhysicsEngine] Initialized');
  }

  /**
   * 每一帧更新物理世界
   * @param {number} delta - 固定时间步长 (ms)
   */
  update(delta) {
    if (this.engine) {
      // [核心修改] 强制使用外部传入的 delta (应由 GameScene 保证为固定 16.66ms)
      // 这样能保证在不同刷新率设备上，物理模拟的步长一致，从而保证碰撞结果一致
      Matter.Engine.update(this.engine, delta);
      
      // 在物理计算后，应用自定义的“急停”逻辑
      this.applyStoppingFriction();
    }
  }

  /**
   * 应用低速刹车逻辑
   * 解决物体在低速时滑行太久不符合直觉的问题
   */
  applyStoppingFriction() {
    const config = GameConfig.physics.stoppingFriction;
    if (!config || !config.enabled) return;
    
    if (!this.engine) return; // 安全检查

    const bodies = Matter.Composite.allBodies(this.engine.world);

    for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        
        // 只处理动态物体 (足球和棋子)
        if (body.isStatic) continue;
        if (body.label !== 'Ball' && body.label !== 'Striker') continue;

        if (body.frictionAir === 0) continue;

        const speed = body.speed;
        
        // 1. 如果速度已经非常小，直接强制静止，避免微小抖动
        if (speed < config.minSpeed) {
            Matter.Body.setVelocity(body, { x: 0, y: 0 });
            Matter.Body.setAngularVelocity(body, 0);
            continue;
        }

        // 2. 如果速度低于“刹车阈值”，则施加额外的强力阻尼
        if (speed < config.threshold) {
            Matter.Body.setVelocity(body, {
                x: body.velocity.x * config.damping,
                y: body.velocity.y * config.damping
            });
            
            // 同时衰减旋转速度
            Matter.Body.setAngularVelocity(body, body.angularVelocity * config.damping);
        }
    }
  }

  /**
   * 添加物体到世界
   * @param {Matter.Body | Matter.Composite} body 
   */
  add(body) {
    if (!this.engine) return;
    Matter.World.add(this.engine.world, body);
  }

  /**
   * 获取点击位置下的物体
   * @param {number} x 
   * @param {number} y 
   * @returns {Matter.Body[]}
   */
  queryPoint(x, y) {
    if (!this.engine) return [];
    const bodies = Matter.Composite.allBodies(this.engine.world);
    return Matter.Query.point(bodies, { x, y });
  }

  /**
   * 判断世界是否静止 (用于回合判定)
   */
  isSleeping() {
    if (!this.engine) return true; 

    const bodies = Matter.Composite.allBodies(this.engine.world);
    const VELOCITY_THRESHOLD = GameConfig.physics.stoppingFriction.minSpeed || 0.1; 
    
    // 过滤掉静态墙壁，检查所有动态物体速度
    return bodies.every(body => {
      if (body.isStatic) return true;
      return body.speed < VELOCITY_THRESHOLD && Math.abs(body.angularVelocity) < VELOCITY_THRESHOLD;
    });
  }

  clear() {
    if (this.engine) {
      Matter.World.clear(this.engine.world, false);
      Matter.Engine.clear(this.engine);
      this.engine = null; // 显式置空
    }
  }
}