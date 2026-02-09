
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
        const defenseThreshold = isLosing ? 0.6 : 0.3; 
        
        if (analysis.isCriticalThreat && config.defenseAwareness > defenseThreshold) {
            // 优先尝试直接解围球 (Clearance)
            let bestClearance = null;
            let maxClearScore = -Infinity;
            
            for (const s of myStrikers) {
                const isGoalie = (s.id === analysis.goalkeeperId);
                const clears = this._generateClearanceActions(s, ball, isGoalie, analysis);
                for (const c of clears) {
                    const distToBall = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, ball.body.position));
                    const score = c.score - distToBall * 0.5; 
                    if (score > maxClearScore) {
                        maxClearScore = score;
                        bestClearance = c;
                    }
                }
            }
            if (bestClearance) {
                bestClearance.score = 10000; 
                bestClearance.desc = "紧急解围";
                return bestClearance;
            }

            const sabotage = this._findSabotageMove(myStrikers, analysis.threatSource);
            if (sabotage) return sabotage;
            
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

            // --- B. 反弹射门 (Bank Shot) ---
            if (config.strategyDepth >= 1 || isLosing) {
                const bankActions = this._generateBankShotActions(striker, ball, isGoalie, config);
                for (const action of bankActions) {
                    if (action.score > maxScore) { maxScore = action.score; bestMove = action; }
                }
            }

            // --- C. 暴力破局 (Breakthrough) ---
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

        // 绝对危险区判定
        if (distToOwn < 350) {
            for (const opp of oppStrikers) {
                const distOppBall = Matter.Vector.magnitude(Matter.Vector.sub(opp.body.position, bPos));
                if (distOppBall < 400) { 
                    isCriticalThreat = true;
                    isThreatened = true;
                    threatSource = opp;
                    threatLine = { start: bPos, end: this.ownGoal };
                    break; 
                }
            }
        }

        // 常规威胁判定
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
                    
                    // [升级] 使用体积射线检测
                    // 注意：这里检测对方能否射门，忽略球和对方自己
                    const oppBlocked = this._isPathBlocked(opp.body.position, ghost.ghostPos, this.strikerR, [ball.body, opp.body]);
                    const shotBlocked = this._isPathBlocked(bPos, target, this.ballR, [ball.body]);

                    if (!oppBlocked && !shotBlocked) {
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
            
            // 1. [升级] 路径阻挡检测 (体积检测)
            // 球->球门 (使用球半径)
            if (this._isPathBlocked(ball.body.position, target, this.ballR, [ball.body, striker.body])) return; 
            
            // 人->球 (使用人半径)
            // [关键修复] 检测前往球的路径时，必须忽略球本身，否则会被误判为阻挡
            if (this._isPathBlocked(striker.body.position, ball.body.position, this.strikerR, [striker.body, ball.body])) return;

            // 2. 计算得分
            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const vecBallToGoal = Matter.Vector.sub(target, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(vecBallToGoal));
            
            if (dot < (isLosing ? 0.05 : 0.1)) return;

            const distBallGoal = Matter.Vector.magnitude(vecBallToGoal);
            
            let score = (dot * 600) + (1000 - distBallGoal * 0.3);

            if (isGoalie) {
                const isSafeShot = dot > 0.9 && !this._isOpponentInPath(ball.body.position, target);
                if (!isSafeShot) score -= 2000; 
                else if (isLosing) score += 500; 
            }

            if (isLosing) score += 400;

            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            let powerRatio = Math.min(1.0, (distBallGoal / 1500) + 0.35);
            if (dot < 0.8) powerRatio += 0.2;
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

    _generateBankShotActions(striker, ball, isGoalie, config) {
        const actions = [];
        if (isGoalie) return actions; 

        const wallTopY = this.fieldY + this.ballR; 
        const wallBottomY = this.fieldY + this.fieldH - this.ballR;

        const mirrorTop = { x: this.targetGoal.x, y: 2 * wallTopY - this.targetGoal.y };
        const mirrorBottom = { x: this.targetGoal.x, y: 2 * wallBottomY - this.targetGoal.y };

        const scenarios = [
            { mirror: mirrorTop, wallY: wallTopY, label: "TopBank" },
            { mirror: mirrorBottom, wallY: wallBottomY, label: "BottomBank" }
        ];

        for (const scene of scenarios) {
            const toMirror = Matter.Vector.sub(scene.mirror, ball.body.position);
            if (Math.abs(toMirror.y) < 1) continue;
            const t = (scene.wallY - ball.body.position.y) / toMirror.y;
            if (t <= 0 || t >= 1) continue; 

            const hitPoint = Matter.Vector.add(ball.body.position, Matter.Vector.mult(toMirror, t));
            if (hitPoint.x < this.fieldX || hitPoint.x > this.fieldX + this.fieldW) continue;

            // B. [升级] 路径检测 (体积检测)
            // 球->撞墙点
            if (this._isPathBlocked(ball.body.position, hitPoint, this.ballR, [ball.body, striker.body])) continue;
            // 撞墙点->球门
            if (this._isPathBlocked(hitPoint, this.targetGoal, this.ballR, [ball.body])) continue;

            // C. 击球计算
            const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, hitPoint);
            
            // 人->球
            // [关键修复] 忽略球本身
            if (this._isPathBlocked(striker.body.position, ball.body.position, this.strikerR, [striker.body, ball.body])) continue;

            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const vecBallToHit = Matter.Vector.sub(hitPoint, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(vecBallToHit));
            
            if (dot < 0.3) continue; 

            let score = 800; 
            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce); 

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

    _generateBreakthroughActions(striker, ball, isGoalie) {
        const actions = [];
        if (isGoalie) return actions;

        const target = this.targetGoal;
        const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, target);

        // 这里的阻挡检查用于判断是否值得破局，所以用原生的 raycast 获取物体列表比较合适
        const obstacles = this._raycastGetBodies(ball.body.position, target, [ball.body, striker.body]);
        if (obstacles.length === 0) return actions;

        let hasOpponentBlocker = false;
        let blockerDistance = Infinity;

        for (const body of obstacles) {
            if (body.label === 'Wall' || body.label.includes('Goal')) return actions; 
            if (body.label === 'Striker') {
                if (body.entity && body.entity.teamId === this.opponentId) {
                    hasOpponentBlocker = true;
                    const d = Matter.Vector.magnitude(Matter.Vector.sub(body.position, ball.body.position));
                    if (d < blockerDistance) blockerDistance = d;
                }
            }
        }

        if (hasOpponentBlocker && blockerDistance < 250) {
            // 人->球 (体积检测)
            // [关键修复] 忽略球本身
            if (this._isPathBlocked(striker.body.position, ball.body.position, this.strikerR, [striker.body, ball.body])) return actions;

            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const vecBallToGoal = Matter.Vector.sub(target, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(vecBallToGoal));

            if (dot < 0.7) return actions;

            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            const force = Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce); 

            actions.push({
                striker,
                force,
                score: 750, 
                type: 'breakthrough',
                desc: '暴力破局'
            });
        }

        return actions;
    }

    _generateClearanceActions(striker, ball, isGoalie, analysis) {
        const actions = [];
        const safeZones = [
            { x: this.targetGoal.x, y: 100 }, 
            { x: this.targetGoal.x, y: this.fieldH - 100 },
            this.targetGoal
        ];

        safeZones.forEach(target => {
            const ghost = this._calculateGhostBall(striker.body.position, ball.body.position, target);
            
            // 人->球 (体积检测)
            // [关键修复] 忽略球本身
            if (this._isPathBlocked(striker.body.position, ball.body.position, this.strikerR, [striker.body, ball.body])) return;

            let score = 300; 
            const distToOwn = Matter.Vector.magnitude(Matter.Vector.sub(ball.body.position, this.ownGoal));
            if (distToOwn < this.fieldW * 0.3) score += 500;
            if (isGoalie) score += 200;
            if (target === this.targetGoal) score += 150;

            const vecStrikerToBall = Matter.Vector.sub(ball.body.position, striker.body.position);
            const kickDir = Matter.Vector.sub(target, ball.body.position);
            const dot = Matter.Vector.dot(Matter.Vector.normalise(vecStrikerToBall), Matter.Vector.normalise(kickDir));
            
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

            // 人 -> 敌方 (体积检测)
            if (!isPushingIntoNet && dist < minDist && !this._isPathBlocked(s.body.position, threatSource.body.position, this.strikerR, [s.body, threatSource.body])) {
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

        const safeMargin = 70; 
        if (this.teamId === TeamId.LEFT) {
            if (defensePoint.x < this.fieldX + safeMargin) defensePoint.x = this.fieldX + safeMargin;
        } else {
            if (defensePoint.x > this.fieldX + this.fieldW - safeMargin) defensePoint.x = this.fieldX + this.fieldW - safeMargin;
        }

        strikers.forEach(s => {
            const dist = Matter.Vector.magnitude(Matter.Vector.sub(s.body.position, defensePoint));
            const distToGoalS = Math.abs(s.body.position.x - goalTarget.x);
            const distToGoalB = Math.abs(ball.body.position.x - goalTarget.x);
            const isBehindBall = distToGoalS < distToGoalB + 50; 

            if (isBehindBall && dist < minCost) {
                // 人 -> 空地 (体积检测)
                if (!this._isPathBlocked(s.body.position, defensePoint, this.strikerR, [s.body])) {
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

    _fallbackSafeMove(strikers, ball, analysis) {
        let subject = strikers[0];
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
        
        // 人 -> 球 (体积检测)
        // [关键修复] 忽略球本身
        if (!this._isPathBlocked(subject.body.position, ball.body.position, this.strikerR, [subject.body, ball.body])) {
            const maxForce = GameConfig.gameplay.maxDragDistance * GameConfig.gameplay.forceMultiplier;
            return {
                striker: subject,
                force: Matter.Vector.mult(Matter.Vector.normalise(ghost.shootVector), maxForce * 0.8),
                type: 'fallback_clear',
                desc: '盲射解围'
            };
        }

        const awayFromGoal = Matter.Vector.sub(ball.body.position, this.ownGoal);
        const randomAngle = (Math.random() - 0.5) * Math.PI / 2; 
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
        
        // 保持穿透深度，确保扎实击球
        const radiusSum = this.strikerR + this.ballR - 5; 
        
        const ghostPos = Matter.Vector.sub(ballPos, Matter.Vector.mult(dir, radiusSum));
        const shootVector = Matter.Vector.sub(ghostPos, strikerPos);
        return { shootVector, ghostPos };
    }

    /**
     * [核心] 判断路径是否被阻挡 (体积射线检测)
     * @param {Vector} start 起点
     * @param {Vector} end 终点
     * @param {Number} radius 物体半径 (用于宽射线)
     * @param {Array} ignoreBodies 忽略的刚体列表
     */
    _isPathBlocked(start, end, radius, ignoreBodies = []) {
        // 1. 中心射线检测
        if (this._raycastSingle(start, end, ignoreBodies)) return true;

        // 2. 如果提供了半径，进行两侧边缘检测
        if (radius > 0) {
            const dx = end.x - start.x;
            const dy = end.y - start.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            
            if (len < 1) return false;

            // 计算垂直方向的单位向量 (-dy, dx)
            const nx = -dy / len;
            const ny = dx / len;
            
            // 使用略小于半径的宽度 (0.9倍) 进行检测，避免紧贴墙壁时的误判
            const r = radius * 0.9;

            // 左边缘射线
            const lStart = { x: start.x + nx * r, y: start.y + ny * r };
            const lEnd = { x: end.x + nx * r, y: end.y + ny * r };
            if (this._raycastSingle(lStart, lEnd, ignoreBodies)) return true;

            // 右边缘射线
            const rStart = { x: start.x - nx * r, y: start.y - ny * r };
            const rEnd = { x: end.x - nx * r, y: end.y - ny * r };
            if (this._raycastSingle(rStart, rEnd, ignoreBodies)) return true;
        }

        return false;
    }

    _raycastSingle(start, end, ignoreBodies) {
        const bodies = this.scene.physics.engine.world.bodies;
        const collisions = Matter.Query.ray(bodies, start, end);
        
        for (const col of collisions) {
            const body = col.body;
            if (body.isSensor) continue;
            // 忽略球网和球门感应区 (因为射门的目标就是穿过它们)
            if (body.label && (body.label.includes('GoalNet') || body.label.includes('GoalSensor'))) continue;
            
            if (ignoreBodies.includes(body)) continue;
            
            return true; // 撞到了障碍物
        }
        return false;
    }

    // 保留旧方法用于获取物体列表
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

    _isOpponentInPath(start, end) {
        // 这里使用更严格的体积检测来判断对手是否在路线上
        // 半径取 BallRadius，因为是球要通过
        return this._isPathBlocked(start, end, this.ballR, [this.scene.ball.body]);
    }
}
