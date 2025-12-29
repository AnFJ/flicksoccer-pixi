
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
import { TeamId, Events, NetMsg } from '../constants.js';

import GameMenuButton from '../ui/GameMenuButton.js';
import GameHUD from '../ui/GameHUD.js';
import GoalBanner from '../ui/GoalBanner.js';
import SparkSystem from '../vfx/SparkSystem.js';
import MenuScene from './MenuScene.js';
import LobbyScene from './LobbyScene.js';

// 引入子控制器
import GameLayout from '../core/GameLayout.js';
import InputController from '../core/InputController.js';
import TurnManager from '../core/TurnManager.js';

export default class GameScene extends BaseScene {
  constructor() {
    super();
    this.physics = new PhysicsEngine();
    
    this.layout = new GameLayout(this);
    this.input = new InputController(this);
    this.turnMgr = new TurnManager(this);
    
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
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    
    if (this.gameMode === 'pvp_online') {
        const me = params.players.find(p => p.id === AccountMgr.userInfo.id);
        if (me) this.myTeamId = me.teamId;
    }

    const loadingText = new PIXI.Text('球场维护中...', { fill: 0xffffff, fontSize: 30 }); 
    loadingText.anchor.set(0.5);
    loadingText.position.set(GameConfig.designWidth/2, GameConfig.designHeight/2);
    this.container.addChild(loadingText);

    await ResourceManager.loadAll();
    this.container.removeChild(loadingText);
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

    // --- 处理断线重连恢复 ---
    if (params.snapshot) {
        this.restoreState(params.snapshot);
    }
  }

  /**
   * 恢复游戏状态 (位置、分数)
   */
  restoreState(snapshot) {
      console.log('[GameScene] Restoring state...', snapshot);
      
      // 1. 恢复分数
      if (snapshot.scores) {
          this.rules.score = snapshot.scores;
          this.hud?.updateScore(snapshot.scores[TeamId.LEFT], snapshot.scores[TeamId.RIGHT]);
      }

      // 2. 恢复位置
      if (snapshot.positions && snapshot.positions.strikers) {
          snapshot.positions.strikers.forEach(data => {
              const s = this.strikers.find(st => st.id === data.id);
              if (s) {
                  Matter.Body.setPosition(s.body, data.pos);
                  Matter.Body.setVelocity(s.body, {x:0, y:0});
              }
          });

          if (this.ball && snapshot.positions.ball) {
              Matter.Body.setPosition(this.ball.body, snapshot.positions.ball);
              Matter.Body.setVelocity(this.ball.body, {x:0, y:0});
          }
      }
      
      Platform.showToast("已恢复对局");
  }

  _createUI() {
    this.hud = new GameHUD(this.gameMode);
    this.layout.layers.ui.addChild(this.hud);

    this.goalBanner = new GoalBanner();
    this.layout.layers.ui.addChild(this.goalBanner);

    const menuBtn = new GameMenuButton(this.app, this.layout.layers.ui);
    this.layout.layers.ui.addChild(menuBtn);

    this.sparkSystem = new SparkSystem();
    this.layout.layers.game.addChild(this.sparkSystem);
    
    this.turnMgr.resetTimer();
  }

