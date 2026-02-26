import { GameConfig } from '../../../config.js';
import { TeamId } from '../../../constants.js';
import { LiveFlickConfig } from '../config/LiveFlickConfig.js';
import AudioManager from '../../../managers/AudioManager.js';

export default class LiveFlickAI {
    constructor(scene) {
        this.scene = scene;
        this.timer = 0;
        this.teamId = TeamId.RIGHT;
        this.difficulty = 1; // 1 to 5
    }

    init(level) {
        this.difficulty = Math.min(5, Math.max(1, Math.floor(level / 2) + 1));
        this.timer = 0;
    }

    update(delta) {
        if (this.scene.isGameOver || this.scene.isGamePaused || this.scene.isLoading) return;

        this.timer += delta;
        if (this.timer >= LiveFlickConfig.aiCheckInterval) {
            this.timer = 0;
            this.checkAndFlick();
        }
    }

    checkAndFlick() {
        if (!this.scene.ball || !this.scene.strikers) return;

        const aiStrikers = this.scene.strikers.filter(s => s.teamId === this.teamId && s.isReady);
        if (aiStrikers.length === 0) return;

        // Pick the one closest to the ball
        let bestStriker = null;
        let minDist = Infinity;
        const bx = this.scene.ball.body.position.x;
        const by = this.scene.ball.body.position.y;

        aiStrikers.forEach(s => {
            const dx = s.body.position.x - bx;
            const dy = s.body.position.y - by;
            const dist = dx * dx + dy * dy;
            if (dist < minDist) {
                minDist = dist;
                bestStriker = s;
            }
        });

        if (bestStriker) {
            // Add some delay to simulate reaction time based on difficulty
            const reactionDelay = Math.max(200, LiveFlickConfig.aiFlickDelay - this.difficulty * 150);
            
            // Check if it's been ready for at least reactionDelay
            // We can approximate this by just randomly delaying or using a simple timeout
            // For simplicity, we just execute it directly but with a chance to wait
            if (Math.random() > 0.5) {
                this.executeFlick(bestStriker);
            }
        }
    }

    executeFlick(striker) {
        if (!striker.isReady) return;

        const bx = this.scene.ball.body.position.x;
        const by = this.scene.ball.body.position.y;
        const sx = striker.body.position.x;
        const sy = striker.body.position.y;

        // Calculate angle to ball
        let angle = Math.atan2(by - sy, bx - sx);

        // Add some error based on difficulty
        const errorMargin = (6 - this.difficulty) * 0.05; // radians
        angle += (Math.random() * 2 - 1) * errorMargin;

        // Calculate force
        const dist = Math.sqrt((bx - sx)**2 + (by - sy)**2);
        const maxForce = GameConfig.physics.maxForce;
        let forceMag = (dist / 300) * maxForce; 
        if (forceMag > maxForce) forceMag = maxForce;
        if (forceMag < maxForce * 0.4) forceMag = maxForce * 0.4;

        const fx = Math.cos(angle) * forceMag;
        const fy = Math.sin(angle) * forceMag;

        AudioManager.playSFX('kick');
        this.scene.physics.applyForce(striker.body, { x: fx, y: fy });
        
        if (striker.startCooldown) {
            striker.startCooldown();
        }

        this.scene.onActionFired(this.teamId);
    }
}
