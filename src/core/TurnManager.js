
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';
import AIController from './AIController.js';
import Platform from '../managers/Platform.js';
import { getLevelConfig } from '../config/LevelConfig.js'; // 引入配置

export default class TurnManager {
    constructor(scene) {
        this.scene = scene;
        this.currentTurn = TeamId.RIGHT;
        this.timer = 0;
        this.maxTime = GameConfig.gameplay.turnTimeLimit || 30;
        this.isPaused = false; 
        
        this.ai = null;
        this.aiTimer = null;
    }

    /**
     * @param {string} mode 模式
     * @param {number} startTurn 起始回合
     * @param {number} level 关卡号 (仅PVE)
     */
    init(mode, startTurn, level = 1) {
        if (mode === 'pve') {
            // PVE模式：AI 控制右边(Blue)
            const aiConfig = getLevelConfig(level);
            this.ai = new AIController(this.scene, this.scene.physics, TeamId.RIGHT, aiConfig);
            // 玩家先手
            this.currentTurn = TeamId.LEFT; 
        } else if (mode === 'pvp_online') {
            this.currentTurn = startTurn !== undefined ? startTurn : TeamId.LEFT;
        } else {
            // 本地 PVP 默认 Left 先手
            this.currentTurn = TeamId.LEFT;
        }
        this.resetTimer();
        this.isPaused = false;
    }

    pause() {
        this.isPaused = true;
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }
    }

    resume() {
        this.isPaused = false;
    }

    update(delta) {
        if (this.isPaused || this.scene.isMoving || this.scene.isGameOver || this.scene.isLoading) return;

        this.timer -= delta / 1000;
        const ratio = Math.max(0, this.timer / this.maxTime);
        if (this.scene.hud) this.scene.hud.updateTimerVisuals(this.currentTurn, ratio);

        if (this.timer <= 0) {
            this._handleTimeout();
        }

        if (this.ai && this.currentTurn === this.ai.teamId && !this.aiTimer) {
            this._triggerAI();
        }
    }

    resetTimer() {
        this.timer = this.maxTime;
        if (this.scene.hud) {
            this.scene.hud.updateTurn(this.currentTurn);
            // [修复] 只需调用一次更新当前回合的视觉即可。
            // GameHUD.updateTimerVisuals 内部逻辑是清除所有图形，然后只绘制 activeTeamId 的部分。
            // 因此调用一次即可完成 "清空对手 + 绘制自己" 的操作。
            // 之前重复调用 updateTimerVisuals(opponent, 0) 会导致刚画好的自己也被清空。
            this.scene.hud.updateTimerVisuals(this.currentTurn, 1.0);
        }
    }

    switchTurn() {
        this.currentTurn = (this.currentTurn === TeamId.LEFT) ? TeamId.RIGHT : TeamId.LEFT;
        this.resetTimer();
    }

    _handleTimeout() {
        if (this.scene.gameMode === 'pvp_online') return;
        
        Platform.showToast("操作超时，自动踢球");
        this.scene.onActionFired();

        // 这里的 QuickAI 只是超时兜底，随便踢一下，不走高级逻辑
        const quickAI = new AIController(this.scene, this.scene.physics, this.currentTurn, null);
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
            // 使用配置好的 AI 实例
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
