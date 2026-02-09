
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
        skillRate: 0 // 这里的 skillRate 现在表示 AI 拥有技能资源的"充裕度"
    };

    // 初始化决策大脑
    this.brain = new AIDecisionMaker(scene, teamId);
  }

  /**
   * AI 思考主入口
   */
  think(myStrikers, ball) {
    if (!ball || myStrikers.length === 0) return null;

    // 1. 获取对手棋子 (用于决策分析)
    const oppStrikers = this.scene.strikers.filter(s => s.teamId !== this.teamId);

    // 2. 调用大脑进行决策
    const decision = this.brain.decide(myStrikers, oppStrikers, ball, this.config);

    if (decision) {
        // 3. 根据决策类型策略性使用技能
        this._applyStrategicSkills(decision);

        // 4. 应用执行误差 (模拟人类操作的不完美)
        const finalForce = this._applyHumanError(decision.force, decision.type);
        
        return {
            striker: decision.striker,
            force: finalForce
        };
    }

    return null;
  }

  /**
   * [优化] 策略性技能释放
   * 不再纯随机，而是根据战术意图决定
   */
  _applyStrategicSkills(decision) {
      if (!this.scene.ball || this.config.skills.length === 0) return;

      // 基础概率检查 (模拟 AI 是否有"蓝量"或冷却，等级越高概率越高)
      // 如果 skillRate 是 0，则永远不用技能
      if (Math.random() > this.config.skillRate) return;

      const type = decision.type;
      const availableSkills = this.config.skills;

      // 策略 A: 暴力破局 -> 必须大力或战车
      if (type === 'breakthrough' || type === 'sabotage') {
          if (availableSkills.includes('super_force') && Math.random() < 0.8) {
              this.scene.ball.setLightningMode(true);
              return; // 一次只用一个
          }
          if (availableSkills.includes('unstoppable') && Math.random() < 0.8) {
              this.scene.ball.activateUnstoppable(3000);
              return;
          }
      }

      // 策略 B: 远距离反弹/精准射门 -> 降低误差 (不仅是视觉，实际误差会在 _applyHumanError 中减少)
      // 这里可以加一点特效表示 AI 正在"瞄准"
      if (type === 'bank_shot' && availableSkills.includes('super_aim')) {
          // 逻辑上：标记一下，稍后在 error 计算时减少误差
          decision.isAiming = true;
      }

      // 策略 C: 紧急解围 -> 战车 (防止被拦截)
      if (type === 'clearance' && decision.score > 2000) { // 分数极高说明是非常紧急的解围
          if (availableSkills.includes('unstoppable') && Math.random() < 0.6) {
              this.scene.ball.activateUnstoppable(3000);
          }
      }
  }

  _applyHumanError(force, type) {
      // 基础误差
      let errorBase = this.config.aiError;

      // [优化] 如果使用了瞄准技能，或者是比较简单的操作，误差减小
      if (type === 'bank_shot' || type === 'breakthrough') {
          // 复杂操作本来误差就大，AI 需要更精准才能执行
          errorBase *= 0.5; 
      }

      // 角度误差
      const angleError = (Math.random() - 0.5) * 2 * errorBase;
      
      // 力度误差 (Level越高误差越小)
      // 破局模式下力度总是拉满，不需要误差
      let powerNoise = 1.0;
      if (type !== 'breakthrough' && type !== 'sabotage') {
          powerNoise = 1.0 + (Math.random() - 0.5) * errorBase * 0.5;
      }

      const rotated = Matter.Vector.rotate(force, angleError);
      return Matter.Vector.mult(rotated, powerNoise);
  }
}
