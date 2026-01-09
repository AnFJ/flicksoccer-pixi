
import AudioManager from '../managers/AudioManager.js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

export default class AtmosphereController {
    constructor(scene) {
        this.scene = scene;
        
        // 状态标记
        this.totalTurns = 0; 
        this.hasPlayedClimaxCheer = false; // 僵持局加油标记
        this.isShooting = false;           // 当前是否属于击球后的射门阶段
        this.shotReactionPlayed = false;   // 本次射门是否已经触发过反应
    }

    reset() {
        this.totalTurns = 0;
        this.hasPlayedClimaxCheer = false;
        this.isShooting = false;
        this.shotReactionPlayed = false;
    }

    /**
     * 回合开始时调用 (击球瞬间)
     */
    onTurnStart() {
        this.isShooting = true;
        this.shotReactionPlayed = false;
    }

    /**
     * 进球时调用
     */
    onGoal() {
        this.hasPlayedClimaxCheer = false;
        this.isShooting = false; // 进球了就不再检测反应
    }

    /**
     * 回合结束时调用
     */
    onTurnEnd() {
        this.totalTurns++;
        this.isShooting = false;
        
        // 检查是否触发僵持局加油
        this._checkEncouragementCheer();
    }

    /**
     * 帧更新，用于实时检测射门轨迹
     */
    update() {
        this._checkShotReaction();
    }

    // --- 内部逻辑 ---

    _checkShotReaction() {
        // 1. 基础条件
        if (!this.isShooting || this.shotReactionPlayed || !this.scene.ball || !this.scene.ball.body) return;
  
        const ballBody = this.scene.ball.body;
        const speed = ballBody.speed;
  
        // 2. 速度门槛
        if (speed < 8) return;
  
        const { x, y, w, h } = this.scene.layout.fieldRect;
        const bX = ballBody.position.x;
        const bY = ballBody.position.y;
        
        // 3. 区域检测：进入对方禁区深处
        const zoneDepth = w * 0.25; 
        const currentTurn = this.scene.turnMgr.currentTurn;
        
        let inDangerZone = false;
        let targetGoalX = 0; 
  
        if (currentTurn === TeamId.LEFT) {
            if (bX > (x + w - zoneDepth) && ballBody.velocity.x > 0) {
                inDangerZone = true;
                targetGoalX = x + w + GameConfig.dimensions.goalWidth / 2; 
            }
        } else {
            if (bX < (x + zoneDepth) && ballBody.velocity.x < 0) {
                inDangerZone = true;
                targetGoalX = x - GameConfig.dimensions.goalWidth / 2;
            }
        }
  
        if (inDangerZone) {
            // 4. 轨迹预测
            const timeToImpact = (targetGoalX - bX) / ballBody.velocity.x;
            if (timeToImpact < 0) return; 
  
            const predictedY = bY + ballBody.velocity.y * timeToImpact;
            
            const fieldCenterY = y + h / 2;
            const goalH = GameConfig.dimensions.goalOpening;
            
            const topPostY = fieldCenterY - goalH / 2;
            const bottomPostY = fieldCenterY + goalH / 2;
            const margin = 30; 
  
            // 触发反应，标记已播放
            this.shotReactionPlayed = true;
  
            // [逻辑分支]
            if (predictedY > (topPostY - margin) && predictedY < (bottomPostY + margin)) {
                // A: 预测进球 (激动)
                const idx = Math.floor(Math.random() * 2) + 1;
                AudioManager.playClimaxCheer(`crowd_anticipation_${idx}`);
                console.log("[Atmosphere] Crowd Anticipation: Close call!");
            } else {
                // B: 臭脚 (叹息)
                const idx = Math.floor(Math.random() * 3) + 1;
                AudioManager.playClimaxCheer(`crowd_sigh_${idx}`);
                console.log("[Atmosphere] Crowd Sigh: Bad shot.");
            }
        }
    }
  
    _checkEncouragementCheer() {
        if (this.hasPlayedClimaxCheer) return;
  
        // 5-10 回合之间
        if (this.totalTurns >= 5 && this.totalTurns <= 10) {
            const scores = this.scene.rules.score;
            const scoreDiff = Math.abs(scores[TeamId.LEFT] - scores[TeamId.RIGHT]);
            
            // 僵持/胶着状态
            if (scoreDiff <= 1) {
                if (Math.random() < 0.3) {
                    console.log(`[Atmosphere] Trigger Encouragement Cheer at turn ${this.totalTurns}`);
                    this.hasPlayedClimaxCheer = true;
                    AudioManager.playClimaxCheer();
                }
            }
        }
    }
}
