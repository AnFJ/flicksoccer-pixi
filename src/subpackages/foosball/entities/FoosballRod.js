
import FoosballPlayer from './FoosballPlayer.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import * as PIXI from 'pixi.js';
import { FoosballConfig } from '../config/FoosballConfig.js';

export default class FoosballRod {
    constructor(scene, x, teamId, numPlayers, constraints) {
        this.scene = scene;
        this.x = x;
        this.y = (constraints.minY + constraints.maxY) / 2;
        this.teamId = teamId;
        this.constraints = constraints;
        
        this.players = [];
        this.kickState = 0; 
        this.kickOffset = 0;
        this.maxKickOffset = 150; 
        this.kickSpeed = 15;      
        this.returnSpeed = 8;    

        // 1. 层级容器 (为了实现杆子穿过肩膀，需要精细的层级顺序)
        // 顺序：PlayerBody(下) -> Rod(中) -> PlayerHead(上)
        this.rodContainer = new PIXI.Container();
        this.headContainer = new PIXI.Container();

        // 将容器添加到场景的 game 层
        this.scene.layout.layers.game.addChild(this.rodContainer);
        this.scene.layout.layers.game.addChild(this.headContainer);

        // 2. 绘制金属滑杆 (纵向)
        this.rodSprite = this.createRodSprite();
        this.rodContainer.addChild(this.rodSprite);

        // 3. 创建球员
        const fieldH = FoosballConfig.pitch.height;
        const spacing = fieldH / (numPlayers + 1);
        
        for (let i = 0; i < numPlayers; i++) {
            const offsetY = (i - (numPlayers - 1) / 2) * (spacing * 1.1);
            const player = new FoosballPlayer(this.x, this.y + offsetY, teamId);
            player.offsetY = offsetY;
            
            this.players.push(player);
            this.scene.physics.add(player.body);
            
            // 物理层级安排：
            // 身体在杆子下
            this.scene.layout.layers.game.addChildAt(player.view, this.scene.layout.layers.game.getChildIndex(this.rodContainer));
            // 头部在杆子上
            this.headContainer.addChild(player.headGroup);
        }
    }

    createRodSprite() {
        const thickness = FoosballConfig.rod.thickness;
        const h = 1080; // 贯穿屏幕
        
        const container = new PIXI.Container();
        const g = new PIXI.Graphics();
        
        // 金属质感：深浅渐变模拟圆柱体
        g.beginFill(0x7f8c8d); // 暗色边
        g.drawRect(-thickness/2, -h/2, thickness, h);
        g.endFill();
        
        g.beginFill(0xecf0f1, 0.4); // 高光中心
        g.drawRect(-thickness/4, -h/2, thickness/2, h);
        g.endFill();

        container.addChild(g);
        
        // 添加两端的把手/固定环 (装饰)
        const ring = new PIXI.Graphics().beginFill(0x333333).drawRect(-thickness*0.8, -h/2, thickness*1.6, 20).endFill();
        container.addChild(ring);

        return container;
    }

    moveTo(targetY) {
        this.y = Math.max(this.constraints.minY, Math.min(this.constraints.maxY, targetY));
    }

    kick() {
        if (this.kickState === 0) this.kickState = 1;
    }

    update() {
        // 击球动画状态机
        if (this.kickState === 1) {
            this.kickOffset += this.kickSpeed;
            if (this.kickOffset >= this.maxKickOffset) this.kickState = 2;
        } else if (this.kickState === 2) {
            this.kickOffset -= this.returnSpeed;
            if (this.kickOffset <= 0) {
                this.kickOffset = 0;
                this.kickState = 0;
            }
        }

        // 同步杆子位置
        this.rodSprite.position.set(this.x, this.y);

        // 同步所有球员
        this.players.forEach(p => {
            p.updatePosition(this.x, this.y + p.offsetY, this.kickOffset);
        });
    }
}
