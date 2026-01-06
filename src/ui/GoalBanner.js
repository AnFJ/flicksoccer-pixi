
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';

/**
 * 进球动画条幅
 * 样式：上下两条金边，中间灰黑色半透明背景
 * 动画：左进右进合拢 -> 停留 -> 左出右出分离
 */
export default class GoalBanner extends PIXI.Container {
  constructor() {
    super();
    this.visible = false;
    
    // 状态控制
    this.state = 'idle'; // idle, in, text_pop, hold, out
    this.timer = 0;
    
    // 尺寸配置
    this.w = GameConfig.designWidth;
    this.h = 280; 
    this.halfH = this.h / 2;
    this.lineHeight = 10; // 金线高度

    this.initVisuals();
  }

  initVisuals() {
    const { designWidth, designHeight } = GameConfig;
    const centerY = designHeight / 2;

    // --- 1. 上半部分 (Top Part) ---
    // 结构：金线在最上方 + 下方是灰黑色半透明背景
    this.topPart = new PIXI.Container();
    
    // 背景 (灰黑色半透明)
    const topBg = new PIXI.Graphics();
    topBg.beginFill(0x000000, 0.6); // 黑色 60% 透明度
    topBg.drawRect(0, 0, this.w, this.halfH - this.lineHeight);
    topBg.endFill();
    topBg.y = this.lineHeight; // 在金线下方

    // 金线 (在最顶部)
    const topLine = new PIXI.Graphics();
    topLine.beginFill(0xFFD700); 
    topLine.drawRect(0, 0, this.w, this.lineHeight);
    topLine.endFill();
    
    // 金线发光条
    const topGlow = new PIXI.Graphics();
    topGlow.beginFill(0xFFFFFF, 0.5);
    topGlow.drawRect(0, 0, this.w, 2);
    topGlow.endFill();

    this.topPart.addChild(topBg, topLine, topGlow);
    
    // 位置：上半部分的底部 对齐 屏幕中心
    this.topPart.position.set(0, centerY - this.halfH);
    this.addChild(this.topPart);


    // --- 2. 下半部分 (Bottom Part) ---
    // 结构：金线在最下方 + 上方是灰黑色半透明背景
    this.bottomPart = new PIXI.Container();

    // 背景 (灰黑色半透明)
    const bottomBg = new PIXI.Graphics();
    bottomBg.beginFill(0x000000, 0.6); // 黑色 60% 透明度
    bottomBg.drawRect(0, 0, this.w, this.halfH - this.lineHeight);
    bottomBg.endFill();
    bottomBg.y = 0; // 从顶开始

    // 金线 (在最底部)
    const bottomLine = new PIXI.Graphics();
    bottomLine.beginFill(0xFFD700);
    bottomLine.drawRect(0, this.halfH - this.lineHeight, this.w, this.lineHeight);
    bottomLine.endFill();

    // 金线发光条
    const bottomGlow = new PIXI.Graphics();
    bottomGlow.beginFill(0xFFFFFF, 0.5);
    bottomGlow.drawRect(0, this.halfH - this.lineHeight, this.w, 2);
    bottomGlow.endFill();

    this.bottomPart.addChild(bottomBg, bottomLine, bottomGlow);
    
    // 位置：下半部分的顶部 对齐 屏幕中心
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
        dropShadowBlur: 10,
        dropShadowAngle: Math.PI / 4,
        dropShadowDistance: 6,
    });
    this.text.anchor.set(0.5);
    this.text.position.set(designWidth / 2, centerY);
    this.addChild(this.text);
  }

  /**
   * 播放横幅动画
   * @param {string} text 显示的文字，默认为"进球！"
   */
  play(text = "进球！") {
    this.text.text = text;
    
    // 根据文本长度自动调整字号
    if (text.length > 4) {
        this.text.style.fontSize = 100;
    } else {
        this.text.style.fontSize = 140;
    }

    this.visible = true;
    this.alpha = 1;
    this.state = 'in';
    this.timer = 0;

    // 初始位置设置
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

    // --- 阶段 1: 飞入 (In) ---
    if (this.state === 'in') {
        const duration = 400; // 400ms
        const t = Math.min(this.timer / duration, 1.0);
        
        // EaseOutCubic
        const ease = 1 - Math.pow(1 - t, 3);

        // 上半部分：左 -> 中
        this.topPart.x = -this.w + (this.w * ease); 
        // 下半部分：右 -> 中
        this.bottomPart.x = this.w - (this.w * ease); 

        if (t >= 1.0) {
            this.state = 'text_pop';
            this.timer = 0;
            this.text.visible = true;
        }
    } 
    // --- 阶段 2: 文字弹出 (Pop) ---
    else if (this.state === 'text_pop') {
        const duration = 300; 
        const t = Math.min(this.timer / duration, 1.0);
        
        // 弹性放大效果
        let scale = 1;
        if (t < 0.5) {
            scale = t * 2 * 1.2; 
        } else {
            scale = 1.2 - (t - 0.5) * 2 * 0.2; 
        }
        if (t >= 1.0) scale = 1.0;
        
        this.text.scale.set(scale);

        if (t >= 1.0) {
            this.state = 'hold';
            this.timer = 0;
        }
    } 
    // --- 阶段 3: 停留 (Hold) ---
    else if (this.state === 'hold') {
        if (this.timer > 1500) {
            this.state = 'out';
            this.timer = 0;
        }
    } 
    // --- 阶段 4: 飞出 (Out) ---
    else if (this.state === 'out') {
        const duration = 400;
        const t = Math.min(this.timer / duration, 1.0);

        // EaseInCubic
        const ease = t * t * t;

        // 怎么来的怎么回
        // 上半部分：中 -> 左
        this.topPart.x = 0 - (this.w * ease);
        // 下半部分：中 -> 右
        this.bottomPart.x = 0 + (this.w * ease);
        
        // 文字同时缩小或淡出
        this.text.alpha = 1 - t;

        if (t >= 1.0) {
            this.visible = false;
            this.state = 'idle';
            this.text.alpha = 1; 
        }
    }
  }
}
