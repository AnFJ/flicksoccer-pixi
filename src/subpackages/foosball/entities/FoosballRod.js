
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
        
        // 初始位置先定在球场垂直中心，稍后会根据限制调整
        this.y = fieldRect.y + fieldRect.h / 2;
        this.teamId = teamId;
        
        this.players = [];
        
        // [核心修改] 物理弹簧状态变量
        this.kickOffset = 0;       // 当前实际偏移量
        this.kickVelocity = 0;     // 当前伸缩速度
        this.targetOffset = 0;     // 目标偏移量 (0 或 maxKickOffset)
        this.kickDirection = 1;    // 1:向前, -1:向后
        this.isKicking = false;    // 是否处于主动击球状态
        
        // 读取配置
        const kickCfg = FoosballConfig.rod.kick;
        this.maxKickOffset = kickCfg.maxOffset; 
        this.stiffness = kickCfg.stiffness;
        this.damping = kickCfg.damping;
        this.mass = kickCfg.mass || 1.0;

        // 1. 层级容器
        this.rodContainer = new PIXI.Container();
        this.headContainer = new PIXI.Container();

        this.scene.layout.layers.game.addChild(this.rodContainer);
        this.scene.layout.layers.game.addChild(this.headContainer);

        // 2. 绘制金属滑杆 (视觉优化)
        this.rodSprite = this.createRodSprite();
        this.rodContainer.addChild(this.rodSprite);

        // 3. 创建球员并计算移动限制
        this.constraints = this.createPlayersAndCalcConstraints(numPlayers);
        
        // 4. 强制复位一次，确保初始位置合法
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
            
            this.scene.layout.layers.game.addChildAt(player.view, this.scene.layout.layers.game.getChildIndex(this.rodContainer));
            this.headContainer.addChild(player.headGroup);
        }

        const margin = 60; 
        const minY = this.fieldRect.y + margin - minOffset;
        const maxY = this.fieldRect.y + this.fieldRect.h - margin - maxOffset;

        return { minY, maxY };
    }

    moveTo(targetY) {
        this.y = Math.max(this.constraints.minY, Math.min(this.constraints.maxY, targetY));
    }

    /**
     * 执行踢球 (设置弹簧目标)
     * @param {number} dir 1:向前踢, -1:向后踢
     */
    kick(dir = 1) {
        // 只有当不在击球状态，或者已经开始回弹时，允许新的击球
        if (!this.isKicking || Math.abs(this.targetOffset) < 10) {
            this.isKicking = true;
            this.kickDirection = dir;
            // 设定目标为最大冲程
            this.targetOffset = this.maxKickOffset * dir;
        }
    }

    update() {
        // --- 1. 弹簧物理模拟核心 ---
        
        // 计算弹簧力 F = k * x (x = target - current)
        const diff = this.targetOffset - this.kickOffset;
        const force = diff * this.stiffness;
        
        // 加速度 a = F / m
        const acceleration = force / this.mass;
        
        // 速度积分 v += a
        this.kickVelocity += acceleration;
        
        // 阻尼衰减 (模拟摩擦和能量损耗)
        this.kickVelocity *= this.damping;
        
        // 位移积分 p += v
        this.kickOffset += this.kickVelocity;

        // --- 2. 自动回弹逻辑 ---
        
        // 如果处于“击球”状态，且已经非常接近目标（甚至冲过了），则触发回弹
        // 这里的判断阈值不用太精确，只要接近了最大值就开始收杆
        if (this.isKicking) {
            const distToTarget = Math.abs(this.targetOffset - this.kickOffset);
            
            // 如果接近目标点 (例如还有 20% 的距离)，或者速度开始反向(意味着到了极点)，就开始自动回弹
            if (distToTarget < this.maxKickOffset * 0.2) {
                this.isKicking = false;
                this.targetOffset = 0; // 目标设为 0，弹簧会把杆子拉回来
            }
        }

        // 强行归零修正 (防止微小震荡停不下来)
        if (!this.isKicking && Math.abs(this.kickOffset) < 1 && Math.abs(this.kickVelocity) < 0.5) {
            this.kickOffset = 0;
            this.kickVelocity = 0;
        }

        // --- 3. 视觉同步 ---

        this.rodSprite.position.set(this.x, this.y);

        this.players.forEach(p => {
            // [修改] 传入 kickVelocity 用于计算视觉拉伸/倾斜效果
            p.updatePosition(this.x, this.y + p.offsetY, this.kickOffset, this.kickVelocity);
        });
    }
}
