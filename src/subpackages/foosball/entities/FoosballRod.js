
import FoosballPlayer from './FoosballPlayer.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import * as PIXI from 'pixi.js';
import { FoosballConfig } from '../config/FoosballConfig.js';

export default class FoosballRod {
    /**
     * @param {Object} scene 场景引用
     * @param {number} x 杆子X坐标
     * @param {number} teamId 队伍ID
     * @param {number} numPlayers 球员数量
     * @param {Object} fieldRect 球场矩形区域 {x, y, w, h}
     */
    constructor(scene, x, teamId, numPlayers, fieldRect) {
        this.scene = scene;
        this.x = x;
        this.fieldRect = fieldRect;
        
        this.y = fieldRect.y + fieldRect.h / 2;
        this.teamId = teamId;
        
        this.players = [];
        
        // 物理弹簧状态变量
        this.kickOffset = 0;       
        this.kickVelocity = 0;     
        this.targetOffset = 0;     
        this.kickDirection = 1;    
        this.isKicking = false;    
        
        const kickCfg = FoosballConfig.rod.kick;
        this.maxKickOffset = kickCfg.maxOffset; 
        this.stiffness = kickCfg.stiffness;
        this.damping = kickCfg.damping;
        this.mass = kickCfg.mass || 1.0;

        // 1. 层级容器
        this.rodContainer = new PIXI.Container();
        // [移除] this.headContainer - 不再需要分层

        this.scene.layout.layers.game.addChild(this.rodContainer);

        // 2. 绘制金属滑杆
        this.rodSprite = this.createRodSprite();
        this.rodContainer.addChild(this.rodSprite);

        // 3. 创建球员
        this.constraints = this.createPlayersAndCalcConstraints(numPlayers);
        
        // 4. 强制复位
        this.moveTo(this.y);
    }

    createRodSprite() {
        const thickness = FoosballConfig.rod.thickness;
        const h = 2500; 
        
        const container = new PIXI.Container();
        
        const rodTex = ResourceManager.get('fb_rod_metal');
        if (rodTex) {
            const sprite = new PIXI.TilingSprite(rodTex, thickness, h);
            sprite.anchor.set(0.5);
            container.addChild(sprite);
        } else {
            const g = new PIXI.Graphics();
            g.beginFill(0x7f8c8d);
            g.drawRect(-thickness/2, -h/2, thickness, h);
            g.endFill();
            g.beginFill(0xecf0f1, 0.4);
            g.drawRect(-thickness/4, -h/2, thickness/2, h);
            g.endFill();
            container.addChild(g);
        }
        
        const ringY = 600; 
        const bumperTex = ResourceManager.get('fb_bumper');
        if (bumperTex) {
            const topBumper = new PIXI.Sprite(bumperTex);
            topBumper.anchor.set(0.5);
            topBumper.y = -ringY;
            topBumper.width = thickness * 2.5;
            topBumper.height = thickness * 1.5;
            
            const bottomBumper = new PIXI.Sprite(bumperTex);
            bottomBumper.anchor.set(0.5);
            bottomBumper.y = ringY;
            bottomBumper.width = thickness * 2.5;
            bottomBumper.height = thickness * 1.5;
            
            container.addChild(topBumper, bottomBumper);
        } else {
            const ring = new PIXI.Graphics();
            ring.beginFill(0x333333);
            ring.drawRect(-thickness*0.8, -ringY, thickness*1.6, 20);
            ring.drawRect(-thickness*0.8, ringY, thickness*1.6, 20);
            ring.endFill();
            container.addChild(ring);
        }

        return container;
    }

    createPlayersAndCalcConstraints(numPlayers) {
        const fieldH = FoosballConfig.pitch.height;
        const spacing = fieldH / (numPlayers + 1);
        const globalYOffset = FoosballConfig.puppet.rodYOffset || 0;
        
        let minOffset = 0;
        let maxOffset = 0;

        for (let i = 0; i < numPlayers; i++) {
            const offsetY = (i - (numPlayers - 1) / 2) * (spacing * 1.1) + globalYOffset;
            if (i === 0) minOffset = offsetY;
            if (i === numPlayers - 1) maxOffset = offsetY;

            const player = new FoosballPlayer(this.x, this.y + offsetY, this.teamId);
            player.offsetY = offsetY;
            
            this.players.push(player);
            this.scene.physics.add(player.body);
            
            // [核心修改] 将球员的 view 直接添加到 rodContainer
            // 因为 rodContainer 中已经先添加了 rodSprite，所以这里 addChild 会将 player 放在 rod 上层
            this.rodContainer.addChild(player.view);
        }

        const margin = 60; 
        const minY = this.fieldRect.y + margin - minOffset;
        const maxY = this.fieldRect.y + this.fieldRect.h - margin - maxOffset;

        return { minY, maxY };
    }

    moveTo(targetY) {
        this.y = Math.max(this.constraints.minY, Math.min(this.constraints.maxY, targetY));
    }

    kick(dir = 1) {
        if (!this.isKicking || Math.abs(this.targetOffset) < 10) {
            this.isKicking = true;
            this.kickDirection = dir;
            this.targetOffset = this.maxKickOffset * dir;
        }
    }

    update() {
        // --- 1. 弹簧物理模拟 ---
        const diff = this.targetOffset - this.kickOffset;
        const force = diff * this.stiffness;
        const acceleration = force / this.mass;
        this.kickVelocity += acceleration;
        this.kickVelocity *= this.damping;
        this.kickOffset += this.kickVelocity;

        // --- 2. 自动回弹逻辑 ---
        if (this.isKicking) {
            const distToTarget = Math.abs(this.targetOffset - this.kickOffset);
            if (distToTarget < this.maxKickOffset * 0.2) {
                this.isKicking = false;
                this.targetOffset = 0; 
            }
        }

        if (!this.isKicking && Math.abs(this.kickOffset) < 1 && Math.abs(this.kickVelocity) < 0.5) {
            this.kickOffset = 0;
            this.kickVelocity = 0;
        }

        // --- 3. 视觉同步 ---
        this.rodSprite.position.set(this.x, this.y);

        this.players.forEach(p => {
            p.updatePosition(this.x, this.y + p.offsetY, this.kickOffset, this.kickVelocity);
        });
    }
}
