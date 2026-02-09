
import { TeamId } from '../constants.js';
import { AIPersonas, AIChatTexts, ChatTrigger } from '../config/AIChatConfig.js';
import AIChatBubble from '../ui/AIChatBubble.js';
import { GameConfig } from '../config.js';

export default class AIChatController {
    constructor(scene) {
        this.scene = scene;
        this.aiPersona = null;
        this.aiChatBubble = null;
        this.lastChatTime = 0;
        this.isEnabled = false;
        
        // [新增] 超时计时器
        this.idleTimer = 0;
        this.hasTriggeredIdle = false;
    }

    init(gameMode) {
        // 只有 PVE 模式启用
        if (gameMode === 'pve') {
            this.isEnabled = true;
            // 随机选择人格
            const randomIndex = Math.floor(Math.random() * AIPersonas.length);
            this.aiPersona = AIPersonas[randomIndex];
            console.log(`[AIChat] Selected Persona: ${this.aiPersona.name}`);
        } else {
            this.isEnabled = false;
        }
    }

    createUI(parentContainer) {
        if (!this.isEnabled) return;

        this.aiChatBubble = new AIChatBubble();
        const centerX = GameConfig.designWidth / 2;
        // 定位在右侧 AI 头像附近
        this.aiChatBubble.position.set(centerX + 430, 125); 
        parentContainer.addChild(this.aiChatBubble);
    }

    getPersona() {
        return this.aiPersona;
    }

    onGoal(scoreTeam, turnStartScores, currentScores, currentTurnTimer) {
        if (!this.isEnabled) return;
        this._resetIdleTimer(); // 进球重置发呆计时

        const scoreId = scoreTeam;
        const turnId = this.scene.turnMgr.currentTurn; 
        const isOwnGoal = turnId !== scoreId;

        const prevScoreP = turnStartScores[TeamId.LEFT];
        const prevScoreAI = turnStartScores[TeamId.RIGHT];
        
        const newScoreP = currentScores[TeamId.LEFT];
        const newScoreAI = currentScores[TeamId.RIGHT];

        if (isOwnGoal) {
            if (scoreId === TeamId.RIGHT) {
                this.trigger(ChatTrigger.PLAYER_OWN_GOAL);
            } else {
                this.trigger(ChatTrigger.AI_OWN_GOAL);
            }
            return;
        }

        if (scoreId === TeamId.LEFT) {
            if (prevScoreP < prevScoreAI && newScoreP === newScoreAI) {
                this.trigger(ChatTrigger.PLAYER_EQUALIZER);
            } 
            else if (prevScoreP === prevScoreAI && newScoreP > newScoreAI) {
                this.trigger(ChatTrigger.PLAYER_OVERTAKE);
            }
            else if (prevScoreP > prevScoreAI && newScoreP > newScoreAI) {
                this.trigger(ChatTrigger.PLAYER_LEAD_EXTEND);
            }
            else if (currentTurnTimer < 2) { 
                this.trigger(ChatTrigger.PLAYER_INSTANT_GOAL);
            }
            else {
                this.trigger(ChatTrigger.PLAYER_GOAL);
            }

        } else {
            if (prevScoreAI < prevScoreP && newScoreAI === newScoreP) {
                this.trigger(ChatTrigger.AI_EQUALIZER);
            }
            else if (prevScoreAI === prevScoreP && newScoreAI > newScoreP) {
                this.trigger(ChatTrigger.AI_OVERTAKE);
            }
            else if (prevScoreAI > prevScoreP && newScoreAI > newScoreP) {
                this.trigger(ChatTrigger.AI_LEAD_EXTEND);
            }
            else {
                this.trigger(ChatTrigger.AI_GOAL);
            }
        }
    }

    onGameOver(winner) {
        if (!this.isEnabled) return;
        if (winner === TeamId.RIGHT) { 
            this.trigger(ChatTrigger.AI_WIN);
        }
    }

    onPlayerMiss() {
        if (!this.isEnabled) return;
        if (this.scene.turnMgr.currentTurn === TeamId.LEFT) {
            this.trigger(ChatTrigger.PLAYER_MISS);
        }
    }

    onPlayerBadMove() {
        if (!this.isEnabled) return;
        this.trigger(ChatTrigger.PLAYER_BAD);
    }

    // [新增] 重置发呆计时器
    _resetIdleTimer() {
        this.idleTimer = 0;
        this.hasTriggeredIdle = false;
    }

    /**
     * 帧更新，检测发呆时间
     * @param {number} delta 毫秒
     */
    update(delta) {
        if (!this.isEnabled) return;
        
        // 仅在玩家回合、且静止时检测
        if (this.scene.turnMgr.currentTurn === TeamId.LEFT && 
            !this.scene.isMoving && 
            !this.scene.isGameOver) {
            
            this.idleTimer += delta;

            // [修改] 延长至 30 秒 (30000ms) 触发，避免太频繁
            if (this.idleTimer >= 30000 && !this.hasTriggeredIdle) {
                this.hasTriggeredIdle = true;
                this.trigger(ChatTrigger.IDLE);
            }
        } else {
            // 如果不在玩家回合或正在移动，重置
            this._resetIdleTimer();
        }
    }

    trigger(triggerType) {
        if (!this.aiPersona || !this.aiChatBubble) return;
        
        const now = Date.now();
        // 2秒冷却
        if (now - this.lastChatTime < 2000) return;
        this.lastChatTime = now;
  
        const personaTexts = AIChatTexts[this.aiPersona.id];
        if (!personaTexts) return;
        
        const lines = personaTexts[triggerType];
        if (lines && lines.length > 0) {
            const text = lines[Math.floor(Math.random() * lines.length)];
            this.aiChatBubble.show(text);
        }
    }
}
