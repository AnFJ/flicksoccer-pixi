
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
    
    // [新增] 快照同步计时器
    this.snapshotTimer = 0;
    
    // [新增] 标记对手是否是主动离开 (防止被后续的 Offline 消息覆盖提示)
    this.hasOpponentLeft = false; 

    // [新增] 暂存下一回合的 ID，用于延迟切换回合
    this.pendingTurn = null;
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    
    if (this.gameMode === 'pvp_online') {
        const me = params.players.find(p => p.id === AccountMgr.userInfo.id);
        if (me) this.myTeamId = me.teamId;
    }

    // 资源已在 LoginScene 统一加载，此处直接初始化
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
    this.snapshotTimer = 0;
    this.hasOpponentLeft = false;
    this.pendingTurn = null;

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

    // [修改] 传递自定义点击事件，处理主动离开
    const menuBtn = new GameMenuButton(this.app, this.layout.layers.ui, () => {
        this.onMenuBtnClick();
    });
    this.layout.layers.ui.addChild(menuBtn);

    this.sparkSystem = new SparkSystem();
    this.layout.layers.game.addChild(this.sparkSystem);
    
    this.turnMgr.resetTimer();
  }

  /**
   * 处理菜单按钮点击
   */
  onMenuBtnClick() {
      // 如果是联网模式，发送离开消息
      if (this.gameMode === 'pvp_online' && !this.isGameOver) {
          NetworkMgr.send({ type: NetMsg.LEAVE });
          
          // [修复] 不再移除 last_room_id，允许玩家在大厅通过重连回来
          // Platform.removeStorage('last_room_id'); 
          
          NetworkMgr.close(); // 断开连接
      }

      // 切换场景
      SceneManager.changeScene(MenuScene);
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

        // [修改] 联网模式下，主动方不再立即执行本地效果
        // 而是等待服务器广播 NetMsg.GOAL 后，双方统一执行 _playGoalEffects
        // 这样可以确保状态重置的同步性，避免一方重置了一方没重置的Bug。
        return; 
    }

    // 本地表现逻辑 (单机/PVE模式直接执行)
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
    
    const isWinner = (this.myTeamId === data.winner);
    const economyConfig = GameConfig.gameplay.economy;

    // 结算金币逻辑 (PVE 或 网络对战)
    // 本地双人 (pvp_local) 不涉及金币
    if (this.gameMode === 'pve' || this.gameMode === 'pvp_online') {
        if (isWinner) {
            const reward = economyConfig.winReward;
            AccountMgr.addCoins(reward);
            Platform.showToast(`胜利！获得 ${reward} 金币`);
        } else {
            // 输了扣除入场费
            const fee = economyConfig.entryFee;
            AccountMgr.consumeCoins(fee);
            Platform.showToast(`惜败！扣除 ${fee} 金币`);
        }
    }

    // 游戏正常结束，才清除重连记录
    if (this.gameMode === 'pvp_online') {
        Platform.removeStorage('last_room_id');
    }

    AudioManager.playSFX('win');
    
    // 显示获胜信息
    if (this.gameMode === 'pvp_local') {
        Platform.showToast(`${data.winner === TeamId.LEFT ? "红方" : "蓝方"} 获胜!`);
    }

    setTimeout(() => {
        if (this.gameMode === 'pvp_online') NetworkMgr.close();
        SceneManager.changeScene(this.gameMode === 'pvp_online' ? LobbyScene : MenuScene);
    }, 3000);
  }

  onNetMessage(msg) {
      // 1. 移动指令
      if (msg.type === NetMsg.MOVE) {
          // 结束瞄准线显示
          this.input.handleRemoteAim(NetMsg.AIM_END);
          
          const striker = this.strikers.find(s => s.id === msg.payload.id);
          if (striker) {
              const isMyStriker = (striker.teamId === this.myTeamId);

              if (!isMyStriker) {
                  Matter.Body.applyForce(striker.body, striker.body.position, msg.payload.force);
                  this.onActionFired();
              }
              // 暂存下回合ID
              this.pendingTurn = msg.payload.nextTurn;
          }
      } 
      // 2. 瞄准同步 (交给 InputController)
      else if (msg.type === NetMsg.AIM_START || msg.type === NetMsg.AIM_UPDATE || msg.type === NetMsg.AIM_END) {
          this.input.handleRemoteAim(msg.type, msg.payload);
      }
      // 3. 公平竞赛移出动画同步
      else if (msg.type === NetMsg.FAIR_PLAY_MOVE) {
          const { id, end, duration } = msg.payload;
          const s = this.strikers.find(st => st.id === id);
          if (s) {
              // 强制将物体设为 Sensor 并推入动画队列
              s.body.isSensor = true;
              this.repositionAnimations.push({
                  body: s.body,
                  start: { x: s.body.position.x, y: s.body.position.y },
                  end: end,
                  time: 0,
                  duration: duration
              });
          }
      }
      // 4. 其他同步消息
      else if (msg.type === NetMsg.SNAPSHOT) {
          this._handleSnapshot(msg.payload);

      } else if (msg.type === NetMsg.TURN_SYNC) {
          // 同步位置
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
          
          // [关键修复] 当收到 TURN_SYNC 时，被动方(Observer)触发回合结束
          // 这确保了被动方不会在物理静止后立即切回合，而是等待主动方确认
          if (this.isMoving && this.gameMode === 'pvp_online') {
              this._endTurn();
          }

      } else if (msg.type === NetMsg.GOAL) {
          const newScore = msg.payload.newScore;
          
          // [修改] 移除之前的本地查重逻辑
          // 因为现在我们完全依赖服务器广播来触发特效和重置，所以这里必须执行
          this.rules.score = newScore;
          this._playGoalEffects(newScore);

      } else if (msg.type === NetMsg.PLAYER_LEFT_GAME) {
          const leftTeamId = msg.payload.teamId;
          if (leftTeamId !== undefined) {
              this.hasOpponentLeft = true;
              this.hud?.setPlayerOffline(leftTeamId, true, "玩家主动离开了\n当前对局");
              this.isGamePaused = true;
              this.turnMgr.pause();
              this.input.reset();
              Platform.showToast("对方已离开，游戏暂停");
          }

      } else if (msg.type === NetMsg.PLAYER_OFFLINE) {
          const offlineTeamId = msg.payload.teamId; 
          if (offlineTeamId !== undefined) {
              if (!this.hasOpponentLeft) {
                  this.hud?.setPlayerOffline(offlineTeamId, true);
              }
              this.isGamePaused = true;
              this.turnMgr.pause();
              this.input.reset();
              if (!this.hasOpponentLeft) {
                  Platform.showToast("对方连接断开，等待重连...");
              }
          }
      } else if (msg.type === NetMsg.PLAYER_JOINED) {
          if (this.isGamePaused) {
               this.hasOpponentLeft = false;
               this.hud?.setPlayerOffline(0, false);
               this.hud?.setPlayerOffline(1, false);
               this.isGamePaused = false;
               this.turnMgr.resume();
               Platform.showToast("玩家已重连，继续游戏");
               if (this.turnMgr.currentTurn === this.myTeamId && !this.isMoving) {
                   this._syncAllPositions();
               }
          }
      } else if (msg.type === NetMsg.LEAVE) {
          Platform.showToast("已离开游戏");
          setTimeout(() => SceneManager.changeScene(LobbyScene), 2000);
      } else if (msg.type === NetMsg.GAME_OVER) {
          Platform.removeStorage('last_room_id');
      }
  }

  // [新增] 发送快照
  _sendSnapshot() {
      if (!this.ball || !this.ball.body) return;
      
      const payload = {
          ball: {
              pos: { x: this.ball.body.position.x, y: this.ball.body.position.y },
              vel: { x: this.ball.body.velocity.x, y: this.ball.body.velocity.y }
          }
      };
      NetworkMgr.send({ type: NetMsg.SNAPSHOT, payload });
  }

  // [新增] 处理快照
  _handleSnapshot(payload) {
      if (!this.ball || !payload.ball) return;
      
      // 核心修正逻辑：
      // 如果是联网对战，且当前回合是我的（意味着是我发起的物理运动），那么我就是物理模拟的 Authority。
      // 此时我应该忽略服务器回传的快照（因为那是我发出去的，或者是延迟的）。
      // 由于我们延迟了 currentTurn 的切换，所以在球运动期间，turnMgr.currentTurn 依然指向“射门者”。
      if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn === this.myTeamId) return;

      const serverPos = payload.ball.pos;
      const serverVel = payload.ball.vel;
      const localBody = this.ball.body;
      const localPos = localBody.position;

      const dx = serverPos.x - localPos.x;
      const dy = serverPos.y - localPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 5) return;

      if (dist > 50) {
          Matter.Body.setPosition(localBody, serverPos);
          Matter.Body.setVelocity(localBody, serverVel);
          return;
      }

      const lerpFactor = 0.2;
      const newX = localPos.x + dx * lerpFactor;
      const newY = localPos.y + dy * lerpFactor;
      
      Matter.Body.setPosition(localBody, { x: newX, y: newY });
      Matter.Body.setVelocity(localBody, serverVel);
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

    if (this.isMoving) {
        // [新增] 在移动期间，权威方发送快照
        // 因为我们延迟了 currentTurn 的切换，所以这里判断依然有效
        if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn === this.myTeamId) {
            this.snapshotTimer += delta;
            // 每 100ms 发送一次快照 (10Hz)
            if (this.snapshotTimer > 100) {
                this.snapshotTimer = 0;
                this._sendSnapshot();
            }
        }

        if (isPhysicsSleeping) {
            if (isAnimFinished) {
                // [关键修复] 只有主动方(Authority)负责计算和发送“移出球网”指令
                // 单机/PVE: 始终有权
                // 联网: 只有当前回合方有权
                const isAuthority = this.gameMode !== 'pvp_online' || this.turnMgr.currentTurn === this.myTeamId;
                
                if (isAuthority) {
                    const startedAnyAnim = this._enforceFairPlay();
                    if (!startedAnyAnim) {
                        this._endTurn();
                    }
                } else {
                    // [关键] 联网模式下的被动方 (Observer)
                    // 即使物理静止了，也不要立即结束回合 (this._endTurn())
                    // 而是等待接收 NetMsg.TURN_SYNC 消息来触发结束
                    // 这样能确保主动方完成 FairPlay 动画后再同步结束
                }
            }
        }
    }

    if (!isAnimFinished) {
        this._updateRepositionAnims(delta);
    }
  }

  _endTurn() {
      this.isMoving = false;
      this.snapshotTimer = 0; // 重置计时器
      
      // 只有当我是当前回合的主动方(权威方)时，我才负责发送最终位置同步。
      // 这样接收方(被动方)会接收我的数据并校准。
      if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn === this.myTeamId) {
          this._syncAllPositions();
      }

      if (this.gameMode !== 'pvp_online') {
          this.turnMgr.switchTurn();
      } else {
          // PVP Online: 在这里应用延迟的回合切换
          if (this.pendingTurn !== null && this.pendingTurn !== undefined) {
              this.turnMgr.currentTurn = this.pendingTurn;
              this.pendingTurn = null;
          }
          this.turnMgr.resetTimer();
      }
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
   * [修改] 只有权威方才计算并发送广播，被动方只负责接收 NetMsg.FAIR_PLAY_MOVE
   */
  _enforceFairPlay() {
    // 如果是联网对战，且我不是当前回合的主动方，我不负责计算
    // 我只需要等待接收 NetMsg.FAIR_PLAY_MOVE 即可
    if (this.gameMode === 'pvp_online' && this.turnMgr.currentTurn !== this.myTeamId) {
        return false;
    }

    const { x, w, h, y } = this.layout.fieldRect;
    const goalDepth = GameConfig.dimensions.goalWidth;
    const radius = GameConfig.dimensions.strikerDiameter / 2;
    const safeDistance = goalDepth * 3.5; 
    let started = false;

    // 先冻结所有物理
    this._freezeAllPhysics();

    this.strikers.forEach(striker => {
        const body = striker.body;
        const posX = body.position.x;
        
        const inLeftGoal = posX < x;
        const inRightGoal = posX > x + w;

        if (inLeftGoal || inRightGoal) {
            const targetPos = this._findSafeRandomPosition(striker.teamId, safeDistance);
            const duration = 700;

            // 1. 发送网络消息 (必须先于本地动画，或同时)
            if (this.gameMode === 'pvp_online') {
                NetworkMgr.send({
                    type: NetMsg.FAIR_PLAY_MOVE,
                    payload: {
                        id: striker.id,
                        start: { x: body.position.x, y: body.position.y },
                        end: targetPos,
                        duration: duration
                    }
                });
            }
            
            // 2. 本地执行动画
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
    if (this.gameMode === 'pvp_online') EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
    this.turnMgr.clear();
    this.physics.clear();
  }
}
