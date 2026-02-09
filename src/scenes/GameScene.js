
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

import LeaveButton from '../ui/LeaveButton.js';
import FormationButton from '../ui/FormationButton.js'; 
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

import AIChatController from '../core/AIChatController.js';
import AtmosphereController from '../core/AtmosphereController.js';

export default class GameScene extends BaseScene {
  constructor() {
    super();
    this.physics = new PhysicsEngine();
    
    this.layout = new GameLayout(this);
    this.input = new InputController(this);
    this.turnMgr = new TurnManager(this);
    this.skillMgr = new SkillManager(this);
    
    this.aiChatCtrl = new AIChatController(this);
    this.atmosphereCtrl = new AtmosphereController(this);

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

    this.moveTimer = 0;
    this.MAX_MOVE_TIME = 15000; 

    this.turnStartScores = { [TeamId.LEFT]: 0, [TeamId.RIGHT]: 0 }; 

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
    
    this.matchStats.startTime = Date.now();
    this.matchStats[TeamId.LEFT] = { shots: 0, skills: {} };
    this.matchStats[TeamId.RIGHT] = { shots: 0, skills: {} };

    this.aiChatCtrl.init(this.gameMode);
    this.atmosphereCtrl.reset();

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
    // [修改] 传递 this 给 GameRules 构造函数
    this.rules = new GameRules(this.physics, this);
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
        if (!this.isGameOver && this.container && !this.container.destroyed) {
            let startText = "游戏开始";
            if (this.gameMode === 'pve') {
                startText = `第 ${this.currentLevel} 关 开始`;
            }
            this.goalBanner?.play(startText);
            AudioManager.playBGM('crowd_bg_loop'); 
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
        aiInfo: this.aiChatCtrl.getPersona() 
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

    this.aiChatCtrl.createUI(this.hud);

    this.goalBanner = new GoalBanner();
    this.layout.layers.ui.addChild(this.goalBanner);

    const leaveBtn = new LeaveButton(this.app, this.layout.layers.ui, () => {
        this.onMenuBtnClick();
    });
    this.layout.layers.ui.addChild(leaveBtn);

    const formationBtn = new FormationButton(this.app, this.layout.layers.ui, () => {
        this.openIngameFormation();
    });
    this.layout.layers.ui.addChild(formationBtn);

    this.sparkSystem = new SparkSystem();
    this.layout.layers.game.addChild(this.sparkSystem);
    
    this.turnMgr.resetTimer();
  }

  openIngameFormation() {
      let mode = 'single_online'; 
      if (this.gameMode === 'pvp_local') {
          mode = 'dual'; 
      }

      const dialog = new FormationSelectionDialog(
          mode, 
          (p1Id, p2Id) => {
              this.onFormationChanged(p1Id, p2Id);
          }, 
          () => {}, 
          "下一局生效" 
      );
      this.layout.layers.ui.addChild(dialog);
  }

  onFormationChanged(p1Id, p2Id) {
      if (this.gameMode === 'pvp_local') {
          this.p1FormationId = p1Id;
          this.p2FormationId = p2Id;
          Platform.showToast("阵型已调整，进球后生效");
      } else {
          if (this.myTeamId === TeamId.LEFT) {
              this.p1FormationId = p1Id;
          } else {
              this.p2FormationId = p1Id; 
          }
          
          AccountMgr.updateFormation(p1Id); 
          Platform.showToast("阵型已调整，进球后生效");

          if (this.gameMode === 'pvp_online' && this.networkCtrl) {
              this.networkCtrl.sendFormationUpdate(p1Id);
          }
      }
  }

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
      // 快速重置动画
      const duration = 500; 

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
        s.destroy(); 
    });
    this.strikers = [];
    if (this.ball) { 
        Matter.World.remove(this.physics.engine.world, this.ball.body); 
        this.layout.layers.game.removeChild(this.ball.view);
        this.ball.destroy(); 
        this.ball = null; 
    }
  }

  onPlaySound(key) {
      if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn !== this.myTeamId) {
          // 在 PVP Online 模式下，Receiver 的音效由 replay event 触发
          return;
      }
      AudioManager.playSFX(key);

      if (key === 'hit_post') {
          this.aiChatCtrl.onPlayerMiss();
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
    
    this.atmosphereCtrl.onTurnStart();

    if (!isRemote) {
        this.recordShot(this.turnMgr.currentTurn);
    }
    this.turnMgr.timer = 0; 
    this.turnStartScores = { ...this.rules.score };
  }

  onGoal(data) {
    // 1. 如果是网络对战，委托给 NetworkCtrl 处理权威逻辑
    if (this.networkCtrl) {
        // 如果我是发送方，NetworkCtrl 会返回 false -> 继续执行 UI
        // 如果我是接收方，NetworkCtrl 会返回 true (理论上不应触发) -> 中断
        const handled = this.networkCtrl.handleLocalGoal(data);
        if (handled) return; 
    }
    
    this.atmosphereCtrl.onGoal();

    this.aiChatCtrl.onGoal(
        data.scoreTeam, 
        this.turnStartScores, 
        this.rules.score,
        this.moveTimer / 1000 
    );

    // 2. 播放 UI 特效
    this._playGoalEffectsOnly(data.newScore, data.scoreTeam);

    // 3. 非网络模式下的自动重置逻辑 (PVE / Local)
    if (!this.networkCtrl) {
        setTimeout(() => {
            if (!this.isGameOver && this.physics && this.physics.engine) {
                this.setupFormation();
                if (data.scoreTeam !== undefined) {
                    const nextTurn = data.scoreTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
                    this.turnMgr.currentTurn = nextTurn;
                    this.turnMgr.resetTimer();
                }
                this.isMoving = false;
            }
        }, 2000);
    }
  }

  // [修改] 只处理视觉效果，不涉及逻辑重置
  _playGoalEffectsOnly(newScore, scoreTeam) {
    AudioManager.playSFX('goal');
    this.hud?.updateScore(newScore[TeamId.LEFT], newScore[TeamId.RIGHT]);
    this.goalBanner?.play("进球！"); 
    Platform.vibrateShort();
    
    // 不要立即停止球的物理效果
    if (this.ball) {
        this.ball.setLightningMode(false);
        this.ball.resetStates(); 
    }
  }

  onGameOver(data) {
    this.isGameOver = true;
    this.matchStats.endTime = Date.now(); 

    this.aiChatCtrl.onGameOver(data.winner);

    AudioManager.playSFX(data.winner !== -1 && data.winner === this.myTeamId ? 'win' : 'goal');

    if (this.gameMode === 'pvp_online') {
        NetworkMgr.send({ type: NetMsg.GAME_OVER });
    }

    setTimeout(() => {
        const roomId = Platform.getStorage('last_room_id');
        
        // [修改] 获取 AI 信息传递给结算页
        const aiPersona = this.gameMode === 'pve' ? this.aiChatCtrl.getPersona() : null;

        SceneManager.changeScene(ResultScene, {
            winner: data.winner,
            gameMode: this.gameMode,
            currentLevel: this.currentLevel,
            score: this.rules.score,
            stats: this.matchStats,
            players: this.players,
            myTeamId: this.myTeamId,
            roomId: roomId,
            aiInfo: aiPersona // [新增] 传递 AI 信息
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

    // [修改] 传递 delta 时间给 AI Chat 控制器
    this.aiChatCtrl.update(delta);
    this.atmosphereCtrl.update();
  }

  _saveEntityStates() {
      this.strikers.forEach(s => s.saveRenderState());
      if (this.ball) this.ball.saveRenderState();
  }

  _fixedUpdate(dt) {
    const isPvpOnline = this.gameMode === 'pvp_online';
    const isMyTurn = this.turnMgr.currentTurn === this.myTeamId;
    
    // [核心修改] 严格的权限分离
    // 1. 物理引擎：仅 Sender 和 单机模式 运行
    if (!isPvpOnline || isMyTurn) {
        this.physics.update(dt);
    }

    // 2. 回合管理：仅 Sender 和 单机模式 运行 (AI触发、倒计时)
    // Receiver 的 Turn 由网络消息驱动
    if (!isPvpOnline || isMyTurn) {
        this.turnMgr.update(dt);
    }
    
    // 3. 网络控制器：负责录制或回放
    if (this.networkCtrl) {
        this.networkCtrl.update(dt);
    }

    if (this.repositionAnimations.length > 0) {
        this._updateRepositionAnims(dt);
    }

    if (this.isMoving) {
        this.moveTimer += dt;
        // 超时保护 (Sender 负责)
        if (this.moveTimer > this.MAX_MOVE_TIME && (!isPvpOnline || isMyTurn)) {
            console.log("Turn timed out, forcing end.");
            this._forceFreezeAll(); 
            this._endTurn();
            return;
        }

        // [核心修改] 
        // 只有 Sender 有权检测物理静止并结束回合
        // Receiver 必须等待 TURN_SYNC 事件来结束 isMoving
        if (!isPvpOnline || isMyTurn) {
            const isPhysicsSleeping = this.physics.isSleeping();
            const isAnimFinished = this.repositionAnimations.length === 0;
            // 只有当没有正在等待重置的进球时，才正常检测静止
            const isWaitingReset = this.networkCtrl && this.networkCtrl.isWaitingForGoalReset;

            if (isPhysicsSleeping && isAnimFinished && !isWaitingReset) {
                 this._endTurn();
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
      if (!this.isMoving && !force) return;

      // [新增] 回合结束前执行公平竞赛检查 (防堵门)
      // 只有拥有权威的一方 (Local / Sender) 才执行检测
      const isOnline = this.gameMode === 'pvp_online';
      const isMyTurn = this.turnMgr.currentTurn === this.myTeamId;
      
      if ((!isOnline || isMyTurn) && this._enforceFairPlay()) {
          // 如果检测到有棋子需要移出球门，则添加了 reposition 动画
          // 此时我们不结束 isMoving 状态，让动画播放完
          // 因为 isMoving 为 true，Sender 会继续发送物理帧 (即动画过程) 给 Receiver
          // Receiver 看起来就像是在播放一段正常的物理移动
          return;
      }

      this.atmosphereCtrl.onTurnEnd();

      if (this.gameMode === 'pve' && 
          this.turnMgr.currentTurn === TeamId.LEFT &&
          this.turnStartScores[TeamId.LEFT] === this.rules.score[TeamId.LEFT]) {
          
          if (Math.random() < 0.3) {
              this.aiChatCtrl.onPlayerBadMove();
          }
      }

      this.isMoving = false;
      this.moveTimer = 0; 
      
      if (this.ball) {
          this.ball.setLightningMode(false);
          this.ball.resetStates(); 
      }

      // 如果是 Sender，通知网络
      if (this.networkCtrl && this.turnMgr.currentTurn === this.myTeamId) {
          this.networkCtrl.syncAllPositions();
      }

      // 如果是单机，切换本地 Turn
      if (!this.networkCtrl) {
          this.turnMgr.switchTurn();
      } else {
          // 网络模式下，Turn 切换由 syncAllPositions (TURN_SYNC) 触发，
          // 但为了即时响应，Sender 在这里也可以预先切换，保持一致
          if (this.turnMgr.currentTurn === this.myTeamId) {
              this.turnMgr.switchTurn();
              this.turnMgr.resetTimer();
          }
      }
  }

  // [新增] 检查是否有棋子滞留在球门内，并生成移出动画
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
          // 仅当没有等待进球重置时，才结束 Move (对于 Reset 后的自动结束逻辑，由 _executeRemoteTurnSync 负责)
          if (this.isMoving && (!this.networkCtrl || !this.networkCtrl.isWaitingForGoalReset)) {
              this._endTurn();
          }
      }
  }

  onExit() {
      Platform.hideGameAds();
      AudioManager.stopBGM();
      
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

      super.onExit();
  }
}
