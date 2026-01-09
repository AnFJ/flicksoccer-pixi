
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import PhysicsEngine from '../core/PhysicsEngine.js';
import GameRules from '../core/GameRules.js';
import Striker from '../entities/Striker.js';
import Ball from '../entities/Ball.js';
import EventBus from '../managers/EventBus.js';
import AudioManager from '../managers/AudioManager.js';
import Platform from '../managers/Platform.js';
import ResourceManager from '../managers/ResourceManager.js'; 
import NetworkMgr from '../managers/NetworkMgr.js';
import AccountMgr from '../managers/AccountMgr.js';
import { GameConfig } from '../config.js';
import { TeamId, Events, NetMsg, SkillType } from '../constants.js';
import { getFormation } from '../config/FormationConfig.js'; 

import GameMenuButton from '../ui/GameMenuButton.js';
import GameHUD from '../ui/GameHUD.js';
import GoalBanner from '../ui/GoalBanner.js';
import SparkSystem from '../vfx/SparkSystem.js';
import MenuScene from './MenuScene.js';
import LobbyScene from './LobbyScene.js';
import LevelSelectScene from './LevelSelectScene.js'; 
import Button from '../ui/Button.js'; 
import FormationSelectionDialog from '../ui/FormationSelectionDialog.js';
import ResultScene from './ResultScene.js'; 

import GameLayout from '../core/GameLayout.js';
import InputController from '../core/InputController.js';
import TurnManager from '../core/TurnManager.js';
import OnlineMatchController from '../core/OnlineMatchController.js';
import SkillManager from '../core/SkillManager.js'; 

import AIChatBubble from '../ui/AIChatBubble.js';
import { AIPersonas, AIChatTexts, ChatTrigger } from '../config/AIChatConfig.js';

export default class GameScene extends BaseScene {
  constructor() {
    super();
    this.physics = new PhysicsEngine();
    
    this.layout = new GameLayout(this);
    this.input = new InputController(this);
    this.turnMgr = new TurnManager(this);
    this.skillMgr = new SkillManager(this); 
    this.networkCtrl = null; 
    
    this.gameMode = 'pve'; 
    this.currentLevel = 1; 
    this.strikers = [];
    this.ball = null;
    this.isMoving = false; 
    this.isGameOver = false;
    this.isLoading = true;
    this.isGamePaused = false; 
    this.myTeamId = TeamId.LEFT;

    this.isGoalResetting = false;

    this.hud = null;
    this.goalBanner = null;
    this.sparkSystem = null;
    this.repositionAnimations = [];
    this.players = []; 

    this.accumulator = 0;
    this.fixedTimeStep = 1000 / 60; 

    this.activeTheme = { striker: 1, field: 1, ball: 1 };
    
    this.p1FormationId = 0;
    this.p2FormationId = 0; 

    this.resetTimerId = null;
    
    this.moveTimer = 0;
    this.MAX_MOVE_TIME = 15000; 

    this.aiPersona = null;
    this.aiChatBubble = null;
    this.lastChatTime = 0;
    this.turnStartScores = { [TeamId.LEFT]: 0, [TeamId.RIGHT]: 0 }; 

    this.matchStats = {
        startTime: 0,
        endTime: 0,
        [TeamId.LEFT]: { shots: 0, skills: {} },
        [TeamId.RIGHT]: { shots: 0, skills: {} }
    };

    // [新增] 高潮系统状态
    this.totalTurns = 0; // 累计回合数
    this.hasPlayedClimaxCheer = false; // 本局是否播放过加油欢呼
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    this.currentLevel = params.level || 1; 
    this.isGoalResetting = false;
    
    this.matchStats.startTime = Date.now();
    this.matchStats[TeamId.LEFT] = { shots: 0, skills: {} };
    this.matchStats[TeamId.RIGHT] = { shots: 0, skills: {} };

    // [新增] 重置高潮状态
    this.totalTurns = 0;
    this.hasPlayedClimaxCheer = false;

    // [新增] 播放比赛氛围音效
    AudioManager.playBGM('crowd_bg_loop');

    if (this.gameMode === 'pve') {
        const randomIndex = Math.floor(Math.random() * AIPersonas.length);
        this.aiPersona = AIPersonas[randomIndex];
        console.log(`[AIChat] Selected Persona: ${this.aiPersona.name}`);
    }

    if (this.gameMode === 'pvp_online') {
        this.players = params.players || []; 
        const me = this.players.find(p => p.id === AccountMgr.userInfo.id);
        if (me) this.myTeamId = me.teamId;
        
        const p1 = this.players.find(p => p.teamId === TeamId.LEFT);
        const p2 = this.players.find(p => p.teamId === TeamId.RIGHT);
        this.p1FormationId = p1 ? (p1.formationId || 0) : 0;
        this.p2FormationId = p2 ? (p2.formationId || 0) : 0;

        this.networkCtrl = new OnlineMatchController(this);
        this.isLoading = false;
        this.initGame(params);

    } else {
        this.myTeamId = TeamId.LEFT;
        this.isLoading = false; 
        this.showFormationSelection(params);
    }
  }

