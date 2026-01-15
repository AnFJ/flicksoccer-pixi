
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import ResourceManager from '../../../managers/ResourceManager.js';

export default class FoosballPlayer {
    /**
     * @param {number} x 初始X (杆的位置)
     * @param {number} y 初始Y
     * @param {number} teamId 0:红方(左), 1:蓝方(右)
     */
    constructor(x, y, teamId) {
        this.teamId = teamId;
        this.width = 25;  // 碰撞箱宽度 (厚度)
        this.height = 50; // 碰撞箱高度 (宽度)
        
        // 视觉尺寸略大
        this.viewWidth = 40;
        this.viewHeight = 60;

        // 1. 物理刚体
        // 技巧：虽然看起来是固定的，但为了产生物理反弹，我们不设为 isStatic，
        // 而是通过每一帧手动 setPosition / setVelocity 来控制它 (Kinematic 风格)。
        // 赋予较大的质量使其不易被球撞偏。
        this.body = Matter.Bodies.rectangle(x, y, this.width, this.height, {
            isStatic: false, 
            inertia: Infinity, // 锁定旋转
            friction: 0,
            frictionAir: 0,
            restitution: 0.5,
            mass: 50, 
            label: 'FoosballPlayer',
            render: { visible: false }
        });
        
        // 2. 视图
        this.view = new PIXI.Container();
        
        // 阴影
        const shadow = new PIXI.Graphics();
        shadow.beginFill(0x000000, 0.3);
        shadow.drawRoundedRect(-this.viewWidth/2 + 5, -this.viewHeight/2 + 5, this.viewWidth, this.viewHeight, 8);
        shadow.endFill();
        this.view.addChild(shadow);

        // 主体
        const spriteKey = teamId === 0 ? 'fb_puppet_red' : 'fb_puppet_blue';
        const tex = ResourceManager.get(spriteKey);
        
        if (tex) {
            const sprite = new PIXI.Sprite(tex);
            sprite.anchor.set(0.5);
            sprite.width = this.viewWidth;
            sprite.height = this.viewHeight;
            // 蓝方(右侧)需要水平翻转
            if (teamId === 1) sprite.scale.x = -1; 
            this.view.addChild(sprite);
        } else {
            // 兜底绘制
            const g = new PIXI.Graphics();
            const color = teamId === 0 ? 0xE74C3C : 0x3498DB;
            g.beginFill(color);
            g.drawRoundedRect(-this.viewWidth/2, -this.viewHeight/2, this.viewWidth, this.viewHeight, 8);
            g.endFill();
            
            // 头部标记
            g.beginFill(0xFFFFFF, 0.3);
            g.drawCircle(0, 0, 10);
            g.endFill();
            
            // 脚部方向指示
            g.beginFill(0xFFFFFF, 0.8);
            const dirX = teamId === 0 ? 10 : -10;
            g.drawRect(dirX - 2, -15, 4, 30);
            g.endFill();

            this.view.addChild(g);
        }
    }

    /**
     * 更新位置
     * @param {number} rodX 杆子的X坐标
     * @param {number} rodY 杆子的Y坐标 (也是球员的基准Y)
     * @param {number} kickOffset 踢球产生的X轴偏移量
     */
    updatePosition(rodX, rodY, kickOffset) {
        // 实际物理位置 = 杆位置 + 踢球偏移
        // 红方(左) 踢球向右 (+x)，蓝方(右) 踢球向左 (-x)
        const dir = this.teamId === 0 ? 1 : -1;
        const targetX = rodX + kickOffset * dir;
        const targetY = rodY;

        // 手动设置速度以保证物理碰撞计算正确
        const vx = targetX - this.body.position.x;
        const vy = targetY - this.body.position.y;
        
        Matter.Body.setVelocity(this.body, { x: vx, y: vy });
        Matter.Body.setPosition(this.body, { x: targetX, y: targetY });
        
        // 强制重置角度
        Matter.Body.setAngle(this.body, 0); 
        Matter.Body.setAngularVelocity(this.body, 0);

        // 同步视图
        this.view.x = targetX;
        this.view.y = targetY;
        
        // 踢球动画效果 (简单的缩放模拟立体感)
        const scaleBase = 1.0;
        const scaleKick = 0.1 * (kickOffset / 30); 
        this.view.scale.set(scaleBase + scaleKick);
    }
}
