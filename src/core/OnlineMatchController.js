
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

    _sendSnapshot() {
        if (!this.scene.ball || !this.scene.ball.body) return;
        const payload = {
            ball: {
                pos: { x: this.scene.ball.body.position.x, y: this.scene.ball.body.position.y },
                vel: { x: this.scene.ball.body.velocity.x, y: this.scene.ball.body.velocity.y }
            }
        };
        NetworkMgr.send({ type: NetMsg.SNAPSHOT, payload });
    }

    _handleSnapshot(payload) {
        if (!this.scene.ball || !payload.ball) return;
        if (this.scene.turnMgr.currentTurn === this.scene.myTeamId) return;

        const serverPos = payload.ball.pos;
        const serverVel = payload.ball.vel;
        const localBody = this.scene.ball.body;
        const localPos = localBody.position;

        const dx = serverPos.x - localPos.x;
        const dy = serverPos.y - localPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) return;

        if (dist > 50) {
            Matter.Body.setPosition(localBody, serverPos);
            Matter.Body.setVelocity(localBody, serverVel);
            return;
        }

        const lerpFactor = 0.2;
        const newX = localPos.x + dx * lerpFactor;
        const newY = localPos.y + dy * lerpFactor;
        
        Matter.Body.setPosition(localBody, { x: newX, y: newY });
        Matter.Body.setVelocity(localBody, serverVel);
    }

    _handleTurnSync(payload) {
        if (payload.strikers) {
            payload.strikers.forEach(data => {
                const s = this.scene.strikers.find(st => st.id === data.id);
                if (s) {
                    Matter.Body.setPosition(s.body, data.pos);
                    Matter.Body.setVelocity(s.body, {x:0, y:0});
                }
            });
        }
        if (this.scene.ball && payload.ball) {
            Matter.Body.setPosition(this.scene.ball.body, payload.ball);
            Matter.Body.setVelocity(this.scene.ball.body, {x:0, y:0});
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
