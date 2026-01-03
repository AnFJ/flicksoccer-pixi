
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

export default class AIController {
  /**
   * @param {Object} scene 场景引用
   * @param {import('./PhysicsEngine').default} physics 
   * @param {TeamId} teamId 
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
        skills: [],
        skillRate: 0
    };
  }

  /**
   * AI 思考主入口
   */
  think(strikers, ball) {
    if (!ball || strikers.length === 0) return null;

    // 1. 技能决策
    this._tryActivateSkill();

    // 2. 筛选可用棋子 (只选在球后方的)
    let candidates = this._getCandidates(strikers, ball);
    
    // 3. 寻找最佳射门方案
    let bestAction = null;
    let maxScore = -Infinity;

    for (const striker of candidates) {
        // A. 直线射门评估
        const directShot = this._evaluateDirectShot(striker, ball);
        if (directShot.score > maxScore) {
            maxScore = directShot.score;
            bestAction = directShot;
        }

        // B. 反弹射门评估 (Strategy Depth >= 2)
        if (this.config.strategyDepth >= 2) {
            const bankShot = this._evaluateBankShot(striker, ball);
            if (bankShot && bankShot.score > maxScore) {
                maxScore = bankShot.score;
                bestAction = bankShot;
            }
        }
    }

    // 如果没找到好的方案，就选离球最近的随便踢一脚
    if (!bestAction) {
        bestAction = this._fallbackShot(candidates, ball);
    }

    // 4. 应用人为误差 (模拟不同难度)
    if (bestAction) {
        bestAction.force = this._applyHumanError(bestAction.force);
    }

    return bestAction;
  }

  _tryActivateSkill() {
      // 随机判定是否使用技能
      if (Math.random() < this.config.skillRate && this.config.skills.length > 0) {
          // 随机选一个技能
          const skill = this.config.skills[Math.floor(Math.random() * this.config.skills.length)];
          
          // 调用 Scene 的 SkillMgr 激活 (模拟点击)
          // 注意：需要 SkillMgr 支持传入 teamId 来强制激活 AI 技能，或者 AI 也有自己的 activeSkills 状态
          // 这里简化处理：AI 直接操作自己的 activeSkills 逻辑，或者复用 SkillManager
          // 由于 SkillManager 目前设计主要是给 UI 用的，我们通过 Scene 接口调用
          if (this.scene.skillMgr) {
              // Hack: 强制激活 AI 端的技能状态
              // 实际项目中应该给 AI 独立的 SkillManager 实例，或者 SkillManager 支持多实例
              // 这里我们假设 SkillManager.activeSkills 是针对"当前操作者"的。
              // 由于 AI 思考时就是 AI 的回合，我们模拟一次点击
              // 但为了不影响 UI 显示 (UI显示的是玩家的技能)，我们需要区分。
              // 简单做法：直接在 AI 内部标记，然后在 InputController 发送 MOVE 时带上。
              // 鉴于目前架构，我们在 GameScene.js 的 onActionFired 会重置所有技能。
              // 我们直接调用 toggle，但传入 AI 的 TeamId (SkillManager 需要适配)
              
              // 现阶段最稳妥的方式：直接修改球的状态 (如果是 Buff 类)
              // 并在 Input/TurnManager 射门时带上特效
              
              if (this.scene.ball) {
                  if (skill === 'unstoppable') {
                      this.scene.ball.activateUnstoppable(3000);
                  } else if (skill === 'super_force') {
                      this.scene.ball.setLightningMode(true);
                  }
                  // Super Aim 对 AI 来说只是视觉效果，AI 本身计算已经是“瞄准”了
                  // 如果想展示辅助线给玩家看 AI 的路径，比较复杂，暂略。
              }
          }
      }
  }

  _getCandidates(strikers, ball) {
    const margin = 5;
    if (this.teamId === TeamId.LEFT) {
        return strikers.filter(s => s.body.position.x < ball.body.position.x - margin);
    } else {
        return strikers.filter(s => s.body.position.x > ball.body.position.x + margin);
    }
  }

