
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
        this.kickState = 0; 
        this.kickOffset = 0;
        this.kickDirection = 1; // [新增] 1:向前踢, -1:向后踢
        
        // [修改] 从配置读取击球参数
        const kickCfg = FoosballConfig.rod.kick;
        this.maxKickOffset = kickCfg.maxOffset; 
        this.kickSpeed = kickCfg.speed;      
        this.returnSpeed = kickCfg.returnSpeed;    

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
        // [修改] 增加杆子长度，确保穿透整个屏幕 (假设设计高度1080，这里给2500足够长)
        const h = 2500; 
        
        const container = new PIXI.Container();
        
        // [恢复] 使用金属杆素材
        const rodTex = ResourceManager.get('fb_rod_metal');
        if (rodTex) {
            // 使用 TilingSprite 以便无限延伸且保持纹理比例
            const sprite = new PIXI.TilingSprite(rodTex, thickness, h);
            sprite.anchor.set(0.5);
            container.addChild(sprite);
        } else {
            // 兜底绘制
            const g = new PIXI.Graphics();
            
            // 金属质感
            g.beginFill(0x7f8c8d); // 暗色边
            g.drawRect(-thickness/2, -h/2, thickness, h);
            g.endFill();
            
            g.beginFill(0xecf0f1, 0.4); // 高光中心
            g.drawRect(-thickness/4, -h/2, thickness/2, h);
            g.endFill();

            container.addChild(g);
        }
        
        // 添加两端的把手/缓冲垫 (位置在极远处，或者根据屏幕裁剪)
        // 这里简单加几个装饰环，位置设宽一点
        const ringY = 600; // 距离中心
        
        // [优化] 尝试加载缓冲垫素材
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
            // 上装饰环
            ring.drawRect(-thickness*0.8, -ringY, thickness*1.6, 20);
            // 下装饰环
            ring.drawRect(-thickness*0.8, ringY, thickness*1.6, 20);
            ring.endFill();
            container.addChild(ring);
        }

        return container;
    }

    createPlayersAndCalcConstraints(numPlayers) {
        const fieldH = FoosballConfig.pitch.height; // 逻辑高度
        // 间距计算：保持原逻辑
        const spacing = fieldH / (numPlayers + 1);
        
        // [新增] 读取配置中的 rodYOffset (默认为0)
        const globalYOffset = FoosballConfig.puppet.rodYOffset || 0;
        
        // 记录相对偏移量的极值
        let minOffset = 0;
        let maxOffset = 0;

        for (let i = 0; i < numPlayers; i++) {
            // 计算相对杆子中心的 Y 偏移
            // [修改] 累加 rodYOffset
            const offsetY = (i - (numPlayers - 1) / 2) * (spacing * 1.1) + globalYOffset;
            
            if (i === 0) minOffset = offsetY;
            if (i === numPlayers - 1) maxOffset = offsetY;

            const player = new FoosballPlayer(this.x, this.y + offsetY, this.teamId);
            player.offsetY = offsetY;
            
            this.players.push(player);
            this.scene.physics.add(player.body);
            
            // 物理层级安排
            this.scene.layout.layers.game.addChildAt(player.view, this.scene.layout.layers.game.getChildIndex(this.rodContainer));
            this.headContainer.addChild(player.headGroup);
        }

        // [核心修改] 计算移动范围限制
        // 球员不应碰到上下墙壁。需要预留半个球员高度 + 边距
        // 假设球员碰撞箱高度约为 50 (hitHeight)，视觉高度更大
        // 我们留 60px 的安全边距
        const margin = 60; 
        
        // 当杆子移到最上方(minY)时，最上面的球员(minOffset)应该刚好抵住上墙(fieldRect.y)
        // minY + minOffset = fieldRect.y + margin
        // => minY = fieldRect.y + margin - minOffset
        const minY = this.fieldRect.y + margin - minOffset;

        // 当杆子移到最下方(maxY)时，最下面的球员(maxOffset)应该刚好抵住下墙(fieldRect.y + h)
        // maxY + maxOffset = fieldRect.y + this.fieldRect.h - margin
        // => maxY = fieldRect.y + this.fieldRect.h - margin - maxOffset
        const maxY = this.fieldRect.y + this.fieldRect.h - margin - maxOffset;

        return { minY, maxY };
    }

    moveTo(targetY) {
        // 应用针对该杆子计算的独立限制
        this.y = Math.max(this.constraints.minY, Math.min(this.constraints.maxY, targetY));
    }

    /**
     * 执行踢球
     * @param {number} dir 1:向前踢, -1:向后踢 (模拟360度旋转打身后的球)
     */
    kick(dir = 1) {
        if (this.kickState === 0) {
            this.kickState = 1;
            this.kickDirection = dir;
        }
    }

    update() {
        // 击球动画状态机 (支持双向)
        if (this.kickState === 1) {
            // 伸出阶段：根据 kickDirection 增加或减少
            if (this.kickDirection === 1) {
                this.kickOffset += this.kickSpeed;
                if (this.kickOffset >= this.maxKickOffset) this.kickState = 2;
            } else {
                this.kickOffset -= this.kickSpeed;
                // 后踢距离稍微短一点 (0.6倍)，避免穿模太严重
                if (this.kickOffset <= -this.maxKickOffset * 0.6) this.kickState = 2;
            }
        } else if (this.kickState === 2) {
            // 收回阶段：归零
            if (this.kickOffset > 0) {
                this.kickOffset -= this.returnSpeed;
                if (this.kickOffset <= 0) { this.kickOffset = 0; this.kickState = 0; }
            } else if (this.kickOffset < 0) {
                this.kickOffset += this.returnSpeed;
                if (this.kickOffset >= 0) { this.kickOffset = 0; this.kickState = 0; }
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
