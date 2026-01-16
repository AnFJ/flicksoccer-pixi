
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
        // [优化] 使用 Config 中的参数
        this.body = Matter.Bodies.rectangle(x, y, cfg.hitWidth, cfg.hitHeight, {
            isStatic: false, 
            inertia: Infinity, // 禁止旋转
            friction: cfg.friction, // 高摩擦，方便搓球
            restitution: cfg.restitution, // 低弹性，静止不反弹
            density: cfg.density, // 高密度，动量大
            label: 'FoosballPlayer',
            collisionFilter: {
                category: CollisionCategory.STRIKER,
                mask: CollisionCategory.BALL
            }
        });
        
        // 2. 视图结构
        this.view = new PIXI.Container();       // 身体层 (杆下)
        this.headGroup = new PIXI.Container();  // 头部层 (杆上)
        
        this.initVisuals(teamId);
    }

    initVisuals(teamId) {
        const cfg = FoosballConfig.puppet;
        const spriteKey = teamId === 0 ? 'fb_puppet_red' : 'fb_puppet_blue';
        const tex = ResourceManager.get(spriteKey);

        // [调整] 视觉修正偏移量 (用于对齐杆子和肩膀)
        // 红色(0)需要左移，蓝色(1)需要右移
        const visualOffset = 0; 

        if (tex) {
            // A. 创建身体渲染器 (旋转 90 度，使肩膀垂直)
            this.bodySprite = new PIXI.Sprite(tex);
            this.bodySprite.anchor.set(0.5);
            this.bodySprite.width = cfg.width;
            this.bodySprite.height = cfg.height;
            
            // 关键：旋转以适应纵向杆子
            // 红色旋转 90 度面朝右，蓝色旋转 -90 度面朝左
            this.bodySprite.rotation = teamId === 0 ? Math.PI / 2 : -Math.PI / 2;
            
            // [修正] 应用偏移，使视觉中心(肚子)偏离杆子，从而让肩膀(杆子位置)对齐
            this.bodySprite.y = visualOffset;

            this.view.addChild(this.bodySprite);

            // B. 创建头部渲染器 (同上，但加遮罩)
            this.headSprite = new PIXI.Sprite(tex);
            this.headSprite.anchor.set(0.5);
            this.headSprite.width = cfg.width;
            this.headSprite.height = cfg.height;
            this.headSprite.rotation = this.bodySprite.rotation;
            
            // [修正] 头部也应用同样的偏移
            this.headSprite.y = visualOffset;

            // 遮罩：根据旋转后的坐标，只保留头部区域 (杆子上方)
            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            // 遮罩区域定义：以中心(杆子)为基准，覆盖中间圆头部分
            // 注意：Mask 不移动，始终在杆子中心，这样正好露出偏移后的头部
            mask.drawCircle(0, 0, 28); 
            mask.endFill();
            this.headSprite.mask = mask;
            this.headGroup.addChild(this.headSprite, mask);

            // C. 阴影
            this.shadow = new PIXI.Graphics();
            this.shadow.beginFill(0x000000, 0.3);
            this.shadow.drawEllipse(0, 0, 30, 40);
            this.shadow.endFill();
            
            // [修正] 阴影跟随身体偏移 (view 容器未旋转，需手动计算 X 轴偏移)
            // 红色(0) offset 为正 -> 身体左移 -> 阴影X应为负
            // 蓝色(1) offset 为正 -> 身体右移 -> 阴影X应为正
            const shadowX = (teamId === 0 ? -visualOffset : visualOffset) + 5;
            this.shadow.position.set(shadowX, 5);
            
            this.view.addChildAt(this.shadow, 0);
        }
    }

    /**
     * 更新位置与击球
     * @param {number} rodX 杆子的X坐标
     * @param {number} rodY 杆子的当前中心Y
     * @param {number} kickOffset 击球强度位移 (最大 150)
     */
    updatePosition(rodX, rodY, kickOffset) {
        const dir = this.teamId === 0 ? 1 : -1; // 0往右(+X)，1往左(-X)
        const cfg = FoosballConfig.puppet;
        const maxOffset = FoosballConfig.rod.kick.maxOffset;

        // 1. 物理同步
        // 击球时，物理重心随脚尖移动
        const targetX = rodX + (kickOffset * cfg.kickPhysicsRatio) * dir;
        
        // [核心优化] 显式设置速度 (Velocity)
        // Matter.js 处理碰撞冲量时依赖刚体的 velocity 属性。
        // 如果只设置 position，虽然物体移动了，但 collision solver 可能认为它是静止或速度不一致。
        // 手动计算当前帧的位移作为速度：vx = newX - oldX
        const vx = targetX - this.body.position.x;
        
        // [优化] 垂直速度增强
        // 适当放大垂直速度，让滑杆击球更有力，补偿物理引擎对摩擦传导的损耗
        // [修改] 使用配置中的系数，默认 1.2
        let vy = (rodY - this.body.position.y) * (cfg.verticalForceScale || 1.2);
        
        // 限制最大速度防止穿透
        if (Math.abs(vy) > 60) vy = Math.sign(vy) * 60;

        Matter.Body.setVelocity(this.body, { x: vx, y: vy });
        Matter.Body.setPosition(this.body, { x: targetX, y: rodY });

        // 2. 视觉同步 (位移 + 拉伸)
        // [核心优化] 仅靠拉伸会导致图片严重失真。
        // 我们让身体中心也跟随前移一部分
        const visualShift = (kickOffset * cfg.kickVisualRatio) * dir;
        this.view.position.set(rodX + visualShift, rodY);

        // 配合适度拉伸：最大 offset 时，拉伸至 1.0 + kickStretchRatio
        const stretch = 1 + (Math.abs(kickOffset) / maxOffset) * cfg.kickStretchRatio;
        this.view.scale.x = stretch;
        
        // 3. 头部始终保持在杆子上 (固定点)
        this.headGroup.position.set(rodX, rodY);
    }
}
