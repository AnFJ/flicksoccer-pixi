
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

export default class GameHUD extends PIXI.Container {
  constructor(gameMode) {
    super();
    this.gameMode = gameMode;
    
    this.leftScoreText = null;
    this.rightScoreText = null;
    this.turnText = null;
    
    // 存储倒计时图形的引用 { [TeamId]: PIXI.Graphics }
    this.timerGraphics = {};

    this.init();
  }

  init() {
    const { designWidth, visuals } = GameConfig;
    const uiColors = visuals.ui;

    // 1. 顶部状态栏背景 (Top Bar)
    const barHeight = 136;
    const barG = new PIXI.Graphics();
    
    // 主背景色
    barG.beginFill(uiColors.topBarBg);
    const topW = designWidth;
    const bottomW = designWidth * 0.95; 
    const slant = (topW - bottomW) / 2;
    
    barG.drawPolygon([
        0, 0,
        designWidth, 0,
        designWidth - slant, barHeight,
        slant, barHeight
    ]);
    barG.endFill();

    // 底部高光条
    barG.beginFill(uiColors.topBarAccent);
    barG.drawPolygon([
        slant, barHeight - 10,
        designWidth - slant, barHeight - 10,
        designWidth - slant - 5, barHeight,
        slant + 5, barHeight
    ]);
    barG.endFill();

    this.addChild(barG);

    // 2. 中央计分板 (Scoreboard)
    const scoreBoxW = 340;
    const scoreBoxH = 90;
    const scoreBoxY = 10;
    const centerX = designWidth / 2;
    
    const scoreBg = new PIXI.Graphics();
    scoreBg.beginFill(0xbdc3c7); 
    scoreBg.drawRoundedRect(-scoreBoxW/2 - 4, scoreBoxY - 4, scoreBoxW + 8, scoreBoxH + 8, 15);
    scoreBg.beginFill(uiColors.scoreBoxBg); 
    scoreBg.drawRoundedRect(-scoreBoxW/2, scoreBoxY, scoreBoxW, scoreBoxH, 12);
    scoreBg.endFill();
    scoreBg.position.set(centerX, 0);
    this.addChild(scoreBg);

    // 中间装饰
    const decoCircle = new PIXI.Graphics();
    decoCircle.beginFill(0xf1c40f); 
    decoCircle.lineStyle(4, 0xffffff);
    decoCircle.drawCircle(0, 0, 35);
    decoCircle.endFill();
    decoCircle.position.set(centerX, scoreBoxY + scoreBoxH / 2);
    
    const vsText = new PIXI.Text('VS', { fontFamily: 'Arial Black', fontSize: 24, fill: 0xffffff });
    vsText.anchor.set(0.5);
    decoCircle.addChild(vsText);
    this.addChild(decoCircle);

    // 左比分
    this.leftScoreText = new PIXI.Text('0', {
        fontFamily: 'Arial Black', fontSize: 50, fill: uiColors.scoreText
    });
    this.leftScoreText.anchor.set(0.5);
    this.leftScoreText.position.set(centerX - 90, scoreBoxY + scoreBoxH / 2);
    this.addChild(this.leftScoreText);

    // 右比分
    this.rightScoreText = new PIXI.Text('0', {
        fontFamily: 'Arial Black', fontSize: 50, fill: uiColors.scoreText
    });
    this.rightScoreText.anchor.set(0.5);
    this.rightScoreText.position.set(centerX + 90, scoreBoxY + scoreBoxH / 2);
    this.addChild(this.rightScoreText);

    // 3. 头像 (Avatars)
    const avatarSpacing = 380; 
    const leftName = this.gameMode === 'pve' ? "AI" : "P2";
    
    this.createAvatar(centerX - avatarSpacing, 60, TeamId.LEFT, leftName);
    this.createAvatar(centerX + avatarSpacing, 60, TeamId.RIGHT, "You");

    // 4. 回合提示文本
    this.turnText = new PIXI.Text('等待开球...', {
        fontFamily: 'Arial', fontSize: 28, fill: 0xffffff,
        dropShadow: true, dropShadowBlur: 4, dropShadowColor: 0x000000
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(centerX, barHeight - 15);
    this.addChild(this.turnText);
  }

  createAvatar(x, y, teamId, name) {
    const container = new PIXI.Container();
    container.position.set(x, y);

    const size = 110; 
    const teamColor = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db;

    // --- 1. 金色流光边框 (Golden Frame) ---
    const frame = new PIXI.Graphics();
    frame.beginFill(0xB8860B); 
    frame.drawRoundedRect(-size/2 - 4, -size/2 - 4, size + 8, size + 8, 12);
    frame.endFill();
    frame.beginFill(0xFFD700); 
    frame.drawRoundedRect(-size/2, -size/2, size, size, 10);
    frame.endFill();
    frame.lineStyle(2, 0xFFFACD, 0.5);
    frame.drawRoundedRect(-size/2 + 2, -size/2 + 2, size - 4, size - 4, 8);
    frame.endFill();

    // --- 2. 头像背景 ---
    const bg = new PIXI.Graphics();
    const innerSize = size - 12; // 留出金色边框
    bg.beginFill(teamColor);
    bg.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
    bg.endFill();

    // --- 3. 简单的用户图标 ---
    const icon = new PIXI.Text('?', { fontSize: 45, fill: 0xffffff, fontWeight: 'bold' });
    icon.anchor.set(0.5);

    // --- 4. 倒计时蒙版 (Timer Mask) ---
    // 关键修改：使用遮罩实现“正方形内的扇形消除”
    // 我们绘制一个巨大的扇形，但只显示它与“头像圆角矩形”重叠的部分
    
    // A. 倒计时内容的容器
    const timerG = new PIXI.Graphics();
    timerG.angle = -90; // 从12点钟方向开始
    this.timerGraphics[teamId] = timerG;

    // B. 创建遮罩图形 (形状与头像背景一致)
    const maskG = new PIXI.Graphics();
    maskG.beginFill(0xffffff);
    maskG.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
    maskG.endFill();
    
    // 将遮罩加入容器 (必须在显示列表里 mask 才能生效)
    container.addChild(maskG);
    
    // 应用遮罩
    timerG.mask = maskG;

    // --- 5. 名字标签 ---
    const nameTag = new PIXI.Graphics();
    nameTag.beginFill(0x000000, 0.7);
    const tagW = 120;
    const tagH = 30;
    nameTag.drawRoundedRect(-tagW/2, size/2 + 5, tagW, tagH, 15);
    nameTag.endFill();

    const nameText = new PIXI.Text(name, { fontSize: 18, fill: 0xffffff, fontWeight: 'bold' });
    nameText.anchor.set(0.5);
    nameText.position.set(0, size/2 + 20);

    // 注意顺序：timerG 在 icon 之上，nameTag 之下
    container.addChild(frame, bg, icon, timerG, nameTag, nameText);
    this.addChild(container);
  }

  updateScore(leftScore, rightScore) {
    if (this.leftScoreText) this.leftScoreText.text = leftScore;
    if (this.rightScoreText) this.rightScoreText.text = rightScore;
  }

  /**
   * 更新倒计时视觉
   */
  updateTimerVisuals(activeTeamId, ratio) {
    for (const teamId in this.timerGraphics) {
        const g = this.timerGraphics[teamId];
        g.clear();

        if (parseInt(teamId) === activeTeamId && ratio > 0) {
            // 绘制一个比头像大得多的扇形 (确保覆盖矩形的四个角)
            const bigRadius = 200; 
            
            // 绿色半透明
            g.beginFill(0x00FF00, 0.4);
            g.moveTo(0, 0);
            
            // 顺时针消除效果：画出剩余时间的扇形
            g.arc(0, 0, bigRadius, 0, Math.PI * 2 * ratio);
            g.lineTo(0, 0);
            g.endFill();
            
            // 因为 g 被设置了 mask (圆角矩形)，所以超出矩形部分的扇形会被自动切掉，
            // 视觉效果就是一个绿色的正方形像钟表一样被擦除。
        }
    }
  }

  updateTurn(currentTurn) {
    if (!this.turnText) return;
    const isLeft = currentTurn === TeamId.LEFT;
    let str = "";
    if (isLeft) {
        str = this.gameMode === 'pve' ? "红方回合 (AI)" : "红方回合 (Player 2)";
    } else {
        str = "蓝方回合 (Player 1)";
    }
    this.turnText.text = str;
    this.turnText.style.fill = isLeft ? 0xe74c3c : 0x3498db;
  }
}
