
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';
import AIDecisionMaker from './AIDecisionMaker.js';

export default class AIController {
  /**
   * @param {Object} scene 场景引用
   * @param {import('./PhysicsEngine').default} physics 
   * @param {TeamId} teamId AI所属队伍
   * @param {Object} levelConfig 关卡配置
   */
  constructor(scene, physics, teamId, levelConfig) {
    this.scene = scene;
    this.physics = physics;
    this.teamId = teamId;
    
    // 默认配置兜底
    this.config = levelConfig || {
        aiError: 0.2,
        powerMultiplier: 0.6,
        strategyDepth: 0,
        defenseAwareness: 0,
        skills: [],
        skillRate: 0
    };

    // 初始化决策大脑
    this.brain = new AIDecisionMaker(scene, teamId);
  }

  /**
   * AI 思考主入口
   */
  think(myStrikers, ball) {
    if (!ball || myStrikers.length === 0) return null;

    // 1. 尝试使用技能 (保持原有逻辑，简单随机)
    this._tryActivateSkill();

    // 2. 获取对手棋子 (用于决策分析)
    const oppStrikers = this.scene.strikers.filter(s => s.teamId !== this.teamId);

    // 3. 调用大脑进行决策
    const decision = this.brain.decide(myStrikers, oppStrikers, ball, this.config);

    if (decision) {
        // 4. 应用执行误差 (模拟人类操作的不完美)
        const finalForce = this._applyHumanError(decision.force);
        
        return {
            striker: decision.striker,
            force: finalForce
        };
    }

    return null;
  }

  _tryActivateSkill() {
      if (Math.random() < this.config.skillRate && this.config.skills.length > 0) {
          const skill = this.config.skills[Math.floor(Math.random() * this.config.skills.length)];
          
          if (this.scene.ball) {
              if (skill === 'unstoppable') {
                  this.scene.ball.activateUnstoppable(3000);
              } else if (skill === 'super_force') {
                  this.scene.ball.setLightningMode(true);
              }
          }
      }
  }

  _applyHumanError(force) {
      // 角度误差
      const angleError = (Math.random() - 0.5) * 2 * this.config.aiError;
      // 力度误差 (Level越高误差越小)
      const powerNoise = 1.0 + (Math.random() - 0.5) * this.config.aiError * 0.5;

      const rotated = Matter.Vector.rotate(force, angleError);
      return Matter.Vector.mult(rotated, powerNoise);
  }
}
