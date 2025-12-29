
import Matter from 'matter-js';
import NetworkMgr from '../managers/NetworkMgr.js';
import EventBus from '../managers/EventBus.js';
import Platform from '../managers/Platform.js';
import { Events, NetMsg, TeamId } from '../constants.js';

/**
 * 联机对战控制器
 * 职责：负责处理 PVP Online 模式下的所有网络通信、状态同步和游戏流控制
 * 解耦：让 GameScene 只关注物理和渲染，不再关心是单机还是联网
 */
export default class OnlineMatchController {
    constructor(scene) {
        this.scene = scene;
        
        // 状态标记
        this.snapshotTimer = 0;
        this.pendingTurn = null;
        this.hasOpponentLeft = false;

        // 监听网络消息
        EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
    }

    /**
     * 每帧更新 (由 GameScene 调用)
     * @param {number} delta 
     */
    update(delta) {
        // 如果是我方回合且正在移动，我是权威方，负责发送快照
        // 10Hz (100ms) 发送一次
        if (this.scene.isMoving && this.scene.turnMgr.currentTurn === this.scene.myTeamId) {
            this.snapshotTimer += delta;
            if (this.snapshotTimer > 100) {
                this.snapshotTimer = 0;
                this._sendSnapshot();
            }
        }
    }

