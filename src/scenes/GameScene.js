
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

    // 本地表现逻辑 (注意：进球方会立即播放，所以收到网络消息时要防止重复播放)
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
    
    // 游戏正常结束，才清除重连记录
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
              const isMyStriker = (striker.teamId === this.myTeamId);

              if (!isMyStriker) {
                  // 如果是对手的棋子，我需要模拟他的操作
                  Matter.Body.applyForce(striker.body, striker.body.position, msg.payload.force);
                  this.onActionFired();
              } else {
                  console.log('[GameScene] Recv own MOVE echo, skipping force apply.');
              }

              // [关键修改] 不要立即切换回合！
              // 如果立即切换，isMoving 期间 currentTurn 就变成了对手，会导致快照逻辑判定失效（误以为应该接收快照）
              // 我们将下一回合 ID 暂存，等到 _endTurn 时再应用
              this.pendingTurn = msg.payload.nextTurn;
          }
      } else if (msg.type === NetMsg.SNAPSHOT) {
          // [新增] 接收中间状态快照，进行平滑修正
          this._handleSnapshot(msg.payload);

      } else if (msg.type === NetMsg.TURN_SYNC) {
          // 接收回合结束时的最终位置校准
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
          const newScore = msg.payload.newScore;
          
          // [修复] 防止进球方重复播放特效 (进球方在本地触发时已经播放过了)
          // 检查本地分数是否已经是最新的
          const currentScore = this.rules.score;
          if (currentScore[TeamId.LEFT] === newScore[TeamId.LEFT] && 
              currentScore[TeamId.RIGHT] === newScore[TeamId.RIGHT]) {
               console.log('[GameScene] Ignored duplicate GOAL message.');
               return;
          }

          this.rules.score = newScore;
          this._playGoalEffects(newScore);

      } else if (msg.type === NetMsg.PLAYER_LEFT_GAME) {
          // [新增] 处理对手主动离开
          const leftTeamId = msg.payload.teamId;
          console.log(`[GameScene] Player LEFT GAME: Team ${leftTeamId}`);
          
          if (leftTeamId !== undefined) {
              // 1. 标记主动离开状态
              this.hasOpponentLeft = true;

              // 2. 设置头像置灰，并显示明确的提示文字
              this.hud?.setPlayerOffline(leftTeamId, true, "玩家主动离开了\n当前对局");
              
              // 3. 暂停游戏逻辑，但不强制退出，等待对方重连
              this.isGamePaused = true;
              this.turnMgr.pause();
              this.input.reset();
              
              Platform.showToast("对方已离开，游戏暂停");
          }

      } else if (msg.type === NetMsg.PLAYER_OFFLINE) {
          // 处理玩家掉线事件
          const offlineTeamId = msg.payload.teamId; 
          console.log(`[GameScene] Player offline: Team ${offlineTeamId}`);
          
          if (offlineTeamId !== undefined) {
              // 关键：如果已经标记为主动离开，则不再覆盖提示文案
              if (!this.hasOpponentLeft) {
                  this.hud?.setPlayerOffline(offlineTeamId, true); // 默认提示 "请等待..."
              } else {
                  // 保持显示 "玩家主动离开"，不被 Socket 关闭的事件覆盖
                  console.log('Ignored PLAYER_OFFLINE due to active leave.');
              }

              this.isGamePaused = true;
              this.turnMgr.pause();
              this.input.reset();
              if (!this.hasOpponentLeft) {
                  Platform.showToast("对方连接断开，等待重连...");
              }
          }
      } else if (msg.type === NetMsg.PLAYER_JOINED) {
          // 如果游戏正在进行中收到 PLAYER_JOINED，说明掉线玩家重连回来了
          if (this.isGamePaused) {
               console.log('[GameScene] Player reconnected!');
               
               // 重置状态
               this.hasOpponentLeft = false;

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
          // 处理自己被动断开的情况 (Socket Close)
          // [修复] 不清除 last_room_id，以便支持重连
          
          Platform.showToast("已离开游戏");
          // 只有当不是手动退出时才跳转 (手动退出在 onMenuBtnClick 处理)
          setTimeout(() => SceneManager.changeScene(LobbyScene), 2000);
      } else if (msg.type === NetMsg.GAME_OVER) {
          // 正常游戏结束，清除缓存
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
                const shouldCalculate = this.gameMode !== 'pvp_online' || this.turnMgr.currentTurn !== this.myTeamId;
                
                if (shouldCalculate) {
                    const startedAnyAnim = this._enforceFairPlay();
                    if (!startedAnyAnim) {
                        this._endTurn();
                    }
                } else {
                    this._endTurn();
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
      
      // 核心修复：将 !== 改为 ===
      // 只有当我是当前回合的主动方(权威方)时，我才负责发送最终位置同步。
      // 这样接收方(被动方)会接收我的数据并校准。
      // 如果是被动方发送，会导致主动方的正确位置被被动方的滞后位置覆盖，产生抖动。
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
        
        const inLeftGoal = posX < x;
        const inRightGoal = posX > x + w;

        if (inLeftGoal || inRightGoal) {
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
