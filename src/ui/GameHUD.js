
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';
import AccountMgr from '../managers/AccountMgr.js';

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
    const myInfo = AccountMgr.userInfo;

    const avatarSpacing = 380; 
    
    // PVE 模式：左边是 AI，右边是玩家
    // PVP 本地：左边是 P2，右边是 P1(玩家)
    // TODO: 联网对战时需要传入对手信息

    const leftInfo = {
        name: this.gameMode === 'pve' ? "Easy AI" : "Player 2",
        avatar: '' // 默认
    };
    
    const rightInfo = {
        name: myInfo.nickname || "You",
        avatar: myInfo.avatarUrl
    };

    this.createAvatar(centerX - avatarSpacing, 60, TeamId.LEFT, leftInfo);
    this.createAvatar(centerX + avatarSpacing, 60, TeamId.RIGHT, rightInfo);

    // 4. 回合提示文本
    this.turnText = new PIXI.Text('等待开球...', {
        fontFamily: 'Arial', fontSize: 28, fill: 0xffffff,
        dropShadow: true, dropShadowBlur: 4, dropShadowColor: 0x000000
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(centerX, barHeight - 15);
    this.addChild(this.turnText);
  }

  createAvatar(x, y, teamId, info) {
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

    // --- 2. 头像背景 (兜底) ---
    const innerSize = size - 12; 
    const bg = new PIXI.Graphics();
    bg.beginFill(teamColor);
    bg.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
    bg.endFill();
    
    // --- 3. 头像内容 (Icon/Image) ---
    let avatarNode;
    
    // 如果有远程 URL，尝试加载
    if (info.avatar && info.avatar.startsWith('http')) {
        const sprite = new PIXI.Sprite(); // 先创建空 Sprite
        sprite.anchor.set(0.5);
        sprite.width = innerSize;
        sprite.height = innerSize;
        
        // 异步加载
        PIXI.Texture.fromURL(info.avatar).then(tex => {
            sprite.texture = tex;
            // 保持尺寸 (Texture加载后会重置尺寸，需再次强制设置)
            const scale = Math.max(innerSize / tex.width, innerSize / tex.height);
            sprite.scale.set(scale); 
        }).catch(e => {
            console.warn('Avatar load failed, using default.', e);
        });
        
        // 创建一个遮罩让图片变成圆角
        const avatarMask = new PIXI.Graphics();
        avatarMask.beginFill(0xffffff);
        avatarMask.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
        avatarMask.endFill();
        sprite.mask = avatarMask;
        sprite.addChild(avatarMask); // 也可以把 mask 加上去

        avatarNode = sprite;
    } else {
        // 默认文字头像
        avatarNode = new PIXI.Text(info.name.substring(0,1).toUpperCase() || '?', { 
            fontSize: 45, fill: 0xffffff, fontWeight: 'bold' 
        });
        avatarNode.anchor.set(0.5);
    }

    // --- 4. 倒计时蒙版 (Timer Mask) ---
    const timerG = new PIXI.Graphics();
    timerG.angle = -90; 
    this.timerGraphics[teamId] = timerG;

    // 遮罩
    const maskG = new PIXI.Graphics();
    maskG.beginFill(0xffffff);
    maskG.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
    maskG.endFill();
    container.addChild(maskG);
    timerG.mask = maskG;

    // --- 5. 名字标签 ---
    const nameTag = new PIXI.Graphics();
    nameTag.beginFill(0x000000, 0.7);
    const tagW = 120;
    const tagH = 30;
    nameTag.drawRoundedRect(-tagW/2, size/2 + 5, tagW, tagH, 15);
    nameTag.endFill();

    // 截断过长的名字
    let displayName = info.name;
    if (displayName.length > 8) displayName = displayName.substring(0, 7) + '..';

    const nameText = new PIXI.Text(displayName, { fontSize: 18, fill: 0xffffff, fontWeight: 'bold' });
    nameText.anchor.set(0.5);
    nameText.position.set(0, size/2 + 20);

    container.addChild(frame, bg, avatarNode, timerG, nameTag, nameText);
    this.addChild(container);
  }

  updateScore(leftScore, rightScore) {
    if (this.leftScoreText) this.leftScoreText.text = leftScore;
    if (this.rightScoreText) this.rightScoreText.text = rightScore;
  }

  updateTimerVisuals(activeTeamId, ratio) {
    for (const teamId in this.timerGraphics) {
        const g = this.timerGraphics[teamId];
        g.clear();

        if (parseInt(teamId) === activeTeamId && ratio > 0) {
            const bigRadius = 200; 
            g.beginFill(0x00FF00, 0.4);
            g.moveTo(0, 0);
            g.arc(0, 0, bigRadius, 0, Math.PI * 2 * ratio);
            g.lineTo(0, 0);
            g.endFill();
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
