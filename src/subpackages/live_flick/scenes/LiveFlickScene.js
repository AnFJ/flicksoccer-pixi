import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import BaseScene from '../../../scenes/BaseScene.js';
import SceneManager from '../../../managers/SceneManager.js';
import PhysicsEngine from '../../../core/PhysicsEngine.js';
import Ball from '../../../entities/Ball.js';
import EventBus from '../../../managers/EventBus.js';
import AudioManager from '../../../managers/AudioManager.js';
import Platform from '../../../managers/Platform.js';
import AccountMgr from '../../../managers/AccountMgr.js';
import { GameConfig } from '../../../config.js';
import { TeamId, Events, SkillType } from '../../../constants.js';
import { getFormation } from '../../../config/FormationConfig.js'; 

import LeaveButton from '../../../ui/LeaveButton.js';
import GameHUD from '../../../ui/GameHUD.js';
import GoalBanner from '../../../ui/GoalBanner.js';
import SparkSystem from '../../../vfx/SparkSystem.js';
import MenuScene from '../../../scenes/MenuScene.js';
import ResultScene from '../../../scenes/ResultScene.js'; 

import GameLayout from '../../../core/GameLayout.js';
import SkillManager from '../../../core/SkillManager.js'; 
import AtmosphereController from '../../../core/AtmosphereController.js';
import UserBehaviorMgr from '../../../managers/UserBehaviorMgr.js';

import LiveStriker from '../entities/LiveStriker.js';
import LiveFlickInput from '../core/LiveFlickInput.js';
import LiveFlickAI from '../core/LiveFlickAI.js';
import LiveFlickRules from '../core/LiveFlickRules.js';

export default class LiveFlickScene extends BaseScene {
  constructor() {
    super();
    this.physics = new PhysicsEngine();
    
    this.layout = new GameLayout(this);
    this.input = new LiveFlickInput(this);
    this.skillMgr = new SkillManager(this);
    this.aiCtrl = new LiveFlickAI(this);
    this.atmosphereCtrl = new AtmosphereController(this);

    this.gameMode = 'live_flick'; 
    this.currentLevel = 1; 
    this.strikers = [];
    this.ball = null;
    this.isGameOver = false;
    this.isLoading = true; 
    this.isGamePaused = false; 
    this.myTeamId = TeamId.LEFT;

    this.hud = null;
    this.goalBanner = null;
    this.sparkSystem = null;
    this.repositionAnimations = [];

    this.accumulator = 0;
    this.fixedTimeStep = 1000 / 60; 

    this.activeTheme = { striker: 1, field: 1, ball: 1 };
    
    this.p1FormationId = 0;
    this.p2FormationId = 0; 

    this.matchStats = {
        startTime: 0,
        endTime: 0,
        [TeamId.LEFT]: { shots: 0, skills: {} },
        [TeamId.RIGHT]: { shots: 0, skills: {} }
    };
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.currentLevel = params.level || 1; 
    
    this.matchStats.startTime = Date.now();
    this.matchStats[TeamId.LEFT] = { shots: 0, skills: {} };
    this.matchStats[TeamId.RIGHT] = { shots: 0, skills: {} };

    this.atmosphereCtrl.reset();
    this.myTeamId = TeamId.LEFT;
    
    this.isLoading = false; 
    this.initGame(params, true); 
  }