  _setupEvents() {
    EventBus.on(Events.GOAL_SCORED, this.onGoal, this);
    EventBus.on(Events.GAME_OVER, this.onGameOver, this);
    EventBus.on(Events.COLLISION_HIT, (data) => this.sparkSystem?.emit(data.x, data.y, data.intensity), this);
    if (this.gameMode === 'pvp_online') EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
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

  onActionFired() {
    this.isMoving = true;
    AudioManager.playSFX('collision');
    this.turnMgr.timer = 0; 
  }

  onGoal(data) {
    // --- 进球权威性判定 (Authority Check) ---
    // 如果是联网对战，为了防止双端同时触发进球导致重复加分：
    // 只有“当前回合的操作方”（即射门的那一方）有资格判定进球并发送消息。
    // 防守方（被动方）忽略本地的进球判定，等待 NetMsg.GOAL 消息。
    if (this.gameMode === 'pvp_online') {
        if (this.turnMgr.currentTurn !== this.myTeamId) {
            console.log('[GameScene] Ignored local goal (Waiting for server/opponent).');
            // 回滚 GameRules 预先加上的分数 (因为 GameRules 不知道这是被动端)
            this.rules.score[data.scoreTeam]--;
            return;
        }

        // 我是主动方，我发送确认消息
        NetworkMgr.send({
            type: NetMsg.GOAL,
            payload: { newScore: data.newScore }
        });
    }

    // 本地表现逻辑
    this._playGoalEffects(data.newScore);
  }

  /** 提取进球表现逻辑 */
  _playGoalEffects(newScore) {
    AudioManager.playSFX('goal');
    this.hud?.updateScore(newScore[TeamId.LEFT], newScore[TeamId.RIGHT]);
    this.goalBanner?.play();
    Platform.vibrateShort();
    
    setTimeout(() => { if (!this.isGameOver) this.setupFormation(); }, 2000);
  }

  onGameOver(data) {
    this.isGameOver = true;
    
    // 游戏正常结束，清除重连记录
    if (this.gameMode === 'pvp_online') {
        Platform.removeStorage('last_room_id');
    }

    AudioManager.playSFX('win');
    Platform.showToast(`${data.winner === TeamId.LEFT ? "红方" : "蓝方"} 获胜!`);
    setTimeout(() => {
        if (this.gameMode === 'pvp_online') NetworkMgr.close();
        SceneManager.changeScene(this.gameMode === 'pvp_online' ? LobbyScene : MenuScene);
    }, 3000);
  }

  onNetMessage(msg) {
      if (msg.type === NetMsg.MOVE) {
          const striker = this.strikers.find(s => s.id === msg.payload.id);
          if (striker) {
              // --- 修复双重施力 Bug ---
              // 检查这个棋子是不是我自己的。
              // 如果是我自己的，说明我在 InputController 里已经 applyForce 过了，
              // 这里只需要更新 turnMgr 的状态，不要再次 applyForce。
              const isMyStriker = (striker.teamId === this.myTeamId);

              if (!isMyStriker) {
                  // 如果是对手的棋子，我需要模拟他的操作
                  Matter.Body.applyForce(striker.body, striker.body.position, msg.payload.force);
                  this.onActionFired();
              } else {
                  console.log('[GameScene] Recv own MOVE echo, skipping force apply.');
              }

              // 无论是否是自己，都要同步回合状态，确保 TurnManager 逻辑正确
              this.turnMgr.currentTurn = msg.payload.nextTurn;
          }
      } else if (msg.type === NetMsg.TURN_SYNC) {
          // 接收位置校准
          if (msg.payload.strikers) {
              msg.payload.strikers.forEach(data => {
                  const s = this.strikers.find(st => st.id === data.id);
                  if (s) {
                      Matter.Body.setPosition(s.body, data.pos);
                      Matter.Body.setVelocity(s.body, {x:0, y:0});
                  }
              });
          }
          if (this.ball && msg.payload.ball) {
              Matter.Body.setPosition(this.ball.body, msg.payload.ball);
              Matter.Body.setVelocity(this.ball.body, {x:0, y:0});
          }
      } else if (msg.type === NetMsg.GOAL) {
          // --- 接收进球同步 ---
          // 只有收到此消息，才最终确认进球有效（特别是对于防守方）
          const newScore = msg.payload.newScore;
          
          // 强制同步本地分数
          this.rules.score = newScore;
          
          // 播放进球动画
          this._playGoalEffects(newScore);

      } else if (msg.type === NetMsg.PLAYER_OFFLINE) {
          // 处理玩家掉线事件
          const offlineTeamId = msg.payload.teamId; 
          console.log(`[GameScene] Player offline: Team ${offlineTeamId}`);
          
          if (offlineTeamId !== undefined) {
              this.hud?.setPlayerOffline(offlineTeamId, true);
              this.isGamePaused = true;
              this.turnMgr.pause();
              this.input.reset();
              Platform.showToast("对方连接断开，等待重连...");
          }
      } else if (msg.type === NetMsg.PLAYER_JOINED) {
          // 如果游戏正在进行中收到 PLAYER_JOINED，说明掉线玩家重连回来了
          if (this.isGamePaused) {
               console.log('[GameScene] Player reconnected!');
               
               // 解除所有人的掉线状态显示
               this.hud?.setPlayerOffline(0, false);
               this.hud?.setPlayerOffline(1, false);

               this.isGamePaused = false;
               this.turnMgr.resume();
               Platform.showToast("玩家已重连，继续游戏");
               
               // 如果我是房主/当前回合方，立即发送一次位置同步，确保重连者画面正确
               if (this.turnMgr.currentTurn === this.myTeamId && !this.isMoving) {
                   this._syncAllPositions();
               }
          }
      } else if (msg.type === NetMsg.LEAVE) {
          // 对方彻底离开了
          Platform.removeStorage('last_room_id');
          Platform.showToast("对方已离开游戏");
          setTimeout(() => SceneManager.changeScene(LobbyScene), 2000);
      } else if (msg.type === NetMsg.GAME_OVER) {
          Platform.removeStorage('last_room_id');
      }
  }

  update(delta) {
    if (this.isLoading || !this.physics.engine) return;
    
    // 如果处于掉线等待的暂停状态，仅渲染静态画面
    if (this.isGamePaused) {
        return;
    }

    // 物理仿真
    this.physics.update(16.66);

    // 实体同步
    this.strikers.forEach(s => s.update());
    this.ball?.update();
    this.goalBanner?.update(delta);
    this.sparkSystem?.update(delta);

    // 控制器同步
    this._updateStrikerHighlights();
    this.turnMgr.update(delta);

    // 回合静止判定
    const isPhysicsSleeping = this.physics.isSleeping();
    const isAnimFinished = this.repositionAnimations.length === 0;

    if (this.isMoving && isPhysicsSleeping) {
        if (isAnimFinished) {
            // 物理停止了，且没有正在进行的复位动画，执行公平检测
            // 联网模式下，只有当前操作者（刚结束回合的人）负责计算复位位置并同步
            const shouldCalculate = this.gameMode !== 'pvp_online' || this.turnMgr.currentTurn !== this.myTeamId;
            
            if (shouldCalculate) {
                const startedAnyAnim = this._enforceFairPlay();
                if (!startedAnyAnim) {
                    this._endTurn();
                }
            } else {
                // 修复：非主控方（接管回合方）在物理静止后，也必须手动结束移动状态，否则无法进行操作
                this._endTurn();
            }
        }
    }

    // 更新正在进行的复位动画
    if (!isAnimFinished) {
        this._updateRepositionAnims(delta);
    }
  }

  _endTurn() {
      this.isMoving = false;
      
      // 联网同步：如果是我刚踢完，同步所有人的最终位置
      if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn !== this.myTeamId) {
          this._syncAllPositions();
      }

      if (this.gameMode !== 'pvp_online') this.turnMgr.switchTurn();
      else this.turnMgr.resetTimer();
  }

