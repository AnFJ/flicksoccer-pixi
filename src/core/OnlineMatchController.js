
import Matter from 'matter-js';
import NetworkMgr from '../managers/NetworkMgr.js';
import EventBus from '../managers/EventBus.js';
import Platform from '../managers/Platform.js';
import { Events, NetMsg, TeamId, SkillType } from '../constants.js';
import { GameConfig } from '../config.js';
import AudioManager from '../managers/AudioManager.js';

/**
 * 联机对战控制器 (重构版)
 * 核心原则：
 * 1. 发送方 (Sender, MyTurn) 权威：负责物理模拟、进球检测、状态流转。
 * 2. 接收方 (Receiver, NotMyTurn) 被动：只负责回放轨迹和事件。
 * 3. 进球流程：GOAL消息(UI展示) -> 物理继续 -> RESET_FIELD消息(重置) -> TURN_SYNC(切换回合)。
 */
export default class OnlineMatchController {
    constructor(scene) {
        this.scene = scene;
        this.pendingTurn = null;
        this.hasOpponentLeft = false;
        this.isMatchEnded = false; // [新增] 比赛结束锁

        // --- 录制相关 (Sender) ---
        this.sendBuffer = []; 
        this.sendTimer = 0;   
        this.isWaitingForGoalReset = false; // Sender: 进球后等待重置的标记

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

        if (isMyTurn) {
            // [Sender 逻辑]
            // [修改] 即使比赛结束 (isMatchEnded)，只要还在移动或等待结算，就继续录制物理帧
            // 这样接收方才能看到球进网后的自然滚动/静止过程，而不是瞬间卡住
            if (this.scene.isMoving || this.isWaitingForGoalReset || this.isMatchEnded) {
                this._recordFrame(delta);
            }
        } else {
            // [Receiver 逻辑]
            // 只要在回放模式，或者队列里有东西，就处理播放
            if (this.isReplaying || this.replayQueue.length > 0) {
                this._processPlayback(delta);
            }
        }
    }

    /**
     * [Sender] 监听并记录本地音效
     */
    onLocalSound(key) {
        const isMyTurn = this.scene.turnMgr.currentTurn === this.scene.myTeamId;
        // 比赛结束后不再发送音效，以免干扰结算
        if (isMyTurn && (this.scene.isMoving || this.isWaitingForGoalReset) && !this.isMatchEnded) {
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
     * 队列中混合了 物理帧 和 关键事件(GOAL, RESET, TURN_SYNC)
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

        // [新增] 锁：如果比赛已判定结束，忽略后续的事件（防止比分跳变或错误重置）
        if (this.isMatchEnded) return;

        if (event.eventType === NetMsg.GOAL) {
            // 执行进球UI (不重置位置，不停止运动)
            this._executeRemoteGoalUI(event.payload);
        } 
        else if (event.eventType === NetMsg.RESET_FIELD) {
            // 执行位置重置
            this.scene.setupFormation();
        }
        else if (event.eventType === NetMsg.TURN_SYNC) {
            // 执行回合结束逻辑：切换回合，停止运动状态
            this._executeRemoteTurnSync(event.payload);
        }
        else if (event.eventType === 'SOUND') {
            AudioManager.playSFX(event.key);
        }
    }

    // [Receiver] 执行远程进球 UI (仅特效)
    _executeRemoteGoalUI(payload) {
        if (this.isMatchEnded) return;

        const { newScore, scoreTeam } = payload;
        
        // 更新比分
        this.scene.rules.score = newScore;
        // 播放特效 (调用场景的公共方法，但注意场景中要避免重置逻辑)
        this.scene._playGoalEffectsOnly(newScore, scoreTeam);
        
        // 检查游戏是否结束 (UI显示)
        this._checkRemoteGameOver(newScore);
    }

    // [Receiver] 执行远程回合同步与结束
    _executeRemoteTurnSync(payload) {
        if (this.isMatchEnded) return;

        this.isReplaying = false;
        this.isBuffering = false;
        this.replayQueue = []; // 清空队列

        // 强行同步一次最终位置 (防御性同步)
        // [修复] 只有当 payload 包含位置信息时才同步
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

        // 设置下一个回合
        if (payload.nextTurn !== undefined) {
            this.scene.turnMgr.currentTurn = payload.nextTurn;
            this.scene.turnMgr.resetTimer();
        }

        // 结束“移动”状态，解锁 UI
        this.scene.isMoving = false;
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
                if (this.isMatchEnded) return;
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
                    scene.isMoving = true; // 锁定输入
                }
                break;

            case NetMsg.TRAJECTORY_BATCH:
                // 即使比赛结束，也接收物理帧以保持画面平滑，直到真正离开场景
                if (this.isReplaying) {
                    const frames = msg.payload.frames;
                    if (frames && frames.length > 0) {
                        frames.forEach(f => {
                            f.originalT = f.t; 
                            this.replayQueue.push(f);
                            if (!f.isEvent) {
                                this.totalBufferedTime += f.t;
                            }
                        });
                    }
                }
                break;

            case NetMsg.GOAL:
                // [Receiver] 将 GOAL 作为事件插入队列
                if (this.isReplaying && !this.isMatchEnded) {
                    this.replayQueue.push({
                        isEvent: true,
                        eventType: NetMsg.GOAL,
                        payload: msg.payload,
                        t: 0 
                    });
                    this.isBuffering = false; // 进球了，不必死等 buffer
                }
                break;

            case NetMsg.RESET_FIELD:
                // [Receiver] 将 RESET 作为事件插入队列
                if (this.isReplaying && !this.isMatchEnded) {
                    this.replayQueue.push({
                        isEvent: true,
                        eventType: NetMsg.RESET_FIELD,
                        payload: msg.payload,
                        t: 0 
                    });
                }
                break;

            case NetMsg.TURN_SYNC:
                // [Receiver] 将 TURN_SYNC 作为事件插入队列
                if (this.isReplaying && !this.isMatchEnded) {
                    this.replayQueue.push({
                        isEvent: true,
                        eventType: NetMsg.TURN_SYNC,
                        payload: msg.payload,
                        t: 0
                    });
                    this.isBuffering = false;
                } else {
                    if (this.isMatchEnded) return;
                    
                    // 非回放状态收到同步
                    const localTurn = this.scene.turnMgr.currentTurn;
                    const remoteNextTurn = msg.payload.nextTurn;
                    
                    if (localTurn === remoteNextTurn) {
                        console.log("[Online] Ignored echo TURN_SYNC");
                        return;
                    }
                    this._executeRemoteTurnSync(msg.payload);
                }
                break;

            case NetMsg.AIM_START:
            case NetMsg.AIM_UPDATE:
            case NetMsg.AIM_END:
                if (!this.isMatchEnded) scene.input.handleRemoteAim(msg.type, msg.payload);
                break;
            
            case NetMsg.SKILL:
                if (!this.isMatchEnded && scene.skillMgr) scene.skillMgr.handleRemoteSkill(msg.payload);
                break;
            
            case NetMsg.FORMATION_UPDATE:
                if (!this.isMatchEnded && msg.payload.teamId !== this.scene.myTeamId) {
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
            this.isMatchEnded = true; // [新增] 锁定
            this.scene.onGameOver({ winner });
        }
    }