  initGame(params, showAd = false) {
    this.activeTheme = AccountMgr.userInfo.theme || { striker: 1, field: 1, ball: 1 };

    this.physics.init();
    this.layout.init(this.activeTheme.field);
    this.input.init();
    this.aiCtrl.init(this.currentLevel);
    
    this.rules = new LiveFlickRules(this.physics, this);
    this.setupFormation();
    this._createUI();
    this._setupEvents();

    this.isGameOver = false;
    this.isGamePaused = false;
    this.accumulator = 0;

    const startGameFlow = () => {
        if (this.isGameOver || (this.container && this.container.destroyed)) return;
        this.isLoading = false;
        
        // [修改] 先让游戏运行一小会儿 (100ms)，确保棋子和画面完全渲染出来
        // 然后再暂停并播放开场条幅
        setTimeout(() => {
            if (this.isGameOver) return;
            
            this.isGamePaused = true;
            
            UserBehaviorMgr.log('GAME', '实况弹指开始', { level: this.currentLevel });
            this.goalBanner?.play("游戏开始");
            AudioManager.playBGM('crowd_bg_loop'); 

            // [新增] 更新 HUD 提示
            if (this.hud && this.hud.turnText) {
                this.hud.turnText.text = "准备开始...";
                this.hud.turnText.style.fill = 0xffffff;
            }

            if (this.layout && this.layout.adBoards && this.layout.adBoards.length > 0) {
                Platform.showGameAds(this.layout.adBoards);
            }

            // [新增] 等待条幅动画结束 (约2.6秒) 后开始
            setTimeout(() => {
                if (this.isGameOver) return;
                this.isGamePaused = false;
                if (this.hud && this.hud.turnText) {
                    this.hud.turnText.text = "比赛进行中";
                    this.hud.turnText.style.fill = 0x00FF00; // 绿色
                }
            }, 2600);
        }, 100);
    };

    if (showAd) {
        this.isLoading = true; 
        const adConfig = GameConfig.adConfig[Platform.env];
        const adUnitId = adConfig && adConfig.interstitial ? adConfig.interstitial.before_game : null;

        Platform.showInterstitialAd(adUnitId).then(() => {
            setTimeout(() => {
                startGameFlow();
            }, 200);
        });
    } else {
        setTimeout(() => {
            startGameFlow();
        }, 500);
    }
  }

