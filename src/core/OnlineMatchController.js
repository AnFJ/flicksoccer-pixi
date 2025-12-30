
import Matter from 'matter-js';
import NetworkMgr from '../managers/NetworkMgr.js';
import EventBus from '../managers/EventBus.js';
import Platform from '../managers/Platform.js';
import { Events, NetMsg, TeamId, SkillType } from '../constants.js';
import { GameConfig } from '../config.js';

/**
 * 联机对战控制器
 */
export default class OnlineMatchController {
    constructor(scene) {
        this.scene = scene;
        this.snapshotTimer = 0;
        this.pendingTurn = null;
        this.hasOpponentLeft = false;
        EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
    }

    update(delta) {
        if (this.scene.isMoving && this.scene.turnMgr.currentTurn === this.scene.myTeamId) {
            this.snapshotTimer += delta;
            // [修改] 使用配置的时间间隔
            if (this.snapshotTimer > GameConfig.network.snapshotInterval) {
                this.snapshotTimer = 0;
                this._sendSnapshot();
            }
        }
    }

    onNetMessage(msg) {
        const scene = this.scene;

        switch (msg.type) {
            case NetMsg.MOVE:
                scene.input.handleRemoteAim(NetMsg.AIM_END); 
                
                const striker = scene.strikers.find(s => s.id === msg.payload.id);
                if (striker) {
                    const isMyStriker = (striker.teamId === scene.myTeamId);
                    if (!isMyStriker) {
                        // [关键修复] 直接从 MOVE 消息中获取技能状态，而不是依赖本地状态
                        // 这样避免了网络时序导致的状态不一致
                        const usedSkills = msg.payload.skills || {};

                        if (usedSkills[SkillType.UNSTOPPABLE]) {
                             if (scene.ball) scene.ball.activateUnstoppable(GameConfig.gameplay.skills.unstoppable.duration);
                        }
                        
                        if (usedSkills[SkillType.SUPER_FORCE]) {
                             if (scene.ball) scene.ball.setLightningMode(true);
                        }

                        Matter.Body.applyForce(striker.body, striker.body.position, msg.payload.force);
                        scene.onActionFired();
                        
                        // 远程动作触发后，我们也重置本地的技能显示（防止 UI 状态残留）
                        scene.skillMgr.consumeSkills();
                    }
                    this.pendingTurn = msg.payload.nextTurn;
                }
                break;

            case NetMsg.AIM_START:
            case NetMsg.AIM_UPDATE:
            case NetMsg.AIM_END:
                scene.input.handleRemoteAim(msg.type, msg.payload);
                break;
            
            case NetMsg.SKILL:
                if (scene.skillMgr) {
                    scene.skillMgr.handleRemoteSkill(msg.payload);
                }
                break;

            case NetMsg.FAIR_PLAY_MOVE:
                const { id, end, duration } = msg.payload;
                const s = scene.strikers.find(st => st.id === id);
                if (s) {
                    s.body.isSensor = true;
                    scene.repositionAnimations.push({
                        body: s.body,
                        start: { x: s.body.position.x, y: s.body.position.y },
                        end: end,
                        time: 0,
                        duration: duration
                    });
                }
                break;

            case NetMsg.SNAPSHOT:
                this._handleSnapshot(msg.payload);
                break;

            case NetMsg.TURN_SYNC:
                this._handleTurnSync(msg.payload);
                break;

            case NetMsg.GOAL:
                const newScore = msg.payload.newScore;
                scene.rules.score = newScore;
                scene._playGoalEffects(newScore);
                break;

            case NetMsg.PLAYER_LEFT_GAME:
                this._handlePlayerLeft(msg.payload);
                break;

            case NetMsg.PLAYER_OFFLINE:
                this._handlePlayerOffline(msg.payload);
                break;

            case NetMsg.PLAYER_JOINED:
                this._handlePlayerReconnected();
                break;

            case NetMsg.LEAVE:
                Platform.showToast("已离开游戏");
                setTimeout(() => {
                    scene.onGameOver({ winner: -1 }); 
                }, 1000);
                break;
            
            case NetMsg.GAME_OVER:
                Platform.removeStorage('last_room_id');
                break;
        }
    }

