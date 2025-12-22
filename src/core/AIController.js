
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

export default class AIController {
  /**
   * @param {import('./PhysicsEngine').default} physics 
   * @param {TeamId} teamId 
   */
  constructor(physics, teamId) {
    this.physics = physics;
    this.teamId = teamId;
  }

  /**
   * 计算最佳击球策略
   * @param {Array} strikers AI 的所有棋子
   * @param {Object} ball 足球实体
   * @returns {Object|null} { striker, force }
   */
  think(strikers, ball) {
    if (!ball || strikers.length === 0) return null;

    // --- 优化核心逻辑：防止乌龙球 ---
    // AI (假设是左方 Red, TeamId.LEFT = 0) 进攻方向是向右 (X 轴正方向)
    // AI 应该只选位于球左侧的棋子 (Striker.x < Ball.x)
    // 如果 AI 是右方 (TeamId.RIGHT)，则进攻方向是向左，只选球右侧的棋子 (Striker.x > Ball.x)

    const safetyMargin = 10; // 稍微有点容错
    let candidates = [];

    if (this.teamId === TeamId.LEFT) {
        // 红方：进攻右边。只选在球左边的棋子。
        candidates = strikers.filter(s => s.body.position.x < ball.body.position.x - safetyMargin);
    } else {
        // 蓝方：进攻左边。只选在球右边的棋子。
        candidates = strikers.filter(s => s.body.position.x > ball.body.position.x + safetyMargin);
    }

    // 如果没有完美的候选人（所有棋子都跑前面去了），
    // 降级策略：选一个离球最远的（通常是最后面的防守队员），或者随便选一个最近的
    // 为了安全起见，如果没有好的射门机会，就选最近的
    if (candidates.length === 0) {
        candidates = strikers; 
    }

    let bestStriker = null;
    let minDist = Infinity;

    candidates.forEach(striker => {
      const d = Matter.Vector.magnitude(Matter.Vector.sub(striker.body.position, ball.body.position));
      if (d < minDist) {
        minDist = d;
        bestStriker = striker;
      }
    });

    if (bestStriker) {
      // 计算方向向量：球的位置 - 棋子位置
      const dir = Matter.Vector.sub(ball.body.position, bestStriker.body.position);
      const normalizedDir = Matter.Vector.normalise(dir);
      
      // 随机力度
      const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
      const power = (0.5 + Math.random() * 0.5) * maxForce; 

      const force = Matter.Vector.mult(normalizedDir, power);

      return {
        striker: bestStriker,
        force: force
      };
    }

    return null;
  }
}
