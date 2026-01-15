
import FoosballPlayer from './FoosballPlayer.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import * as PIXI from 'pixi.js';

export default class FoosballRod {
    /**
     * @param {Object} scene 场景引用
     * @param {number} x 杆子的固定X坐标
     * @param {number} teamId 0/1
     * @param {number} numPlayers 球员数量 (1~3)
     * @param {Object} constraints { minY, maxY } 移动范围
     */
    constructor(scene, x, teamId, numPlayers, constraints) {
        this.scene = scene;
        this.x = x;
        this.y = (constraints.minY + constraints.maxY) / 2; // 初始在中间
        this.teamId = teamId;
        this.constraints = constraints;
        
        this.players = [];
        this.kickState = 0; // 0:Idle, 1:Kicking(Out), 2:Returning(In)
        this.kickOffset = 0;
        this.maxKickOffset = 35; // 踢球伸出的最大距离
        this.kickSpeed = 8;      // 踢出速度
        this.returnSpeed = 4;    // 收回速度

        // 创建视图 (杆子本身)
        this.view = new PIXI.Container();
        this.rodSprite = this.createRodSprite();
        this.view.addChild(this.rodSprite);
        this.scene.layout.layers.game.addChild(this.view); 

        // 创建球员
        const fieldH = constraints.maxY - constraints.minY + 200; // 估算覆盖区域
        // 球员分布间距
        const spacing = fieldH / (numPlayers + 1) * 1.2; 
        
        // 计算球员相对于杆子中心的Y偏移
        for (let i = 0; i < numPlayers; i++) {
            const offsetY = (i - (numPlayers - 1) / 2) * spacing;
            
            const player = new FoosballPlayer(this.x, this.y + offsetY, teamId);
            player.offsetY = offsetY; // 记录相对偏移
            
            this.players.push(player);
            this.scene.physics.add(player.body);
            this.scene.layout.layers.game.addChild(player.view);
        }
    }

    createRodSprite() {
        const h = 1000; // 杆子足够长
        const w = 14;
        
        const tex = ResourceManager.get('fb_rod_metal');
        if (tex) {
            const sp = new PIXI.TilingSprite(tex, w, h);
            sp.anchor.set(0.5);
            return sp;
        } 
        
        const g = new PIXI.Graphics();
        g.beginFill(0xBDC3C7); // 银色
        g.lineStyle(2, 0x7F8C8D);
        g.drawRect(-w/2, -h/2, w, h);
        g.endFill();
        return g;
    }

    /**
     * 移动杆子
     * @param {number} targetY 目标Y坐标 (绝对坐标)
     */
    moveTo(targetY) {
        // 限制范围
        this.y = Math.max(this.constraints.minY, Math.min(this.constraints.maxY, targetY));
    }

    /**
     * 触发击球
     */
    kick() {
        if (this.kickState === 0) {
            this.kickState = 1;
        }
    }

    update() {
        // 1. 处理击球动画状态
        if (this.kickState === 1) {
            // 踢出阶段
            this.kickOffset += this.kickSpeed;
            if (this.kickOffset >= this.maxKickOffset) {
                this.kickOffset = this.maxKickOffset;
                this.kickState = 2; // 开始收回
            }
        } else if (this.kickState === 2) {
            // 收回阶段
            this.kickOffset -= this.returnSpeed;
            if (this.kickOffset <= 0) {
                this.kickOffset = 0;
                this.kickState = 0; // 回到待机
            }
        }

        // 2. 更新杆子视图位置
        this.view.x = this.x;
        this.view.y = this.y;

        // 3. 更新所有球员位置
        this.players.forEach(p => {
            // 球员Y = 杆子Y + 相对偏移
            p.updatePosition(this.x, this.y + p.offsetY, this.kickOffset);
        });
    }
}
