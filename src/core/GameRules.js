
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
        const bodyA = pairs[i].bodyA;
        const bodyB = pairs[i].bodyB;

        this.checkGoal(bodyA, bodyB);
      }
    });
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

    // 重置状态防止重复触发 (通常会等待几秒重置场景)
    setTimeout(() => {
      this.isGoalProcessing = false;
    }, 2000);
  }

  reset() {
    this.score = { [TeamId.LEFT]: 0, [TeamId.RIGHT]: 0 };
    this.isGoalProcessing = false;
  }
}