  showFormationSelection(params) {
      let mode = 'single';
      if (this.gameMode === 'pvp_local') mode = 'dual';

      const dialog = new FormationSelectionDialog(mode, (p1Id, p2Id) => {
          this.p1FormationId = p1Id;
          if (this.gameMode === 'pvp_local') {
              this.p2FormationId = p2Id;
          } else {
              this.p2FormationId = 0;
          }
          this.initGame(params);
      }, () => {
          if (this.gameMode === 'pve') SceneManager.changeScene(LevelSelectScene);
          else SceneManager.changeScene(MenuScene);
      });

      this.container.addChild(dialog);
  }

  initGame(params) {
    if (this.gameMode === 'pvp_online') {
        const hostPlayer = this.players.find(p => p.teamId === TeamId.LEFT);
        if (hostPlayer && hostPlayer.theme) {
            this.activeTheme = hostPlayer.theme;
        } else {
            this.activeTheme = { striker: 1, field: 1, ball: 1 };
        }
    } else {
        this.activeTheme = AccountMgr.userInfo.theme || { striker: 1, field: 1, ball: 1 };
    }

    this.physics.init();
    this.layout.init(this.activeTheme.field);
    this.input.init();
    this.turnMgr.init(this.gameMode, params.startTurn, this.currentLevel);
    this.rules = new GameRules(this.physics);
    this.setupFormation();
    this._createUI();
    this._setupEvents();

    this.isGameOver = false;
    this.isGamePaused = false;
    this.accumulator = 0;

    if (params.snapshot && this.networkCtrl) {
        this.networkCtrl.restoreState(params.snapshot);
    }

    setTimeout(() => {
        if (!this.isGameOver) {
            let startText = "游戏开始";
            if (this.gameMode === 'pve') {
                startText = `第 ${this.currentLevel} 关 开始`;
            }
            this.goalBanner?.play(startText);
        }
    }, 500);

    if (this.layout && this.layout.adBoards && this.layout.adBoards.length > 0) {
        setTimeout(() => {
            if (!this.isGameOver) {
                Platform.showGameAds(this.layout.adBoards);
            }
        }, 100);
    }
  }

  _createUI() {
    const extraData = {
        currentLevel: this.currentLevel,
        players: this.gameMode === 'pvp_online' ? this.players : [],
        aiInfo: this.aiPersona 
    };

    this.hud = new GameHUD(
        this.gameMode, 
        this.myTeamId, 
        (skillType, teamId) => {
            this.skillMgr.toggleSkill(skillType);
        },
        extraData 
    );
    this.layout.layers.ui.addChild(this.hud);

    if (this.gameMode === 'pve' && this.hud) {
        this.aiChatBubble = new AIChatBubble();
        const centerX = GameConfig.designWidth / 2;
        this.aiChatBubble.position.set(centerX + 480, 125); 
        this.hud.addChild(this.aiChatBubble);
    }

    this.goalBanner = new GoalBanner();
    this.layout.layers.ui.addChild(this.goalBanner);

    const menuBtn = new GameMenuButton(this.app, this.layout.layers.ui, () => {
        this.onMenuBtnClick();
    });
    this.layout.layers.ui.addChild(menuBtn);

    // [新增] 阵型调整按钮 (右下角)
    // 逻辑上支持所有模式玩家换自己的阵型。
    this.createFormationButton();

    this.sparkSystem = new SparkSystem();
    this.layout.layers.game.addChild(this.sparkSystem);
    
    this.turnMgr.resetTimer();
  }

