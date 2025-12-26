
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';

/**
 * 进球动画条幅
 * 动画逻辑：
 * 1. 上半部分带着金线从左侧飞入
 * 2. 下半部分带着金线从右侧飞入
 * 3. 中间合并后文字弹出
 */
export default class GoalBanner extends PIXI.Container {
  constructor() {
    super();
    this.visible = false;
    
    // 状态控制
    this.state = 'idle'; // idle, in, hold, out
    this.timer = 0;
    
    // 尺寸配置
    this.w = GameConfig.designWidth;
    this.h = 240; // 条幅总高度
    this.halfH = this.h / 2;
    this.lineHeight = 12; // 金线高度

    this.initVisuals();
  }

  initVisuals() {
    const { designWidth, designHeight } = GameConfig;
    const centerY = designHeight / 2;

    // --- 1. 上半部分 (Top Part) ---
    // 包含：半透明黑底 (高度一半) + 底部金条
    this.topPart = new PIXI.Container();
    
    const topBg = new PIXI.Graphics();
    topBg.beginFill(0x000000, 0.7);
    topBg.drawRect(0, 0, this.w, this.halfH);
    topBg.endFill();

    const topLine = new PIXI.Graphics();
    topLine.beginFill(0xFFD700); // 金色
    topLine.drawRect(0, this.halfH - this.lineHeight, this.w, this.lineHeight);
    topLine.endFill();

    this.topPart.addChild(topBg, topLine);
    // 锚点设置在 (0, 0)，位置设置在屏幕垂直中心偏上
    this.topPart.position.set(0, centerY - this.halfH);
    this.addChild(this.topPart);


    // --- 2. 下半部分 (Bottom Part) ---
    // 包含：半透明黑底 (高度一半) + 顶部金条
    this.bottomPart = new PIXI.Container();

    const bottomBg = new PIXI.Graphics();
    bottomBg.beginFill(0x000000, 0.7);
    bottomBg.drawRect(0, 0, this.w, this.halfH);
    bottomBg.endFill();

    const bottomLine = new PIXI.Graphics();
    bottomLine.beginFill(0xFFD700); // 金色
    bottomLine.drawRect(0, 0, this.w, this.lineHeight);
    bottomLine.endFill();

    this.bottomPart.addChild(bottomBg, bottomLine);
    // 锚点设置在 (0, 0)，位置设置在屏幕垂直中心
    this.bottomPart.position.set(0, centerY);
    this.addChild(this.bottomPart);


    // --- 3. 进球文字 ---
    this.text = new PIXI.Text('进球！', {
        fontFamily: 'Arial',
        fontSize: 140,
        fontWeight: 'bold',
        fill: 0xffffff,
        stroke: 0x000000,
        strokeThickness: 6,
        dropShadow: true,
        dropShadowColor: 0x000000,
        dropShadowBlur: 6,
        dropShadowAngle: Math.PI / 4,
        dropShadowDistance: 6,
    });
    this.text.anchor.set(0.5);
    this.text.position.set(designWidth / 2, centerY);
    this.addChild(this.text);
  }

  /**
   * 播放进球动画
   */
  play() {
    this.visible = true;
    this.alpha = 1;
    this.state = 'in';
    this.timer = 0;

    // 重置位置
    // 上部分从左边屏幕外开始
    this.topPart.x = -this.w;
    // 下部分从右边屏幕外开始
    this.bottomPart.x = this.w;
    
    // 文字初始缩放为0
    this.text.scale.set(0);
    this.text.visible = false;
  }

  /**
   * 帧更新
   * @param {number} deltaMS 毫秒
   */
  update(deltaMS) {
    if (!this.visible || this.state === 'idle') return;

    this.timer += deltaMS;

    if (this.state === 'in') {
        const duration = 400; // 进场耗时 400ms
        const t = Math.min(this.timer / duration, 1.0);
        
        // EaseOutCubic: 1 - (1-t)^3
        const ease = 1 - Math.pow(1 - t, 3);

        // 更新位置
        this.topPart.x = -this.w + (this.w * ease); // -w -> 0
        this.bottomPart.x = this.w - (this.w * ease); // w -> 0

        if (t >= 1.0) {
            this.state = 'text_pop';
            this.timer = 0;
            this.text.visible = true;
        }

    } else if (this.state === 'text_pop') {
        const duration = 300; 
        const t = Math.min(this.timer / duration, 1.0);
        
        // 弹性效果: 过冲一点点再回来
        //简单的 elastic out 近似模拟
        let scale = 1;
        if (t < 0.5) {
            scale = t * 2 * 1.2; // 放大到 1.2
        } else {
            scale = 1.2 - (t - 0.5) * 2 * 0.2; // 回到 1.0
        }
        
        // 修正终值
        if (t >= 1.0) scale = 1.0;
        
        this.text.scale.set(scale);

        if (t >= 1.0) {
            this.state = 'hold';
            this.timer = 0;
        }

    } else if (this.state === 'hold') {
        // 停留 1.5 秒
        if (this.timer > 1500) {
            this.state = 'out';
            this.timer = 0;
        }

    } else if (this.state === 'out') {
        // 淡出 300ms
        const duration = 300;
        const t = Math.min(this.timer / duration, 1.0);

        this.alpha = 1 - t;

        if (t >= 1.0) {
            this.visible = false;
            this.state = 'idle';
        }
    }
  }
}
