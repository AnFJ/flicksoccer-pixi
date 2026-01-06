
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

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

    // AI 进攻方向的目标球门 X 坐标
    // AI (Right/Blue) 进攻 Left Goal (x=0)
    // AI (Left/Red) 进攻 Right Goal (x=FieldWidth)
    this.fieldW = this.scene.layout.fieldRect.w;
    this.fieldH = this.scene.layout.fieldRect.h;
    
    // 目标球门中心点
    this.targetGoal = {
        x: this.teamId === TeamId.LEFT ? this.fieldW : 0,
        y: this.fieldH / 2
    };

    // 自家球门中心点 (用于防守判断)
    this.ownGoal = {
        x: this.teamId === TeamId.LEFT ? 0 : this.fieldW,
        y: this.fieldH / 2
    };
  }

  /**
   * AI 思考主入口
   */
  think(strikers, ball) {
    if (!ball || strikers.length === 0) return null;

    // 1. 尝试使用技能
    this._tryActivateSkill();

    // 2. 筛选可用棋子
    // 规则：通常只选择在球后方（相对进攻方向）的棋子，除非是解围
    const candidates = this._getCandidates(strikers, ball);
    if (candidates.length === 0) return this._fallbackShot(strikers, ball); // 如果都在球前面，就随便找一个

    // 3. 决策评分系统
    let bestAction = null;
    let maxScore = -Infinity;

    // 预计算环境信息
    const isBallInDanger = this._isBallInDanger(ball);
    const needClearance = isBallInDanger && (Math.random() < this.config.defenseAwareness);

    for (const striker of candidates) {
        // --- 策略 A: 射门 (最高优先级) ---
        const shotAction = this._evaluateBestShot(striker, ball);
        if (shotAction.score > maxScore) {
            maxScore = shotAction.score;
            bestAction = shotAction;
        }

        // --- 策略 B: 解围 (危险时高优先级) ---
        // 只有当策略深度 >= 1 且处于危险状态时触发
        if (this.config.strategyDepth >= 1 && needClearance) {
            const clearAction = this._evaluateClearance(striker, ball);
            // 解围的分数通常给予较高权重，但低于"必进球"
            if (clearAction.score > maxScore) {
                maxScore = clearAction.score;
                bestAction = clearAction;
            }
        }
    }

    // 如果没有好的方案，执行保底逻辑 (朝着球踢一脚)
    if (!bestAction || maxScore < 0) {
        bestAction = this._fallbackShot(candidates, ball);
    }

    // 4. 应用人为误差 (模拟不同难度)
    if (bestAction) {
        // 根据策略深度调整力度 (Level 20+ 懂得控力)
        if (this.config.strategyDepth >= 3 && bestAction.suggestedPower) {
             // 使用计算出的建议力度
             bestAction.force = Matter.Vector.mult(
                 Matter.Vector.normalise(bestAction.force), 
                 bestAction.suggestedPower
             );
        }
        
        bestAction.force = this._applyHumanError(bestAction.force);
    }

    return bestAction;
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

  _getCandidates(strikers, ball) {
    const margin = 10;
    // 进攻方向向量
    const attackDirX = this.teamId === TeamId.LEFT ? 1 : -1;
    
    // 筛选位于球后方的棋子 (X轴比较)
    // LeftTeam(->): Striker.x < Ball.x
    // RightTeam(<-): Striker.x > Ball.x
    const valid = strikers.filter(s => {
        if (attackDirX > 0) return s.body.position.x < ball.body.position.x - margin;
        else return s.body.position.x > ball.body.position.x + margin;
    });

    // 如果没有合适位置的，就返回所有棋子 (可能需要回追)
    return valid.length > 0 ? valid : strikers;
  }

  // 评估最佳射门 (包含直线和反弹)
  _evaluateBestShot(striker, ball) {
      let bestResult = { score: -Infinity };

      // 1. 直线射门
      const direct = this._evaluateDirectShot(striker, ball);
      if (direct.score > bestResult.score) bestResult = direct;

      // 2. 反弹射门 (Level 8+ 开启)
      if (this.config.strategyDepth >= 2) {
          const bank = this._evaluateBankShot(striker, ball);
          if (bank && bank.score > bestResult.score) bestResult = bank;
      }

      return bestResult;
  }

  _evaluateDirectShot(striker, ball) {
      const sPos = striker.body.position;
      const bPos = ball.body.position;
      
      // 向量：棋子 -> 球
      const dir = Matter.Vector.sub(bPos, sPos);
      const normalDir = Matter.Vector.normalise(dir);
      
      // [修复] 提前定义 distStrikerBall，因为后面 suggestedPower 计算需要用到
      const distStrikerBall = Matter.Vector.magnitude(dir);

      // 向量：球 -> 目标球门
      const ballToGoal = Matter.Vector.sub(this.targetGoal, bPos);
      const distToGoal = Matter.Vector.magnitude(ballToGoal);
      
      // 检查路径阻挡 (球 -> 门)
      // 使用射线检测，排除球自身和目标棋子
      // 射线宽度设为球半径的一半，比较严格
      const isBlocked = this._raycast(bPos, this.targetGoal, 10, [ball.body, striker.body]);

      let score = 0;

      if (isBlocked) {
          score = 10; // 被挡住了，分数很低
      } else {
          // 角度越正越好
          const angleDiff = Matter.Vector.angle(normalDir, ballToGoal);
          
          score = 1000 
                  - Math.abs(angleDiff) * 300   // 角度惩罚
                  - distStrikerBall * 0.5       // 跑位距离惩罚
                  - distToGoal * 0.1;           // 进球距离微弱惩罚
      }
      
      // 基础力度 (默认最大)
      const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * this.config.powerMultiplier;
      const force = Matter.Vector.mult(normalDir, maxForce);

      // 建议力度 (简单计算：越远越大力)
      // 如果策略深度够高，这里可以返回精确力度，防止踢飞
      const suggestedPower = Math.min(maxForce, (distToGoal * 0.003 + distStrikerBall * 0.001));

      return { striker, force, score, type: 'direct', suggestedPower };
  }

  _evaluateBankShot(striker, ball) {
      // 简单的上/下墙反弹计算
      // 镜像法：目标关于墙壁对称
      // 上墙 Y = 0 (实际有厚度，取球场边界 0)
      // 下墙 Y = fieldH
      
      const walls = [0, this.fieldH]; // 上边界和下边界
      let bestBank = null;
      let maxScore = -Infinity;

      for (const wallY of walls) {
          // 镜像目标点
          const mirrorGoal = {
              x: this.targetGoal.x,
              y: wallY + (wallY - this.targetGoal.y)
          };

          // 球 -> 镜像目标 的连线与墙壁的交点即为撞击点
          // 向量：球 -> 镜像
          const ballToMirror = Matter.Vector.sub(mirrorGoal, ball.body.position);
          
          // 检查路径 1: 球 -> 墙 (撞击点)
          // 简单的线段相交计算求撞击点 (HitPoint)
          // 利用相似三角形: (HitY - BallY) / (MirrorY - BallY) = Ratio
          // HitY 就是 wallY.
          const ratio = (wallY - ball.body.position.y) / (mirrorGoal.y - ball.body.position.y);
          if (ratio <= 0 || ratio >= 1) continue; // 无法反弹

          const hitPoint = {
              x: ball.body.position.x + (mirrorGoal.x - ball.body.position.x) * ratio,
              y: wallY
          };

          // 检查路径阻挡
          // 1. 球 -> 撞击点
          const blocked1 = this._raycast(ball.body.position, hitPoint, 10, [ball.body, striker.body]);
          // 2. 撞击点 -> 球门
          const blocked2 = this._raycast(hitPoint, this.targetGoal, 10, [ball.body, striker.body]);

          if (!blocked1 && !blocked2) {
              // 这是一个可行的反弹球！
              // 计算棋子需要撞击球的角度
              // 目标方向即 ballToMirror 的方向
              const shotDir = Matter.Vector.normalise(ballToMirror);
              
              // 棋子 -> 球 的方向必须与 shotDir 一致才能把球踢向那个方向
              // 但实际上我们需要撞击球的“反面”
              // 这里简化：AI 只要能把球往 shotDir 的方向踢就行
              
              // 计算棋子位置能否踢出这个角度
              const strikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
              const angleDiff = Matter.Vector.angle(Matter.Vector.normalise(strikerToBall), shotDir);
              
              // 如果夹角太小，说明棋子位置很好；如果太大，说明棋子得绕到球后面去踢，这在一步操作里是不可能的
              // 允许 45度 (PI/4) 的偏差通过切球实现
              if (Math.abs(angleDiff) < Math.PI / 4) {
                  const score = 800 - Math.abs(angleDiff) * 200; // 略低于完美的直射
                  
                  if (score > maxScore) {
                      const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * this.config.powerMultiplier;
                      // 修正力度方向：融合 棋子->球 和 理想出射方向
                      // 简单起见，直接用 Striker->Ball 的方向，靠 aiError 来模拟切球的不稳定性
                      // 或者更高级：计算偏心撞击。这里为了稳定性，仍然沿连线踢，但力度调大
                      const force = Matter.Vector.mult(Matter.Vector.normalise(strikerToBall), maxForce);
                      
                      bestBank = { striker, force, score, type: 'bank' };
                      maxScore = score;
                  }
              }
          }
      }
      return bestBank;
  }

  _evaluateClearance(striker, ball) {
      // 解围：目标是将球踢向对方半场的开阔地带 (或者对方边角)
      // 简单策略：瞄准对方半场的上下两个角落
      const corners = [
          { x: this.targetGoal.x, y: 0 },
          { x: this.targetGoal.x, y: this.fieldH }
      ];
      
      // 也是找一个最近的解围点
      let bestDir = null;
      let maxDist = -Infinity;

      for (const target of corners) {
          const dir = Matter.Vector.sub(target, ball.body.position);
          const dist = Matter.Vector.magnitude(dir);
          if (dist > maxDist) {
              maxDist = dist;
              bestDir = dir;
          }
      }
      
      // 向量：棋子 -> 球
      const sPos = striker.body.position;
      const bPos = ball.body.position;
      const strikerToBall = Matter.Vector.sub(bPos, sPos);

      // 仅仅为了把球踢远，不需要太精确的角度，只要大致向前即可
      const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier; // 全力解围
      const force = Matter.Vector.mult(Matter.Vector.normalise(strikerToBall), maxForce);
      
      // 解围的分数：越高越急
      // 距离自家球门越近，分数越高
      const distToOwnGoal = Matter.Vector.magnitude(Matter.Vector.sub(this.ownGoal, bPos));
      const score = 600 + (1000 - distToOwnGoal); // 基础分600，越近越高

      return { striker, force, score, type: 'clearance' };
  }

  _fallbackShot(candidates, ball) {
      // 随便找个最近的人，往球的方向踢
      // 距离球最近的
      let closest = candidates[0];
      let minDist = Infinity;
      
      for (const s of candidates) {
          const d = Matter.Vector.magnitude(Matter.Vector.sub(ball.body.position, s.body.position));
          if (d < minDist) {
              minDist = d;
              closest = s;
          }
      }

      if (!closest) closest = this.scene.strikers.find(s => s.teamId === this.teamId);

      const dir = Matter.Vector.sub(ball.body.position, closest.body.position);
      const force = Matter.Vector.mult(Matter.Vector.normalise(dir), GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * 0.6);
      
      return { striker: closest, force, score: 0, type: 'fallback' };
  }

  // 判断球是否在己方危险区域
  _isBallInDanger(ball) {
      const x = ball.body.position.x;
      const w = this.fieldW;
      
      // 假设场地宽 1500
      // AI 是 RightTeam (进攻 0, 防守 W) -> Danger > W * 0.6
      // AI 是 LeftTeam (进攻 W, 防守 0) -> Danger < W * 0.4
      
      if (this.teamId === TeamId.RIGHT) {
          return x > w * 0.6;
      } else {
          return x < w * 0.4;
      }
  }

  /**
   * 射线检测
   * @param {Object} start 起点
   * @param {Object} end 终点
   * @param {number} radius 射线半径 (用于模拟球的宽度)
   * @param {Array} ignoreBodies 忽略的刚体列表
   * @returns {boolean} 是否被阻挡
   */
  _raycast(start, end, radius, ignoreBodies = []) {
      const bodies = this.physics.engine.world.bodies;
      
      // 1. 简单的 Matter.Query.ray (中心线)
      const collisions = Matter.Query.ray(bodies, start, end);
      
      for (const col of collisions) {
          const body = col.body;
          // 忽略墙壁(如果是边界检查可能需要，但射门路径通常不包含墙壁内部)、忽略自身、忽略球
          if (ignoreBodies.includes(body)) continue;
          if (body.isSensor) continue; // 忽略进球感应区
          
          // 如果碰到其他棋子，视为阻挡
          if (body.label === 'Striker') return true;
      }
      
      // 2. 进阶：如果需要考虑球的体积，可以发射两条平行射线 (start+offset -> end+offset)
      // 简单起见，这里只做中心线检测，对于这个体量的游戏足够了。
      // 如果想要更精准，可以检测 start->end 矩形区域内的物体 (Query.region)
      
      return false;
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
