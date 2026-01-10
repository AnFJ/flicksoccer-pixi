
import Matter from 'matter-js';
import EventBus from '../managers/EventBus.js';
import { Events, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';

export default class GameRules {
  /**
   * @param {PhysicsEngine} physicsEngine 
   * @param {GameScene} scene [新增] 传入场景引用以便判断游戏模式和回合
   */
  constructor(physicsEngine, scene) {
    this.engine = physicsEngine.engine;
    this.scene = scene; 
    this.score = {
      [TeamId.LEFT]: 0,
      [TeamId.RIGHT]: 0
    };
    
    this.isGoalProcessing = false; 
    this.lastGoalTime = 0;
    
    this.collisionHandler = (event) => this.onCollisionStart(event);
    this.initCollisionEvents();
  }

  initCollisionEvents() {
    if (this.engine) {
        Matter.Events.on(this.engine, 'collisionStart', this.collisionHandler);
    }
  }

  destroy() {
      if (this.engine) {
          Matter.Events.off(this.engine, 'collisionStart', this.collisionHandler);
      }
      this.engine = null;
      this.scene = null;
  }

  onCollisionStart(event) {
      const pairs = event.pairs;

      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        const bodyA = pair.bodyA;
        const bodyB = pair.bodyB;

        // [核心修改] 权限校验
        // 在网络对战中，只有“发送方 (Sender)”（当前操作者）有权检测进球
        // 接收方 (Receiver) 绝对禁止执行检测逻辑，完全由网络消息驱动
        const isOnline = this.scene && this.scene.gameMode === 'pvp_online';
        const isMyTurn = this.scene && this.scene.turnMgr.currentTurn === this.scene.myTeamId;
        
        const hasAuthority = !isOnline || isMyTurn;

        // 如果已经在处理进球中，则不再检测（防止短时间内重复触发）
        if (hasAuthority && !this.isGoalProcessing) {
            this.checkGoal(bodyA, bodyB);
        }
        
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

      // 2. 棋子撞墙
      if (labels.includes('Striker')) {
          const other = bodyA.label === 'Striker' ? bodyB : bodyA;
          if (other.label && (other.label.includes('Wall') || other.label.includes('GoalNet'))) {
              EventBus.emit(Events.PLAY_SOUND, 'striker_hit_edge');
              return;
          }
      }

      // 3. 棋子撞棋子
      if (bodyA.label === 'Striker' && bodyB.label === 'Striker') {
          let soundKey = 'striker_hit_striker_3'; 
          if (intensity > 12) {
              soundKey = 'striker_hit_striker_1';
          } else if (intensity > 6) {
              soundKey = 'striker_hit_striker_2';
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

        if (intensity > 1.0) {
            let soundKey = 'ball_hit_striker_3'; 
            if (intensity > 15) {
                soundKey = 'ball_hit_striker_1';
            } else if (intensity > 8) {
                soundKey = 'ball_hit_striker_2';
            }
            EventBus.emit(Events.PLAY_SOUND, soundKey);

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
    // 如果已经在处理进球，直接返回
    if (this.isGoalProcessing) return;

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
    // 锁定进球状态，防止重复检测
    this.isGoalProcessing = true;
    this.lastGoalTime = Date.now();
    
    const defenseTeam = goalEntity.ownerTeamId;
    const scoreTeam = defenseTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;

    this.score[scoreTeam]++;
    console.log(`[GameRules] GOAL! Team ${scoreTeam} scores! Current: ${JSON.stringify(this.score)}`);

    EventBus.emit(Events.GOAL_SCORED, {
      scoreTeam: scoreTeam,
      newScore: this.score
    });

    // 只有非联网模式才在此处检查结束。联网模式由 Sender 的逻辑层决定何时发送结束
    if (this.scene.gameMode !== 'pvp_online') {
        if (this.score[scoreTeam] >= GameConfig.gameplay.maxScore) {
            EventBus.emit(Events.GAME_OVER, { winner: scoreTeam });
        }
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