  // [新增] 创建右下角阵型按钮
  createFormationButton() {
      // 样式参考 GameMenuButton，但颜色为黄色
      const btnSize = 100;
      const btn = new Button({
          text: '阵型', 
          width: btnSize, 
          height: btnSize, 
          color: 0xF1C40F, // 黄色
          texture: ResourceManager.get('icon_theme'), // 尝试使用图标
          fontSize: 24,
          textColor: 0x333333,
          onClick: () => this.openIngameFormation()
      });

      // 如果有图标，隐藏文字
      if (ResourceManager.get('icon_theme')) {
          btn.label.visible = false;
      }

      // 添加阴影和圆角效果 (手动绘制以匹配 GameMenuButton 风格)
      // Button 类内部是一个 Container，我们可以在 btn.inner 下添加修饰
      const bg = new PIXI.Graphics();
      // 阴影
      bg.beginFill(0xC27C0E); // 深黄
      bg.drawRoundedRect(-btnSize/2, -btnSize/2 + 6, btnSize, btnSize, 20);
      bg.endFill();
      // 实体覆盖 (Button 内部已有 bg，这里是为了做立体感)
      // 由于 Button 内部实现较简单，我们直接调整位置即可
      
      // 定位：屏幕右下角
      const screenMargin = 30;
      const globalX = this.app.screen.width - screenMargin - btnSize / 4;
      const globalY = this.app.screen.height - screenMargin;
      
      const localPos = this.layout.layers.ui.toLocal(new PIXI.Point(globalX, globalY));
      btn.position.set(localPos.x, localPos.y);

      this.layout.layers.ui.addChild(btn);
  }

  // [新增] 打开游戏内阵型调整
  openIngameFormation() {
      // 模式判断
      // PVP Local: 双人换
      // PVP Online / PVE: 单人换 (P1)
      let mode = 'single_online'; // 默认为只换自己的模式
      if (this.gameMode === 'pvp_local') {
          mode = 'dual'; 
      }

      const dialog = new FormationSelectionDialog(
          mode, 
          (p1Id, p2Id) => {
              this.onFormationChanged(p1Id, p2Id);
          }, 
          () => {}, // Cancel
          "下一局生效" // 按钮文本
      );
      this.layout.layers.ui.addChild(dialog);
  }

  // [新增] 阵型变更处理
  onFormationChanged(p1Id, p2Id) {
      if (this.gameMode === 'pvp_local') {
          this.p1FormationId = p1Id;
          this.p2FormationId = p2Id;
          Platform.showToast("阵型已调整，进球后生效");
      } else {
          // PVE 或 Online，只改自己
          // 如果我是 P1 (Left)
          if (this.myTeamId === TeamId.LEFT) {
              this.p1FormationId = p1Id;
          } else {
              // 我是 P2 (Right)
              this.p2FormationId = p1Id; // 注意 Dialog 单人模式下回传的是第一个参数
          }
          
          AccountMgr.updateFormation(p1Id); // 保存偏好
          Platform.showToast("阵型已调整，进球后生效");

          // 联网通知
          if (this.gameMode === 'pvp_online' && this.networkCtrl) {
              this.networkCtrl.sendFormationUpdate(p1Id);
          }
      }
  }

  // [新增] 处理远程阵型更新
  handleRemoteFormationUpdate(teamId, formationId) {
      if (teamId === TeamId.LEFT) {
          this.p1FormationId = formationId;
      } else {
          this.p2FormationId = formationId;
      }
      Platform.showToast("对方调整了阵型，下一局生效");
  }

  _setupEvents() {
    EventBus.on(Events.GOAL_SCORED, this.onGoal, this);
    EventBus.on(Events.GAME_OVER, this.onGameOver, this);
    EventBus.on(Events.COLLISION_HIT, (data) => this.sparkSystem?.emit(data.x, data.y, data.intensity), this);
    EventBus.on(Events.PLAY_SOUND, this.onPlaySound, this); 
    EventBus.on(Events.SKILL_ACTIVATED, this.onSkillStateChange, this);
    EventBus.on(Events.ITEM_UPDATE, this.onItemUpdate, this); 
  }

  recordShot(teamId) {
      if (this.matchStats[teamId]) {
          this.matchStats[teamId].shots++;
      }
  }

  recordSkillUsage(teamId, skillType) {
      if (this.matchStats[teamId]) {
          const skills = this.matchStats[teamId].skills;
          skills[skillType] = (skills[skillType] || 0) + 1;
      }
  }

