
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import ResourceManager from '../../../managers/ResourceManager.js';
import { CollisionCategory } from '../../../constants.js';
import { FoosballConfig } from '../config/FoosballConfig.js';

export default class FoosballPlayer {
    constructor(x, y, teamId) {
        this.teamId = teamId;
        const cfg = FoosballConfig.puppet;

        // 1. 物理刚体
        this.body = Matter.Bodies.rectangle(x, y, cfg.hitWidth, cfg.hitHeight, {
            isStatic: false, 
            inertia: Infinity, // 禁止物理引擎自动旋转，我们手动控制视觉
            friction: cfg.friction,
            restitution: cfg.restitution,
            density: cfg.density,
            label: 'FoosballPlayer',
            collisionFilter: {
                category: CollisionCategory.STRIKER,
                mask: CollisionCategory.BALL
            }
        });
        
        // 2. 视图结构
        this.view = new PIXI.Container();       // 包含整个棋子(身体+阴影)
        
        // [修改] 基础旋转角度归零 (假设素材已预处理为横向，红方朝右，蓝方朝左)
        this.baseRotation = 0;
        
        // 基础缩放比例缓存
        this.baseScale = { x: 1, y: 1 };

        // 序列帧缓存
        this.frames = []; 
        this.useFrameAnimation = false;

        this.initVisuals(teamId);
    }

    initVisuals(teamId) {
        const cfg = FoosballConfig.puppet;
        const colorKey = teamId === 0 ? 'red' : 'blue';
        const baseKey = `fb_puppet_${colorKey}`;
        
        // --- A. 尝试加载序列帧 ---
        for (let i = 0; i < 10; i++) {
            const frameKey = `${baseKey}_${i}`;
            const tex = ResourceManager.get(frameKey);
            if (tex) {
                this.frames.push(tex);
            } else {
                if (i > 0) break;
            }
        }

        if (this.frames.length > 1) {
            this.useFrameAnimation = true;
            console.log(`[FoosballPlayer] Frame animation enabled for ${colorKey}, frames: ${this.frames.length}`);
        }

        // --- B. 初始化 Sprite ---
        const mainTex = this.frames.length > 0 ? this.frames[0] : ResourceManager.get(baseKey);

        const visualOffset = 0; 

        if (mainTex) {
            // 1. 完整棋子渲染器
            this.bodySprite = new PIXI.Sprite(mainTex);
            this.bodySprite.anchor.set(0.5);
            
            // [修改] 尺寸映射回归直观逻辑 (不旋转)
            // Sprite 横向(X) = 长度/身高 (cfg.width)
            // Sprite 纵向(Y) = 宽度/肩宽 (cfg.height)
            this.bodySprite.width = cfg.width; 
            this.bodySprite.height = cfg.height;
            
            this.baseScale.x = this.bodySprite.scale.x;
            this.baseScale.y = this.bodySprite.scale.y;
            
            this.bodySprite.rotation = this.baseRotation;
            this.bodySprite.y = visualOffset;

            this.view.addChild(this.bodySprite);

            // 2. 阴影 (简单椭圆)
            this.shadow = new PIXI.Graphics();
            this.shadow.beginFill(0x000000, 0.3);
            this.shadow.drawEllipse(0, 0, 40, 30); // 调整阴影形状适配横向
            this.shadow.endFill();
            
            // 阴影稍微偏向一侧
            const shadowX = (teamId === 0 ? -visualOffset : visualOffset) + 5;
            this.shadow.position.set(shadowX, 5);
            
            this.view.addChildAt(this.shadow, 0);
        }
    }

    updatePosition(rodX, rodY, kickOffset, kickVelocity = 0) {
        const dir = this.teamId === 0 ? 1 : -1; 
        const cfg = FoosballConfig.puppet;
        const maxOffset = FoosballConfig.rod.kick.maxOffset;

        // 1. 物理刚体同步
        const targetX = rodX + (kickOffset * cfg.kickPhysicsRatio) * dir;
        const vx = targetX - this.body.position.x;
        let vy = (rodY - this.body.position.y) * (cfg.verticalForceScale || 1.2);
        if (Math.abs(vy) > 60) vy = Math.sign(vy) * 60; 

        Matter.Body.setVelocity(this.body, { x: vx, y: vy });
        Matter.Body.setPosition(this.body, { x: targetX, y: rodY });

        // 计算归一化的踢球进度
        let ratio = kickOffset / maxOffset; 
        ratio = Math.max(-1.0, Math.min(1.0, ratio));

        // 2. 视觉处理
        if (this.useFrameAnimation) {
            this._updateWithFrames(rodX, rodY, ratio, dir, cfg);
        } else {
            this._updateWithProcedural3D(rodX, rodY, ratio, dir, kickVelocity, cfg);
        }
    }

    _updateWithFrames(rodX, rodY, ratio, dir, cfg) {
        const visualShift = (ratio * 120) * dir; 
        this.view.position.set(rodX + visualShift, rodY);

        const len = this.frames.length;
        const absRatio = Math.abs(ratio); 
        
        let frameIndex = Math.floor(absRatio * (len - 1));
        frameIndex = Math.max(0, Math.min(len - 1, frameIndex));

        if (this.bodySprite && this.frames[frameIndex]) {
            this.bodySprite.texture = this.frames[frameIndex];
            const isBackKick = ratio < 0; 
            
            // 恢复基础缩放 (不反转Y，因为已预处理方向)
            this.bodySprite.scale.x = this.baseScale.x; 
            this.bodySprite.scale.y = this.baseScale.y; 
        }
    }

    /**
     * 方案 B: 优化后的单图伪 3D 变换 (水平正向踢球)
     * 目标：头部固定，双脚水平蹬出，无倾斜
     */
    _updateWithProcedural3D(rodX, rodY, ratio, dir, kickVelocity, cfg) {
        this.view.position.set(rodX, rodY);

        if (this.bodySprite) {
            this.bodySprite.rotation = this.baseRotation;

            // 1. 计算形变比例
            const absRatio = Math.abs(ratio);
            // 拉伸系数：模拟腿部伸出，稍微加大拉伸幅度让动作更明显
            const stretch = 1 + absRatio * 0.65; 
            // 宽度保持不变或极微小变化，模拟“双脚平蹬”的厚实感
            const squash = 1.0; 

            this.bodySprite.scale.x = this.baseScale.x * stretch;
            this.bodySprite.scale.y = this.baseScale.y * squash;

            // 2. 头部锚定 (Head Pinning)
            // 核心逻辑：当 Sprite 从中心拉伸时，头部会向后退。
            // 我们需要将 Sprite 整体向“前”（脚的方向）移动，刚好抵消头部的后退量。
            const originalLen = FoosballConfig.puppet.width; 
            const newLen = originalLen * stretch;
            const deltaLen = newLen - originalLen;
            
            // 修正位移：dir 为正(右)时，向右移；dir 为负(左)时，向左移。
            this.bodySprite.x = (dir * deltaLen) / 2;
            this.bodySprite.y = 0; 

            // 3. [关键修改] 移除 Skew，确保是正向水平踢球
            this.bodySprite.skew.x = 0; 

            // 4. 阴影处理
            if (this.shadow) {
                // 阴影跟随身体重心稍微前移一点点
                this.shadow.x = (this.teamId === 0 ? 5 : -5) + (this.bodySprite.x * 0.5); 
                this.shadow.alpha = 0.5 - absRatio * 0.1; 
                // 阴影随身体拉长，增强冲刺感
                this.shadow.scale.x = 1 + absRatio * 0.4; 
            }
        }
    }
}
