
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
            inertia: Infinity,
            friction: 0.1,
            restitution: 0.8,
            mass: 100, 
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

        if (tex) {
            // A. 创建身体渲染器 (旋转 90 度，使肩膀垂直)
            this.bodySprite = new PIXI.Sprite(tex);
            this.bodySprite.anchor.set(0.5);
            this.bodySprite.width = cfg.width;
            this.bodySprite.height = cfg.height;
            
            // 关键：旋转以适应纵向杆子
            // 红色旋转 90 度面朝右，蓝色旋转 -90 度面朝左
            this.bodySprite.rotation = teamId === 0 ? Math.PI / 2 : -Math.PI / 2;
            this.view.addChild(this.bodySprite);

            // B. 创建头部渲染器 (同上，但加遮罩)
            this.headSprite = new PIXI.Sprite(tex);
            this.headSprite.anchor.set(0.5);
            this.headSprite.width = cfg.width;
            this.headSprite.height = cfg.height;
            this.headSprite.rotation = this.bodySprite.rotation;

            // 遮罩：根据旋转后的坐标，只保留头部区域 (杆子上方)
            const mask = new PIXI.Graphics();
            mask.beginFill(0xffffff);
            // 遮罩区域定义：以中心为基准，覆盖中间圆头部分
            mask.drawCircle(0, 0, 28); 
            mask.endFill();
            this.headSprite.mask = mask;
            this.headGroup.addChild(this.headSprite, mask);

            // C. 阴影
            this.shadow = new PIXI.Graphics();
            this.shadow.beginFill(0x000000, 0.3);
            this.shadow.drawEllipse(0, 0, 30, 40);
            this.shadow.endFill();
            this.shadow.position.set(5, 5);
            this.view.addChildAt(this.shadow, 0);
        }
    }

    /**
     * 更新位置与击球
     * @param {number} rodX 杆子的X坐标
     * @param {number} rodY 杆子的当前中心Y
     * @param {number} kickOffset 击球强度位移
     */
    updatePosition(rodX, rodY, kickOffset) {
        const dir = this.teamId === 0 ? 1 : -1; // 0往右(+X)，1往左(-X)

        // 1. 计算视觉拉伸 (模拟脚踢出去的动作)
        const stretch = 1 + (kickOffset / 50) * 0.3;
        this.view.scale.x = stretch;
        
        // 2. 物理同步
        // 击球时，物理重心随脚尖移动
        const targetX = rodX + (kickOffset * 0.8) * dir;
        Matter.Body.setPosition(this.body, { x: targetX, y: rodY });
        
        // 3. 视觉同步
        this.view.position.set(rodX, rodY);
        this.headGroup.position.set(rodX, rodY);
    }
}
