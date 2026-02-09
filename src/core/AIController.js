
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
        aiError: 0.15, // [优化] 默认误差降低，避免太蠢
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

    // 1. 获取对手棋子 (用于决策分析)
    const oppStrikers = this.scene.strikers.filter(s => s.teamId !== this.teamId);

    // 2. 调用大脑进行决策
    const decision = this.brain.decide(myStrikers, oppStrikers, ball, this.config);

    if (decision) {
        // 3. 根据决策类型策略性使用技能
        this._applyStrategicSkills(decision);

        // 4. 应用执行误差 (模拟人类操作的不完美)
        // [修改] 传入 ball 和 striker 对象，用于计算必中角度
        const finalForce = this._applyHumanError(decision.force, decision.type, decision.striker, ball);
        
        return {
            striker: decision.striker,
            force: finalForce
        };
    }

    return null;
  }

  /**
   * [优化] 策略性技能释放
   */
  _applyStrategicSkills(decision) {
      if (!this.scene.ball || this.config.skills.length === 0) return;

      if (Math.random() > this.config.skillRate) return;

      const type = decision.type;
      const availableSkills = this.config.skills;

      // 策略 A: 暴力破局 -> 必须大力或战车
      if (type === 'breakthrough' || type === 'sabotage') {
          if (availableSkills.includes('super_force') && Math.random() < 0.8) {
              this.scene.ball.setLightningMode(true);
              return; 
          }
          if (availableSkills.includes('unstoppable') && Math.random() < 0.8) {
              this.scene.ball.activateUnstoppable(3000);
              return;
          }
      }

      // 策略 B: 远距离反弹/精准射门 -> 标记瞄准
      if (type === 'bank_shot' && availableSkills.includes('super_aim')) {
          decision.isAiming = true;
      }

      // 策略 C: 紧急解围
      if (type === 'clearance' && decision.score > 2000) { 
          if (availableSkills.includes('unstoppable') && Math.random() < 0.6) {
              this.scene.ball.activateUnstoppable(3000);
          }
      }
  }

  /**
   * [核心修复] 应用人为误差，并使用绝对几何约束防止踢空
   */
  _applyHumanError(force, type, striker, ball) {
      // 1. 基础误差配置
      let errorBase = this.config.aiError;
      
      let angleNoise = 0;
      let safeFactor = 0.98; // 默认允许稍微边缘一点的击球

      // [核心修复] 10关+ (误差几乎为0) 的特殊处理
      if (errorBase <= 0.00001) {
          angleNoise = 0; 
          // [关键回滚] 恢复为 1.0 (允许全角度击球)。
          // 之前的 0.80 会强制 AI 把切球修正为推射，导致无法踢出需要的角度，进而导致"明明能进却不踢"或踢偏。
          // 我们在 AIDecisionMaker 中通过增加物理穿透深度来解决"擦边"问题，而不是在这里限制角度。
          safeFactor = 1.0; 
      } else {
          // 普通关卡，计算随机误差
          angleNoise = (Math.random() - 0.5) * 2 * errorBase;
      }

      if (type === 'bank_shot' || type === 'breakthrough') {
          // 特殊球种降低误差影响
          if (errorBase > 0.00001) angleNoise *= 0.5;
      }

      // 3. 计算“意图向量”的原始角度
      const intendedAngle = Math.atan2(force.y, force.x);
      
      // 4. 应用噪音后的候选角度 (这是 AI 打算踢出的方向)
      let finalAngle = intendedAngle + angleNoise;

      // 5. [新增] 绝对几何约束：确保最终角度仍在“必中扇区”内
      // 无论误差怎么偏，底线是不能完全 miss 球
      if (striker && striker.body && ball && ball.body) {
          const sPos = striker.body.position;
          const bPos = ball.body.position;
          
          const vecSB = Matter.Vector.sub(bPos, sPos);
          const dist = Matter.Vector.magnitude(vecSB);
          
          // 物理半径之和 (碰撞临界距离)
          const rStriker = GameConfig.dimensions.strikerDiameter / 2;
          const rBall = GameConfig.dimensions.ballDiameter / 2;
          const radiusSum = rStriker + rBall;
          
          if (dist > radiusSum) {
              // 计算 Striker 指向 Ball 中心的绝对角度
              const angleSB = Math.atan2(vecSB.y, vecSB.x);
              
              // 计算最大偏差角 (反正弦)
              // safeFactor 决定了锥体的大小。
              // 1.0 表示只要在物理接触范围内都允许 (asin(1) = 90度，即切线)
              const maxDeviation = Math.asin(Math.min(1.0, (radiusSum * safeFactor) / dist));
              
              // 计算 finalAngle 相对于 中心连线角度(angleSB) 的偏差
              let diff = finalAngle - angleSB;
              
              // 角度标准化到 -PI ~ PI
              while (diff > Math.PI) diff -= Math.PI * 2;
              while (diff < -Math.PI) diff += Math.PI * 2;
              
              // 如果偏差超出了必然碰撞的扇区，强制钳制
              if (Math.abs(diff) > maxDeviation) {
                  // 保留偏离方向 (左偏还是右偏)，但限制幅度
                  const clampedDiff = Math.sign(diff) * maxDeviation;
                  finalAngle = angleSB + clampedDiff;
                  // console.log(`[AI] Miss prevented. Dist: ${dist.toFixed(0)}, Angle clamped to hit edge.`);
              }
          }
      }

      // 6. 重建力向量
      const forceMag = Matter.Vector.magnitude(force);
      
      // 力度误差
      let powerNoise = 1.0;
      if (type !== 'breakthrough' && type !== 'sabotage') {
          // 只有在有误差配置时才添加力度噪点
          if (errorBase > 0) {
              powerNoise = 1.0 + (Math.random() - 0.5) * errorBase * 0.5;
          }
      }
      
      return {
          x: Math.cos(finalAngle) * forceMag * powerNoise,
          y: Math.sin(finalAngle) * forceMag * powerNoise
      };
  }
}