  _syncAllPositions() {
      const payload = {
          strikers: this.strikers.map(s => ({ id: s.id, pos: { x: s.body.position.x, y: s.body.position.y } })),
          ball: { x: this.ball.body.position.x, y: this.ball.body.position.y }
      };
      NetworkMgr.send({ type: NetMsg.TURN_SYNC, payload });
  }

  /**
   * 公平竞赛检测：移出进入球筐的棋子
   */
  _enforceFairPlay() {
    const { x, w, h, y } = this.layout.fieldRect;
    const goalDepth = GameConfig.dimensions.goalWidth;
    const radius = GameConfig.dimensions.strikerDiameter / 2;
    const safeDistance = goalDepth * 3.5; // 移出到3.5倍深度外
    let started = false;

    this._freezeAllPhysics();

    this.strikers.forEach(striker => {
        const body = striker.body;
        const posX = body.position.x;
        
        // 判定棋子是否在左侧或右侧球筐内
        const inLeftGoal = posX < x;
        const inRightGoal = posX > x + w;

        if (inLeftGoal || inRightGoal) {
            // 寻找随机且安全的复位点
            const targetPos = this._findSafeRandomPosition(striker.teamId, safeDistance);
            
            body.isSensor = true;
            this.repositionAnimations.push({
                body: body,
                start: { x: body.position.x, y: body.position.y },
                end: targetPos,
                time: 0,
                duration: 700
            });
            started = true;
        }
    });

    return started;
  }

  /**
   * 寻找安全的随机复位点
   * @param {TeamId} teamId 棋子所属队伍
   * @param {number} safeDistance 离门线的安全距离
   */
  _findSafeRandomPosition(teamId, safeDistance) {
    const { x, y, w, h } = this.layout.fieldRect;
    const r = GameConfig.dimensions.strikerDiameter / 2;
    const padding = 40; // 离上下墙的边距
    
    let targetX, minX, maxX;
    if (teamId === TeamId.LEFT) {
        // 红方：复位到左半场
        minX = x + safeDistance;
        maxX = x + w / 2 - r - 20;
    } else {
        // 蓝方：复位到右半场
        minX = x + w / 2 + r + 20;
        maxX = x + w - safeDistance;
    }

    // 尝试寻找不重叠的位置
    for (let attempt = 0; attempt < 50; attempt++) {
        const rx = minX + Math.random() * (maxX - minX);
        const ry = (y + padding + r) + Math.random() * (h - padding * 2 - r * 2);
        
        // 检查与场上所有棋子及足球的距离
        const isOverlap = this._checkPositionOverlap(rx, ry, r);
        if (!isOverlap) {
            return { x: rx, y: ry };
        }
    }

    // 如果多次尝试失败，直接返回一个保底位置
    return { x: (minX + maxX) / 2, y: y + h / 2 };
  }

  /** 检查指定位置是否与现有棋子或足球重叠 */
  _checkPositionOverlap(px, py, radius) {
    const minSafeDist = radius * 2.2; // 留一点间隙
    
    // 检查足球
    const dxBall = px - this.ball.body.position.x;
    const dyBall = py - this.ball.body.position.y;
    if (Math.sqrt(dxBall*dxBall + dyBall*dyBall) < minSafeDist) return true;

    // 检查其他棋子
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
          const ease = 1 - Math.pow(1 - progress, 4); // 更丝滑的 EaseOutQuart
          
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
    if (this.gameMode === 'pvp_online') EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
    this.turnMgr.clear();
    this.physics.clear();
  }
}