  _evaluateDirectShot(striker, ball) {
      const sPos = striker.body.position;
      const bPos = ball.body.position;
      
      // 向量：棋子 -> 球
      const dir = Matter.Vector.sub(bPos, sPos);
      const dist = Matter.Vector.magnitude(dir);
      const normalDir = Matter.Vector.normalise(dir);

      // 评估分数：距离越近越好，角度越正越好
      // 简单起见，主要看距离
      let score = 1000 - dist;

      // 目标位置 (对方球门中心)
      // 左方进攻右门，右方进攻左门
      const goalX = this.teamId === TeamId.LEFT ? this.scene.layout.fieldRect.w : 0;
      const goalY = this.scene.layout.fieldRect.h / 2;
      
      // 向量：球 -> 门
      const ballToGoal = Matter.Vector.sub({x: goalX, y: goalY}, bPos);
      
      // 计算 "棋子->球" 和 "球->门" 的夹角
      // 夹角越小，说明三点一线，越容易进球
      const angleDiff = Matter.Vector.angle(normalDir, ballToGoal);
      
      // 惩罚大角度
      score -= Math.abs(angleDiff) * 500;

      // 射线检测：如果有障碍物挡路，分数大幅降低
      if (this.config.strategyDepth >= 1) {
          if (this._isPathBlocked(sPos, bPos) || this._isPathBlocked(bPos, {x: goalX, y: goalY})) {
              score -= 2000;
          }
      }

      // 计算力度
      const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * this.config.powerMultiplier;
      const force = Matter.Vector.mult(normalDir, maxForce);

      return { striker, force, score };
  }

  _evaluateBankShot(striker, ball) {
      // 简化的反弹逻辑：只考虑撞击上下墙壁进球
      // 镜像法：将球门以墙壁为轴对称，瞄准镜像球门
      
      const field = this.scene.layout.fieldRect;
      const goalX = this.teamId === TeamId.LEFT ? field.w : 0;
      const goalY = field.h / 2;
      
      // 尝试上墙反弹 (Y = 0)
      // 镜像球门 Y = -goalY
      const mirrorGoalTop = { x: goalX, y: -goalY };
      
      // 计算撞击点
      // 这是一个简单的几何估算，不考虑球的体积和摩擦
      // 实际效果可能不完美，但对 AI 来说足够像“反弹球”
      const bPos = ball.body.position;
      
      // 向量：球 -> 镜像门
      const ballToMirror = Matter.Vector.sub(mirrorGoalTop, bPos);
      
      // 检测是否真的能撞到上墙 (交点 x 必须在球场范围内)
      // ... 略去复杂几何计算，直接给一个向上的分量
      
      // 这里简化：如果没有直射机会，尝试给一个斜向上的力
      const sPos = striker.body.position;
      const dir = Matter.Vector.sub(bPos, sPos);
      const angle = Math.atan2(dir.y, dir.x);
      
      // 稍微偏转角度，制造切球效果
      const cutAngle = angle + (Math.random() > 0.5 ? 0.3 : -0.3);
      
      const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * this.config.powerMultiplier;
      const force = {
          x: Math.cos(cutAngle) * maxForce,
          y: Math.sin(cutAngle) * maxForce
      };

      return { striker, force, score: 500 }; // 分数略低于完美直射，但高于被阻挡的直射
  }

  _fallbackShot(candidates, ball) {
      // 没招了，找最近的人随便踢一脚
      let closest = candidates[0] || this.scene.strikers.filter(s => s.teamId === this.teamId)[0];
      if (!closest) return null; // 场上没人了？

      const dir = Matter.Vector.sub(ball.body.position, closest.body.position);
      const norm = Matter.Vector.normalise(dir);
      const force = Matter.Vector.mult(norm, GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * 0.5);
      
      return { striker: closest, force, score: 0 };
  }

  _isPathBlocked(start, end) {
      // 简易射线检测：采样中点
      const mid = {
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2
      };
      const bodies = this.physics.queryPoint(mid.x, mid.y);
      // 如果中点有任何物体 (除了球和墙)，认为阻挡
      return bodies.some(b => b.label === 'Striker');
  }

  _applyHumanError(force) {
      // 根据配置的 aiError (弧度) 旋转向量
      const error = (Math.random() - 0.5) * 2 * this.config.aiError;
      return Matter.Vector.rotate(force, error);
  }
}
