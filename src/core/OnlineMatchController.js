
import Matter from 'matter-js';
import NetworkMgr from '../managers/NetworkMgr.js';
import EventBus from '../managers/EventBus.js';
import Platform from '../managers/Platform.js';
import { Events, NetMsg, TeamId, SkillType } from '../constants.js';
import { GameConfig } from '../config.js';

/**
 * 联机对战控制器
 * 采用 "攻击方权威计算 - 防守方缓冲回放" 模式
 */
export default class OnlineMatchController {
    constructor(scene) {
        this.scene = scene;
        this.pendingTurn = null;
        this.hasOpponentLeft = false;

        // --- 录制相关 (Sender) ---
        this.sendBuffer = []; // 待发送的帧列表
        this.sendTimer = 0;   // 发送计时器

        // --- 回放相关 (Receiver) ---
        this.isReplaying = false;      // 是否处于被动回放模式
        this.isBuffering = false;      // 是否正在缓冲数据
        this.replayQueue = [];         // 接收到的帧队列
        this.replayTime = 0;           // 当前回放的时间指针
        this.totalBufferedTime = 0;    // 当前队列中总数据时长
        
        EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
    }

    /**
     * 主循环调用
     * @param {number} delta (ms)
     */
    update(delta) {
        const isMyTurn = this.scene.turnMgr.currentTurn === this.scene.myTeamId;

        if (this.scene.isMoving) {
            if (isMyTurn) {
                // 1. 我是攻击方：记录当前帧
                this._recordFrame(delta);
            } else if (this.isReplaying) {
                // 2. 我是防守方：播放回放
                this._processPlayback(delta);
            }
        }
    }

    /**
     * [Sender] 记录当前物理世界状态
     */
    _recordFrame(dt) {
        // 只记录活跃物体
        const frameData = {
            t: dt, // 这一帧的时长
            bodies: {}
        };

        let hasActive = false;

        // 记录球
        if (this.scene.ball && this.scene.ball.body) {
            const b = this.scene.ball.body;
            // 简单优化：静止物体不发送，但为了回放平滑，建议每一帧都发关键物体
            frameData.bodies['ball'] = this._packBodyData(b);
            hasActive = true;
        }

        // 记录所有棋子
        this.scene.strikers.forEach(s => {
            if (s.body) {
                frameData.bodies[s.id] = this._packBodyData(s.body);
            }
        });

        this.sendBuffer.push(frameData);
        this.sendTimer += dt;

        // 达到发送间隔，打包发送
        if (this.sendTimer >= GameConfig.network.trajectorySendInterval) {
            this._flushSendBuffer();
        }
    }

    _packBodyData(body) {
        return {
            x: Number(body.position.x.toFixed(1)),
            y: Number(body.position.y.toFixed(1)),
            a: Number(body.angle.toFixed(3)),
            vx: Number(body.velocity.x.toFixed(2)), // 速度用于客户端预测或特效
            vy: Number(body.velocity.y.toFixed(2))
        };
    }

    _flushSendBuffer() {
        if (this.sendBuffer.length === 0) return;

        NetworkMgr.send({
            type: NetMsg.TRAJECTORY_BATCH,
            payload: {
                frames: this.sendBuffer
            }
        });

        this.sendBuffer = [];
        this.sendTimer = 0;
    }

    /**
     * [Receiver] 处理回放逻辑
     */
    _processPlayback(dt) {
        // 1. 缓冲阶段
        if (this.isBuffering) {
            // 检查缓冲区是否足够
            if (this.totalBufferedTime >= GameConfig.network.replayBufferTime) {
                console.log(`[Replay] Buffer ready (${this.totalBufferedTime}ms), starting playback.`);
                this.isBuffering = false;
            } else {
                // 还在缓冲，直接返回，画面暂停或显示加载
                return;
            }
        }

        // 2. 播放阶段
        if (this.replayQueue.length === 0) {
            return;
        }

        let remainingDt = dt;

        while (remainingDt > 0 && this.replayQueue.length > 0) {
            const currentFrame = this.replayQueue[0];
            
            // [核心修改] 检查是否为事件帧 (如进球)
            if (currentFrame.isEvent) {
                this._handleReplayEvent(currentFrame);
                this.replayQueue.shift(); // 移除事件帧
                // 事件帧不消耗时间，直接继续处理下一帧
                continue; 
            }

            // 处理普通物理帧
            // 如果这一帧能覆盖剩余时间
            if (currentFrame.t > remainingDt) {
                currentFrame.t -= remainingDt;
                this._applyFrameState(currentFrame);
                remainingDt = 0;
            } else {
                // 这一帧时间耗尽，应用并移除
                remainingDt -= currentFrame.t;
                this._applyFrameState(currentFrame);
                this.replayQueue.shift();
                this.totalBufferedTime -= currentFrame.originalT || currentFrame.t; 
            }
        }
    }

    /**
     * 处理队列中的特殊事件
     */
    _handleReplayEvent(frame) {
        if (frame.eventType === NetMsg.GOAL) {
            const { newScore } = frame.payload;
            this.scene.rules.score = newScore;
            this.scene._playGoalEffects(newScore);
            console.log('[Replay] Executed delayed GOAL event.');
        }
    }

    _applyFrameState(frame) {
        const bodies = frame.bodies;
        if (!bodies) return;

        // 应用球的状态
        if (bodies['ball'] && this.scene.ball) {
            this._setBodyState(this.scene.ball.body, bodies['ball']);
        }

        // 应用棋子状态
        for (const id in bodies) {
            if (id === 'ball') continue;
            const striker = this.scene.strikers.find(s => s.id === id);
            if (striker) {
                this._setBodyState(striker.body, bodies[id]);
            }
        }
    }

    _setBodyState(body, data) {
        // 强制设置位置和角度
        Matter.Body.setPosition(body, { x: data.x, y: data.y });
        Matter.Body.setAngle(body, data.a);
        // 同时设置速度，以便特效（如拖尾、火花）能正常计算
        Matter.Body.setVelocity(body, { x: data.vx, y: data.vy });
    }

    onNetMessage(msg) {
        const scene = this.scene;

        switch (msg.type) {
            case NetMsg.MOVE:
                scene.input.handleRemoteAim(NetMsg.AIM_END);
                
                this.pendingTurn = msg.payload.nextTurn;

                const striker = scene.strikers.find(s => s.id === msg.payload.id);
                if (striker && striker.teamId !== scene.myTeamId) {
                    const usedSkills = msg.payload.skills || {};
                    if (usedSkills[SkillType.UNSTOPPABLE] && scene.ball) {
                         scene.ball.activateUnstoppable(GameConfig.gameplay.skills.unstoppable.duration);
                    }
                    if (usedSkills[SkillType.SUPER_FORCE] && scene.ball) {
                         scene.ball.setLightningMode(true);
                    }
                    scene.skillMgr.consumeSkills();

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
                // [核心修改]
                // 如果正在回放（防守方），不要立即执行进球逻辑
                // 而是将进球事件推入回放队列，等待画面同步到那一刻
                if (this.isReplaying) {
                    this.replayQueue.push({
                        isEvent: true,
                        eventType: NetMsg.GOAL,
                        payload: msg.payload,
                        t: 0 // 事件帧不占用时间
                    });
                    console.log('[Replay] Queued GOAL event.');
                } else {
                    // 如果我是攻击方（或者异常状态），直接执行
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

    _handlePlayerLeft(payload) { /* 同前 */
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
    _handlePlayerOffline(payload) { /* 同前 */
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
    _handlePlayerReconnected() { /* 同前 */
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

    destroy() {
        EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
    }
}
