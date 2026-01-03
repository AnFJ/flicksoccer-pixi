
import * as PIXI from 'pixi.js';
import { GameConfig } from '../config.js';
import { TeamId, SkillType } from '../constants.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';
import Button from './Button.js';

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
    const { designWidth } = GameConfig;
    const centerX = designWidth / 2;

    // 1. 顶部状态栏背景
    const hudBgTex = ResourceManager.get('hud_bg');
    if (hudBgTex) {
        const bgSprite = new PIXI.Sprite(hudBgTex);
        bgSprite.width = designWidth - 300;
        bgSprite.height = 150;
        bgSprite.x = 150; 
        this.addChild(bgSprite);
    }

    // 2. 核心比分板容器
    const boardW = 460;
    const boardH = 85; 
    const boardY = 10;  
    
    const scoreBoard = new PIXI.Container();
    scoreBoard.position.set(centerX, boardY);
    this.addChild(scoreBoard);

    // 3. 内部元素：比分与VS
    const vsText = new PIXI.Text('vs', { 
        fontFamily: 'Arial Black', 
        fontSize: 42, 
        fill: 0xf1c40f,
        fontStyle: 'italic',
        fontWeight: 'bold'
    });
    vsText.anchor.set(0.5);
    vsText.position.set(0, boardH / 2);
    scoreBoard.addChild(vsText);

    this.leftScoreText = new PIXI.Text('0', { 
        fontFamily: 'Arial Black', 
        fontSize: 64, 
        fill: 0xffffff,
        dropShadow: true,
        dropShadowDistance: 2,
        dropShadowColor: 0x000000
    });
    this.leftScoreText.anchor.set(0.5);
    this.leftScoreText.position.set(-110, boardH / 2);
    scoreBoard.addChild(this.leftScoreText);

    this.rightScoreText = new PIXI.Text('0', { 
        fontFamily: 'Arial Black', 
        fontSize: 64, 
        fill: 0xffffff,
        dropShadow: true,
        dropShadowDistance: 2,
        dropShadowColor: 0x000000
    });
    this.rightScoreText.anchor.set(0.5);
    this.rightScoreText.position.set(110, boardH / 2);
    scoreBoard.addChild(this.rightScoreText);

    // 4. 回合提示文本
    this.turnText = new PIXI.Text('等待开球...', {
        fontFamily: 'Arial', 
        fontSize: 32, 
        fill: 0xcc6666,
        fontWeight: 'bold',
        dropShadow: true, 
        dropShadowBlur: 2, 
        dropShadowColor: 0x000000,
        dropShadowDistance: 1
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(centerX, boardY + boardH + 30);
    this.addChild(this.turnText);

    // 5. 头像与技能栏
    const myInfo = AccountMgr.userInfo;
    const avatarSpacing = 480; 

    const leftInfo = { name: myInfo.nickname || "You", avatar: myInfo.avatarUrl };
    const rightInfo = { name: this.gameMode === 'pve' ? "Easy AI" : "Player 2", avatar: '' };

    this.createAvatarWithSkills(centerX - avatarSpacing, 60, TeamId.LEFT, leftInfo);
    this.createAvatarWithSkills(centerX + avatarSpacing, 60, TeamId.RIGHT, rightInfo);
  }

  createAvatarWithSkills(x, y, teamId, info) {
    const container = new PIXI.Container();
    container.position.set(x, y);

    const size = 100; 
    const teamColor = teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db;

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

    let isInteractive = false;
    if (this.gameMode === 'pvp_local') {
        isInteractive = true;
    } else {
        isInteractive = (teamId === this.myTeamId);
    }

    this.createSkillBar(teamId, container, isInteractive);
    this.createOfflineUI(teamId, container, size);
    this.addChild(container);
    
    if (!this.avatarComponents[teamId]) this.avatarComponents[teamId] = {};
    this.avatarComponents[teamId].container = container;
  }

  createOfflineUI(teamId, container, size) {
      const overlay = new PIXI.Graphics();
      overlay.beginFill(0x333333, 0.7);
      overlay.drawRoundedRect(-size/2, -size/2, size, size, 10);
      overlay.endFill();
      overlay.visible = false;
      container.addChild(overlay);

      const bubble = new PIXI.Container();
      bubble.position.set(0, size/2 + 45); 
      bubble.visible = false;

      const bubbleW = 130;
      const bubbleH = 40;
      const arrowH = 10;
      const bubbleColor = 0xFFFFFF;

      const bg = new PIXI.Graphics();
      bg.beginFill(0x000000, 0.3);
      bg.drawRoundedRect(-bubbleW/2 + 3, arrowH + 3, bubbleW, bubbleH, 8);
      bg.endFill();

      bg.beginFill(bubbleColor);
      bg.moveTo(0, 0);
      bg.lineTo(-8, arrowH);
      bg.lineTo(8, arrowH);
      bg.lineTo(0, 0);
      bg.drawRoundedRect(-bubbleW/2, arrowH, bubbleW, bubbleH, 8);
      bg.endFill();
      bubble.addChild(bg);

      const offlineText = new PIXI.Text('已掉线', {
          fontFamily: 'Arial', fontSize: 22, fill: 0xFF0000, fontWeight: 'bold'
      });
      offlineText.anchor.set(0.5);
      offlineText.position.set(0, arrowH + bubbleH/2);
      bubble.addChild(offlineText);

      container.addChild(bubble);
      
      if (!this.avatarComponents[teamId]) this.avatarComponents[teamId] = {};
      this.avatarComponents[teamId].overlay = overlay;
      this.avatarComponents[teamId].offlineBubble = bubble;
      this.avatarComponents[teamId].offlineText = offlineText;
  }
  
  setPlayerOffline(teamId, isOffline, text = '已掉线') {
      const comp = this.avatarComponents[teamId];
      if (comp) {
          if (comp.overlay) comp.overlay.visible = isOffline;
          if (comp.offlineBubble && comp.offlineText) {
              comp.offlineBubble.visible = isOffline;
              comp.offlineText.text = text;
              if (text.length > 5) {
                  comp.offlineText.style.fontSize = 18;
              } else {
                  comp.offlineText.style.fontSize = 22;
              }
          }
      }
  }

  createSkillBar(teamId, parent, isInteractive) {
      // 获取配置中的解锁等级
      const skillConfig = GameConfig.gameplay.skills;

      // 定义所有可能的技能 (按解锁顺序排列: 瞄准(4) -> 战车(7) -> 大力(10))
      const allSkills = [
          { type: SkillType.SUPER_AIM, tex: 'skill_aim_bg', unlockLevel: skillConfig.superAim.unlockLevel, label: "瞄准" },
          { type: SkillType.UNSTOPPABLE, tex: 'skill_unstoppable_bg', unlockLevel: skillConfig.unstoppable.unlockLevel, label: "战车" },
          { type: SkillType.SUPER_FORCE, tex: 'skill_force_bg', unlockLevel: skillConfig.superForce.unlockLevel, label: "大力" },
      ];

      // 获取当前用户的闯关等级
      const userLevel = AccountMgr.userInfo.level || 1;

      // 过滤出当前等级已解锁的技能
      // 注意：为了界面一致性，我们在PVE和PVP中都应用这个逻辑
      // 如果你希望PVP全解锁，可以在这里加 gameMode 判断
      const visibleSkills = allSkills.filter(skill => userLevel >= skill.unlockLevel);

      const btnSize = 100; 
      const gap = 25;
      const isLeft = teamId === TeamId.LEFT;
      const dir = isLeft ? -1 : 1;
      const startOffset = 120;

      visibleSkills.forEach((skill, index) => {
          const dist = startOffset + index * (btnSize + gap);
          const xCenter = dir * dist;
          const yCenter = 0; 

          const skillTex = ResourceManager.get(skill.tex);

          if (isInteractive) {
              // 传入 texture 参数，使用素材图作为按钮背景
              const btn = new Button({
                  text: skill.label, 
                  width: btnSize, 
                  height: btnSize, 
                  color: 0x333333, // 默认颜色，如果有 texture 会被覆盖
                  texture: skillTex, 
                  fontSize: 36,
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

              let iconBg;
              if (skillTex) {
                  // 如果有素材图，远程玩家也显示素材图
                  iconBg = new PIXI.Sprite(skillTex);
                  iconBg.anchor.set(0.5);
                  iconBg.width = btnSize;
                  iconBg.height = btnSize;
              } else {
                  iconBg = new PIXI.Graphics();
                  iconBg.beginFill(0x555555); 
                  iconBg.drawCircle(0, 0, btnSize/2);
                  iconBg.endFill();
              }
              iconBg.alpha = 0.3;
              
              const txt = new PIXI.Text(skill.label, {
                  fontFamily: 'Arial', fontSize: 36, fill: 0xffffff, fontWeight: 'bold'
              });
              txt.anchor.set(0.5);
              txt.alpha = 0.5;

              const ring = new PIXI.Graphics();
              ring.lineStyle(5, 0xFFFF00);
              if (skillTex) {
                  ring.drawRoundedRect(-btnSize/2, -btnSize/2, btnSize, btnSize, 20);
              } else {
                  ring.drawCircle(0, 0, btnSize/2 + 2);
              }
              ring.visible = false;

              icon.addChild(iconBg, txt, ring);
              parent.addChild(icon);

              this.skillMap[teamId][skill.type] = {
                  isIcon: true,
                  bg: iconBg,
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
              item.container.scale.set(1.0);
          }
      } else {
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
    this.turnText.style.fill = isLeft ? 0xcc3333 : 0x3366cc;
  }
}