    /**
     * 发送游戏状态快照
     * 优化：同步所有运动中的物体（球 + 棋子），而不仅仅是球
     */
    _sendSnapshot() {
        if (!this.scene.ball || !this.scene.ball.body) return;

        const payload = {
            bodies: []
        };

        // 辅助函数：提取刚体数据
        const extractData = (id, body) => {
            // 只同步有明显速度的物体，节省带宽
            if (body.speed > 0.05 || Math.abs(body.angularVelocity) > 0.05) {
                return {
                    id: id,
                    x: Number(body.position.x.toFixed(1)),
                    y: Number(body.position.y.toFixed(1)),
                    vx: Number(body.velocity.x.toFixed(2)),
                    vy: Number(body.velocity.y.toFixed(2)),
                    a: Number(body.angle.toFixed(2)), // 角度
                    va: Number(body.angularVelocity.toFixed(3)) // 角速度
                };
            }
            return null;
        };

        // 1. 足球
        const ballData = extractData('ball', this.scene.ball.body);
        if (ballData) payload.bodies.push(ballData);

        // 2. 所有棋子
        this.scene.strikers.forEach(s => {
            const data = extractData(s.id, s.body);
            if (data) payload.bodies.push(data);
        });

        // 只有当有物体在动时才发送
        if (payload.bodies.length > 0) {
            NetworkMgr.send({ type: NetMsg.SNAPSHOT, payload });
        }
    }

    /**
     * 处理收到的快照
     * 优化：支持多物体同步，增加平滑插值逻辑
     */
    _handleSnapshot(payload) {
        // 如果是自己的回合，忽略收到的快照（以本地计算为准）
        if (this.scene.turnMgr.currentTurn === this.scene.myTeamId) return;
        if (!payload.bodies) return;

        payload.bodies.forEach(data => {
            let body = null;

            if (data.id === 'ball') {
                body = this.scene.ball ? this.scene.ball.body : null;
            } else {
                const striker = this.scene.strikers.find(s => s.id === data.id);
                body = striker ? striker.body : null;
            }

            if (body) {
                this._applySyncToBody(body, data);
            }
        });
    }

    /**
     * 将同步数据应用到刚体 (带插值)
     */
    _applySyncToBody(localBody, serverData) {
        const localPos = localBody.position;
        const dx = serverData.x - localPos.x;
        const dy = serverData.y - localPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 阈值 1: 极其微小的误差，忽略，避免抖动
        if (dist < 2) return;

        // 阈值 2: 误差过大，直接瞬移（防穿墙、防卡死）
        if (dist > 60) {
            Matter.Body.setPosition(localBody, { x: serverData.x, y: serverData.y });
            Matter.Body.setVelocity(localBody, { x: serverData.vx, y: serverData.vy });
            Matter.Body.setAngle(localBody, serverData.a);
            Matter.Body.setAngularVelocity(localBody, serverData.va);
            return;
        }

        // 阈值 3: 正常误差，进行线性插值 (Lerp)
        const lerpFactor = 0.3; // 插值系数
        const newX = localPos.x + dx * lerpFactor;
        const newY = localPos.y + dy * lerpFactor;
        
        Matter.Body.setPosition(localBody, { x: newX, y: newY });
        
        // 速度和角度直接信任服务器，以保证预测轨迹一致
        Matter.Body.setVelocity(localBody, { x: serverData.vx, y: serverData.vy });
        
        // 角度插值 (防止旋转突变)
        const currentAngle = localBody.angle;
        const targetAngle = serverData.a;
        Matter.Body.setAngle(localBody, currentAngle + (targetAngle - currentAngle) * lerpFactor);
        Matter.Body.setAngularVelocity(localBody, serverData.va);
    }

