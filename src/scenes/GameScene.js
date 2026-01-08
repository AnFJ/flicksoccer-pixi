
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

// [新增] 引入聊天相关
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

    // [新增] 进球重置状态锁，防止物理静止检测干扰进球重置流程
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

    // [新增] AI 聊天相关状态
    this.aiPersona = null;
    this.aiChatBubble = null;
    this.lastChatTime = 0;
    this.turnStartScores = { [TeamId.LEFT]: 0, [TeamId.RIGHT]: 0 }; // 记录回合开始时比分

    this.matchStats = {
        startTime: 0,
        endTime: 0,
        [TeamId.LEFT]: { shots: 0, skills: {} },
        [TeamId.RIGHT]: { shots: 0, skills: {} }
    };
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    this.currentLevel = params.level || 1; 
    this.isGoalResetting = false;
    
    this.matchStats.startTime = Date.now();
    this.matchStats[TeamId.LEFT] = { shots: 0, skills: {} };
    this.matchStats[TeamId.RIGHT] = { shots: 0, skills: {} };

    // [新增] PVE模式下，随机选择一个AI人格
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
        // [新增] 传入 AI 人格数据，以便 HUD 显示对应头像和名字
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

    // [新增] 初始化 AI 聊天气泡
    if (this.gameMode === 'pve' && this.hud) {
        this.aiChatBubble = new AIChatBubble();
        
        // 调整位置：
        // 右侧头像中心 X = designWidth/2 + 480
        // 头像 Y = 60，半径 50 -> 底部 Y = 110
        // 将气泡尖端对准头像底部，稍微下移留点空隙
        const centerX = GameConfig.designWidth / 2;
        // x: 对齐右侧头像 (1200 + 480 = 1680)
        // y: 头像下方 (60 + 50 + 15 = 125)
        this.aiChatBubble.position.set(centerX + 480, 125); 
        
        this.hud.addChild(this.aiChatBubble);
    }

    this.goalBanner = new GoalBanner();
    this.layout.layers.ui.addChild(this.goalBanner);

    const menuBtn = new GameMenuButton(this.app, this.layout.layers.ui, () => {
        this.onMenuBtnClick();
    });
    this.layout.layers.ui.addChild(menuBtn);

    this.sparkSystem = new SparkSystem();
    this.layout.layers.game.addChild(this.sparkSystem);
    
    this.turnMgr.resetTimer();
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
    // [修复] 每次重新布局时，重置进球处理锁
    // 确保之前的球已经被清理或移动了，不会再触发碰撞
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
          this.ball.resetStates(); // [核心修改]
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
    });
    this.strikers = [];
    if (this.ball) { 
        Matter.World.remove(this.physics.engine.world, this.ball.body); 
        this.layout.layers.game.removeChild(this.ball.view); 
        this.ball = null; 
    }
  }

  onPlaySound(key) {
      if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn !== this.myTeamId) {
          return;
      }
      AudioManager.playSFX(key);

      // [新增] 监听撞门柱音效，触发聊天
      if (key === 'hit_post' && this.gameMode === 'pve') {
          // 只在玩家回合撞柱时触发嘲讽/遗憾
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
          // [修改] 发送 LEAVE 消息，让服务端知道是主动离开
          // 服务端根据当前游戏状态(PLAYING)决定是保留房间(标记Offline)还是销毁房间
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
        AudioManager.playSFX('collision'); 
        this.recordShot(this.turnMgr.currentTurn);
    }
    this.turnMgr.timer = 0; 
    
    // [新增] 记录回合开始时的比分，用于检测是否进球和判断乌龙球
    this.turnStartScores = { ...this.rules.score };
  }

  onGoal(data) {
    if (this.networkCtrl) {
        const handled = this.networkCtrl.handleLocalGoal(data);
        if (handled) return; 
    }
    
    // [新增] 触发进球相关聊天
    if (this.gameMode === 'pve') {
        this.checkGoalChatTrigger(data.scoreTeam);
    }

    this._playGoalEffects(data.newScore, data.scoreTeam);
  }

  // [新增] 进球聊天判断逻辑 (优化版：支持乌龙球和复杂比分场景)
  checkGoalChatTrigger(scoreTeam) {
      // 谁踢的球？(回合方)
      const turnId = this.turnMgr.currentTurn;
      // 谁得了分？
      const scoreId = scoreTeam;

      // 判断是否是乌龙球 (踢球方 != 得分方)
      const isOwnGoal = turnId !== scoreId;

      const prevScoreP = this.turnStartScores[TeamId.LEFT];
      const prevScoreAI = this.turnStartScores[TeamId.RIGHT];
      
      const newScoreP = scoreTeam === TeamId.LEFT ? prevScoreP + 1 : prevScoreP;
      const newScoreAI = scoreTeam === TeamId.RIGHT ? prevScoreAI + 1 : prevScoreAI;

      // 1. 处理乌龙球
      if (isOwnGoal) {
          if (scoreId === TeamId.RIGHT) {
              // 玩家乌龙 (AI得分)
              this.triggerAIChat(ChatTrigger.PLAYER_OWN_GOAL);
          } else {
              // AI乌龙 (玩家得分)
              this.triggerAIChat(ChatTrigger.AI_OWN_GOAL);
          }
          return;
      }

      // 2. 处理正常进球
      if (scoreId === TeamId.LEFT) {
          // --- 玩家进球 ---
          
          // 场景判定
          if (prevScoreP < prevScoreAI && newScoreP === newScoreAI) {
              // 追平 (例如 0-1 -> 1-1)
              this.triggerAIChat(ChatTrigger.PLAYER_EQUALIZER);
          } 
          else if (prevScoreP === prevScoreAI && newScoreP > newScoreAI) {
              // 反超 (例如 1-1 -> 2-1)
              this.triggerAIChat(ChatTrigger.PLAYER_OVERTAKE);
          }
          else if (prevScoreP > prevScoreAI && newScoreP > newScoreAI) {
              // 扩大领先 (例如 1-0 -> 2-0)
              this.triggerAIChat(ChatTrigger.PLAYER_LEAD_EXTEND);
          }
          else if (this.turnMgr.timer < 2) { 
              // 秒进 (备选，优先级较低)
              this.triggerAIChat(ChatTrigger.PLAYER_INSTANT_GOAL);
          }
          else {
              // 普通进球 (例如 0-0 -> 1-0 也算开局领先，或者默认)
              this.triggerAIChat(ChatTrigger.PLAYER_GOAL);
          }

      } else {
          // --- AI 进球 ---
          
          if (prevScoreAI < prevScoreP && newScoreAI === newScoreP) {
              // AI 追平
              this.triggerAIChat(ChatTrigger.AI_EQUALIZER);
          }
          else if (prevScoreAI === prevScoreP && newScoreAI > newScoreP) {
              // AI 反超
              this.triggerAIChat(ChatTrigger.AI_OVERTAKE);
          }
          else if (prevScoreAI > prevScoreP && newScoreAI > newScoreP) {
              // AI 扩大领先
              this.triggerAIChat(ChatTrigger.AI_LEAD_EXTEND);
          }
          else {
              this.triggerAIChat(ChatTrigger.AI_GOAL);
          }
      }
  }

  // [新增] 触发 AI 聊天
  triggerAIChat(triggerType) {
      if (!this.aiPersona || !this.aiChatBubble) return;
      
      // 简单的防刷屏：2秒冷却
      const now = Date.now();
      if (now - this.lastChatTime < 2000) return;
      this.lastChatTime = now;

      // 获取该人格、该类型下的文案列表
      const personaTexts = AIChatTexts[this.aiPersona.id];
      if (!personaTexts) return;
      
      const lines = personaTexts[triggerType];
      if (lines && lines.length > 0) {
          // 随机一句
          const text = lines[Math.floor(Math.random() * lines.length)];
          this.aiChatBubble.show(text);
      }
  }

  _playGoalEffects(newScore, scoreTeam) {
    AudioManager.playSFX('goal');
    this.hud?.updateScore(newScore[TeamId.LEFT], newScore[TeamId.RIGHT]);
    this.goalBanner?.play("进球！"); 
    Platform.vibrateShort();
    
    // [核心修改] 锁定状态，阻止物理静止检测自动切换回合
    this.isGoalResetting = true;

    if (this.ball) {
        this.ball.setLightningMode(false);
        this.ball.resetStates(); // [核心修改] 进球后立即重置状态，防止无限滑行
    }
    
    if (this.resetTimerId) clearTimeout(this.resetTimerId);

    this.resetTimerId = setTimeout(() => { 
        if (!this.isGameOver && this.physics && this.physics.engine) {
            this.setupFormation(); 
            
            // [核心修改] 进球后，由失分方（scoreTeam 的对方）开球
            if (scoreTeam !== undefined && scoreTeam !== null) {
                const nextTurn = scoreTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
                this.turnMgr.currentTurn = nextTurn;
                this.turnMgr.resetTimer();
            }

            // 重置完成，解锁状态
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

    // [新增] 触发胜负聊天
    if (this.gameMode === 'pve') {
        if (data.winner === TeamId.RIGHT) { // AI 赢
            this.triggerAIChat(ChatTrigger.AI_WIN);
        }
    }

    AudioManager.playSFX(data.winner !== -1 && data.winner === this.myTeamId ? 'win' : 'goal');

    // [核心修改] 网络对战不在这里断开连接，而是发送 GAME_OVER 消息
    // 保留连接以便复玩
    if (this.gameMode === 'pvp_online') {
        NetworkMgr.send({ type: NetMsg.GAME_OVER });
    }

    setTimeout(() => {
        // [核心修改] 传递 roomId 给结果页，以便 "再来一局" 使用
        const roomId = Platform.getStorage('last_room_id');
        
        SceneManager.changeScene(ResultScene, {
            winner: data.winner,
            gameMode: this.gameMode,
            currentLevel: this.currentLevel,
            score: this.rules.score,
            stats: this.matchStats,
            players: this.players,
            myTeamId: this.myTeamId,
            roomId: roomId // 传递房间号
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
    
    // [核心优化] 物理步进与视觉插值分离
    while (this.accumulator >= this.fixedTimeStep) {
        // 1. 在物理步进前，保存当前状态为“上一帧”状态
        this._saveEntityStates();
        
        // 2. 执行物理步进
        this._fixedUpdate(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
    }

    // 3. 计算插值系数 (alpha)，代表当前时间点位于上一次物理帧和下一次物理帧之间的比例 (0.0 ~ 1.0)
    const alpha = this.accumulator / this.fixedTimeStep;

    // 4. 使用插值系数更新视图
    this.strikers.forEach(s => s.update(delta, alpha));
    this.ball?.update(delta, alpha);

    // [新增] 检测玩家发呆
    if (this.gameMode === 'pve' && 
        this.turnMgr.currentTurn === TeamId.LEFT && 
        !this.isMoving && 
        !this.isGameOver) {
        
        // 如果倒计时过了 10秒 (总时限30秒，剩余20秒时)
        if (this.turnMgr.timer < (this.turnMgr.maxTime - 10)) {
            // 只有极低概率触发，避免一直催
            if (Math.random() < 0.005) { 
                this.triggerAIChat(ChatTrigger.IDLE);
            }
        }
    }
  }

  // [新增] 保存所有实体的渲染状态
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

            // [核心修改] 增加 !this.isGoalResetting 判断
            // 如果正在处理进球重置逻辑，不要因为物理静止了就自动切换回合
            // 而是等待 setTimeout 中的重置逻辑来切换回合
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
          // 强制同步视觉，避免插值产生的残影
          this._saveEntityStates(); 
      }
  }
  
  _endTurn() {
      if (!this.isMoving) return;

      // [新增] 检测是否为玩家失误（没有进球，且球没有发生大的位移，或者没碰到球）
      // 这里简化判断：只要回合结束了且没有进球，就有概率触发“失误/未进”的嘲讽
      // 只有 PVE 且是玩家刚踢完
      if (this.gameMode === 'pve' && 
          this.turnMgr.currentTurn === TeamId.LEFT &&
          this.turnStartScores[TeamId.LEFT] === this.rules.score[TeamId.LEFT]) {
          
          // 30% 概率触发“踢得不好”或“没进”的吐槽
          if (Math.random() < 0.3) {
              this.triggerAIChat(ChatTrigger.PLAYER_BAD);
          }
      }

      this.isMoving = false;
      this.moveTimer = 0; 
      
      if (this.ball) {
          this.ball.setLightningMode(false);
          this.ball.resetStates(); // [核心修改] 回合结束强制重置技能状态
      }

      if (this.networkCtrl && this.turnMgr.currentTurn === this.myTeamId) {
          this.networkCtrl.syncAllPositions();
      }

      if (!this.networkCtrl) {
          this.turnMgr.switchTurn();
      } else {
          const pending = this.networkCtrl.popPendingTurn();
          if (pending !== null && pending !== undefined) {
              this.turnMgr.currentTurn = pending;
          } else if (this.turnMgr.currentTurn === this.myTeamId) {
              this.turnMgr.switchTurn();
          }
          this.turnMgr.resetTimer();
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
      super.onExit();
      Platform.hideGameAds();
      if (this.resetTimerId) {
          clearTimeout(this.resetTimerId);
          this.resetTimerId = null;
      }
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
      this.turnMgr.clear();
      this.physics.clear();
  }
}