    /**
     * 处理网络消息
     */
    onNetMessage(msg) {
        const scene = this.scene;

        switch (msg.type) {
            // 1. 移动指令 (对方击球)
            case NetMsg.MOVE:
                scene.input.handleRemoteAim(NetMsg.AIM_END); // 确保对方瞄准线消失
                
                const striker = scene.strikers.find(s => s.id === msg.payload.id);
                if (striker) {
                    const isMyStriker = (striker.teamId === scene.myTeamId);
                    // 只有对方的棋子移动指令才需要执行 (防止本地预测和服务器回包冲突)
                    if (!isMyStriker) {
                        Matter.Body.applyForce(striker.body, striker.body.position, msg.payload.force);
                        scene.onActionFired();
                    }
                    // 暂存下回合 ID，用于物理静止后切换
                    this.pendingTurn = msg.payload.nextTurn;
                }
                break;

            // 2. 瞄准同步 (交给 InputController 处理绘制)
            case NetMsg.AIM_START:
            case NetMsg.AIM_UPDATE:
            case NetMsg.AIM_END:
                scene.input.handleRemoteAim(msg.type, msg.payload);
                break;

            // 3. 公平竞赛移出动画
            case NetMsg.FAIR_PLAY_MOVE:
                const { id, end, duration } = msg.payload;
                const s = scene.strikers.find(st => st.id === id);
                if (s) {
                    // 强制将物体设为 Sensor 并推入动画队列
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

            // 4. 中间状态快照 (位置修正)
            case NetMsg.SNAPSHOT:
                this._handleSnapshot(msg.payload);
                break;

            // 5. 回合结束同步 (最终一致性)
            case NetMsg.TURN_SYNC:
                this._handleTurnSync(msg.payload);
                break;

            // 6. 进球确认
            case NetMsg.GOAL:
                const newScore = msg.payload.newScore;
                // 服务器确认进球，更新本地分数并播放特效
                scene.rules.score = newScore;
                scene._playGoalEffects(newScore);
                break;

            // 7. 玩家状态变化
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
                // 自己被踢出或主动离开确认
                Platform.showToast("已离开游戏");
                // 延时跳转，避免切场景太快
                setTimeout(() => {
                    // 避免循环引用，这里不 import LobbyScene，而是通过 scene.onMenuBtnClick 类似的机制
                    // 或者直接通知 SceneManager，但为了解耦，我们假定 GameScene 会处理销毁
                    scene.onGameOver({ winner: -1 }); // 触发离开逻辑
                }, 1000);
                break;
            
            case NetMsg.GAME_OVER:
                Platform.removeStorage('last_room_id');
                break;
        }
    }

    /**
     * 发送当前球的位置快照
     */
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

    /**
     * 处理接收到的快照 (插值平滑)
     */
    _handleSnapshot(payload) {
        if (!this.scene.ball || !payload.ball) return;
        
        // 核心逻辑：如果是我的回合，我是权威，忽略服务器快照
        if (this.scene.turnMgr.currentTurn === this.scene.myTeamId) return;

        const serverPos = payload.ball.pos;
        const serverVel = payload.ball.vel;
        const localBody = this.scene.ball.body;
        const localPos = localBody.position;

        const dx = serverPos.x - localPos.x;
        const dy = serverPos.y - localPos.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // 误差极小，忽略
        if (dist < 5) return;

        // 误差过大，瞬移纠正
        if (dist > 50) {
            Matter.Body.setPosition(localBody, serverPos);
            Matter.Body.setVelocity(localBody, serverVel);
            return;
        }

        // 误差较小，线性插值平滑
        const lerpFactor = 0.2;
        const newX = localPos.x + dx * lerpFactor;
        const newY = localPos.y + dy * lerpFactor;
        
        Matter.Body.setPosition(localBody, { x: newX, y: newY });
        Matter.Body.setVelocity(localBody, serverVel);
    }

    /**
     * 处理回合结束同步
     */
    _handleTurnSync(payload) {
        // 同步所有棋子位置
        if (payload.strikers) {
            payload.strikers.forEach(data => {
                const s = this.scene.strikers.find(st => st.id === data.id);
                if (s) {
                    Matter.Body.setPosition(s.body, data.pos);
                    Matter.Body.setVelocity(s.body, {x:0, y:0});
                }
            });
        }
        // 同步球位置
        if (this.scene.ball && payload.ball) {
            Matter.Body.setPosition(this.scene.ball.body, payload.ball);
            Matter.Body.setVelocity(this.scene.ball.body, {x:0, y:0});
        }
        
        // 如果被动方(Observer)还在模拟物理运动，强制结束
        if (this.scene.isMoving) {
            this.scene._endTurn();
        }
    }

    /**
     * 处理玩家主动离开
     */
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

    /**
     * 处理玩家掉线
     */
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

    /**
     * 处理玩家重连
     */
    _handlePlayerReconnected() {
        if (this.scene.isGamePaused) {
            this.hasOpponentLeft = false;
            this.scene.hud?.setPlayerOffline(0, false);
            this.scene.hud?.setPlayerOffline(1, false);
            this.scene.isGamePaused = false;
            this.scene.turnMgr.resume();
            Platform.showToast("玩家已重连，继续游戏");
            
            // 如果正好轮到我，重新同步一次位置给对方
            if (this.scene.turnMgr.currentTurn === this.scene.myTeamId && !this.scene.isMoving) {
                this.syncAllPositions();
            }
        }
    }

    /**
     * 恢复游戏状态 (断线重连用)
     */
    restoreState(snapshot) {
        console.log('[OnlineMatch] Restoring state...', snapshot);
        const scene = this.scene;

        // 1. 恢复分数
        if (snapshot.scores) {
            scene.rules.score = snapshot.scores;
            scene.hud?.updateScore(snapshot.scores[TeamId.LEFT], snapshot.scores[TeamId.RIGHT]);
        }

        // 2. 恢复位置
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

    /**
     * 判定是否由我处理进球逻辑
     * @returns {boolean} true=已拦截(等待服务器)，false=执行本地逻辑
     */
    handleLocalGoal(data) {
        // 如果不是我进的球（比如是对方回合进的，或者是服务器判定的），我只是被动接收
        if (this.scene.turnMgr.currentTurn !== this.scene.myTeamId) {
            console.log('[OnlineMatch] Ignored local goal (Waiting for server/opponent).');
            // 回滚 GameRules 预先加上的分数 (等待服务器 GOAL 消息纠正)
            this.scene.rules.score[data.scoreTeam]--;
            return true; 
        }

        // 我是主动方，发送确认消息
        NetworkMgr.send({
            type: NetMsg.GOAL,
            payload: { newScore: data.newScore }
        });

        // 拦截本地执行，等待服务器广播 NetMsg.GOAL
        return true; 
    }

    /**
     * 发送 FairPlay 移动指令
     */
    sendFairPlayMove(id, start, end, duration) {
        NetworkMgr.send({
            type: NetMsg.FAIR_PLAY_MOVE,
            payload: {
                id, start, end, duration
            }
        });
    }

    /**
     * 发送回合结束时的全量位置同步
     */
    syncAllPositions() {
        const payload = {
            strikers: this.scene.strikers.map(s => ({ id: s.id, pos: { x: s.body.position.x, y: s.body.position.y } })),
            ball: { x: this.scene.ball.body.position.x, y: this.scene.ball.body.position.y }
        };
        NetworkMgr.send({ type: NetMsg.TURN_SYNC, payload });
    }

    /**
     * 获取暂存的下回合 ID
     */
    popPendingTurn() {
        const turn = this.pendingTurn;
        this.pendingTurn = null;
        return turn;
    }

    destroy() {
        EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
    }
}