    _handleTurnSync(payload) {
        if (payload.strikers) {
            payload.strikers.forEach(data => {
                const s = this.scene.strikers.find(st => st.id === data.id);
                if (s) {
                    Matter.Body.setPosition(s.body, data.pos);
                    Matter.Body.setVelocity(s.body, {x:0, y:0});
                    Matter.Body.setAngularVelocity(s.body, 0); // 确保停转
                }
            });
        }
        if (this.scene.ball && payload.ball) {
            Matter.Body.setPosition(this.scene.ball.body, payload.ball);
            Matter.Body.setVelocity(this.scene.ball.body, {x:0, y:0});
            Matter.Body.setAngularVelocity(this.scene.ball.body, 0);
        }
        if (this.scene.isMoving) {
            this.scene._endTurn();
        }
    }

    _handlePlayerLeft(payload) {
        const leftTeamId = payload.teamId;
        if (leftTeamId !== undefined) {
            this.hasOpponentLeft = true;
            this.scene.hud?.setPlayerOffline(leftTeamId, true, "玩家主动离开了\n当前对局");
            this.scene.isGamePaused = true;
            this.scene.turnMgr.pause();
            this.scene.input.reset();
            Platform.showToast("对方已离开，游戏暂停");
        }
    }

    _handlePlayerOffline(payload) {
        const offlineTeamId = payload.teamId; 
        if (offlineTeamId !== undefined) {
            if (!this.hasOpponentLeft) {
                this.scene.hud?.setPlayerOffline(offlineTeamId, true);
            }
            this.scene.isGamePaused = true;
            this.scene.turnMgr.pause();
            this.scene.input.reset();
            if (!this.hasOpponentLeft) {
                Platform.showToast("对方连接断开，等待重连...");
            }
        }
    }

    _handlePlayerReconnected() {
        if (this.scene.isGamePaused) {
            this.hasOpponentLeft = false;
            this.scene.hud?.setPlayerOffline(0, false);
            this.scene.hud?.setPlayerOffline(1, false);
            this.scene.isGamePaused = false;
            this.scene.turnMgr.resume();
            Platform.showToast("玩家已重连，继续游戏");
            if (this.scene.turnMgr.currentTurn === this.scene.myTeamId && !this.scene.isMoving) {
                this.syncAllPositions();
            }
        }
    }

    restoreState(snapshot) {
        console.log('[OnlineMatch] Restoring state...', snapshot);
        const scene = this.scene;
        if (snapshot.scores) {
            scene.rules.score = snapshot.scores;
            scene.hud?.updateScore(snapshot.scores[TeamId.LEFT], snapshot.scores[TeamId.RIGHT]);
        }
        if (snapshot.positions && snapshot.positions.strikers) {
            snapshot.positions.strikers.forEach(data => {
                const s = scene.strikers.find(st => st.id === data.id);
                if (s) {
                    Matter.Body.setPosition(s.body, data.pos);
                    Matter.Body.setVelocity(s.body, {x:0, y:0});
                }
            });
            if (scene.ball && snapshot.positions.ball) {
                Matter.Body.setPosition(scene.ball.body, snapshot.positions.ball);
                Matter.Body.setVelocity(scene.ball.body, {x:0, y:0});
            }
        }
        Platform.showToast("已恢复对局");
    }

    handleLocalGoal(data) {
        if (this.scene.turnMgr.currentTurn !== this.scene.myTeamId) {
            this.scene.rules.score[data.scoreTeam]--;
            return true; 
        }
        NetworkMgr.send({
            type: NetMsg.GOAL,
            payload: { newScore: data.newScore }
        });
        return true; 
    }

    sendFairPlayMove(id, start, end, duration) {
        NetworkMgr.send({
            type: NetMsg.FAIR_PLAY_MOVE,
            payload: { id, start, end, duration }
        });
    }

    syncAllPositions() {
        const payload = {
            strikers: this.scene.strikers.map(s => ({ id: s.id, pos: { x: s.body.position.x, y: s.body.position.y } })),
            ball: { x: this.scene.ball.body.position.x, y: this.scene.ball.body.position.y }
        };
        NetworkMgr.send({ type: NetMsg.TURN_SYNC, payload });
    }

    popPendingTurn() {
        const turn = this.pendingTurn;
        this.pendingTurn = null;
        return turn;
    }

    destroy() {
        EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
    }
}
