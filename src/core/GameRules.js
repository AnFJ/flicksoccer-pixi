
import Matter from 'matter-js';
import EventBus from '../managers/EventBus.js';
import { Events, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';

export default class GameRules {
  /**
   * @param {PhysicsEngine} physicsEngine 
   */
  constructor(physicsEngine) {
    this.engine = physicsEngine.engine;
    this.score = {
      [TeamId.LEFT]: 0,
      [TeamId.RIGHT]: 0
    };
    
    this.isGoalProcessing = false; // 防止一次进球触发多次碰撞

    this.initCollisionEvents();
  }

  initCollisionEvents() {
    Matter.Events.on(this.engine, 'collisionStart', (event) => {
      const pairs = event.pairs;

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // 1. 检查进球
        this.checkGoal(bodyA, bodyB);

        // 2. 检查撞网 (模拟网兜吸能)
        this.checkNetCollision(bodyA, bodyB);

        // 3. 检查 棋子 vs 足球 的碰撞，触发火星特效
        this.checkStrikerBallCollision(pair);

        // 4. [新增] 检查并触发各类碰撞音效
        this.checkSoundEffects(pair);
      }
    });
  }

  /**
   * 检查并触发音效
   * 逻辑：根据 body.label 判断碰撞类型，并根据相对速度过滤轻微碰撞
   */
  checkSoundEffects(pair) {
      const { bodyA, bodyB } = pair;
      
      // 计算相对速度 (强度)
      const relativeVelocity = Matter.Vector.sub(bodyA.velocity, bodyB.velocity);
      const intensity = Matter.Vector.magnitude(relativeVelocity);

      // 音效触发阈值 (避免静止接触或微小滑动时噪音)
      const SOUND_THRESHOLD = 1.0; 

      if (intensity < SOUND_THRESHOLD) return;

      const labels = [bodyA.label, bodyB.label];

      // 1. 足球 vs 棋子 (hit_ball)
      if (labels.includes('Ball') && labels.includes('Striker')) {
          EventBus.emit(Events.PLAY_SOUND, 'hit_ball');
          return;
      }

      // 2. 足球 vs 墙壁 (hit_wall)
      // 墙壁包括 WallTop, WallBottom, WallLeftTop 等，label 都包含 'Wall'
      if (labels.includes('Ball')) {
          const other = bodyA.label === 'Ball' ? bodyB : bodyA;
          if (other.label && other.label.includes('Wall')) {
              EventBus.emit(Events.PLAY_SOUND, 'hit_wall');
              return;
          }
      }

      // 3. 棋子 vs 棋子 (hit_striker)
      if (bodyA.label === 'Striker' && bodyB.label === 'Striker') {
          EventBus.emit(Events.PLAY_SOUND, 'hit_striker');
          return;
      }

      // 4. 足球 vs 球门框 (hit_post)
      // 这里的球门框是指门柱 (GoalPost)，不包含网兜 (GoalNet)
      if (labels.includes('Ball') && labels.includes('GoalPost')) {
           EventBus.emit(Events.PLAY_SOUND, 'hit_post');
           return;
      }
  }

  checkStrikerBallCollision(pair) {
    const { bodyA, bodyB } = pair;

    let ball = null;
    let striker = null;

    if (bodyA.label === 'Ball' && bodyB.label === 'Striker') {
        ball = bodyA;
        striker = bodyB;
    } else if (bodyB.label === 'Ball' && bodyA.label === 'Striker') {
        ball = bodyB;
        striker = bodyA;
    }

    if (ball && striker) {
        // 1. 计算碰撞力度 (相对速度 magnitude)
        // 这是一个近似值，对于视觉效果足够了
        const relativeVelocity = Matter.Vector.sub(ball.velocity, striker.velocity);
        const intensity = Matter.Vector.magnitude(relativeVelocity);

        // 只有达到一定速度才产生火星 (避免静止接触时不断闪烁)
        if (intensity > 1.0) {
            // 2. 获取碰撞点 (Contact Point)
            // Matter.js 通常提供 supports 数组
            let contactX, contactY;
            
            if (pair.collision.supports && pair.collision.supports.length > 0) {
                const contact = pair.collision.supports[0];
                contactX = contact.x;
                contactY = contact.y;
            } else {
                // 如果没有接触点信息，取两者中心的中点
                contactX = (ball.position.x + striker.position.x) / 2;
                contactY = (ball.position.y + striker.position.y) / 2;
            }

            // 3. 发送事件
            EventBus.emit(Events.COLLISION_HIT, {
                x: contactX,
                y: contactY,
                intensity: intensity
            });
        }
    }
  }

  /**
   * 检查是否撞到了球网内壁 (GoalNet)
   * 物理引擎默认会取两者最大的弹性系数，导致球会从无弹性的墙上弹飞。
   * 这里我们手动干预，撞网时强制大幅减速。
   */
  checkNetCollision(bodyA, bodyB) {
    let net = null;
    let dynamicBody = null;

    if (bodyA.label === 'GoalNet') {
        net = bodyA;
        dynamicBody = bodyB;
    } else if (bodyB.label === 'GoalNet') {
        net = bodyB;
        dynamicBody = bodyA;
    }

    if (net && dynamicBody) {
        // 确保撞网的是球或者棋子
        if (dynamicBody.label === 'Ball' || dynamicBody.label === 'Striker') {
            
            // 吸收系数：0.2 表示保留 20% 的速度，吸收 80% 的能量
            const dampingFactor = 0.2; 
            
            Matter.Body.setVelocity(dynamicBody, {
                x: dynamicBody.velocity.x * dampingFactor,
                y: dynamicBody.velocity.y * dampingFactor
            });

            // 同时大幅减少旋转速度，防止球在网里疯狂旋转
            Matter.Body.setAngularVelocity(dynamicBody, dynamicBody.angularVelocity * dampingFactor);
        }
    }
  }

  /**
   * 检查进球
   */
  checkGoal(bodyA, bodyB) {
    if (this.isGoalProcessing) return;

    // 检查是否有 Ball 和 GoalSensor 的碰撞
    // 注意：现在 Goal 是复合刚体，碰撞事件中的 bodyA/bodyB 可能是复合体中的某个 Part
    // 我们在 Goal.js 中给 sensor part 设置了 label: 'GoalSensor'
    
    let ball = null;
    let goalSensor = null;

    if (this.isBall(bodyA) && this.isGoalSensor(bodyB)) {
      ball = bodyA;
      goalSensor = bodyB;
    } else if (this.isBall(bodyB) && this.isGoalSensor(bodyA)) {
      ball = bodyB;
      goalSensor = bodyA;
    }

    if (ball && goalSensor) {
      // 通过 sensor.entity 获取到 Goal 实例
      // 注意：bodyB 如果是 sensor part，它上面挂载了 entity
      if (goalSensor.entity) {
        this.handleGoal(goalSensor.entity);
      }
    }
  }

  isBall(body) {
    return body.label === 'Ball';
  }

  isGoalSensor(body) {
    return body.label === 'GoalSensor';
  }

  /**
   * 处理进球逻辑
   * @param {import('../entities/Goal').default} goalEntity 
   */
  handleGoal(goalEntity) {
    this.isGoalProcessing = true;
    
    // 规则：进谁的门，对方得分
    // goalEntity.ownerTeamId 是这个球门所属的队伍（防守方）
    const defenseTeam = goalEntity.ownerTeamId;
    const scoreTeam = defenseTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;

    // 增加分数
    this.score[scoreTeam]++;
    console.log(`[GameRules] GOAL! Team ${scoreTeam} scores! Current: ${JSON.stringify(this.score)}`);

    // 广播进球事件
    EventBus.emit(Events.GOAL_SCORED, {
      scoreTeam: scoreTeam,
      newScore: this.score
    });

    // 检查是否胜利
    if (this.score[scoreTeam] >= GameConfig.gameplay.maxScore) {
      EventBus.emit(Events.GAME_OVER, { winner: scoreTeam });
    }

    // [修复] 移除自动重置，由 GameScene 在 setupFormation 时手动调用 resetProcessingState
    // 这样可以避免慢速进球时，定时器先结束导致二次触发进球
  }

  // [新增] 手动重置进球处理状态 (供 GameScene 在重置球场时调用)
  resetProcessingState() {
      this.isGoalProcessing = false;
  }

  reset() {
    this.score = { [TeamId.LEFT]: 0, [TeamId.RIGHT]: 0 };
    this.isGoalProcessing = false;
  }
}
