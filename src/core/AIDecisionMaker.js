
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

/**
 * AI 决策大脑
 * 负责分析局势，不负责具体执行
 */
export default class AIDecisionMaker {
    constructor(scene, teamId) {
        this.scene = scene;
        this.teamId = teamId; // AI 所在的队伍
        this.opponentId = teamId === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;

        // 场地数据缓存
        this.fieldW = scene.layout.fieldRect.w;
        this.fieldH = scene.layout.fieldRect.h;
        this.fieldX = scene.layout.fieldRect.x;
        this.fieldY = scene.layout.fieldRect.y;

        // 目标球门中心
        this.targetGoal = {
            x: teamId === TeamId.LEFT ? this.fieldX + this.fieldW : this.fieldX,
            y: this.fieldY + this.fieldH / 2
        };

        // 自家球门中心 (需要保护的点)
        this.ownGoal = {
            x: teamId === TeamId.LEFT ? this.fieldX : this.fieldX + this.fieldW,
            y: this.fieldY + this.fieldH / 2
        };

        // 半径缓存
        this.strikerR = GameConfig.dimensions.strikerDiameter / 2;
        this.ballR = GameConfig.dimensions.ballDiameter / 2;
    }

    /**
     * 核心决策函数
     * @param {Array} myStrikers 我方棋子
     * @param {Array} oppStrikers 敌方棋子
     * @param {Object} ball 足球
     * @param {Object} config 难度配置
     */
    decide(myStrikers, oppStrikers, ball, config) {
        if (!ball || myStrikers.length === 0) return null;

        // 1. 局势分析
        const analysis = this._analyzeSituation(myStrikers, oppStrikers, ball);
        
        // 2. 决策树执行
        let bestMove = null;

        // --- 优先级 0: 绝对必进球 (God Shot) ---
        // 无论什么情况，如果能直接赢，就不管防守
        const winningShot = this._findBestShot(myStrikers, ball, true); 
        if (winningShot && winningShot.probability > 0.9) {
            console.log(`[AI] ${config.description} - 发现必进球`);
            return winningShot;
        }

        // --- 优先级 1: 紧急防守 (Emergency Defense) ---
        // 如果球对自家球门威胁极大，且难度允许防守
        if (analysis.isThreatened && config.defenseAwareness > 0.3) {
            const defenseMove = this._findDefensiveMove(myStrikers, ball, analysis.threatLine);
            if (defenseMove) {
                console.log(`[AI] ${config.description} - 触发紧急防守`);
                return defenseMove;
            }
        }

        // --- 优先级 2: 常规射门 (Standard Attack) ---
        const standardShot = this._findBestShot(myStrikers, ball, false);
        
        // 高难度下，如果射门概率太低，宁愿不射，改用防守移动
        // 比如 菜鸟(Level 1) 总是尝试射门，大师(Level 20) 只有 > 40% 把握才射门
        const shotThreshold = config.strategyDepth >= 3 ? 0.4 : 0.1;

        if (standardShot && standardShot.probability > shotThreshold) {
            // 检查：这次射门会不会破坏自家的守门员站位？
            if (config.defenseAwareness >= 0.8 && analysis.goalkeeperId === standardShot.striker.id) {
                // 如果是守门员，且进球率不是很高，放弃射门，改为防守微调
                if (standardShot.probability < 0.7) {
                    console.log(`[AI] 守门员保持站位，放弃低概率射门`);
                    return this._createSafeClearance(standardShot.striker, ball);
                }
            }
            return standardShot;
        }

        // --- 优先级 3: 战术布局 / 解围 (Tactical Move) ---
        // 没有好的射门机会，尝试把球踢远，或者把棋子移动到阻挡位置
        if (config.strategyDepth >= 1) {
            console.log(`[AI] 无法射门，执行解围/布局`);
            return this._findPositionalMove(myStrikers, ball, analysis);
        }

        // --- 优先级 4: 摆烂 (Panic) ---
        // 随便找个最近的人踢一脚
        return this._fallbackKick(myStrikers, ball);
    }

    // ==========================================
    //              分析模块
    // ==========================================