  setupFormation() {
    if (this.rules) {
        this.rules.resetProcessingState();
    }

    if (this.strikers.length > 0 && this.ball) {
        this._animateReset();
        return;
    }

    this._clearEntities();
    const { x, y, w, h } = this.layout.fieldRect;
    const cx = x + w/2, cy = y + h/2;

    this.ball = new Ball(cx, cy, this.activeTheme.ball);
    this._addEntity(this.ball);

    const r = GameConfig.dimensions.strikerDiameter / 2;

    const fmtLeft = getFormation(this.p1FormationId);
    const fmtRight = getFormation(this.p2FormationId);

    fmtLeft.positions.forEach((pos, i) => {
        const px = cx + pos.x * w; 
        const py = cy + pos.y * h;
        const s = new Striker(px, py, r, TeamId.LEFT, this.activeTheme.striker);
        s.id = `left_${i}`;
        this.strikers.push(s); this._addEntity(s);
    });

    fmtRight.positions.forEach((pos, i) => {
        const px = cx - pos.x * w; 
        const py = cy + pos.y * h; 
        const s = new Striker(px, py, r, TeamId.RIGHT, this.activeTheme.striker);
        s.id = `right_${i}`;
        this.strikers.push(s); this._addEntity(s);
    });
  }

  _animateReset() {
      const { x, y, w, h } = this.layout.fieldRect;
      const cx = x + w/2, cy = y + h/2;
      const duration = 1000; 

      if (this.ball) {
          this.ball.body.isSensor = true; 
          this.repositionAnimations.push({
              body: this.ball.body,
              start: { x: this.ball.body.position.x, y: this.ball.body.position.y },
              end: { x: cx, y: cy },
              time: 0,
              duration: duration
          });
          this.ball.setLightningMode(false);
          this.ball.resetStates(); 
      }

      const fmtLeft = getFormation(this.p1FormationId);
      const fmtRight = getFormation(this.p2FormationId);

      const leftStrikers = this.strikers.filter(s => s.teamId === TeamId.LEFT);
      const rightStrikers = this.strikers.filter(s => s.teamId === TeamId.RIGHT);

      leftStrikers.forEach((s, i) => {
          if (i < fmtLeft.positions.length) {
              const pos = fmtLeft.positions[i];
              const targetX = cx + pos.x * w;
              const targetY = cy + pos.y * h;
              
              s.body.isSensor = true;
              this.repositionAnimations.push({
                  body: s.body,
                  start: { x: s.body.position.x, y: s.body.position.y },
                  end: { x: targetX, y: targetY },
                  time: 0,
                  duration: duration
              });
          }
      });

      rightStrikers.forEach((s, i) => {
          if (i < fmtRight.positions.length) {
              const pos = fmtRight.positions[i];
              const targetX = cx - pos.x * w;
              const targetY = cy + pos.y * h;

              s.body.isSensor = true;
              this.repositionAnimations.push({
                  body: s.body,
                  start: { x: s.body.position.x, y: s.body.position.y },
                  end: { x: targetX, y: targetY },
                  time: 0,
                  duration: duration
              });
          }
      });
      
      this._forceFreezeAll();
  }

  _addEntity(entity) {
    this.layout.layers.game.addChild(entity.view);
    this.physics.add(entity.body);
  }

  _clearEntities() {
    if (!this.physics || !this.physics.engine) return;
    this.strikers.forEach(s => { 
        Matter.World.remove(this.physics.engine.world, s.body); 
        this.layout.layers.game.removeChild(s.view);
        s.destroy(); // [新增]
    });
    this.strikers = [];
    if (this.ball) { 
        Matter.World.remove(this.physics.engine.world, this.ball.body); 
        this.layout.layers.game.removeChild(this.ball.view);
        this.ball.destroy(); // [新增]
        this.ball = null; 
    }
  }

  onPlaySound(key) {
      if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn !== this.myTeamId) {
          return;
      }
      AudioManager.playSFX(key);

