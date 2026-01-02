
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
    
    // 存储头像相关组件引用，用于更新掉线状态
    this.avatarComponents = {}; // { [TeamId]: { container, overlay, statusText } }

    this.init();
  }

  init() {
    const { designWidth, visuals } = GameConfig;
    const uiColors = visuals.ui;

    // 1. 顶部状态栏背景 (Top Bar)
    const barHeight = 140;
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
    
    // [修正] 
    // 左边 (Left/Red) = 玩家/P1
    // 右边 (Right/Blue) = AI/P2
    
    const leftInfo = {
        name: myInfo.nickname || "You",
        avatar: myInfo.avatarUrl
    };
    
    const rightInfo = {
        name: this.gameMode === 'pve' ? "Easy AI" : "Player 2",
        avatar: '' 
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

    const size = 100; 
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
    let avatarMask = null; 
    
    if (info.avatar && info.avatar.startsWith('http')) {
        const sprite = new PIXI.Sprite(); 
        sprite.anchor.set(0.5);
        
        PIXI.Texture.fromURL(info.avatar).then(tex => {
            sprite.texture = tex;
            const scale = Math.max(innerSize / tex.width, innerSize / tex.height);
            sprite.scale.set(scale); 
        }).catch(e => {
            console.warn('Avatar load failed, using default.', e);
        });
        
        avatarMask = new PIXI.Graphics();
        avatarMask.beginFill(0xffffff);
        avatarMask.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
        avatarMask.endFill();
        sprite.mask = avatarMask;

        avatarNode = sprite;
    } else {
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

    let displayName = info.name;
    if (displayName.length > 8) displayName = displayName.substring(0, 7) + '..';

    const nameText = new PIXI.Text(displayName, { fontSize: 18, fill: 0xffffff, fontWeight: 'bold' });
    nameText.anchor.set(0.5);
    nameText.position.set(0, size/2 + 20);

    // --- 新增：6. 掉线灰色蒙层 (Overlay) ---
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x333333, 0.7); // 深灰色半透明
    overlay.drawRoundedRect(-size/2, -size/2, size, size, 10);
    overlay.endFill();
    overlay.visible = false; // 默认隐藏

    // --- 新增：7. 掉线提示文字 (Offline Text) ---
    // 放在头像的“外侧”
    // 左边队伍(LEFT=0) 文字在左边，右边队伍(RIGHT=1) 文字在右边
    const isLeft = teamId === TeamId.LEFT;
    const offTextX = isLeft ? (-size/2 - 20) : (size/2 + 20);
    const offTextAnchor = isLeft ? 1 : 0; // 左队右对齐，右队左对齐

    const offlineText = new PIXI.Text('玩家已掉线\n请等待...', {
        fontFamily: 'Arial',
        fontSize: 24,
        fill: 0xFF0000,
        stroke: 0xFFFFFF,
        strokeThickness: 3,
        fontWeight: 'bold',
        align: isLeft ? 'right' : 'left'
    });
    offlineText.anchor.set(offTextAnchor, 0.5);
    offlineText.position.set(offTextX, 0);
    offlineText.visible = false;

    // 添加所有子节点
    container.addChild(frame, bg, avatarNode);
    if (avatarMask) container.addChild(avatarMask);
    container.addChild(timerG, nameTag, nameText);
    
    // 添加掉线相关UI (在最上层)
    container.addChild(overlay, offlineText);
    
    this.addChild(container);

    // 存储引用
    this.avatarComponents[teamId] = {
        container,
        overlay,
        offlineText
    };
  }

  /**
   * 设置指定玩家的掉线/离开状态
   * @param {number} teamId 
   * @param {boolean} isOffline 
   * @param {string} [customText] 自定义提示文本 (例如 "玩家已离开")
   */
  setPlayerOffline(teamId, isOffline, customText) {
      const comps = this.avatarComponents[teamId];
      if (comps) {
          comps.overlay.visible = isOffline;
          comps.offlineText.visible = isOffline;
          
          if (isOffline) {
              comps.offlineText.alpha = 1;
              if (customText) {
                  comps.offlineText.text = customText;
              } else {
                  comps.offlineText.text = '玩家已掉线\n请等待...';
              }
          }
      }
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
    // [修正] Left 是 P1, Right 是 P2
    if (isLeft) {
        str = "红方回合 (Player 1)";
    } else {
        str = this.gameMode === 'pve' ? "蓝方回合 (AI)" : "蓝方回合 (Player 2)";
    }
    this.turnText.text = str;
    this.turnText.style.fill = isLeft ? 0xe74c3c : 0x3498db;
  }
}
