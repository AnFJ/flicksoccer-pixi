
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class TutorialOverlay extends PIXI.Container {
    constructor() {
        super();
        this.hand = null;
        this.guideLine = null;
        this.text = null;
        this.animState = null;
        this.init();
    }

    init() {
        // 1. 引导线
        this.guideLine = new PIXI.Graphics();
        this.addChild(this.guideLine);

        // 2. 手势图标
        // 尝试使用用户提供的素材，如果加载失败则使用绘制的图形
        const handTex = ResourceManager.get('tutorial_hand'); 
        if (handTex) {
            this.hand = new PIXI.Sprite(handTex);
            this.hand.anchor.set(0, 0); // 指尖在左上角
            // 假设素材比较大，缩放一下
            this.hand.scale.set(0.8); 
        } else {
            // 绘制备用手势
            this.hand = new PIXI.Graphics();
            
            // 绘制阴影 (手动绘制，避免依赖 DropShadowFilter)
            this.hand.beginFill(0x000000, 0.3);
            this.hand.moveTo(4, 4);
            this.hand.lineTo(24, 24);
            this.hand.lineTo(14, 24);
            this.hand.lineTo(19, 39);
            this.hand.lineTo(14, 41);
            this.hand.lineTo(9, 26);
            this.hand.lineTo(4, 31);
            this.hand.lineTo(4, 4);
            this.hand.endFill();

            // 绘制主体
            this.hand.beginFill(0xFFFFFF);
            this.hand.lineStyle(2, 0x000000);
            this.hand.moveTo(0, 0);
            this.hand.lineTo(20, 20);
            this.hand.lineTo(10, 20);
            this.hand.lineTo(15, 35);
            this.hand.lineTo(10, 37);
            this.hand.lineTo(5, 22);
            this.hand.lineTo(0, 27);
            this.hand.lineTo(0, 0);
            this.hand.endFill();
        }
        this.hand.visible = false;
        this.addChild(this.hand);

        // 3. 提示文字
        this.text = new PIXI.Text('', {
            fontFamily: 'Arial',
            fontSize: 36,
            fill: 0xFFD700,
            stroke: 0x000000,
            strokeThickness: 4,
            dropShadow: true,
            dropShadowBlur: 4,
            align: 'center'
        });
        this.text.anchor.set(0.5);
        this.text.position.set(GameConfig.designWidth / 2, GameConfig.designHeight / 2 - 250);
        this.text.visible = false;
        this.addChild(this.text);
    }

    /**
     * 显示拖拽引导
     * @param {Object} startPos - 起始位置 {x, y}
     * @param {Object} endPos - 结束位置 {x, y}
     * @param {String} message - 提示文字
     */
    showDragTutorial(startPos, endPos, message = "拖动棋子瞄准，松开射门") {
        this.visible = true;
        this.hand.visible = true;
        this.text.visible = true;
        this.text.text = message;
        
        this.animState = {
            type: 'drag',
            start: { ...startPos },
            end: { ...endPos },
            time: 0,
            duration: 1500
        };
    }

    /**
     * 显示点击引导
     * @param {Object} targetPos - 目标位置 {x, y}
     * @param {String} message - 提示文字
     */
    showClickTutorial(targetPos, message = "点击技能图标释放强力技能") {
        this.visible = true;
        this.hand.visible = true;
        this.text.visible = true;
        this.text.text = message;
        
        this.animState = {
            type: 'click',
            pos: { ...targetPos },
            time: 0,
            duration: 1000
        };
    }

    /**
     * 显示瞄准引导 (拖拽后上下滑动)
     * @param {Object} startPos - 起始位置 {x, y}
     * @param {Object} endPos - 结束位置 {x, y}
     * @param {String} message - 提示文字
     */
    showAimTutorial(startPos, endPos, message = "上下拖动调整瞄准线") {
        this.visible = true;
        this.hand.visible = true;
        this.text.visible = true;
        this.text.text = message;
        
        this.animState = {
            type: 'aim',
            start: { ...startPos },
            end: { ...endPos },
            time: 0,
            duration: 2000
        };
    }

    hide() {
        this.visible = false;
        this.animState = null;
        this.hand.visible = false;
        this.text.visible = false;
        this.guideLine.clear();
    }

    update(delta) {
        if (!this.visible || !this.animState) return;

        this.animState.time += delta;
        const t = (this.animState.time % this.animState.duration) / this.animState.duration;

        if (this.animState.type === 'drag') {
            const { start, end } = this.animState;
            
            // 模拟拖拽动作：
            // 0.0 - 0.2: 移动到起点
            // 0.2 - 0.8: 拖拽到终点
            // 0.8 - 1.0: 淡出
            
            let currX, currY, alpha = 1;
            
            if (t < 0.2) {
                // 快速移动到起点
                const subT = t / 0.2;
                currX = start.x; // 简化：直接出现在起点或者从上一次终点飞过来？直接出现在起点比较清晰
                currY = start.y;
                alpha = subT; // 淡入
            } else if (t < 0.8) {
                // 拖拽过程
                const subT = (t - 0.2) / 0.6;
                // 使用 easeOut 效果
                const ease = 1 - Math.pow(1 - subT, 2);
                currX = start.x + (end.x - start.x) * ease;
                currY = start.y + (end.y - start.y) * ease;
            } else {
                // 停留在终点并淡出
                currX = end.x;
                currY = end.y;
                alpha = 1 - (t - 0.8) / 0.2;
            }

            this.hand.position.set(currX, currY);
            this.hand.alpha = alpha;
            
            // 绘制轨迹线 (仅在拖拽阶段显示)
            this.guideLine.clear();
            if (t >= 0.2 && t < 0.8) {
                this.guideLine.lineStyle(4, 0xFFFFFF, 0.5 * alpha);
                this.guideLine.moveTo(start.x, start.y);
                this.guideLine.lineTo(currX, currY);
            }

        } else if (this.animState.type === 'aim') {
            const { start, end } = this.animState;
            
            // 模拟瞄准动作：
            // 1. 拖拽拉开 (0.0 - 0.3)
            // 2. 上下摆动 (0.3 - 0.8)
            // 3. 保持 (0.8 - 1.0)
            
            let currX, currY, alpha = 1;
            
            if (t < 0.3) {
                // 阶段1: 拉开
                const subT = t / 0.3;
                const ease = 1 - Math.pow(1 - subT, 2);
                currX = start.x + (end.x - start.x) * ease;
                currY = start.y + (end.y - start.y) * ease;
            } else if (t < 0.8) {
                // 阶段2: 上下摆动 (模拟调整角度)
                const subT = (t - 0.3) / 0.5;
                // 在垂直于拉开方向的轴上移动
                const dx = end.x - start.x;
                const dy = end.y - start.y;
                // 垂直向量
                const perpX = -dy * 0.3; // 摆动幅度
                const perpY = dx * 0.3;
                
                const wave = Math.sin(subT * Math.PI * 2); 
                currX = end.x + perpX * wave;
                currY = end.y + perpY * wave;
            } else {
                // 阶段3: 保持
                currX = end.x;
                currY = end.y;
            }

            this.hand.position.set(currX, currY);
            this.hand.alpha = 1;
            
            // 绘制轨迹线
            this.guideLine.clear();
            this.guideLine.lineStyle(4, 0xFFFFFF, 0.5);
            this.guideLine.moveTo(start.x, start.y);
            this.guideLine.lineTo(currX, currY);

        } else if (this.animState.type === 'click') {
            const { pos } = this.animState;
            // 手指位置稍微偏移，指向按钮中心
            this.hand.position.set(pos.x + 10, pos.y + 10);
            
            // 缩放模拟点击
            // 0.5 时缩到最小 (点击下去)
            const scaleBase = 0.8; // 基础缩放
            const clickAnim = Math.sin(t * Math.PI * 2); 
            const scale = scaleBase + (clickAnim > 0 ? 0 : clickAnim * 0.1); 
            
            this.hand.scale.set(scale);
            this.hand.alpha = 1;
            this.guideLine.clear();
        }
    }
}