      if (key === 'hit_post' && this.gameMode === 'pve') {
          if (this.turnMgr.currentTurn === TeamId.LEFT) {
              this.triggerAIChat(ChatTrigger.PLAYER_MISS);
          }
      }
  }

  onSkillStateChange(data) {
      const { type, active, teamId } = data;
      
      if (this.hud) {
          this.hud.updateSkillState(teamId, type, active);
      }

      if (teamId !== this.myTeamId && active && this.gameMode !== 'pvp_local') {
          let skillName = "";
          if (type === SkillType.SUPER_FORCE) skillName = "大力水手";
          if (type === SkillType.UNSTOPPABLE) skillName = "无敌战车";
          if (skillName) {
              Platform.showToast(`对方开启了 ${skillName} !`);
          }
      }
  }

  onItemUpdate(data) {
      const { itemId, count } = data;
      if (this.hud) {
          this.hud.updateItemCount(this.myTeamId, itemId, count);
          if (this.gameMode === 'pvp_local') {
             this.hud.updateItemCount(TeamId.RIGHT, itemId, count);
          }
      }
  }

  onMenuBtnClick() {
      if (this.gameMode === 'pvp_online' && !this.isGameOver) {
          NetworkMgr.send({ type: NetMsg.LEAVE });
          NetworkMgr.close(); 
      }
      if (this.gameMode === 'pve') {
          SceneManager.changeScene(LevelSelectScene);
      } else {
          SceneManager.changeScene(MenuScene);
      }
  }

  onActionFired(isRemote = false) {
    this.isMoving = true;
    this.moveTimer = 0; 
    if (!isRemote) {
        // [修改] 移除通用的 collision 音效，因为现在由 GameRules 触发分级音效
        // AudioManager.playSFX('collision'); 
        this.recordShot(this.turnMgr.currentTurn);
    }
    this.turnMgr.timer = 0; 
    this.turnStartScores = { ...this.rules.score };
  }

  onGoal(data) {
    // [注意] 此处不再重置 hasPlayedClimaxCheer，确保整局只触发一次加油欢呼（针对5-10回合的僵持）
    
    if (this.networkCtrl) {
        const handled = this.networkCtrl.handleLocalGoal(data);
        if (handled) return; 
    }
    
    if (this.gameMode === 'pve') {
        this.checkGoalChatTrigger(data.scoreTeam);
    }

    this._playGoalEffects(data.newScore, data.scoreTeam);
  }

  checkGoalChatTrigger(scoreTeam) {
      const turnId = this.turnMgr.currentTurn;
      const scoreId = scoreTeam;
      const isOwnGoal = turnId !== scoreId;

      const prevScoreP = this.turnStartScores[TeamId.LEFT];
      const prevScoreAI = this.turnStartScores[TeamId.RIGHT];
      
      const newScoreP = scoreTeam === TeamId.LEFT ? prevScoreP + 1 : prevScoreP;
      const newScoreAI = scoreTeam === TeamId.RIGHT ? prevScoreAI + 1 : prevScoreAI;

      if (isOwnGoal) {
          if (scoreId === TeamId.RIGHT) {
              this.triggerAIChat(ChatTrigger.PLAYER_OWN_GOAL);
          } else {
              this.triggerAIChat(ChatTrigger.AI_OWN_GOAL);
          }
          return;
      }

      if (scoreId === TeamId.LEFT) {
          if (prevScoreP < prevScoreAI && newScoreP === newScoreAI) {
              this.triggerAIChat(ChatTrigger.PLAYER_EQUALIZER);
          } 
          else if (prevScoreP === prevScoreAI && newScoreP > newScoreAI) {
              this.triggerAIChat(ChatTrigger.PLAYER_OVERTAKE);
          }
          else if (prevScoreP > prevScoreAI && newScoreP > newScoreAI) {
              this.triggerAIChat(ChatTrigger.PLAYER_LEAD_EXTEND);
          }
          else if (this.turnMgr.timer < 2) { 
              this.triggerAIChat(ChatTrigger.PLAYER_INSTANT_GOAL);
          }
          else {
              this.triggerAIChat(ChatTrigger.PLAYER_GOAL);
          }

      } else {
          if (prevScoreAI < prevScoreP && newScoreAI === newScoreP) {
              this.triggerAIChat(ChatTrigger.AI_EQUALIZER);
          }
          else if (prevScoreAI === prevScoreP && newScoreAI > newScoreP) {
              this.triggerAIChat(ChatTrigger.AI_OVERTAKE);
          }
          else if (prevScoreAI > prevScoreP && newScoreAI > newScoreP) {
              this.triggerAIChat(ChatTrigger.AI_LEAD_EXTEND);
          }
          else {
              this.triggerAIChat(ChatTrigger.AI_GOAL);
          }
      }
  }

  triggerAIChat(triggerType) {
      if (!this.aiPersona || !this.aiChatBubble) return;
      
      const now = Date.now();
      if (now - this.lastChatTime < 2000) return;
      this.lastChatTime = now;

      const personaTexts = AIChatTexts[this.aiPersona.id];
      if (!personaTexts) return;
      
      const lines = personaTexts[triggerType];
      if (lines && lines.length > 0) {
          const text = lines[Math.floor(Math.random() * lines.length)];
          this.aiChatBubble.show(text);
      }
  }

  _playGoalEffects(newScore, scoreTeam) {
    AudioManager.playSFX('goal');
    this.hud?.updateScore(newScore[TeamId.LEFT], newScore[TeamId.RIGHT]);
    this.goalBanner?.play("进球！"); 
    Platform.vibrateShort();
    
    this.isGoalResetting = true;

    if (this.ball) {
        this.ball.setLightningMode(false);
        this.ball.resetStates(); 
    }
    
    if (this.resetTimerId) clearTimeout(this.resetTimerId);

    this.resetTimerId = setTimeout(() => { 
        if (!this.isGameOver && this.physics && this.physics.engine) {
            this.setupFormation(); 
            
            if (scoreTeam !== undefined && scoreTeam !== null) {
                const nextTurn = scoreTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
                this.turnMgr.currentTurn = nextTurn;
                this.turnMgr.resetTimer();
            }

            this.isGoalResetting = false;
            this.isMoving = false;
        }
    }, 2000);
  }

  onGameOver(data) {
    this.isGameOver = true;
    this.matchStats.endTime = Date.now(); 

    if (this.resetTimerId) {
        clearTimeout(this.resetTimerId);
        this.resetTimerId = null;
    }

    if (this.gameMode === 'pve') {
        if (data.winner === TeamId.RIGHT) { 
            this.triggerAIChat(ChatTrigger.AI_WIN);
        }
    }

    AudioManager.playSFX(data.winner !== -1 && data.winner === this.myTeamId ? 'win' : 'goal');

    if (this.gameMode === 'pvp_online') {
        NetworkMgr.send({ type: NetMsg.GAME_OVER });
    }

    setTimeout(() => {
        const roomId = Platform.getStorage('last_room_id');
        
        SceneManager.changeScene(ResultScene, {
            winner: data.winner,
            gameMode: this.gameMode,
            currentLevel: this.currentLevel,
            score: this.rules.score,
            stats: this.matchStats,
            players: this.players,
            myTeamId: this.myTeamId,
            roomId: roomId 
        });
    }, 2000);
  }

  update(delta) {
    if (this.isLoading || !this.physics.engine) return;
    if (this.isGamePaused) return;

    this.goalBanner?.update(delta);
    this.sparkSystem?.update(delta);
    this._updateStrikerHighlights(); 

    this.accumulator += delta;
    if (this.accumulator > this.fixedTimeStep * 5) {
        this.accumulator = this.fixedTimeStep * 5;
    }
    
    while (this.accumulator >= this.fixedTimeStep) {
        this._saveEntityStates();
        this._fixedUpdate(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
    }

    const alpha = this.accumulator / this.fixedTimeStep;

    this.strikers.forEach(s => s.update(delta, alpha));
    this.ball?.update(delta, alpha);

    if (this.gameMode === 'pve' && 
        this.turnMgr.currentTurn === TeamId.LEFT && 
        !this.isMoving && 
        !this.isGameOver) {
        
        if (this.turnMgr.timer < (this.turnMgr.maxTime - 10)) {
            if (Math.random() < 0.005) { 
                this.triggerAIChat(ChatTrigger.IDLE);
            }
        }
    }
  }

  _saveEntityStates() {
      this.strikers.forEach(s => s.saveRenderState());
      if (this.ball) this.ball.saveRenderState();
  }

  _fixedUpdate(dt) {
    const isPvpOnline = this.gameMode === 'pvp_online';
    const isMyTurn = this.turnMgr.currentTurn === this.myTeamId;
    
    if (!isPvpOnline || isMyTurn) {
        this.physics.update(dt);
    } 

    this.turnMgr.update(dt);
    
    if (this.networkCtrl) {
        this.networkCtrl.update(dt);
    }

    if (this.repositionAnimations.length > 0) {
        this._updateRepositionAnims(dt);
    }

    if (this.isMoving) {
        this.moveTimer += dt;
        if (this.moveTimer > this.MAX_MOVE_TIME) {
            console.log("Turn timed out, forcing end.");
            this._forceFreezeAll(); 
            this._endTurn();
            return;
        }

        if (!isPvpOnline || isMyTurn) {
            const isPhysicsSleeping = this.physics.isSleeping();
            const isAnimFinished = this.repositionAnimations.length === 0;

            if (isPhysicsSleeping && isAnimFinished && !this.isGoalResetting) {
                 const startedAnyAnim = this._enforceFairPlay();
                 if (!startedAnyAnim) {
                     this._endTurn();
                 }
            }
        }
    }
  }
  
  _forceFreezeAll() {
      if (this.physics && this.physics.engine) {
          const bodies = Matter.Composite.allBodies(this.physics.engine.world);
          bodies.forEach(b => {
              if (!b.isStatic) {
                  Matter.Body.setVelocity(b, { x: 0, y: 0 });
                  Matter.Body.setAngularVelocity(b, 0);
              }
          });
          this._saveEntityStates(); 
      }
  }
  
  _endTurn(force = false) {
      // [修复] 增加 force 参数，允许强制结束回合 (用于处理 TURN_SYNC 乱序或 MOVE 丢失的情况)
      if (!this.isMoving && !force) return;

      // [新增] 回合计数增加
      this.totalTurns++;

      if (this.gameMode === 'pve' && 
          this.turnMgr.currentTurn === TeamId.LEFT &&
          this.turnStartScores[TeamId.LEFT] === this.rules.score[TeamId.LEFT]) {
          
          if (Math.random() < 0.3) {
              this.triggerAIChat(ChatTrigger.PLAYER_BAD);
          }
      }

      this.isMoving = false;
      this.moveTimer = 0; 
      
      if (this.ball) {
          this.ball.setLightningMode(false);
          this.ball.resetStates(); 
      }

      // [核心新增] 检查是否触发僵持局加油 (回合切换时判断)
      this._checkEncouragementCheer();

      if (this.networkCtrl && this.turnMgr.currentTurn === this.myTeamId) {
          this.networkCtrl.syncAllPositions();
      }

      if (!this.networkCtrl) {
          this.turnMgr.switchTurn();
      } else {
          const pending = this.networkCtrl.popPendingTurn();
          if (pending !== null && pending !== undefined) {
              this.turnMgr.currentTurn = pending;
          } else {
              // [修复] 兜底策略：如果 pendingTurn 缺失（例如 MOVE 消息丢失），强制切换回合
              // 这确保了接收方不会卡在发送方的回合中
              this.turnMgr.switchTurn();
          }
          this.turnMgr.resetTimer();
      }
  }

  // [新增] 僵持局加油判断逻辑
  _checkEncouragementCheer() {
      // 1. 如果本局已经触发过，则不再触发
      if (this.hasPlayedClimaxCheer) return;

      // 2. 回合数检测：5-10 回合之间
      if (this.totalTurns >= 5 && this.totalTurns <= 10) {
          // 3. 局势判断：分差 <= 1 (僵持/胶着状态)
          const scoreDiff = Math.abs(this.rules.score[TeamId.LEFT] - this.rules.score[TeamId.RIGHT]);
          
          if (scoreDiff <= 1) {
              // 4. 随机触发 (约30%概率)
              if (Math.random() < 0.3) {
                  console.log(`[Audio] Trigger Encouragement Cheer at turn ${this.totalTurns}`);
                  this.hasPlayedClimaxCheer = true;
                  AudioManager.playClimaxCheer();
              }
          }
      }
  }
  
  _enforceFairPlay() {
    if (this.networkCtrl && this.turnMgr.currentTurn !== this.myTeamId) {
        return false;
    }

    const { x, w, h, y } = this.layout.fieldRect;
    const goalDepth = GameConfig.dimensions.goalWidth;
    const safeDistance = goalDepth * 3.5; 
    let started = false;

    this._freezeAllPhysics();

    this.strikers.forEach(striker => {
        const body = striker.body;
        const posX = body.position.x;
        
        const inLeftGoal = posX < x;
        const inRightGoal = posX > x + w;

        if (inLeftGoal || inRightGoal) {
            const targetPos = this._findSafeRandomPosition(striker.teamId, safeDistance);
            const duration = 700;

            if (this.networkCtrl) {
                this.networkCtrl.sendFairPlayMove(striker.id, { x: body.position.x, y: body.position.y }, targetPos, duration);
            }
            
            body.isSensor = true;
            this.repositionAnimations.push({
                body: body,
                start: { x: body.position.x, y: body.position.y },
                end: targetPos,
                time: 0,
                duration: duration
            });
            started = true;
        }
    });

    return started;
  }
  
  _findSafeRandomPosition(teamId, safeDistance) {
    const { x, y, w, h } = this.layout.fieldRect;
    const r = GameConfig.dimensions.strikerDiameter / 2;
    const padding = 40; 
    
    let targetX, minX, maxX;
    if (teamId === TeamId.LEFT) {
        minX = x + safeDistance;
        maxX = x + w / 2 - r - 20;
    } else {
        minX = x + w / 2 + r + 20;
        maxX = x + w - safeDistance;
    }

    for (let attempt = 0; attempt < 50; attempt++) {
        const rx = minX + Math.random() * (maxX - minX);
        const ry = (y + padding + r) + Math.random() * (h - padding * 2 - r * 2);
        
        const isOverlap = this._checkPositionOverlap(rx, ry, r);
        if (!isOverlap) {
            return { x: rx, y: ry };
        }
    }
    return { x: (minX + maxX) / 2, y: y + h / 2 };
  }

  _checkPositionOverlap(px, py, radius) {
    const minSafeDist = radius * 2.2; 
    const dxBall = px - this.ball.body.position.x;
    const dyBall = py - this.ball.body.position.y;
    if (Math.sqrt(dxBall*dxBall + dyBall*dyBall) < minSafeDist) return true;
    for (const s of this.strikers) {
        const dx = px - s.body.position.x;
        const dy = py - s.body.position.y;
        if (Math.sqrt(dx*dx + dy*dy) < minSafeDist) return true;
    }
    return false;
  }

  _freezeAllPhysics() {
    const bodies = [this.ball.body, ...this.strikers.map(s => s.body)];
    bodies.forEach(b => {
        Matter.Body.setVelocity(b, { x: 0, y: 0 });
        Matter.Body.setAngularVelocity(b, 0);
        Matter.Body.setInertia(b, Infinity); 
    });
  }

  _updateStrikerHighlights() {
      const active = !this.isMoving && !this.isGameOver && !this.isLoading && this.repositionAnimations.length === 0;
      this.strikers.forEach(s => {
          let glow = active && !this.input.isDragging && s.teamId === this.turnMgr.currentTurn;
          if (this.gameMode === 'pvp_online' && s.teamId !== this.myTeamId) glow = false;
          s.setHighlight(glow);
      });
  }

  _updateRepositionAnims(delta) {
      const finishedAnims = [];
      this.repositionAnimations = this.repositionAnimations.filter(anim => {
          anim.time += delta;
          const progress = Math.min(anim.time / anim.duration, 1.0);
          const ease = 1 - Math.pow(1 - progress, 4); 
          const curX = anim.start.x + (anim.end.x - anim.start.x) * ease;
          const curY = anim.start.y + (anim.end.y - anim.start.y) * ease;
          Matter.Body.setPosition(anim.body, { x: curX, y: curY });
          Matter.Body.setVelocity(anim.body, { x: 0, y: 0 });
          if (progress >= 1.0) {
              finishedAnims.push(anim);
              return false;
          }
          return true;
      });
      
      finishedAnims.forEach(anim => {
          anim.body.isSensor = false; 
          Matter.Body.setVelocity(anim.body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(anim.body, 0);
          
          const isStriker = anim.body.label === 'Striker';
          if (isStriker && GameConfig.physics.strikerFixedRotation) {
              Matter.Body.setInertia(anim.body, Infinity);
          } else {
              const r = isStriker ? GameConfig.dimensions.strikerDiameter/2 : GameConfig.dimensions.ballDiameter/2;
              Matter.Body.setInertia(anim.body, (anim.body.mass * r * r) / 2);
          }
      });
      
      if (finishedAnims.length > 0 && this.repositionAnimations.length === 0) {
          if (this.isMoving) {
              this._endTurn();
          }
      }
  }

  onExit() {
      // 1. 先清理逻辑和事件监听
      Platform.hideGameAds();
      if (this.resetTimerId) {
          clearTimeout(this.resetTimerId);
          this.resetTimerId = null;
      }

      // [新增] 停止背景音
      AudioManager.stopBGM();
      
      // 移除事件监听 (EventBus 已修复支持传 context)
      EventBus.off(Events.GOAL_SCORED, this);
      EventBus.off(Events.GAME_OVER, this);
      EventBus.off(Events.COLLISION_HIT, this);
      EventBus.off(Events.PLAY_SOUND, this); 
      EventBus.off(Events.SKILL_ACTIVATED, this); 
      EventBus.off(Events.ITEM_UPDATE, this); 
      
      if (this.networkCtrl) {
          this.networkCtrl.destroy();
          this.networkCtrl = null;
      }
      
      if (this.rules) {
          this.rules.destroy();
          this.rules = null;
      }
      
      this._clearEntities();
      this.turnMgr.clear();
      this.physics.clear();

      // 2. 最后再销毁显示对象容器
      super.onExit();
  }
}
