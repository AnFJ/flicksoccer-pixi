
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
import { getFormation } from '../config/FormationConfig.js'; // [新增]

import GameMenuButton from '../ui/GameMenuButton.js';
import GameHUD from '../ui/GameHUD.js';
import GoalBanner from '../ui/GoalBanner.js';
import SparkSystem from '../vfx/SparkSystem.js';
import MenuScene from './MenuScene.js';
import LobbyScene from './LobbyScene.js';
import LevelSelectScene from './LevelSelectScene.js'; 
import Button from '../ui/Button.js'; 
import FormationSelectionDialog from '../ui/FormationSelectionDialog.js'; // [新增]

import GameLayout from '../core/GameLayout.js';
import InputController from '../core/InputController.js';
import TurnManager from '../core/TurnManager.js';
import OnlineMatchController from '../core/OnlineMatchController.js';
import SkillManager from '../core/SkillManager.js'; 

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

    this.hud = null;
    this.goalBanner = null;
    this.sparkSystem = null;
    this.repositionAnimations = [];
    this.players = []; 

    this.accumulator = 0;
    this.fixedTimeStep = 1000 / 60; 

    this.activeTheme = { striker: 1, field: 1, ball: 1 };
    
    // [新增] 阵型ID
    this.p1FormationId = 0;
    this.p2FormationId = 0; // PVE AI default or PVP P2

    this.resetTimerId = null; // 用于存储进球后重置的定时器ID
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    this.currentLevel = params.level || 1; 
    
    if (this.gameMode === 'pvp_online') {
        this.players = params.players || []; 
        const me = this.players.find(p => p.id === AccountMgr.userInfo.id);
        if (me) this.myTeamId = me.teamId;
        
        // [新增] 从玩家数据中读取阵型ID
        const p1 = this.players.find(p => p.teamId === TeamId.LEFT);
        const p2 = this.players.find(p => p.teamId === TeamId.RIGHT);
        this.p1FormationId = p1 ? (p1.formationId || 0) : 0;
        this.p2FormationId = p2 ? (p2.formationId || 0) : 0;

        this.networkCtrl = new OnlineMatchController(this);
        
        // Online 直接开始，不需要弹窗
        this.isLoading = false;
        this.initGame(params);

    } else {
        this.myTeamId = TeamId.LEFT;
        this.isLoading = false; // 先解除 Loading，准备显示弹窗

        // [新增] 本地模式需要先选择阵型
        this.showFormationSelection(params);
    }
  }

  showFormationSelection(params) {
      let mode = 'single';
      if (this.gameMode === 'pvp_local') mode = 'dual';

      const dialog = new FormationSelectionDialog(mode, (p1Id, p2Id) => {
          this.p1FormationId = p1Id;
          // PVE 模式下，p2Id 是 AI 的阵型，这里暂且保持默认 0，或者根据关卡配置读取
          // 如果是本地 PVP，使用传入的 p2Id
          if (this.gameMode === 'pvp_local') {
              this.p2FormationId = p2Id;
          } else {
              // PVE AI 阵型，暂时默认0，未来可在 LevelConfig 配置
              this.p2FormationId = 0;
          }

          // 确认后开始初始化游戏
          this.initGame(params);
      }, () => {
          // 取消则返回菜单
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
    this.setupFormation(); // 使用新逻辑
    this._createUI();
    this._setupEvents();

    this.isGameOver = false;
    this.isGamePaused = false;
    
    this.accumulator = 0;

    if (params.snapshot && this.networkCtrl) {
        this.networkCtrl.restoreState(params.snapshot);
    }

    if (this.gameMode === 'pve') {
        Platform.showToast(`第 ${this.currentLevel} 关 开始!`);
    }

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
        players: this.gameMode === 'pvp_online' ? this.players : []
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

  setupFormation() {
    this._clearEntities();
    const { x, y, w, h } = this.layout.fieldRect;
    const cx = x + w/2, cy = y + h/2;

    this.ball = new Ball(cx, cy, this.activeTheme.ball);
    this._addEntity(this.ball);

    const r = GameConfig.dimensions.strikerDiameter / 2;

    // [修改] 使用 FormationConfig 获取坐标
    const fmtLeft = getFormation(this.p1FormationId);
    const fmtRight = getFormation(this.p2FormationId);

    // 左方 (P1)
    fmtLeft.positions.forEach((pos, i) => {
        // config.x 是相对半场宽度的比例 (-0.5 ~ 0)
        // config.y 是相对半场高度的比例 (-0.5 ~ 0.5)
        // 实际坐标：cx + (pos.x * w), cy + (pos.y * h)
        // 左方在左侧，pos.x 本身就是负数，直接加即可
        const px = cx + pos.x * w; 
        const py = cy + pos.y * h;
        
        const s = new Striker(px, py, r, TeamId.LEFT, this.activeTheme.striker);
        s.id = `left_${i}`;
        this.strikers.push(s); this._addEntity(s);
    });

    // 右方 (P2/AI) - 需要镜像
    fmtRight.positions.forEach((pos, i) => {
        // 镜像：x 取反
        const px = cx - pos.x * w; 
        const py = cy + pos.y * h; // y 保持或取反皆可，通常对称即可
        
        const s = new Striker(px, py, r, TeamId.RIGHT, this.activeTheme.striker);
        s.id = `right_${i}`;
        this.strikers.push(s); this._addEntity(s);
    });
  }

  _addEntity(entity) {
    this.layout.layers.game.addChild(entity.view);
    this.physics.add(entity.body);
  }

  _clearEntities() {
    // 增加空指针保护，防止物理引擎已销毁时报错
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
    if (!isRemote) {
        AudioManager.playSFX('collision'); 
    }
    this.turnMgr.timer = 0; 
  }

  onGoal(data) {
    if (this.networkCtrl) {
        const handled = this.networkCtrl.handleLocalGoal(data);
        if (handled) return; 
    }
    this._playGoalEffects(data.newScore);
  }

  _playGoalEffects(newScore) {
    AudioManager.playSFX('goal');
    this.hud?.updateScore(newScore[TeamId.LEFT], newScore[TeamId.RIGHT]);
    this.goalBanner?.play();
    Platform.vibrateShort();
    
    if (this.ball) {
        this.ball.setLightningMode(false);
        this.ball.skillStates.fire = false;
    }
    
    // 如果之前有 pending 的重置定时器，先清除
    if (this.resetTimerId) clearTimeout(this.resetTimerId);

    // 延迟重置
    this.resetTimerId = setTimeout(() => { 
        // 增加检查：场景未结束且物理引擎有效
        if (!this.isGameOver && this.physics && this.physics.engine) {
            this.setupFormation(); 
        }
    }, 2000);
  }

  onGameOver(data) {
    this.isGameOver = true;
    // 游戏结束时也要清除重置定时器，防止进球后刚好游戏结束导致重置
    if (this.resetTimerId) {
        clearTimeout(this.resetTimerId);
        this.resetTimerId = null;
    }

    if (data.winner !== -1) {
        const isWinner = (this.myTeamId === data.winner);
        const economyConfig = GameConfig.gameplay.economy;

        if (this.gameMode === 'pve') {
             if (isWinner) {
                 const reward = 50; 
                 AccountMgr.addCoins(reward, false);
                 
                 const isLevelUp = AccountMgr.completeLevel(this.currentLevel, false);
                 
                 AccountMgr.sync();

                 if (isLevelUp) {
                     Platform.showToast(`通关！解锁第 ${this.currentLevel + 1} 关！`);
                 } else {
                     Platform.showToast(`挑战成功！获得 ${reward} 金币`);
                 }
             } else {
                 Platform.showToast("挑战失败，请再接再厉");
             }
        } 
        else if (this.gameMode === 'pvp_online') {
            if (isWinner) {
                const reward = economyConfig.winReward;
                AccountMgr.addCoins(reward); 
                Platform.showToast(`胜利！获得 ${reward} 金币`);
            } else {
                const fee = economyConfig.entryFee;
                AccountMgr.consumeCoins(fee);
                Platform.showToast(`惜败！扣除 ${fee} 金币`);
            }
        }
        
        AudioManager.playSFX('win');
        if (this.gameMode === 'pvp_local') {
            Platform.showToast(`${data.winner === TeamId.LEFT ? "红方" : "蓝方"} 获胜!`);
        }
    }

    if (this.gameMode === 'pvp_online') {
        Platform.removeStorage('last_room_id');
    }

    setTimeout(() => {
        if (this.gameMode === 'pvp_online') NetworkMgr.close();
        
        if (this.gameMode === 'pve') {
            SceneManager.changeScene(LevelSelectScene);
        } else {
            SceneManager.changeScene(this.gameMode === 'pvp_online' ? LobbyScene : MenuScene);
        }
    }, 3000);
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
        this._fixedUpdate(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
    }

    this.strikers.forEach(s => s.update(delta));
    this.ball?.update(delta);
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
        if (!isPvpOnline || isMyTurn) {
            const isPhysicsSleeping = this.physics.isSleeping();
            const isAnimFinished = this.repositionAnimations.length === 0;

            if (isPhysicsSleeping && isAnimFinished) {
                 const startedAnyAnim = this._enforceFairPlay();
                 if (!startedAnyAnim) {
                     this._endTurn();
                 }
            }
        }
    }
  }
  
  _endTurn() {
      if (!this.isMoving) return;

      this.isMoving = false;
      
      if (this.ball) {
          this.ball.setLightningMode(false);
          this.ball.skillStates.fire = false;
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
          const isStriker = anim.body.label === 'Striker';
          if (isStriker && GameConfig.physics.strikerFixedRotation) {
              Matter.Body.setInertia(anim.body, Infinity);
          } else {
              const r = isStriker ? GameConfig.dimensions.strikerDiameter/2 : GameConfig.dimensions.ballDiameter/2;
              Matter.Body.setInertia(anim.body, (anim.body.mass * r * r) / 2);
          }
      });
      if (finishedAnims.length > 0 && this.repositionAnimations.length === 0) {
          this._endTurn();
      }
  }

  onExit() {
      super.onExit();
      // [新增] 离开游戏场景时清理广告
      Platform.hideGameAds();

      // [新增] 清除进球重置定时器
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
