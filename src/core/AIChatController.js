
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
        this.aiChatBubble.position.set(centerX + 480, 125); 
        parentContainer.addChild(this.aiChatBubble);
    }

    /**
     * 外部获取当前 AI 信息用于显示头像等
     */
    getPersona() {
        return this.aiPersona;
    }

    /**
     * 进球时的触发检测
     * @param {number} scoreTeam 得分队伍
     * @param {Object} turnStartScores 回合开始时的比分快照
     * @param {Object} currentScores 当前最新比分
     * @param {number} currentTurnTimer 当前回合剩余时间(判断秒进)
     */
    onGoal(scoreTeam, turnStartScores, currentScores, currentTurnTimer) {
        if (!this.isEnabled) return;

        const scoreId = scoreTeam;
        // 判断是否乌龙：得分的人不是当前回合操作的人 (简化判断：假设回合还没切换)
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
            // 玩家进球
            if (prevScoreP < prevScoreAI && newScoreP === newScoreAI) {
                this.trigger(ChatTrigger.PLAYER_EQUALIZER);
            } 
            else if (prevScoreP === prevScoreAI && newScoreP > newScoreAI) {
                this.trigger(ChatTrigger.PLAYER_OVERTAKE);
            }
            else if (prevScoreP > prevScoreAI && newScoreP > newScoreAI) {
                this.trigger(ChatTrigger.PLAYER_LEAD_EXTEND);
            }
            else if (currentTurnTimer < 2) { // 假设 timer 从 0 开始计数，或者传入已用时间
                this.trigger(ChatTrigger.PLAYER_INSTANT_GOAL);
            }
            else {
                this.trigger(ChatTrigger.PLAYER_GOAL);
            }

        } else {
            // AI 进球
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
        // 只有玩家回合才触发嘲讽
        if (this.scene.turnMgr.currentTurn === TeamId.LEFT) {
            this.trigger(ChatTrigger.PLAYER_MISS);
        }
    }

    onPlayerBadMove() {
        if (!this.isEnabled) return;
        this.trigger(ChatTrigger.PLAYER_BAD);
    }

    /**
     * 帧更新，用于检测发呆
     */
    update() {
        if (!this.isEnabled) return;
        
        // 仅在玩家回合、且静止时检测
        if (this.scene.turnMgr.currentTurn === TeamId.LEFT && 
            !this.scene.isMoving && 
            !this.scene.isGameOver) {
            
            // 简单随机触发 IDLE
            if (Math.random() < 0.005) { 
                this.trigger(ChatTrigger.IDLE);
            }
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
