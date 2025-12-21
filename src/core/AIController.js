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

    // 简单逻辑：找到离球最近的棋子，朝球踢过去
    // 进阶逻辑可以考虑：进攻球门方向、防守站位等

    let bestStriker = null;
    let minDist = Infinity;

    strikers.forEach(striker => {
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
      
      // 随机力度，避免太强或太弱
      // GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier 大约是最大力
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