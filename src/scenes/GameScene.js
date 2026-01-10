
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
    this.isGoalResetting = false;
    
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
    // [核心修改]
    // 如果是网络对战，且通过 GameRules 触发了进球（说明是本地检测到的）
    // 如果 NetworkCtrl 存在，则让 NetworkCtrl 判断是否是 Sender。
    // 如果是 Sender，handleLocalGoal 会返回 false -> 继续执行 UI 特效
    // 如果是 Receiver（理论上不会触发，但做防御），返回 true -> 中断本地执行
    if (this.networkCtrl) {
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

    this._playGoalEffects(data.newScore, data.scoreTeam);
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

    // [注意] 这里的重置计时器对 Sender 是有效的
    // 对 Receiver 而言，它可能在回放中已经处理了 TURN_SYNC，
    // 或者等待 Sender 发送的 TURN_SYNC 来触发重置。
    // 为了防止 Receiver 这里的定时器比网络消息先触发导致位置不一致，
    // 我们在 _fixedUpdate 中做了限制，Receiver 不会检查物理静止状态。
    // 此外，Receiver 的 _endTurn 是由网络消息驱动的，会覆盖这里的逻辑。
    
    this.resetTimerId = setTimeout(() => { 
        // 只有 Sender 或 本地模式 需要通过定时器自动进入下一回合
        // Receiver 应该等待 TURN_SYNC 消息来触发 _endTurn 
        // 但为了视觉连贯，先重置阵型是可以的，真正的 turnSwitch 由 _endTurn 控制
        if (!this.isGameOver && this.physics && this.physics.engine) {
            this.setupFormation(); 
            
            // 仅本地逻辑更新回合，网络模式下由 _endTurn 或 网络消息决定
            if (!this.networkCtrl) {
                if (scoreTeam !== undefined && scoreTeam !== null) {
                    const nextTurn = scoreTeam === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
                    this.turnMgr.currentTurn = nextTurn;
                    this.turnMgr.resetTimer();
                }
            }

            this.isGoalResetting = false;
            // 注意：isMoving 设为 false 会导致 InputController 重新启用
            // Receiver 最好保持 isMoving = true 直到 TURN_SYNC 真正到达
            if (!this.networkCtrl || this.turnMgr.currentTurn === this.myTeamId) {
                this.isMoving = false;
            }
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

    this.aiChatCtrl.onGameOver(data.winner);

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

    this.aiChatCtrl.update();
    this.atmosphereCtrl.update();
  }

  _saveEntityStates() {
      this.strikers.forEach(s => s.saveRenderState());
      if (this.ball) this.ball.saveRenderState();
  }

  _fixedUpdate(dt) {
    const isPvpOnline = this.gameMode === 'pvp_online';
    const isMyTurn = this.turnMgr.currentTurn === this.myTeamId;
    
    // [核心修改] 
    // 只有非联网模式(PVE/Local) 或者 联网模式下的发送方(Sender) 才执行物理模拟。
    // 接收方(Receiver) 的物体位置完全由 NetworkCtrl 里的回放逻辑控制 (this.networkCtrl.update)
    if (!isPvpOnline || isMyTurn) {
        this.physics.update(dt);
    } 

    // TurnMgr 也只在本地更新，Receiver 的 Turn 切换由消息控制
    if (!isPvpOnline || isMyTurn) {
        this.turnMgr.update(dt);
    }
    
    if (this.networkCtrl) {
        // NetworkCtrl 内部会根据是 Sender 还是 Receiver 执行不同的逻辑 (录制 vs 回放)
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

        // [核心修改] 
        // 只有 Sender 有权检测物理静止并结束回合
        // Receiver 必须等待 TURN_SYNC 事件
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
      if (!this.isMoving && !force) return;

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
      Platform.hideGameAds();
      if (this.resetTimerId) {
          clearTimeout(this.resetTimerId);
          this.resetTimerId = null;
      }

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
