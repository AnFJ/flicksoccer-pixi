
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

import GameMenuButton from '../ui/GameMenuButton.js';
import GameHUD from '../ui/GameHUD.js';
import GoalBanner from '../ui/GoalBanner.js';
import SparkSystem from '../vfx/SparkSystem.js';
import MenuScene from './MenuScene.js';
import LobbyScene from './LobbyScene.js';
import Button from '../ui/Button.js'; 

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

    this.skillBtns = {};

    this.accumulator = 0;
    this.fixedTimeStep = 1000 / 60; 
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    
    if (this.gameMode === 'pvp_online') {
        const me = params.players.find(p => p.id === AccountMgr.userInfo.id);
        if (me) this.myTeamId = me.teamId;
        this.networkCtrl = new OnlineMatchController(this);
    } else {
        this.myTeamId = TeamId.LEFT;
    }

    this.isLoading = false;
    this.initGame(params);
  }

  initGame(params) {
    this.physics.init();
    this.layout.init();
    this.input.init();
    this.turnMgr.init(this.gameMode, params.startTurn);
    
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
  }

  _createUI() {
    this.hud = new GameHUD(this.gameMode);
    this.layout.layers.ui.addChild(this.hud);

    this.goalBanner = new GoalBanner();
    this.layout.layers.ui.addChild(this.goalBanner);

    const menuBtn = new GameMenuButton(this.app, this.layout.layers.ui, () => {
        this.onMenuBtnClick();
    });
    this.layout.layers.ui.addChild(menuBtn);

    this._createSkillButtons();

    this.sparkSystem = new SparkSystem();
    this.layout.layers.game.addChild(this.sparkSystem);
    
    this.turnMgr.resetTimer();
  }

  _createSkillButtons() {
      const btnSize = 100;
      const gap = 20;
      // [修复] 修正起始坐标，因为 Button 锚点在左上角 (0,0)，之前减去 btnSize/2 会导致右下角溢出屏幕
      const startX = GameConfig.designWidth - btnSize - 60;
      const startY = GameConfig.designHeight - btnSize - 60;

      const skills = [
          { type: SkillType.UNSTOPPABLE, label: '无敌\n战车', color: 0xe74c3c },
          { type: SkillType.SUPER_FORCE, label: '大力\n水手', color: 0x3498db },
          { type: SkillType.SUPER_AIM,   label: '超距\n瞄准', color: 0x9b59b6 },
      ];

      skills.forEach((skill, index) => {
          const btn = new Button({
              text: skill.label,
              width: btnSize,
              height: btnSize,
              color: skill.color,
              fontSize: 24,
              onClick: () => {
                  this.skillMgr.toggleSkill(skill.type);
              }
          });
          
          btn.position.set(startX - index * (btnSize + gap), startY);
          
          const highlight = new PIXI.Graphics();
          highlight.lineStyle(6, 0xFFFF00);
          highlight.drawRoundedRect(0, 0, btnSize, btnSize, 20);
          // [修复] 移除 highlight.position.set(-btnSize/2, -btnSize/2); 
          // 按钮和高亮框都是从 (0,0) 开始绘制的，不需要偏移
          highlight.visible = false;
          btn.addChild(highlight);
          btn.highlight = highlight;

          this.skillBtns[skill.type] = btn;
          this.layout.layers.ui.addChild(btn);
      });
  }

  _setupEvents() {
    EventBus.on(Events.GOAL_SCORED, this.onGoal, this);
    EventBus.on(Events.GAME_OVER, this.onGameOver, this);
    EventBus.on(Events.COLLISION_HIT, (data) => this.sparkSystem?.emit(data.x, data.y, data.intensity), this);
    EventBus.on(Events.SKILL_ACTIVATED, this.onSkillStateChange, this);
  }

  setupFormation() {
    this._clearEntities();
    const { x, y, w, h } = this.layout.fieldRect;
    const cx = x + w/2, cy = y + h/2;

    this.ball = new Ball(cx, cy);
    this._addEntity(this.ball);

    const r = GameConfig.dimensions.strikerDiameter / 2;
    const formation = [
        { x: -w * 0.45, y: 0 }, { x: -w * 0.30, y: -h * 0.15 }, { x: -w * 0.30, y: h * 0.15 },
        { x: -w * 0.12, y: -h * 0.20 }, { x: -w * 0.12, y: h * 0.20 }
    ];

    formation.forEach((pos, i) => {
        const sL = new Striker(cx + pos.x, cy + pos.y, r, TeamId.LEFT);
        sL.id = `left_${i}`;
        this.strikers.push(sL); this._addEntity(sL);

        const sR = new Striker(cx - pos.x, cy + pos.y, r, TeamId.RIGHT);
        sR.id = `right_${i}`;
        this.strikers.push(sR); this._addEntity(sR);
    });
  }

  _addEntity(entity) {
    this.layout.layers.game.addChild(entity.view);
    this.physics.add(entity.body);
  }

  _clearEntities() {
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

  onSkillStateChange(data) {
      const { type, active, teamId } = data;
      
      if (teamId === this.myTeamId && this.skillBtns[type]) {
          this.skillBtns[type].highlight.visible = active;
          this.skillBtns[type].alpha = active ? 1.0 : 0.8; 
      }

      if (teamId !== this.myTeamId && active) {
          let skillName = "";
          if (type === SkillType.SUPER_FORCE) skillName = "大力水手";
          if (type === SkillType.UNSTOPPABLE) skillName = "无敌战车";
          if (skillName) {
              Platform.showToast(`对方开启了 ${skillName} !`);
          }
      }
  }

  onMenuBtnClick() {
      if (this.gameMode === 'pvp_online' && !this.isGameOver) {
          NetworkMgr.send({ type: NetMsg.LEAVE });
          NetworkMgr.close(); 
      }
      SceneManager.changeScene(MenuScene);
  }

  onActionFired() {
    this.isMoving = true;
    AudioManager.playSFX('collision');
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
    
    setTimeout(() => { if (!this.isGameOver) this.setupFormation(); }, 2000);
  }

  onGameOver(data) {
    this.isGameOver = true;
    if (data.winner !== -1) {
        const isWinner = (this.myTeamId === data.winner);
        const economyConfig = GameConfig.gameplay.economy;

        if (this.gameMode === 'pve' || this.gameMode === 'pvp_online') {
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
        SceneManager.changeScene(this.gameMode === 'pvp_online' ? LobbyScene : MenuScene);
    }, 3000);
  }

  update(delta) {
    if (this.isLoading || !this.physics.engine) return;
    if (this.isGamePaused) return;

    this.goalBanner?.update(delta);
    this.sparkSystem?.update(delta);
    this._updateStrikerHighlights(); 

    this.accumulator += delta;
    if (this.accumulator > 100) this.accumulator = 100;

    while (this.accumulator >= this.fixedTimeStep) {
        this._fixedUpdate(this.fixedTimeStep);
        this.accumulator -= this.fixedTimeStep;
    }

    this.strikers.forEach(s => s.update());
    this.ball?.update();
  }

  _fixedUpdate(dt) {
    this.physics.update(dt);
    this.turnMgr.update(dt);
    if (this.networkCtrl) this.networkCtrl.update(dt);

    if (this.repositionAnimations.length > 0) {
        this._updateRepositionAnims(dt);
    }

    const isPhysicsSleeping = this.physics.isSleeping();
    const isAnimFinished = this.repositionAnimations.length === 0;

    if (this.isMoving) {
        if (isPhysicsSleeping) {
            if (isAnimFinished) {
                const isAuthority = !this.networkCtrl || this.turnMgr.currentTurn === this.myTeamId;
                if (isAuthority) {
                    const startedAnyAnim = this._enforceFairPlay();
                    if (!startedAnyAnim) {
                        this._endTurn();
                    }
                }
            }
        }
    }
  }
  
  _endTurn() {
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
    EventBus.off(Events.GOAL_SCORED, this);
    EventBus.off(Events.GAME_OVER, this);
    EventBus.off(Events.COLLISION_HIT, this);
    EventBus.off(Events.SKILL_ACTIVATED, this); 
    if (this.networkCtrl) {
        this.networkCtrl.destroy();
        this.networkCtrl = null;
    }
    this.turnMgr.clear();
    this.physics.clear();
  }
}
