
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

    // 可以在这里设置 timing，但在 update 中手动控制更稳
    // Matter.js 默认是变步长的，这会导致不同帧率设备物理结果不同
    
    console.log('[PhysicsEngine] Initialized');
  }

  /**
   * 每一帧更新物理世界
   * @param {number} delta - 这里的 delta 实际上我们不直接传给 engine.update
   * 为了保证确定性，我们强制传固定值
   */
  update(delta) {
    if (this.engine) {
      // [核心修改] 强制固定时间步长 16.666ms (60FPS)
      // 无论屏幕刷新率是 120Hz 还是 30Hz，物理世界每一步都按 16.66ms 走
      // 注意：这需要在 GameScene 的 accumulator 逻辑配合下使用
      // Matter.Engine.update 的第二个参数是 correction，第三个是 delta (默认为 16.666)
      
      // 我们显式传入 16.666，确保不同设备计算一致
      const FIXED_TIMESTEP = 1000 / 60;
      
      Matter.Engine.update(this.engine, FIXED_TIMESTEP);
      
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