  _createUI() {
    const extraData = {
        currentLevel: this.currentLevel,
        players: [],
        aiInfo: { name: "Live AI", avatar: '' } 
    };

    this.hud = new GameHUD(
        'pve', 
        this.myTeamId, 
        (skillType, teamId) => {
            this.skillMgr.toggleSkill(skillType);
        },
        extraData 
    );
    this.layout.layers.ui.addChild(this.hud);

    this.goalBanner = new GoalBanner();
    this.layout.layers.ui.addChild(this.goalBanner);

    const leaveBtn = new LeaveButton(this.app, this.layout.layers.ui, () => {
        this.onMenuBtnClick();
    });
    this.layout.layers.ui.addChild(leaveBtn);

    this.sparkSystem = new SparkSystem();
    this.layout.layers.game.addChild(this.sparkSystem);
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
        const s = new LiveStriker(px, py, r, TeamId.LEFT, this.activeTheme.striker);
        s.id = `left_${i}`;
        this.strikers.push(s); this._addEntity(s);
    });

    fmtRight.positions.forEach((pos, i) => {
        const px = cx - pos.x * w; 
        const py = cy + pos.y * h; 
        const s = new LiveStriker(px, py, r, TeamId.RIGHT, this.activeTheme.striker);
        s.id = `right_${i}`;
        this.strikers.push(s); this._addEntity(s);
    });
  }

  _animateReset() {
      const { x, y, w, h } = this.layout.fieldRect;
      const cx = x + w/2, cy = y + h/2;
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
      AudioManager.playSFX(key);
  }

  onSkillStateChange(data) {
      const { type, active, teamId } = data;
      if (this.hud) {
          this.hud.updateSkillState(teamId, type, active);
      }
  }

  onItemUpdate(data) {
      const { itemId, count } = data;
      if (this.hud) {
          this.hud.updateItemCount(this.myTeamId, itemId, count);
      }
  }

  onMenuBtnClick() {
      if (!this.isGameOver) {
          UserBehaviorMgr.log('GAME', '中途退出实况弹指');
      }
      SceneManager.changeScene(MenuScene);
  }

  onActionFired(teamId) {
    this.atmosphereCtrl.onTurnStart();
    if (this.matchStats[teamId]) {
        this.matchStats[teamId].shots++;
    }
  }

  onGoal(data) {
    this.atmosphereCtrl.onGoal();
    this._playGoalEffectsOnly(data.newScore, data.scoreTeam);

    // [新增] 进球后暂停游戏，等待条幅动画
    this.isGamePaused = true;
    if (this.hud && this.hud.turnText) {
        this.hud.turnText.text = "进球回放...";
        this.hud.turnText.style.fill = 0xffffff;
    }

    setTimeout(() => {
        if (!this.isGameOver && this.physics && this.physics.engine) {
            this.setupFormation();
            
            // [新增] 重置阵型动画结束后恢复游戏 (动画约500ms)
            setTimeout(() => {
                if (this.isGameOver) return;
                this.isGamePaused = false;
                if (this.hud && this.hud.turnText) {
                    this.hud.turnText.text = "比赛进行中";
                    this.hud.turnText.style.fill = 0x00FF00;
                }
            }, 600);
        }
    }, 2600); // 等待条幅动画结束 (约2.6秒)
  }

  _playGoalEffectsOnly(newScore, scoreTeam) {
    AudioManager.playSFX('goal');
    this.hud?.updateScore(newScore[TeamId.LEFT], newScore[TeamId.RIGHT]);
    this.goalBanner?.play("进球！"); 
    Platform.vibrateShort();
    
    if (this.ball) {
        this.ball.setLightningMode(false);
        this.ball.resetStates(); 
    }
  }

  onGameOver(data) {
    this.isGameOver = true;
    this.matchStats.endTime = Date.now(); 
    
    // [新增] 游戏结束时隐藏广告
    Platform.hideGameAds();
    
    UserBehaviorMgr.log('GAME', '实况弹指结束', { 
        winner: data.winner, 
        myTeam: this.myTeamId,
        score: this.rules.score,
        duration: (this.matchStats.endTime - this.matchStats.startTime) / 1000
    });

    AudioManager.playSFX(data.winner !== -1 && data.winner === this.myTeamId ? 'win' : 'goal');

    setTimeout(() => {
        SceneManager.changeScene(ResultScene, {
            winner: data.winner,
            gameMode: this.gameMode,
            currentLevel: this.currentLevel,
            score: this.rules.score,
            stats: this.matchStats,
            players: [],
            myTeamId: this.myTeamId,
            roomId: null,
            aiInfo: null 
        });
    }, 2000);
  }

  update(delta) {
    if (this.isLoading || !this.physics.engine) return;

    // [修复] UI 动画必须在暂停时也能更新，否则条幅会卡住
    this.goalBanner?.update(delta);
    this.sparkSystem?.update(delta);

    if (this.isGamePaused) {
        // [新增] 暂停时也更新棋子的视觉效果 (如进度环、呼吸灯)，确保画面不缺失
        this.strikers.forEach(s => s.drawProgressRing(delta));
        return;
    }

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

    this.aiCtrl.update(delta);
    this.atmosphereCtrl.update();
  }

  _updateStrikerHighlights() {
      // No turn highlights in Live Flick
  }

  _saveEntityStates() {
      this.strikers.forEach(s => s.saveRenderState());
      if (this.ball) this.ball.saveRenderState();
  }

  _fixedUpdate(deltaMs) {
      if (this.repositionAnimations.length > 0) {
          this._updateRepositionAnimations(deltaMs);
      }
      this.physics.update(deltaMs);
  }

  _updateRepositionAnimations(deltaMs) {
      for (let i = this.repositionAnimations.length - 1; i >= 0; i--) {
          const anim = this.repositionAnimations[i];
          anim.time += deltaMs;
          const t = Math.min(anim.time / anim.duration, 1);
          
          const easeT = 1 - Math.pow(1 - t, 3);
          
          const newX = anim.start.x + (anim.end.x - anim.start.x) * easeT;
          const newY = anim.start.y + (anim.end.y - anim.start.y) * easeT;
          
          Matter.Body.setPosition(anim.body, { x: newX, y: newY });
          Matter.Body.setVelocity(anim.body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(anim.body, 0);

          if (t >= 1) {
              anim.body.isSensor = false;
              this.repositionAnimations.splice(i, 1);
          }
      }
  }

  _forceFreezeAll() {
      if (this.ball) {
          Matter.Body.setVelocity(this.ball.body, {x:0, y:0});
          Matter.Body.setAngularVelocity(this.ball.body, 0);
      }
      this.strikers.forEach(s => {
          Matter.Body.setVelocity(s.body, {x:0, y:0});
          Matter.Body.setAngularVelocity(s.body, 0);
      });
  }

  onDestroy() {
    // [新增] 销毁时隐藏广告
    Platform.hideGameAds();
    
    EventBus.off(Events.GOAL_SCORED, this.onGoal, this);
    EventBus.off(Events.GAME_OVER, this.onGameOver, this);
    EventBus.off(Events.COLLISION_HIT, null, this);
    EventBus.off(Events.PLAY_SOUND, this.onPlaySound, this);
    EventBus.off(Events.SKILL_ACTIVATED, this.onSkillStateChange, this);
    EventBus.off(Events.ITEM_UPDATE, this.onItemUpdate, this);

    this._clearEntities();
    if (this.rules) this.rules.destroy();
    if (this.physics) this.physics.destroy();

    super.onDestroy();
  }
}
