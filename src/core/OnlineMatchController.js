
import Matter from 'matter-js';
import NetworkMgr from '../managers/NetworkMgr.js';
import EventBus from '../managers/EventBus.js';
import Platform from '../managers/Platform.js';
import { Events, NetMsg, TeamId, SkillType } from '../constants.js';
import { GameConfig } from '../config.js';
import AudioManager from '../managers/AudioManager.js';

/**
 * 联机对战控制器 (重构版)
 * 核心原则：发送方(Sender)是唯一事实来源，接收方(Receiver)严格按照队列回放事件。
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
        this.replayQueue = []; // 队列中可以包含物理帧Frame 或 事件Event
        this.replayTime = 0;           
        this.totalBufferedTime = 0;    
        
        EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
        EventBus.on(Events.PLAY_SOUND, this.onLocalSound, this); 
    }

    update(delta) {
        const isMyTurn = this.scene.turnMgr.currentTurn === this.scene.myTeamId;

        // 如果是我的回合，我在操作(Moving)，则录制
        // 如果不是我的回合，且正在回放模式，则播放
        if (this.scene.isMoving) {
            if (isMyTurn) {
                this._recordFrame(delta);
            } else if (this.isReplaying) {
                this._processPlayback(delta);
            }
        }
    }

    /**
     * [Sender] 监听并记录本地音效
     */
    onLocalSound(key) {
        const isMyTurn = this.scene.turnMgr.currentTurn === this.scene.myTeamId;
        if (isMyTurn && this.scene.isMoving) {
            this.sendBuffer.push({
                t: 0, 
                isEvent: true,
                eventType: 'SOUND',
                key: key
            });
        }
    }

    /**
     * [Sender] 录制物理帧
     */
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

    /**
     * [Receiver] 播放回放队列
     * 队列中混合了 物理帧 和 关键事件(进球、回合结束)
     */
    _processPlayback(dt) {
        // 如果缓冲中，判断是否可以开始
        if (this.isBuffering) {
            if (this.totalBufferedTime >= GameConfig.network.replayBufferTime) {
                this.isBuffering = false;
            } else {
                return;
            }
        }

        let remainingDt = dt;

        while (remainingDt > 0 || this.replayQueue.length > 0) {
            // 如果队列空了，停止播放，等待更多数据
            if (this.replayQueue.length === 0) {
                // 如果时间也没了，直接退出
                if (remainingDt > 0) {
                    // console.log("Buffer empty, waiting...");
                }
                break;
            }

            const item = this.replayQueue[0];

            // --- 情况 A: 处理事件 (t=0) ---
            if (item.isEvent) {
                this._handleReplayEvent(item);
                this.replayQueue.shift();
                continue; // 事件处理完继续循环，不消耗 dt
            }

            // --- 情况 B: 处理物理帧 ---
            // 如果当前帧的时间 > 剩余时间，说明这一帧只播放一部分
            if (item.t > remainingDt) {
                item.t -= remainingDt;
                // 这里我们不需要真正插值，只需要应用物理状态。
                // 为了平滑，理想情况是根据 remainingDt 插值，但这里直接应用目标状态作为简化
                this._applyFrameState(item); 
                remainingDt = 0;
            } else {
                // 当前帧时间 <= 剩余时间，完整播放这一帧
                remainingDt -= item.t;
                this._applyFrameState(item);
                
                // 移除帧，并更新缓冲总时长
                this.replayQueue.shift();
                this.totalBufferedTime -= item.originalT || item.t;
            }
            
            if (remainingDt <= 0) break;
        }
    }

    _handleReplayEvent(event) {
        console.log(`[Online] Replay Event: ${event.eventType}`, event.payload);

        if (event.eventType === NetMsg.GOAL) {
            // 执行进球逻辑：更新比分，播放特效
            this._executeRemoteGoal(event.payload);
        } 
        else if (event.eventType === NetMsg.TURN_SYNC) {
            // 执行回合结束逻辑：同步最终位置，切换回合
            this._executeRemoteTurnSync(event.payload);
        }
        else if (event.eventType === 'SOUND') {
            AudioManager.playSFX(event.key);
        }
    }

    // [Receiver] 执行远程进球
    _executeRemoteGoal(payload) {
        const { newScore, scoreTeam } = payload;
        
        // 双重校验，防止重复进球 (虽然序列化后几率很小)
        const currentScore = this.scene.rules.score[scoreTeam];
        if (newScore[scoreTeam] <= currentScore) {
            return;
        }

        this.scene.rules.score = newScore;
        // 调用 Scene 的特效逻辑
        // 注意：Scene.onGoal 里会判断如果是接收方则只播特效
        this.scene._playGoalEffects(newScore, scoreTeam);
        
        // 检查游戏是否结束
        this._checkRemoteGameOver(newScore);
    }

    // [Receiver] 执行远程回合同步与结束
    _executeRemoteTurnSync(payload) {
        this.isReplaying = false;
        this.isBuffering = false;
        this.replayQueue = []; // 清空队列 (理论上此时应该是空的)

        // 强行同步一次最终位置
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

        // 调用 Scene 结束回合
        this.scene._endTurn(true); 
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
                // 收到对手移动指令，开始进入回放模式
                if (striker && striker.teamId !== scene.myTeamId) {
                    const usedSkills = msg.payload.skills || {};
                    
                    if (usedSkills[SkillType.UNSTOPPABLE] && scene.ball) {
                         scene.ball.activateUnstoppable(GameConfig.gameplay.skills.unstoppable.duration);
                    }
                    if (usedSkills[SkillType.SUPER_FORCE] && scene.ball) {
                         scene.ball.setLightningMode(true);
                    }
                    
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
                // 只有在回放模式下才接收物理帧
                if (this.isReplaying) {
                    const frames = msg.payload.frames;
                    if (frames && frames.length > 0) {
                        frames.forEach(f => {
                            f.originalT = f.t; 
                            this.replayQueue.push(f);
                            // 只有物理帧才计入缓冲时间，事件帧是瞬时的
                            if (!f.isEvent) {
                                this.totalBufferedTime += f.t;
                            }
                        });
                    }
                }
                break;

            case NetMsg.GOAL:
                // [核心修改] 进球消息作为事件帧插入队列
                if (this.isReplaying) {
                    console.log("[Online] Queuing GOAL event");
                    this.replayQueue.push({
                        isEvent: true,
                        eventType: NetMsg.GOAL,
                        payload: msg.payload,
                        t: 0 
                    });
                    // 收到进球，停止缓冲等待，尽可能快地播放
                    this.isBuffering = false;
                } else {
                    // 如果不在回放模式（比如极罕见的同步延迟），直接处理
                    // 但通常应该在回放模式中
                    this._executeRemoteGoal(msg.payload);
                }
                break;

            case NetMsg.TURN_SYNC:
                // [核心修改] 回合结束消息作为事件帧插入队列
                if (this.isReplaying) {
                    console.log("[Online] Queuing TURN_SYNC event");
                    this.replayQueue.push({
                        isEvent: true,
                        eventType: NetMsg.TURN_SYNC,
                        payload: msg.payload,
                        t: 0
                    });
                    this.isBuffering = false;
                } else {
                    // 异常情况：未回放却收到同步，强制同步
                    this._executeRemoteTurnSync(msg.payload);
                }
                break;

            case NetMsg.AIM_START:
            case NetMsg.AIM_UPDATE:
            case NetMsg.AIM_END:
                scene.input.handleRemoteAim(msg.type, msg.payload);
                break;
            
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
            
            case NetMsg.FORMATION_UPDATE:
                if (msg.payload.teamId !== this.scene.myTeamId) {
                    this.scene.handleRemoteFormationUpdate(msg.payload.teamId, msg.payload.formationId);
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

    sendFormationUpdate(formationId) {
        NetworkMgr.send({
            type: NetMsg.FORMATION_UPDATE,
            payload: {
                teamId: this.scene.myTeamId,
                formationId: formationId
            }
        });
    }

    _checkRemoteGameOver(score) {
        const maxScore = GameConfig.gameplay.maxScore;
        let winner = -1;
        if (score[TeamId.LEFT] >= maxScore) winner = TeamId.LEFT;
        else if (score[TeamId.RIGHT] >= maxScore) winner = TeamId.RIGHT;

        if (winner !== -1) {
            this.scene.onGameOver({ winner });
        }
    }

    /**
     * [Sender] 本地发生进球
     * 必须先刷新缓冲区，确保之前的物理帧先发出去，然后再发 GOAL 消息
     */
    handleLocalGoal(data) {
        if (this.scene.turnMgr.currentTurn !== this.scene.myTeamId) {
            // 如果不是我的回合，但我检测到了进球（理论上被 GameRules 屏蔽了，这里是兜底）
            // 立即回滚，不发送消息
            this.scene.rules.score[data.scoreTeam]--; 
            return true; 
        }
        
        this._flushSendBuffer();

        NetworkMgr.send({
            type: NetMsg.GOAL,
            payload: { newScore: data.newScore, scoreTeam: data.scoreTeam }
        });
        
        // 返回 false，表示本地逻辑继续执行 (播放特效等)
        return false; 
    }

    sendFairPlayMove(id, start, end, duration) {
        NetworkMgr.send({
            type: NetMsg.FAIR_PLAY_MOVE,
            payload: { id, start, end, duration }
        });
    }

    /**
     * [Sender] 回合结束，发送同步包
     */
    syncAllPositions() {
        // 先发完剩下的轨迹
        this._flushSendBuffer();
        
        // 再发同步包
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
        const reason = payload.reason;

        if (offlineTeamId !== undefined) {
            if (!this.hasOpponentLeft) {
                this.scene.hud?.setPlayerOffline(offlineTeamId, true);
            }
            this.scene.isGamePaused = true;
            this.scene.turnMgr.pause();
            this.scene.input.reset();
            
            if (!this.hasOpponentLeft) {
                if (reason === 'manual') {
                    Platform.showToast("对方主动离开了...");
                } else {
                    Platform.showToast("对方连接断开，等待重连...");
                }
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
        EventBus.off(Events.PLAY_SOUND, this.onLocalSound, this);
    }
}
