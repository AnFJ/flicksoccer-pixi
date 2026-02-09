
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

/**
 * AI 决策大脑 (增强版)
 * 具备攻防预判、守门员保护、反弹球计算和暴力破局能力
 */
export default class AIDecisionMaker {
    constructor(scene, teamId) {
        this.scene = scene;
        this.teamId = teamId; 
        this.opponentId = teamId === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;

        // 场地数据缓存
        this.fieldW = scene.layout.fieldRect.w;
        this.fieldH = scene.layout.fieldRect.h;
        this.fieldX = scene.layout.fieldRect.x;
        this.fieldY = scene.layout.fieldRect.y;

        // 目标球门中心 (进攻)
        this.targetGoal = {
            x: teamId === TeamId.LEFT ? this.fieldX + this.fieldW : this.fieldX,
            y: this.fieldY + this.fieldH / 2
        };

        // 自家球门中心 (防守)
        this.ownGoal = {
            x: teamId === TeamId.LEFT ? this.fieldX : this.fieldX + this.fieldW,
            y: this.fieldY + this.fieldH / 2
        };

        this.strikerR = GameConfig.dimensions.strikerDiameter / 2;
        this.ballR = GameConfig.dimensions.ballDiameter / 2;
    }

    /**
     * 核心决策函数
     */
    decide(myStrikers, oppStrikers, ball, config) {
        if (!ball || myStrikers.length === 0) return null;

        // 0. 获取比分差距 (正数表示领先，负数表示落后)
        const myScore = this.scene.rules.score[this.teamId];
        const oppScore = this.scene.rules.score[this.opponentId];
        const scoreDiff = myScore - oppScore;
        const isLosing = scoreDiff < 0;

        // 1. 全局局势分析
        const analysis = this._analyzeSituation(myStrikers, oppStrikers, ball);
        
        // 2. 紧急防御检查 (最高优先级)
        // 如果落后 (isLosing)，防御阈值提高，更倾向于进攻而不是纯粹破坏
        // 但如果是 CriticalThreat (门前险情)，必须优先处理
        const defenseThreshold = isLosing ? 0.6 : 0.3; 
        
        if (analysis.isCriticalThreat && config.defenseAwareness > defenseThreshold) {
            // [新增] 优先尝试直接解围球 (Clearance)
            // 在极度危险时，把球踢走比撞人更稳妥
            let bestClearance = null;
            let maxClearScore = -Infinity;
            
            for (const s of myStrikers) {
                const isGoalie = (s.id === analysis.goalkeeperId);
                const clears = this._generateClearanceActions(s, ball, isGoalie, analysis);
                for (const c of clears) {
                    // 距离球越近的解围越优先
                    const distToBall = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, ball.body.position));
                    const score = c.score - distToBall * 0.5; 
                    if (score > maxClearScore) {
                        maxClearScore = score;
                        bestClearance = c;
                    }
                }
            }
            if (bestClearance) {
                bestClearance.score = 10000; // 赋予极高分数，确保执行
                bestClearance.desc = "紧急解围";
                return bestClearance;
            }

            // 其次尝试破坏对手 (Sabotage)
            const sabotage = this._findSabotageMove(myStrikers, analysis.threatSource);
            if (sabotage) return sabotage;
            
