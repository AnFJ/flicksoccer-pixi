
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
            inertia: Infinity, // 禁止旋转
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
        this.view = new PIXI.Container();       // 身体层 (杆下)
        this.headGroup = new PIXI.Container();  // 头部层 (杆上)
        
        // 基础旋转角度缓存
        this.baseRotation = teamId === 0 ? Math.PI / 2 : -Math.PI / 2;
        
        // [新增] 基础缩放比例缓存
        this.baseScale = { x: 1, y: 1 };

        this.initVisuals(teamId);
    }

    initVisuals(teamId) {
        const cfg = FoosballConfig.puppet;
        const spriteKey = teamId === 0 ? 'fb_puppet_red' : 'fb_puppet_blue';
        const tex = ResourceManager.get(spriteKey);

        const visualOffset = 0; 

        if (tex) {
            // A. 创建身体渲染器
            this.bodySprite = new PIXI.Sprite(tex);
            this.bodySprite.anchor.set(0.5);
            
            // [修改] 先设置尺寸，然后立即获取并保存计算出的缩放比例
            this.bodySprite.width = cfg.width;
            this.bodySprite.height = cfg.height;
            
            this.baseScale.x = this.bodySprite.scale.x;
            this.baseScale.y = this.bodySprite.scale.y;
            
            this.bodySprite.rotation = this.baseRotation;
            this.bodySprite.y = visualOffset;

            this.view.addChild(this.bodySprite);

            // B. 创建头部渲染器
            this.headSprite = new PIXI.Sprite(tex);
            this.headSprite.anchor.set(0.5);
            this.headSprite.width = cfg.width;
            this.headSprite.height = cfg.height;
            this.headSprite.rotation = this.baseRotation;
            this.headSprite.y = visualOffset;

            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            // 稍微调小遮罩半径，适配视觉
            mask.drawCircle(0, 0, 70); 
            mask.endFill();
            this.headSprite.mask = mask;
            this.headGroup.addChild(this.headSprite, mask);

            // C. 阴影
            this.shadow = new PIXI.Graphics();
            this.shadow.beginFill(0x000000, 0.3);
            this.shadow.drawEllipse(0, 0, 30, 40);
            this.shadow.endFill();
            
            const shadowX = (teamId === 0 ? -visualOffset : visualOffset) + 5;
            this.shadow.position.set(shadowX, 5);
            
            this.view.addChildAt(this.shadow, 0);
        }
    }

    /**
     * 更新位置与击球表现
     * @param {number} rodX 杆子的X坐标
     * @param {number} rodY 杆子的当前中心Y
     * @param {number} kickOffset 当前弹簧位移量
     * @param {number} kickVelocity 当前弹簧速度 (用于计算形变)
     */
    updatePosition(rodX, rodY, kickOffset, kickVelocity = 0) {
        const dir = this.teamId === 0 ? 1 : -1; 
        const cfg = FoosballConfig.puppet;

        // 1. 物理同步 (保持原逻辑)
        const targetX = rodX + (kickOffset * cfg.kickPhysicsRatio) * dir;
        const vx = targetX - this.body.position.x;
        let vy = (rodY - this.body.position.y) * (cfg.verticalForceScale || 1.2);
        if (Math.abs(vy) > 60) vy = Math.sign(vy) * 60;

        Matter.Body.setVelocity(this.body, { x: vx, y: vy });
        Matter.Body.setPosition(this.body, { x: targetX, y: rodY });

        // 2. 视觉位移
        const visualShift = (kickOffset * cfg.kickVisualRatio) * dir;
        this.view.position.set(rodX + visualShift, rodY);
        this.headGroup.position.set(rodX, rodY);

        // 3. 程序化动画 (Procedural Animation)
        if (this.bodySprite) {
            // A. 动态拉伸 (Squash & Stretch)
            const speedFactor = Math.abs(kickVelocity) * 0.015;
            const stretch = 1 + speedFactor;      
            const squash = 1 - speedFactor * 0.5; 
            
            // [修改] 必须乘以基础缩放比例 (baseScale)
            // 原图是竖向的，旋转90度后：
            // bodySprite.scale.x 对应原图宽度 (现在是视觉高度)
            // bodySprite.scale.y 对应原图高度 (现在是视觉宽度)
            
            // 我们的拉伸是沿着踢球方向(视觉X轴)，对应 Sprite 的 Local Y 轴 (因为旋转了90度)
            const targetScaleX = this.baseScale.x * squash; // 变窄
            const targetScaleY = this.baseScale.y * stretch; // 拉长

            this.bodySprite.scale.set(targetScaleX, targetScaleY); 

            // B. 惯性倾斜 (Skew / Rotation Offset)
            const skewAmount = (kickVelocity * dir) * 0.01; 
            const maxSkew = 0.3; 
            const clampedSkew = Math.max(-maxSkew, Math.min(maxSkew, skewAmount));
            
            this.bodySprite.rotation = this.baseRotation - clampedSkew;
            this.headSprite.rotation = this.baseRotation - clampedSkew * 0.5;
        }
    }
}
