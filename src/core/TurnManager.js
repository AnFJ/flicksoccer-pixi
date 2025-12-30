
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';
import AIController from './AIController.js';
import Platform from '../managers/Platform.js';

/**
 * TurnManager 维护游戏的生命周期和回合逻辑
 */
export default class TurnManager {
    constructor(scene) {
        this.scene = scene;
        this.currentTurn = TeamId.RIGHT;
        this.timer = 0;
        this.maxTime = GameConfig.gameplay.turnTimeLimit || 30;
        this.isPaused = false; // 新增：暂停标记
        
        this.ai = null;
        this.aiTimer = null;
    }

    init(mode, startTurn) {
        if (mode === 'pve') {
            // [修正] PVE模式：AI 控制右边(Blue)，玩家控制左边(Red)
            this.ai = new AIController(this.scene.physics, TeamId.RIGHT);
            // [修正] 玩家先手 (Left/Red)
            this.currentTurn = TeamId.LEFT; 
        } else if (mode === 'pvp_online') {
            this.currentTurn = startTurn !== undefined ? startTurn : TeamId.LEFT;
        } else {
            // 本地 PVP 默认 Left 先手更符合直觉，也可以保持 Right
            this.currentTurn = TeamId.LEFT;
        }
        this.resetTimer();
        this.isPaused = false;
    }

    /**
     * 暂停计时 (例如对手掉线时)
     */
    pause() {
        this.isPaused = true;
        // 如果有AI计时器，也要暂停或清除 (虽然PVP一般没AI，但为了健壮性)
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }
    }

    /**
     * 恢复计时
     */
    resume() {
        this.isPaused = false;
        // AI逻辑在 update 中会自动重新触发，不需要手动恢复timer
    }

    update(delta) {
        // 如果游戏处于暂停状态、移动中、结束或加载中，都不更新回合逻辑
        if (this.isPaused || this.scene.isMoving || this.scene.isGameOver || this.scene.isLoading) return;

        // 更新倒计时
        this.timer -= delta / 1000;
        const ratio = Math.max(0, this.timer / this.maxTime);
        if (this.scene.hud) this.scene.hud.updateTimerVisuals(this.currentTurn, ratio);

        if (this.timer <= 0) {
            this._handleTimeout();
        }

        // 检查 AI 触发
        if (this.ai && this.currentTurn === this.ai.teamId && !this.aiTimer) {
            this._triggerAI();
        }
    }

    resetTimer() {
        this.timer = this.maxTime;
        if (this.scene.hud) {
            this.scene.hud.updateTurn(this.currentTurn);
            this.scene.hud.updateTimerVisuals(this.currentTurn, 1.0);
            const opponent = this.currentTurn === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
            this.scene.hud.updateTimerVisuals(opponent, 0);
        }
    }

    switchTurn() {
        this.currentTurn = (this.currentTurn === TeamId.LEFT) ? TeamId.RIGHT : TeamId.LEFT;
        this.resetTimer();
    }

    _handleTimeout() {
        // 联网模式等待同步，单机模式自动执行
        if (this.scene.gameMode === 'pvp_online') return;
        
        Platform.showToast("操作超时，自动踢球");
        this.scene.onActionFired();

        const quickAI = new AIController(this.scene.physics, this.currentTurn);
        const decision = quickAI.think(this.scene.strikers.filter(s => s.teamId === this.currentTurn), this.scene.ball);
        if (decision) {
            Matter.Body.applyForce(decision.striker.body, decision.striker.body.position, decision.force);
        } else {
            this.switchTurn();
            this.scene.isMoving = false;
        }
    }

    _triggerAI() {
        this.aiTimer = setTimeout(() => {
            if (this.scene.isGameOver || this.isPaused) return;
            const decision = this.ai.think(this.scene.strikers.filter(s => s.teamId === this.ai.teamId), this.scene.ball);
            if (decision) {
                Matter.Body.applyForce(decision.striker.body, decision.striker.body.position, decision.force);
                this.scene.onActionFired();
            } else {
                this.switchTurn();
            }
            this.aiTimer = null;
        }, 1200);
    }

    clear() {
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }
    }
}
