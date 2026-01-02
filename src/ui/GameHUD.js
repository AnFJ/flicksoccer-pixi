
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import { TeamId, SkillType } from '../constants.js';
import AccountMgr from '../managers/AccountMgr.js';
import Button from './Button.js'; // 引入 Button 组件

export default class GameHUD extends PIXI.Container {
  constructor(gameMode, myTeamId, onSkillClick) {
    super();
    this.gameMode = gameMode;
    this.myTeamId = myTeamId;
    this.onSkillClick = onSkillClick;
    
    this.leftScoreText = null;
    this.rightScoreText = null;
    this.turnText = null;
    this.timerGraphics = {};
    this.avatarComponents = {}; 
    this.skillMap = { [TeamId.LEFT]: {}, [TeamId.RIGHT]: {} };

    this.init();
  }

  init() {
    const { designWidth, visuals } = GameConfig;
    const uiColors = visuals.ui;

    // 1. 顶部状态栏背景
    const barHeight = 140;
    const barG = new PIXI.Graphics();
    barG.beginFill(uiColors.topBarBg);
    const topW = designWidth;
    const bottomW = designWidth * 0.95; 
    const slant = (topW - bottomW) / 2;
    barG.drawPolygon([0, 0, designWidth, 0, designWidth - slant, barHeight, slant, barHeight]);
    barG.endFill();
    
    // 底部高光
    barG.beginFill(uiColors.topBarAccent);
    barG.drawPolygon([slant, barHeight - 10, designWidth - slant, barHeight - 10, designWidth - slant - 5, barHeight, slant + 5, barHeight]);
    barG.endFill();
    this.addChild(barG);

    // 2. 中央计分板
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

    // VS装饰
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
    this.leftScoreText = new PIXI.Text('0', { fontFamily: 'Arial Black', fontSize: 50, fill: uiColors.scoreText });
    this.leftScoreText.anchor.set(0.5);
    this.leftScoreText.position.set(centerX - 90, scoreBoxY + scoreBoxH / 2);
    this.addChild(this.leftScoreText);

    // 右比分
    this.rightScoreText = new PIXI.Text('0', { fontFamily: 'Arial Black', fontSize: 50, fill: uiColors.scoreText });
    this.rightScoreText.anchor.set(0.5);
    this.rightScoreText.position.set(centerX + 90, scoreBoxY + scoreBoxH / 2);
    this.addChild(this.rightScoreText);

    // 3. 头像与技能栏
    const myInfo = AccountMgr.userInfo;
    const avatarSpacing = 380; 

    const leftInfo = { name: myInfo.nickname || "You", avatar: myInfo.avatarUrl };
    const rightInfo = { name: this.gameMode === 'pve' ? "Easy AI" : "Player 2", avatar: '' };

    this.createAvatarWithSkills(centerX - avatarSpacing, 60, TeamId.LEFT, leftInfo);
    this.createAvatarWithSkills(centerX + avatarSpacing, 60, TeamId.RIGHT, rightInfo);

    // 4. 回合提示文本
    this.turnText = new PIXI.Text('等待开球...', {
        fontFamily: 'Arial', fontSize: 28, fill: 0xffffff,
        dropShadow: true, dropShadowBlur: 4, dropShadowColor: 0x000000
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(centerX, barHeight - 15);
    this.addChild(this.turnText);
  }

  createAvatarWithSkills(x, y, teamId, info) {
    const container = new PIXI.Container();
    container.position.set(x, y);

    const size = 100; 
    const teamColor = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db;

    // --- A. 头像框体 ---
    const frame = new PIXI.Graphics();
    frame.beginFill(0xB8860B); 
    frame.drawRoundedRect(-size/2 - 4, -size/2 - 4, size + 8, size + 8, 12);
    frame.endFill();
    frame.beginFill(0xFFD700); 
    frame.drawRoundedRect(-size/2, -size/2, size, size, 10);
    frame.endFill();

    const innerSize = size - 12; 
    const bg = new PIXI.Graphics();
    bg.beginFill(teamColor);
    bg.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
    bg.endFill();

    let avatarNode;
    let avatarMask = null;
    if (info.avatar && info.avatar.startsWith('http')) {
        const sprite = new PIXI.Sprite(); 
        sprite.anchor.set(0.5);
        PIXI.Texture.fromURL(info.avatar).then(tex => {
            sprite.texture = tex;
            const scale = Math.max(innerSize / tex.width, innerSize / tex.height);
            sprite.scale.set(scale); 
        }).catch(()=>{});
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

    const timerG = new PIXI.Graphics();
    timerG.angle = -90; 
    this.timerGraphics[teamId] = timerG;
    const maskG = new PIXI.Graphics();
    maskG.beginFill(0xffffff);
    maskG.drawRoundedRect(-innerSize/2, -innerSize/2, innerSize, innerSize, 6);
    maskG.endFill();
    container.addChild(maskG);
    timerG.mask = maskG;

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

    container.addChild(frame, bg, avatarNode);
    if (avatarMask) container.addChild(avatarMask);
    container.addChild(timerG, nameTag, nameText);

    // --- B. 技能栏 ---
    let isInteractive = false;
    if (this.gameMode === 'pvp_local') {
        isInteractive = true;
    } else {
        isInteractive = (teamId === this.myTeamId);
    }

    this.createSkillBar(teamId, container, isInteractive);
    this.createOfflineUI(teamId, container, size);
    this.addChild(container);
    this.avatarComponents[teamId] = { container };
  }

  createOfflineUI(teamId, container, size) {
      const overlay = new PIXI.Graphics();
      overlay.beginFill(0x333333, 0.7);
      overlay.drawRoundedRect(-size/2, -size/2, size, size, 10);
      overlay.endFill();
      overlay.visible = false;

      const isLeft = teamId === TeamId.LEFT;
      const offTextX = isLeft ? (-size/2 - 20) : (size/2 + 20);
      const offTextAnchor = isLeft ? 1 : 0;
      const offlineText = new PIXI.Text('已掉线', {
          fontFamily: 'Arial', fontSize: 24, fill: 0xFF0000,
          stroke: 0xFFFFFF, strokeThickness: 3, fontWeight: 'bold', align: isLeft ? 'right' : 'left'
      });
      offlineText.anchor.set(offTextAnchor, 0.5);
      offlineText.position.set(offTextX, 0);
      offlineText.visible = false;
      container.addChild(overlay, offlineText);
      if (!this.avatarComponents[teamId]) this.avatarComponents[teamId] = {};
      this.avatarComponents[teamId].overlay = overlay;
      this.avatarComponents[teamId].offlineText = offlineText;
  }

  createSkillBar(teamId, parent, isInteractive) {
      const skills = [
          { type: SkillType.SUPER_AIM,   label: '瞄', color: 0x9b59b6 },
          { type: SkillType.SUPER_FORCE, label: '力', color: 0x3498db },
          { type: SkillType.UNSTOPPABLE, label: '无', color: 0xe74c3c },
      ];

      const btnSize = 90; 
      const gap = 20;
      const isLeft = teamId === TeamId.LEFT;
      const dir = isLeft ? -1 : 1;
      const startOffset = 120;

      skills.forEach((skill, index) => {
          const dist = startOffset + index * (btnSize + gap);
          const xCenter = dir * dist;
          const yCenter = 0; 

          if (isInteractive) {
              const btn = new Button({
                  text: skill.label, width: btnSize, height: btnSize, color: skill.color, fontSize: 36,
                  onClick: () => {
                      if (this.onSkillClick) this.onSkillClick(skill.type, teamId);
                  }
              });
              btn.position.set(xCenter - btnSize/2, yCenter - btnSize/2);
              const highlight = new PIXI.Graphics();
              highlight.lineStyle(6, 0xFFFF00);
              highlight.drawRoundedRect(0, 0, btnSize, btnSize, 20);
              highlight.visible = false;
              btn.addChild(highlight);
              btn.highlight = highlight;

              const count = AccountMgr.getItemCount(skill.type);
              const countBg = new PIXI.Graphics();
              countBg.beginFill(0x333333);
              countBg.drawCircle(0, 0, 18); 
              countBg.endFill();
              countBg.position.set(btnSize - 10, 10);
              const countText = new PIXI.Text(count.toString(), {
                  fontFamily: 'Arial', fontSize: 20, fill: 0xffffff, fontWeight: 'bold'
              });
              countText.anchor.set(0.5);
              countBg.addChild(countText);
              btn.addChild(countBg);
              btn.countText = countText;

              parent.addChild(btn);
              this.skillMap[teamId][skill.type] = btn;

          } else {
              const icon = new PIXI.Container();
              icon.position.set(xCenter, yCenter);

              const bg = new PIXI.Graphics();
              bg.beginFill(skill.color); 
              bg.drawCircle(0, 0, btnSize/2);
              bg.endFill();
              bg.alpha = 0.3; // 默认暗淡
              
              const txt = new PIXI.Text(skill.label, {
                  fontFamily: 'Arial', fontSize: 36, fill: 0xffffff, fontWeight: 'bold'
              });
              txt.anchor.set(0.5);
              txt.alpha = 0.5;

              const ring = new PIXI.Graphics();
              ring.lineStyle(5, 0xFFFF00);
              ring.drawCircle(0, 0, btnSize/2 + 2);
              ring.visible = false;

              icon.addChild(bg, txt, ring);
              parent.addChild(icon);

              this.skillMap[teamId][skill.type] = {
                  isIcon: true,
                  bg: bg,
                  txt: txt,
                  highlight: ring,
                  container: icon
              };
          }
      });
  }

  updateSkillState(teamId, type, active) {
      const item = this.skillMap[teamId] && this.skillMap[teamId][type];
      if (!item) return;

      if (item.isIcon) {
          // 纯图标模式 (对手)
          item.highlight.visible = active;
          item.bg.alpha = active ? 1.0 : 0.3;
          item.txt.alpha = active ? 1.0 : 0.5;
          
          if (active) {
              item.container.scale.set(1.2);
              const animate = () => {
                  if (item.container.scale.x > 1.0) {
                      item.container.scale.x -= 0.05;
                      item.container.scale.y -= 0.05;
                      requestAnimationFrame(animate);
                  } else {
                      item.container.scale.set(1.0);
                  }
              };
              animate();
          } else {
              // 取消选中时，确保恢复原状
              item.container.scale.set(1.0);
          }

      } else {
          // 按钮模式 (自己)
          if (item.highlight) item.highlight.visible = active;
          item.alpha = active ? 1.0 : 0.9;
      }
  }

  updateItemCount(teamId, type, count) {
      const btn = this.skillMap[teamId] && this.skillMap[teamId][type];
      if (btn && btn.countText) {
          btn.countText.text = count.toString();
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
            const bigRadius = 160; 
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
        str = "红方回合 (Player 1)";
    } else {
        str = this.gameMode === 'pve' ? "蓝方回合 (AI)" : "蓝方回合 (Player 2)";
    }
    this.turnText.text = str;
    this.turnText.style.fill = isLeft ? 0xe74c3c : 0x3498db;
  }
}
