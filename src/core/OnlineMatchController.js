
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
        this.pendingTurn = null;
        this.hasOpponentLeft = false;

        // --- 录制相关 (Sender) ---
        this.sendBuffer = []; 
        this.sendTimer = 0;   

        // --- 回放相关 (Receiver) ---
        this.isReplaying = false;      
        this.isBuffering = false;      
        this.replayQueue = [];         
        this.replayTime = 0;           
        this.totalBufferedTime = 0;    
        
        EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
    }

    update(delta) {
        const isMyTurn = this.scene.turnMgr.currentTurn === this.scene.myTeamId;

        if (this.scene.isMoving) {
            if (isMyTurn) {
                // 我是攻击方：记录当前帧
                this._recordFrame(delta);
            } else if (this.isReplaying) {
                // 我是防守方：播放回放
                this._processPlayback(delta);
            }
        }
    }

    _recordFrame(dt) {
        const frameData = {
            t: dt, 
            bodies: {}
        };

        let hasActive = false;
        if (this.scene.ball && this.scene.ball.body) {
            const b = this.scene.ball.body;
            frameData.bodies['ball'] = this._packBodyData(b);
            hasActive = true;
        }

        this.scene.strikers.forEach(s => {
            if (s.body) {
                frameData.bodies[s.id] = this._packBodyData(s.body);
            }
        });

        this.sendBuffer.push(frameData);
        this.sendTimer += dt;

        if (this.sendTimer >= GameConfig.network.trajectorySendInterval) {
            this._flushSendBuffer();
        }
    }

    _packBodyData(body) {
        return {
            x: Number(body.position.x.toFixed(1)),
            y: Number(body.position.y.toFixed(1)),
            a: Number(body.angle.toFixed(3)),
            vx: Number(body.velocity.x.toFixed(2)), 
            vy: Number(body.velocity.y.toFixed(2))
        };
    }

    _flushSendBuffer() {
        if (this.sendBuffer.length === 0) return;
        NetworkMgr.send({
            type: NetMsg.TRAJECTORY_BATCH,
            payload: { frames: this.sendBuffer }
        });
        this.sendBuffer = [];
        this.sendTimer = 0;
    }

    _processPlayback(dt) {
        if (this.isBuffering) {
            if (this.totalBufferedTime >= GameConfig.network.replayBufferTime) {
                this.isBuffering = false;
            } else {
                return;
            }
        }

        if (this.replayQueue.length === 0) return;

        let remainingDt = dt;
        while (remainingDt > 0 && this.replayQueue.length > 0) {
            const currentFrame = this.replayQueue[0];
            
            if (currentFrame.isEvent) {
                this._handleReplayEvent(currentFrame);
                this.replayQueue.shift(); 
                continue; 
            }

            if (currentFrame.t > remainingDt) {
                currentFrame.t -= remainingDt;
                this._applyFrameState(currentFrame);
                remainingDt = 0;
            } else {
                remainingDt -= currentFrame.t;
                this._applyFrameState(currentFrame);
                this.replayQueue.shift();
                this.totalBufferedTime -= currentFrame.originalT || currentFrame.t; 
            }
        }
    }

    _handleReplayEvent(frame) {
        if (frame.eventType === NetMsg.GOAL) {
            const { newScore } = frame.payload;
            this.scene.rules.score = newScore;
            this.scene._playGoalEffects(newScore);
        }
    }

    _applyFrameState(frame) {
        const bodies = frame.bodies;
        if (!bodies) return;

        if (bodies['ball'] && this.scene.ball) {
            this._setBodyState(this.scene.ball.body, bodies['ball']);
        }
        for (const id in bodies) {
            if (id === 'ball') continue;
            const striker = this.scene.strikers.find(s => s.id === id);
            if (striker) {
                this._setBodyState(striker.body, bodies[id]);
            }
        }
    }

    _setBodyState(body, data) {
        Matter.Body.setPosition(body, { x: data.x, y: data.y });
        Matter.Body.setAngle(body, data.a);
        Matter.Body.setVelocity(body, { x: data.vx, y: data.vy });
    }

    onNetMessage(msg) {
        const scene = this.scene;

        switch (msg.type) {
            case NetMsg.MOVE:
                scene.input.handleRemoteAim(NetMsg.AIM_END);
                this.pendingTurn = msg.payload.nextTurn;

                const striker = scene.strikers.find(s => s.id === msg.payload.id);
                // 只有当击球者不是我的时候，才进入回放逻辑
                if (striker && striker.teamId !== scene.myTeamId) {
                    const usedSkills = msg.payload.skills || {};
                    
                    // 应用技能特效到球上
                    if (usedSkills[SkillType.UNSTOPPABLE] && scene.ball) {
                         scene.ball.activateUnstoppable(GameConfig.gameplay.skills.unstoppable.duration);
                    }
                    if (usedSkills[SkillType.SUPER_FORCE] && scene.ball) {
                         scene.ball.setLightningMode(true);
                    }
                    
                    // [核心修改] 
                    // 对方已经出球了，技能效果已经生效。
                    // 此时应该重置 UI 上显示的对手技能图标（熄灭它们）。
                    if (scene.skillMgr) {
                        scene.skillMgr.resetRemoteSkills(striker.teamId);
                    }

                    this.isReplaying = true;
                    this.isBuffering = true;
                    this.replayQueue = [];
                    this.totalBufferedTime = 0;
                    scene.onActionFired(true); 
                }
                break;

            case NetMsg.TRAJECTORY_BATCH:
                if (this.isReplaying) {
                    const frames = msg.payload.frames;
                    if (frames && frames.length > 0) {
                        frames.forEach(f => {
                            f.originalT = f.t; 
                            this.replayQueue.push(f);
                            this.totalBufferedTime += f.t;
                        });
                    }
                }
                break;

            case NetMsg.AIM_START:
            case NetMsg.AIM_UPDATE:
            case NetMsg.AIM_END:
                scene.input.handleRemoteAim(msg.type, msg.payload);
                break;
            
            // [同步技能选中状态]
            case NetMsg.SKILL:
                if (scene.skillMgr) scene.skillMgr.handleRemoteSkill(msg.payload);
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

            case NetMsg.TURN_SYNC:
                this._handleTurnSync(msg.payload);
                break;

            case NetMsg.GOAL:
                if (this.isReplaying) {
                    this.replayQueue.push({
                        isEvent: true,
                        eventType: NetMsg.GOAL,
                        payload: msg.payload,
                        t: 0 
                    });
                } else {
                    const newScore = msg.payload.newScore;
                    scene.rules.score = newScore;
                    scene._playGoalEffects(newScore);
                }
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

    _handleTurnSync(payload) {
        this.isReplaying = false;
        this.isBuffering = false;
        this.replayQueue = [];
        
        if (payload.strikers) {
            payload.strikers.forEach(data => {
                const s = this.scene.strikers.find(st => st.id === data.id);
                if (s) {
                    Matter.Body.setPosition(s.body, data.pos);
                    Matter.Body.setVelocity(s.body, {x:0, y:0});
                    Matter.Body.setAngularVelocity(s.body, 0); 
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
        this._flushSendBuffer();
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

    destroy() {
        EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
    }
}