            // 最后尝试堵枪眼 (Block)
            const block = this._findDefensiveMove(myStrikers, ball, analysis.threatLine);
            if (block) return block;
        }

        let bestMove = null;
        let maxScore = -Infinity;

        // 3. 遍历所有可能的动作进行评分 (常规逻辑)
        for (const striker of myStrikers) {
            const isGoalie = (striker.id === analysis.goalkeeperId);
            
            // --- A. 常规直射 ---
            const shotActions = this._generateShotActions(striker, ball, isGoalie, analysis, config, isLosing);
            for (const action of shotActions) {
                if (action.score > maxScore) { maxScore = action.score; bestMove = action; }
            }

            // --- B. 反弹射门 (Bank Shot) - 进阶策略 ---
            // 只有当常规射门分数不高，或者处于落后急需破局时计算
            if (config.strategyDepth >= 1 || isLosing) {
                const bankActions = this._generateBankShotActions(striker, ball, isGoalie, config);
                for (const action of bankActions) {
                    if (action.score > maxScore) { maxScore = action.score; bestMove = action; }
                }
            }

            // --- C. 暴力破局 (Breakthrough) ---
            // 当处于劣势或前面被堵死时，尝试大力出奇迹
            if (isLosing || maxScore < 200) {
                const breakActions = this._generateBreakthroughActions(striker, ball, isGoalie);
                for (const action of breakActions) {
                    if (action.score > maxScore) { maxScore = action.score; bestMove = action; }
                }
            }

            // --- D. 防守/解围/安全球 ---
            if ((analysis.isThreatened || maxScore < 300) && !isLosing) {
                const clearActions = this._generateClearanceActions(striker, ball, isGoalie, analysis);
                for (const action of clearActions) {
                    if (action.score > maxScore) { maxScore = action.score; bestMove = action; }
                }
            }
        }

        // 4. 最终检查
        if (!bestMove || maxScore < 50) {
            return this._fallbackSafeMove(myStrikers, ball, analysis);
        }

        return bestMove;
    }

    // ... (保留 _analyzeSituation 不变) ...
    _analyzeSituation(myStrikers, oppStrikers, ball) {
        const bPos = ball.body.position;
        const distToOwn = Matter.Vector.magnitude(Matter.Vector.sub(bPos, this.ownGoal));
        
        let goalkeeperId = null;
        let minGDist = Infinity;
        myStrikers.forEach(s => {
            const d = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, this.ownGoal));
            const isBackCourt = Math.abs(s.body.position.x - this.ownGoal.x) < this.fieldW * 0.35;
            if (isBackCourt && d < minGDist) {
                minGDist = d;
                goalkeeperId = s.id;
            }
        });

        let isCriticalThreat = false;
        let isThreatened = false; 
        let threatLine = null;
        let threatSource = null;

        // [新增] 绝对危险区判定 (Red Zone)
        // 只要球在门前危险区域(350px)，且有对手在附近(400px)，无论能否直线射门，都视为致命威胁
        // 这样可以避免因为射线检测被门柱或微小障碍阻挡而忽略近在咫尺的威胁
        if (distToOwn < 350) {
            for (const opp of oppStrikers) {
                const distOppBall = Matter.Vector.magnitude(Matter.Vector.sub(opp.body.position, bPos));
                if (distOppBall < 400) { 
                    isCriticalThreat = true;
                    isThreatened = true;
                    threatSource = opp;
                    threatLine = { start: bPos, end: this.ownGoal };
                    break; // 发现一个就够了
                }
            }
        }

        // 常规威胁判定 (如果没有触发绝对危险)
        if (!isCriticalThreat && distToOwn < this.fieldW * 0.7) {
            isThreatened = true;
            const threatTargets = [
                this.ownGoal,
                { x: this.ownGoal.x, y: this.ownGoal.y - 120 }, 
                { x: this.ownGoal.x, y: this.ownGoal.y + 120 }  
            ];

            for (const opp of oppStrikers) {
                if (isCriticalThreat) break;
                for (const target of threatTargets) {
                    const ghost = this._calculateGhostBall(opp.body.position, bPos, target);
                    if (!this._raycastTest(opp.body.position, ghost.ghostPos, [ball.body, opp.body]) &&
                        !this._raycastTest(bPos, target, [ball.body])) {
                        
                        const vecOppToBall = Matter.Vector.sub(bPos, opp.body.position);
                        const vecBallToGoal = Matter.Vector.sub(target, bPos);
                        const dot = Matter.Vector.dot(Matter.Vector.normalise(vecOppToBall), Matter.Vector.normalise(vecBallToGoal));
                        
                        if (dot > 0.3) {
                            isCriticalThreat = true;
                            threatSource = opp;
                            threatLine = { start: bPos, end: target };
                            break;
                        }
                    }
                }
            }
        }
        return { goalkeeperId, isThreatened, isCriticalThreat, threatSource, threatLine };
    }

    // ==========================================
    //              动作生成与评分
    // ==========================================

    _generateShotActions(striker, ball, isGoalie, analysis, config, isLosing) {
        const actions = [];
        
        const targets = [
            this.targetGoal, // 中心
            { x: this.targetGoal.x, y: this.targetGoal.y - 115 }, // 上角
            { x: this.targetGoal.x, y: this.targetGoal.y + 115 }  // 下角
        ];

        targets.forEach(target => {
            const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, target);
            
            // 1. 路径阻挡检测
            // 如果落后 (isLosing)，我们允许稍微冒险一点，如果阻挡物是球或者对手，也许能撞开
            // 但这里是“精准射门”逻辑，所以还是要求路径相对干净
            if (this._raycastTest(ball.body.position, target, [ball.body, striker.body])) return; 
            
            const distToGhost = Matter.Vector.magnitude(ghost.shootVector);
            
            if (distToGhost > 20) {
                if (this._raycastTest(striker.body.position, ghost.ghostPos, [striker.body])) return;
            }

            // 2. 计算得分
            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const vecBallToGoal = Matter.Vector.sub(target, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(vecBallToGoal));
            
            // 角度修正：落后时，哪怕角度只有一点点切线 (0.05)，只要能把球往那个方向踢都行
            if (dot < (isLosing ? 0.05 : 0.1)) return;

            const distBallGoal = Matter.Vector.magnitude(vecBallToGoal);
            
            // 基础分：角度越大越好，距离越近越好
            let score = (dot * 600) + (1000 - distBallGoal * 0.3);

            // 风险评估
            if (isGoalie) {
                // 守门员如果在后场且角度好，也允许长传吊门
                const isSafeShot = dot > 0.9 && !this._isOpponentInPath(ball.body.position, target);
                if (!isSafeShot) {
                    score -= 2000; 
                } else if (isLosing) {
                    score += 500; // 落后时门将长传也是好选择
                }
            }

            // [新增] 劣势激励：如果落后，这种直接得分机会的分数大幅提高
            if (isLosing) score += 400;

            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            let powerRatio = Math.min(1.0, (distBallGoal / 1500) + 0.35);
            if (dot < 0.8) powerRatio += 0.2;
            
            // 落后时总是全力射门
            if (isLosing) powerRatio = 1.0;

            const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce * Math.min(1.0, powerRatio));

            actions.push({
                striker,
                force,
                score,
                type: 'shoot',
                desc: '精准射门'
            });
        });

        return actions;
    }

    /**
     * [新增] 反弹射门逻辑 (Bank Shot)
     * 利用上下墙壁进行一次反弹
     */
    _generateBankShotActions(striker, ball, isGoalie, config) {
        const actions = [];
        if (isGoalie) return actions; // 门将尽量不玩花活

        // 上墙和下墙的Y坐标 (考虑球半径的偏移)
        const wallTopY = this.fieldY + this.ballR; 
        const wallBottomY = this.fieldY + this.fieldH - this.ballR;

        // 镜像目标点：只计算打球门中心的镜像
        // 1. 上墙镜像：Goal.y 关于 wallTopY 对称 -> 2*wallTopY - Goal.y
        const mirrorTop = { x: this.targetGoal.x, y: 2 * wallTopY - this.targetGoal.y };
        
        // 2. 下墙镜像：Goal.y 关于 wallBottomY 对称
        const mirrorBottom = { x: this.targetGoal.x, y: 2 * wallBottomY - this.targetGoal.y };

        const scenarios = [
            { mirror: mirrorTop, wallY: wallTopY, label: "TopBank" },
            { mirror: mirrorBottom, wallY: wallBottomY, label: "BottomBank" }
        ];

        for (const scene of scenarios) {
            // A. 计算撞墙点 (Intersection)
            // 简单的几何：连接球和镜像点的线段，与墙壁的交点
            // 利用相似三角形： (Ball.x - Hit.x) / (Ball.y - Wall.y) = (Goal.x - Hit.x) / (Goal.y - Wall.y) ... 
            // 简化向量法：Dir = Mirror - Ball
            const toMirror = Matter.Vector.sub(scene.mirror, ball.body.position);
            
            // 如果球已经在墙外或者方向不对，跳过
            if (Math.abs(toMirror.y) < 1) continue;
            
            // 比例 t，使得 Ball + t * Dir 的 y = WallY
            const t = (scene.wallY - ball.body.position.y) / toMirror.y;
            
            if (t <= 0 || t >= 1) continue; // 撞点不在球和目标之间

            const hitPoint = Matter.Vector.add(ball.body.position, Matter.Vector.mult(toMirror, t));
            
            // 检查撞点是否在球场X范围内
            if (hitPoint.x < this.fieldX || hitPoint.x > this.fieldX + this.fieldW) continue;

            // B. 路径检测
            // 1. 球 -> 撞墙点
            if (this._raycastTest(ball.body.position, hitPoint, [ball.body, striker.body])) continue;
            // 2. 撞墙点 -> 球门
            if (this._raycastTest(hitPoint, this.targetGoal, [ball.body])) continue;

            // C. 击球计算 (瞄准撞墙点)
            const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, hitPoint);
            
            if (this._raycastTest(striker.body.position, ghost.ghostPos, [striker.body])) continue;

            // D. 角度检查
            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const vecBallToHit = Matter.Vector.sub(hitPoint, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(vecBallToHit));
            
            if (dot < 0.3) continue; // 切角不能太大

            // E. 评分
            // 反弹球虽然帅，但距离长、误差大，分数不宜过高，主要作为直线不通时的备选
            let score = 800; 
            
            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce); // 反弹球通常需要大力

            actions.push({
                striker,
                force,
                score,
                type: 'bank_shot',
                desc: `反弹射门(${scene.label})`
            });
        }

        return actions;
    }

    /**
     * [新增] 暴力破局 (Breakthrough)
     * 当正常射门路线上有对手阻挡时，如果对手离球不远，尝试大力出奇迹，冲散防守
     */
    _generateBreakthroughActions(striker, ball, isGoalie) {
        const actions = [];
        if (isGoalie) return actions;

        // 目标依然是球门
        const target = this.targetGoal;
        const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, target);

        // 1. 检查谁挡在球和球门之间
        const obstacles = this._raycastGetBodies(ball.body.position, target, [ball.body, striker.body]);
        
        // 如果没有阻挡，或者全是墙壁，不属于破局范畴（那是常规射门）
        if (obstacles.length === 0) return actions;

        // 2. 分析阻挡物
        let hasOpponentBlocker = false;
        let blockerDistance = Infinity;

        for (const body of obstacles) {
            if (body.label === 'Wall' || body.label.includes('Goal')) return actions; // 被墙挡住无法破局
            if (body.label === 'Striker') {
                // 检查是否是对手
                if (body.entity && body.entity.teamId === this.opponentId) {
                    hasOpponentBlocker = true;
                    const d = Matter.Vector.magnitude(Matter.Vector.sub(body.position, ball.body.position));
                    if (d < blockerDistance) blockerDistance = d;
                }
            }
        }

        // 3. 只有当对手离球比较近（< 200px）时，才值得尝试暴力冲撞
        // 太远的话，球的动能衰减，撞过去也没力度了
        if (hasOpponentBlocker && blockerDistance < 250) {
            
            // 确保棋子能跑到击球点
            if (this._raycastTest(striker.body.position, ghost.ghostPos, [striker.body])) return actions;

            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const vecBallToGoal = Matter.Vector.sub(target, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(vecBallToGoal));

            // 需要比较正的击球角度，才能传导最大动能
            if (dot < 0.7) return actions;

            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce); 

            actions.push({
                striker,
                force,
                score: 750, // 分数略低于完美直线，但高于漫无目的的解围
                type: 'breakthrough',
                desc: '暴力破局'
            });
        }

        return actions;
    }

    _generateClearanceActions(striker, ball, isGoalie, analysis) {
        const actions = [];
        
        // 1. 原有的边路安全点
        const safeZones = [
            { x: this.targetGoal.x, y: 100 }, 
            { x: this.targetGoal.x, y: this.fieldH - 100 }
        ];

        // [新增] 2. 直接吊向对方球门中心 (Long Shot Clearance)
        // 即使中间有阻挡，往对方球门踢总比往边线踢更有威胁
        safeZones.push(this.targetGoal);

        safeZones.forEach(target => {
            const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, target);
            
            if (this._raycastTest(striker.body.position, ghost.ghostPos, [striker.body])) return;

            let score = 300; 
            
            // 距离己方球门越近，解围分越高
            const distToOwn = Matter.Vector.magnitude(Matter.Vector.sub(ball.body.position, this.ownGoal));
            if (distToOwn < this.fieldW * 0.3) score += 500;

            if (isGoalie) score += 200;

            // 如果是吊射对方球门，额外加分
            if (target === this.targetGoal) score += 150;

            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const kickDir = Matter.Vector.sub(target, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(kickDir));
            
            // 解围对角度要求低，甚至可以切球解围
            if (dot < -0.1) return; 

            score += dot * 200;

            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce); 

            actions.push({
                striker,
                force,
                score,
                type: 'clearance',
                desc: target === this.targetGoal ? '长传反击' : '安全解围'
            });
        });

        return actions;
    }

    _findSabotageMove(myStrikers, threatSource) {
        if (!threatSource) return null;
        
        const distToGoal = Matter.Vector.magnitude(Matter.Vector.sub(threatSource.body.position, this.targetGoal));
        
        let bestSabotage = null;
        let minDist = Infinity;

        myStrikers.forEach(s => {
            if (s.id === this._analyzeSituation(myStrikers, [], this.scene.ball).goalkeeperId) return;

            const dir = Matter.Vector.sub(threatSource.body.position, s.body.position);
            const dist = Matter.Vector.magnitude(dir);
            
            let isPushingIntoNet = false;
            if (distToGoal < 250) { 
                const toGoal = Matter.Vector.sub(this.targetGoal, threatSource.body.position);
                const pushDir = Matter.Vector.normalise(dir);
                const goalDir = Matter.Vector.normalise(toGoal);
                if (Matter.Vector.dot(pushDir, goalDir) > 0.3) {
                    isPushingIntoNet = true;
                }
            }

            if (!isPushingIntoNet && dist < minDist && !this._raycastTest(s.body.position, threatSource.body.position, [s.body, threatSource.body])) {
                minDist = dist;
                const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
                const force = Matter.Vector.mult(Matter.Vector.normalise(dir), maxForce); 
                
                bestSabotage = {
                    striker: s,
                    force: force,
                    type: 'sabotage',
                    score: 9999 
                };
            }
        });
        
        return bestSabotage;
    }

    _findDefensiveMove(strikers, ball, threatLine) {
        let bestDefender = null;
        let minCost = Infinity;
        let targetPos = null;

        const goalTarget = threatLine ? threatLine.end : this.ownGoal;
        const vecGoalToBall = Matter.Vector.sub(ball.body.position, goalTarget);
        const defensePoint = Matter.Vector.add(goalTarget, Matter.Vector.mult(vecGoalToBall, 0.35)); 

        // [修改] 强制防守点在球门外 (Clamping)
        const safeMargin = 70; // 稍微大于棋子半径
        if (this.teamId === TeamId.LEFT) {
            // 左边球门在 x=fieldX, 防守点必须 > fieldX + safeMargin
            if (defensePoint.x < this.fieldX + safeMargin) {
                defensePoint.x = this.fieldX + safeMargin;
            }
        } else {
            // 右边球门在 x=fieldX+fieldW, 防守点必须 < fieldX+fieldW - safeMargin
            if (defensePoint.x > this.fieldX + this.fieldW - safeMargin) {
                defensePoint.x = this.fieldX + this.fieldW - safeMargin;
            }
        }

        strikers.forEach(s => {
            const dist = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, defensePoint));
            const distToGoalS = Math.abs(s.body.position.x - goalTarget.x);
            const distToGoalB = Math.abs(ball.body.position.x - goalTarget.x);
            const isBehindBall = distToGoalS < distToGoalB + 50; 

            if (isBehindBall && dist < minCost) {
                if (!this._raycastTest(s.body.position, defensePoint, [s.body])) {
                    minCost = dist;
                    bestDefender = s;
                    targetPos = defensePoint;
                }
            }
        });

        if (bestDefender && targetPos) {
            const dir = Matter.Vector.sub(targetPos, bestDefender.body.position);
            const dist = Matter.Vector.magnitude(dir);
            const power = Math.min(dist * 0.005, GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier); 
            const force = Matter.Vector.mult(Matter.Vector.normalise(dir), power);
            
            return {
                striker: bestDefender,
                force: force,
                score: 2000,
                type: 'defense'
            };
        }
        return null;
    }

    /**
     * [优化] 兜底安全移动
     * 当没有好的射门或解围路线时调用。
     * 旧逻辑：轻推 (0.2力)。
     * 新逻辑：大力往场地中央踢 (0.8力)。
     */
    _fallbackSafeMove(strikers, ball, analysis) {
        let subject = strikers[0];
        // 优先使用最近的棋子，而不是守门员，除非守门员最近
        let minDist = Infinity;
        strikers.forEach(s => {
            const d = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, ball.body.position));
            if (d < minDist) {
                minDist = d;
                subject = s;
            }
        });

        const fieldCenter = { x: this.fieldX + this.fieldW / 2, y: this.fieldY + this.fieldH / 2 };
        const ghost = this._calculateGhostBall(subject.body.position, ball.body.position, fieldCenter);
        
        // 如果能打向中心，就打向中心
        if (!this._raycastTest(subject.body.position, ghost.ghostPos, [subject.body])) {
            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            return {
                striker: subject,
                force: Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce * 0.8),
                type: 'fallback_clear',
                desc: '盲射解围'
            };
        }

        // 如果连中心都打不了（被围死），就往自家球门反方向随便踢一脚
        const awayFromGoal = Matter.Vector.sub(ball.body.position, this.ownGoal);
        const randomAngle = (Math.random() - 0.5) * Math.PI / 2; // +/- 45度
        const randomDir = Matter.Vector.rotate(awayFromGoal, randomAngle);
        
        const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
        
        return {
            striker: subject,
            force: Matter.Vector.mult(Matter.Vector.normalise(randomDir), maxForce * 0.6),
            type: 'fallback_panic',
            desc: '慌乱一脚'
        };
    }

    // ==========================================
    //              物理/几何辅助
    // ==========================================

    _calculateGhostBall(strikerPos, ballPos, targetPos) {
        const ballToTarget = Matter.Vector.sub(targetPos, ballPos);
        const dir = Matter.Vector.normalise(ballToTarget);
        const radiusSum = this.strikerR + this.ballR;
        const ghostPos = Matter.Vector.sub(ballPos, Matter.Vector.mult(dir, radiusSum));
        const shootVector = Matter.Vector.sub(ghostPos, strikerPos);
        return { shootVector, ghostPos };
    }

    // 简单的布尔检测
    _raycastTest(start, end, ignoreBodies = []) {
        const bodies = this.scene.physics.engine.world.bodies;
        const collisions = Matter.Query.ray(bodies, start, end);
        for (const col of collisions) {
            const body = col.body;
            if (body.isSensor) continue;
            if (body.label && body.label.includes('GoalNet')) continue;
            if (ignoreBodies.includes(body)) continue;
            return true;
        }
        return false;
    }

    // [新增] 返回阻挡物体的列表
    _raycastGetBodies(start, end, ignoreBodies = []) {
        const bodies = this.scene.physics.engine.world.bodies;
        const collisions = Matter.Query.ray(bodies, start, end);
        const hits = [];
        for (const col of collisions) {
            const body = col.body;
            if (body.isSensor) continue;
            if (body.label && body.label.includes('GoalNet')) continue;
            if (ignoreBodies.includes(body)) continue;
            hits.push(body);
        }
        return hits;
    }

    // [新增] 检查球和目标之间是否有对手阻挡 (用于判断射门安全性)
    _isOpponentInPath(start, end) {
        const bodies = this._raycastGetBodies(start, end, [this.scene.ball.body]);
        for (const b of bodies) {
            if (b.label === 'Striker' && b.entity && b.entity.teamId === this.opponentId) {
                return true;
            }
        }
        return false;
    }
}