    /**
     * [Sender] 本地发生进球
     */
    handleLocalGoal(data) {
        if (this.scene.turnMgr.currentTurn !== this.scene.myTeamId) {
            // 安全防御：如果不该我处理，忽略
            return true; 
        }
        
        // [新增] 锁
        if (this.isMatchEnded) return true;
        
        // 1. 发送所有未发送的轨迹
        this._flushSendBuffer();

        // 2. 发送 GOAL 消息
        NetworkMgr.send({
            type: NetMsg.GOAL,
            payload: { newScore: data.newScore, scoreTeam: data.scoreTeam }
        });

        // [核心修复] 3. 检查是否达成胜利条件 (Sender 侧检查)
        // Receiver 侧在回放 GOAL 时会检查
        const maxScore = GameConfig.gameplay.maxScore;
        let winner = -1;
        if (data.newScore[TeamId.LEFT] >= maxScore) winner = TeamId.LEFT;
        else if (data.newScore[TeamId.RIGHT] >= maxScore) winner = TeamId.RIGHT;

        if (winner !== -1) {
            this.isMatchEnded = true; // [新增] 锁定
            // 游戏结束：直接进入结算，不再执行后续的 Reset 逻辑
            this.scene.onGameOver({ winner });
            // 返回 false 允许 GameScene 播放 "进球" Banner (然后 2秒后转场)
            return false;
        }
        
        // 4. 标记进入“等待重置”状态
        // 此时物理引擎还要继续运行，轨迹还要继续发送
        this.isWaitingForGoalReset = true;

        // 5. 启动延时重置流程
        setTimeout(() => {
            // 只有当比赛没有因为其他原因结束时才执行重置
            if (!this.isMatchEnded) {
                this._performSenderReset(data.scoreTeam);
            }
        }, 2000); // 2秒后重置

        // 返回 false，表示本地逻辑(UI特效)可以执行
        return false; 
    }

    /**
     * [Sender] 执行重置和回合切换
     */
    _performSenderReset(scoreTeam) {
        if (this.isMatchEnded) return;

        // 1. 本地重置球场 (开始动画)
        this.scene.setupFormation();
        
        // 2. 发送重置消息 (通知 Receiver 也要开始 Reset)
        NetworkMgr.send({ type: NetMsg.RESET_FIELD });

        // 3. 发送剩余轨迹 (不再重要)
        this._flushSendBuffer();

        // 4. 准备下个回合数据
        const nextTurn = scoreTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
        
        const payload = {
            nextTurn: nextTurn
        };

        // 6. 发送 TURN_SYNC
        NetworkMgr.send({ type: NetMsg.TURN_SYNC, payload });

        // 7. 本地应用切换
        this.isWaitingForGoalReset = false;
        this.scene.turnMgr.currentTurn = nextTurn;
        this.scene.turnMgr.resetTimer();
        
        // 如果下回合还是我，保持 isMoving=false 允许操作；否则 isMoving=false (等待对方 MOVE)
        this.scene.isMoving = false;
    }

    /**
     * [Sender] 正常回合结束 (无进球)
     */
    syncAllPositions() {
        if (this.isMatchEnded) return;

        this._flushSendBuffer();
        
        const currentTurn = this.scene.turnMgr.currentTurn;
        const nextTurn = currentTurn === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;

        const payload = {
            strikers: this.scene.strikers.map(s => ({ id: s.id, pos: { x: s.body.position.x, y: s.body.position.y } })),
            ball: { x: this.scene.ball.body.position.x, y: this.scene.ball.body.position.y },
            nextTurn: nextTurn
        };
        NetworkMgr.send({ type: NetMsg.TURN_SYNC, payload });
    }

    popPendingTurn() {
        // 在新逻辑中，nextTurn 通过 TURN_SYNC 传递，这里不需要处理 pendingTurn 了
        return null;
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
