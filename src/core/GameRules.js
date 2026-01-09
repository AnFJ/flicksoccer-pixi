
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
    
    this.isGoalProcessing = false; 
    this.lastGoalTime = 0; // [新增] 进球时间锁
    
    // [修改] 保存回调引用以便移除
    this.collisionHandler = (event) => this.onCollisionStart(event);
    this.initCollisionEvents();
  }

  initCollisionEvents() {
    if (this.engine) {
        Matter.Events.on(this.engine, 'collisionStart', this.collisionHandler);
    }
  }

  // [新增] 清理方法
  destroy() {
      if (this.engine) {
          Matter.Events.off(this.engine, 'collisionStart', this.collisionHandler);
      }
      this.engine = null;
  }

  onCollisionStart(event) {
      const pairs = event.pairs;

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        this.checkGoal(bodyA, bodyB);
        this.checkNetCollision(bodyA, bodyB);
        this.checkStrikerBallCollision(pair);
        this.checkSoundEffects(pair);
      }
  }

  /**
   * 检查并触发音效
   */
  checkSoundEffects(pair) {
      const { bodyA, bodyB } = pair;
      
      const relativeVelocity = Matter.Vector.sub(bodyA.velocity, bodyB.velocity);
      const intensity = Matter.Vector.magnitude(relativeVelocity);

      const SOUND_THRESHOLD = 1.0; 

      if (intensity < SOUND_THRESHOLD) return;

      const labels = [bodyA.label, bodyB.label];

      // [修改] 足球撞击棋子的音效逻辑已移至 checkStrikerBallCollision 统一处理，此处忽略
      if (labels.includes('Ball') && labels.includes('Striker')) {
          return;
      }

      // 1. 足球撞墙
      if (labels.includes('Ball')) {
          const other = bodyA.label === 'Ball' ? bodyB : bodyA;
          if (other.label && other.label.includes('Wall')) {
              EventBus.emit(Events.PLAY_SOUND, 'hit_wall');
              return;
          }
      }

      // 2. 棋子撞墙 (新增)
      if (labels.includes('Striker')) {
          const other = bodyA.label === 'Striker' ? bodyB : bodyA;
          // 检查是否撞到了墙壁 (WallTop, WallBottom, GoalNet 等)
          if (other.label && (other.label.includes('Wall') || other.label.includes('GoalNet'))) {
              EventBus.emit(Events.PLAY_SOUND, 'striker_hit_edge');
              return;
          }
      }

      // 3. 棋子撞棋子 (新增分级音效)
      if (bodyA.label === 'Striker' && bodyB.label === 'Striker') {
          let soundKey = 'striker_hit_striker_3'; // 默认小声
          if (intensity > 12) {
              soundKey = 'striker_hit_striker_1'; // 大速度 (强力碰撞)
          } else if (intensity > 6) {
              soundKey = 'striker_hit_striker_2'; // 中速度
          }
          EventBus.emit(Events.PLAY_SOUND, soundKey);
          return;
      }

      // 4. 足球撞门柱
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
        const relativeVelocity = Matter.Vector.sub(ball.velocity, striker.velocity);
        const intensity = Matter.Vector.magnitude(relativeVelocity);

        // [新增] 根据强度分级播放音效
        if (intensity > 1.0) {
            let soundKey = 'ball_hit_striker_3'; // 默认小
            if (intensity > 15) {
                soundKey = 'ball_hit_striker_1'; // 大速度 (暴力射门)
            } else if (intensity > 8) {
                soundKey = 'ball_hit_striker_2'; // 中速度
            }
            EventBus.emit(Events.PLAY_SOUND, soundKey);

            // 产生火花特效
            let contactX, contactY;
            if (pair.collision.supports && pair.collision.supports.length > 0) {
                const contact = pair.collision.supports[0];
                contactX = contact.x;
                contactY = contact.y;
            } else {
                contactX = (ball.position.x + striker.position.x) / 2;
                contactY = (ball.position.y + striker.position.y) / 2;
            }

            EventBus.emit(Events.COLLISION_HIT, {
                x: contactX,
                y: contactY,
                intensity: intensity
            });
        }
    }
  }

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
        if (dynamicBody.label === 'Ball' || dynamicBody.label === 'Striker') {
            const dampingFactor = 0.2; 
            Matter.Body.setVelocity(dynamicBody, {
                x: dynamicBody.velocity.x * dampingFactor,
                y: dynamicBody.velocity.y * dampingFactor
            });
            Matter.Body.setAngularVelocity(dynamicBody, dynamicBody.angularVelocity * dampingFactor);
        }
    }
  }

  checkGoal(bodyA, bodyB) {
    // [修改] 增加时间锁检查，防止短时间(2秒)内多次触发
    if (this.isGoalProcessing || (Date.now() - this.lastGoalTime < 2000)) return;

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

  handleGoal(goalEntity) {
    this.isGoalProcessing = true;
    this.lastGoalTime = Date.now(); // [新增] 更新时间戳
    
    const defenseTeam = goalEntity.ownerTeamId;
    const scoreTeam = defenseTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;

    this.score[scoreTeam]++;
    console.log(`[GameRules] GOAL! Team ${scoreTeam} scores! Current: ${JSON.stringify(this.score)}`);

    EventBus.emit(Events.GOAL_SCORED, {
      scoreTeam: scoreTeam,
      newScore: this.score
    });

    if (this.score[scoreTeam] >= GameConfig.gameplay.maxScore) {
      EventBus.emit(Events.GAME_OVER, { winner: scoreTeam });
    }
  }

  resetProcessingState() {
      this.isGoalProcessing = false;
  }

  reset() {
    this.score = { [TeamId.LEFT]: 0, [TeamId.RIGHT]: 0 };
    this.isGoalProcessing = false;
    this.lastGoalTime = 0;
  }
}