    _analyzeSituation(myStrikers, oppStrikers, ball) {
        const bPos = ball.body.position;
        
        // 1. 寻找我方“守门员” (离自家球门最近，且位于球和门之间的棋子)
        let goalkeeperId = null;
        let minGoalDist = Infinity;
        
        myStrikers.forEach(s => {
            const d = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, this.ownGoal));
            // 必须在后场
            const isBackCourt = Math.abs(s.body.position.x - this.ownGoal.x) < this.fieldW * 0.4;
            if (d < minGoalDist && isBackCourt) {
                minGoalDist = d;
                goalkeeperId = s.id;
            }
        });

        // 2. 威胁评估：球是否能直线射入自家球门？
        // 简单的射线检测，看球 -> 自家球门 是否有阻挡
        const threatLine = { start: bPos, end: this.ownGoal };
        const isBlocked = this._raycastTest(bPos, this.ownGoal, [ball.body]); // 排除球本身
        
        // 只有当球在自家半场，且路线通畅时，才视为威胁
        const distToOwn = Matter.Vector.magnitude(Matter.Vector.sub(bPos, this.ownGoal));
        const isThreatened = !isBlocked && distToOwn < this.fieldW * 0.6;

        return { goalkeeperId, isThreatened, threatLine };
    }

    // ==========================================
    //              动作搜索模块
    // ==========================================

    /**
     * 寻找最佳射门机会
     * @param {boolean} onlySureGoal 是否只看必进球
     */
    _findBestShot(strikers, ball, onlySureGoal) {
        let bestMove = null;
        let maxScore = -1;

        // 遍历所有可能的射门路径
        // 1. 直射球门中心
        // 2. 直射球门上角
        // 3. 直射球门下角
        const targets = [
            this.targetGoal, // 中心
            { x: this.targetGoal.x, y: this.targetGoal.y - 120 }, // 上角
            { x: this.targetGoal.x, y: this.targetGoal.y + 120 }  // 下角
        ];

        for (const s of strikers) {
            for (const target of targets) {
                // 计算幽灵球位置
                const ghostData = this._calculateGhostBall(s.body.position, ball.body.position, target);
                
                // 评估这次射门
                const evalResult = this._evaluateShot(s, ball, target, ghostData);
                
                if (evalResult.score > maxScore) {
                    maxScore = evalResult.score;
                    bestMove = {
                        striker: s,
                        force: evalResult.force,
                        probability: evalResult.probability,
                        type: 'shoot'
                    };
                }
            }
        }

        return bestMove;
    }

    _evaluateShot(striker, ball, target, ghostData) {
        const { shootVector, distToGhost } = ghostData;
        
        // 1. 路径阻挡检测 (球 -> 目标)
        if (this._raycastTest(ball.body.position, target, [ball.body, striker.body])) {
            return { score: -1, probability: 0 };
        }

        // 2. 击球阻挡检测 (棋子 -> 幽灵球位)
        // 注意：这里需要稍微宽松一点，因为棋子和球靠得很近时容易误判
        if (distToGhost > this.strikerR * 2) {
             if (this._raycastTest(striker.body.position, ghostData.ghostPos, [ball.body, striker.body])) {
                 return { score: -1, probability: 0 };
             }
        }

        // 3. 切球角度评估
        // 向量点积：判断是否顺手
        const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
        const vecBallToTarget = Matter.Vector.sub(target, ball.body.position);
        const angleCos = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(vecBallToTarget));
        
        // 夹角过大(切球太薄) 成功率低
        // angleCos = 1 (正对), 0 (90度切), -1 (背对)
        if (angleCos < 0.1) return { score: 0, probability: 0.1 };

        // 4. 距离评估
        const distGoal = Matter.Vector.magnitude(vecBallToTarget);
        
        // 综合评分
        let probability = (angleCos * 0.6) + (1000 / (distGoal + 1000) * 0.4);
        
        // 计算力度
        const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
        // 距离越远力度越大，且根据切球角度适当增加力度补偿
        let powerRatio = Math.min(1.0, (distGoal / 1500) + 0.3);
        if (angleCos < 0.8) powerRatio += 0.2; // 切球需要更大力
        
        const forceMag = maxForce * Math.min(1.0, powerRatio);
        const force = Matter.Vector.mult(Matter.Vector.normalise(shootVector), forceMag);

        return { score: probability * 100, probability, force };
    }

    /**
     * 寻找防守移动 (封堵路线)
     */
    _findDefensiveMove(strikers, ball, threatLine) {
        // 策略：找到一个棋子，把它移动到 threatLine 的中间
        // 且这个移动本身不能碰到球 (否则就是乌龙球)
        
        let bestDefender = null;
        let minCost = Infinity;
        let targetPos = null;

        // 防守点：球和自家球门的连线中点，偏向球门一侧
        // Point = OwnGoal + (Ball - OwnGoal) * 0.3
        const vecGoalToBall = Matter.Vector.sub(ball.body.position, this.ownGoal);
        const defensePoint = Matter.Vector.add(this.ownGoal, Matter.Vector.mult(vecGoalToBall, 0.3));

        for (const s of strikers) {
            // 距离防守点最近的棋子
            const dist = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, defensePoint));
            
            // 排除：如果棋子就在球的前面 (进攻方向)，不要为了防守回撤太远
            // 简单判断：只用在球后方的棋子做防守
            const isBehindBall = Math.abs(s.body.position.x - this.ownGoal.x) < Math.abs(ball.body.position.x - this.ownGoal.x);
            
            if (isBehindBall && dist < minCost) {
                // 检查：移动路径上是否有阻挡
                if (!this._raycastTest(s.body.position, defensePoint, [s.body])) {
                    minCost = dist;
                    bestDefender = s;
                    targetPos = defensePoint;
                }
            }
        }

        if (bestDefender && targetPos) {
            // 计算移动向量：只需要移动到 targetPos，不需要击球
            // 我们通过给一个指向 targetPos 的力来实现
            const dir = Matter.Vector.sub(targetPos, bestDefender.body.position);
            const dist = Matter.Vector.magnitude(dir);
            // 力度要控制好，刚好停在位置上 (模拟)
            // 简单处理：给一个中等力度
            const force = Matter.Vector.mult(Matter.Vector.normalise(dir), 
                GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * 0.5);
            
            return {
                striker: bestDefender,
                force: force,
                type: 'defense'
            };
        }
        return null;
    }

    /**
     * 寻找战术位移/解围
     */
    _findPositionalMove(strikers, ball, analysis) {
        // 策略：如果是守门员，就把球往两边踢 (解围)
        // 如果是前锋，尝试把球往对方半场踢 (推进)
        
        // 优先使用离球最近的棋子
        let closest = strikers[0];
        let minDist = Infinity;
        strikers.forEach(s => {
            const d = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, ball.body.position));
            if (d < minDist) {
                minDist = d;
                closest = s;
            }
        });

        if (!closest) return null;

        // 确定目标方向
        let targetArea;
        
        // 如果球在自家半场，往对方边路踢 (安全解围)
        const isOwnHalf = Math.abs(ball.body.position.x - this.ownGoal.x) < this.fieldW * 0.5;
        
        if (isOwnHalf) {
            // 往上边路或下边路踢
            targetArea = ball.body.position.y < this.fieldH/2 ? 
                { x: this.targetGoal.x, y: 0 } : 
                { x: this.targetGoal.x, y: this.fieldH };
        } else {
            // 在对方半场，往球门方向踢，制造混乱
            targetArea = this.targetGoal;
        }

        const ghost = this._calculateGhostBall(closest.body.position, ball.body.position, targetArea);
        const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
        
        // 解围通常大力
        const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce * 0.8);

        return {
            striker: closest,
            force: force,
            type: 'clearance'
        };
    }

    _fallbackKick(strikers, ball) {
        const s = strikers[0]; // 随便取一个
        const dir = Matter.Vector.sub(ball.body.position, s.body.position);
        const force = Matter.Vector.mult(Matter.Vector.normalise(dir), GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * 0.5);
        return { striker: s, force, type: 'panic' };
    }

    // 安全解围（微调守门员）
    _createSafeClearance(striker, ball) {
        // 轻轻把球碰离危险区，或者调整自己位置
        // 这里简单实现为：向侧面轻轻踢球
        const sideDir = { x: 0, y: ball.body.position.y > this.fieldH/2 ? -1 : 1 };
        const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, 
            Matter.Vector.add(ball.body.position, Matter.Vector.mult(sideDir, 200)));
        
        const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), 
            GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier * 0.3);
            
        return { striker, force, type: 'safe_touch' };
    }

    // ==========================================
    //              物理计算辅助
    // ==========================================

    _calculateGhostBall(strikerPos, ballPos, targetPos) {
        // 1. 理想出球方向
        const ballToTarget = Matter.Vector.sub(targetPos, ballPos);
        const dir = Matter.Vector.normalise(ballToTarget);

        // 2. 幽灵球位置 (两球相切时，棋子的中心点)
        const radiusSum = this.strikerR + this.ballR;
        // 沿着反方向回退半径和的距离
        const ghostPos = Matter.Vector.sub(ballPos, Matter.Vector.mult(dir, radiusSum));

        // 3. 射门向量
        const shootVector = Matter.Vector.sub(ghostPos, strikerPos);
        const distToGhost = Matter.Vector.magnitude(shootVector);

        return { shootVector, ghostPos, distToGhost };
    }

    _raycastTest(start, end, ignoreBodies = []) {
        const bodies = this.scene.physics.engine.world.bodies;
        const collisions = Matter.Query.ray(bodies, start, end);
        
        for (const col of collisions) {
            const body = col.body;
            if (body.isSensor) continue;
            if (body.label && body.label.includes('GoalNet')) continue; // 忽略球网内壁
            if (ignoreBodies.includes(body)) continue;
            
            // 碰到任何实体墙、棋子、球都算阻挡
            return true;
        }
        return false;
    }
}
