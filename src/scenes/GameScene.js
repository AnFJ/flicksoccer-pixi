
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import PhysicsEngine from '../core/PhysicsEngine.js';
import GameRules from '../core/GameRules.js';
import AIController from '../core/AIController.js';
import Striker from '../entities/Striker.js';
import Ball from '../entities/Ball.js';
import Goal from '../entities/Goal.js';
import EventBus from '../managers/EventBus.js';
import AudioManager from '../managers/AudioManager.js';
import Platform from '../managers/Platform.js';
import ResourceManager from '../managers/ResourceManager.js'; 
import NetworkMgr from '../managers/NetworkMgr.js';
import AccountMgr from '../managers/AccountMgr.js';
import { GameConfig } from '../config.js';
import { TeamId, CollisionCategory, Events, NetMsg } from '../constants.js';

import AdBoard from '../ui/AdBoard.js';
import GameMenuButton from '../ui/GameMenuButton.js';
import GameHUD from '../ui/GameHUD.js';
import GoalBanner from '../ui/GoalBanner.js';
import SparkSystem from '../vfx/SparkSystem.js';
import MenuScene from './MenuScene.js';
import LobbyScene from './LobbyScene.js'; // 引入 LobbyScene 以便网络断开时返回

export default class GameScene extends BaseScene {
  constructor() {
    super();
    this.physics = new PhysicsEngine();
    this.rules = null;
    this.ai = null;
    this.gameMode = 'pve'; 
    
    this.strikers = [];
    this.ball = null;
    this.goals = [];

    this.currentTurn = TeamId.RIGHT; 
    this.isMoving = false; 
    this.isGameOver = false;

    // --- 网络对战相关 ---
    this.myTeamId = TeamId.LEFT; // 默认，将在 onEnter 中覆盖
    
    // --- 倒计时相关 ---
    this.turnTimer = 0;
    this.maxTurnTime = GameConfig.gameplay.turnTimeLimit || 30; 

    this.selectedBody = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.aimVector = { x: 0, y: 0 };
    
    this.isDualControl = false; 
    this.controlStartPos = { x: 0, y: 0 }; 
    this.baseAimVector = { x: 0, y: 0 };   

    this.isDragging = false;
    this.aimingPointerId = null; 

    this.aimGraphics = new PIXI.Graphics();
    
    // HUD 组件引用
    this.hud = null;
    this.goalBanner = null; // 进球条幅引用
    this.sparkSystem = null; // 粒子特效引用
    this.menuButton = null; // 菜单按钮引用
    
    this.isLoading = true;
    
    // --- 移位动画队列 ---
    // 结构: { body, start: {x,y}, end: {x,y}, time: 0, duration: 500 }
    this.repositionAnimations = [];

    // --- 定义分层容器 ---
    this.bgLayer = new PIXI.Container();   // 背景 (草地)
    this.gameLayer = new PIXI.Container(); // 游戏物体 (球、人)
    this.overLayer = new PIXI.Container(); // 前景 (球筐、边框、广告牌)
    this.uiLayer = new PIXI.Container();   // UI
    
    this.container.addChild(this.bgLayer);
    this.container.addChild(this.gameLayer);
    this.container.addChild(this.overLayer);
    this.container.addChild(this.uiLayer);
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    
    // 如果是网络模式，确认自己的队伍
    if (this.gameMode === 'pvp_online') {
        const myId = AccountMgr.userInfo.id;
        const me = params.players.find(p => p.id === myId);
        if (me) this.myTeamId = me.teamId;
        
        // 服务器决定的先手
        if (typeof params.startTurn !== 'undefined') {
            this.currentTurn = params.startTurn;
        }
        console.log(`[Game] Online Mode. My Team: ${this.myTeamId}, Start Turn: ${this.currentTurn}`);
    } else {
        // 本地模式，玩家默认是 P1 (Right/Blue)，PVE 时 AI 是 P0 (Left/Red)
        // 注意：根据代码习惯，TeamId.LEFT(0) 是红色，TeamId.RIGHT(1) 是蓝色
        // 在 PVE 中，玩家控制 Blue (RIGHT)，AI 控制 Red (LEFT)
        // 在 PVP Local 中，轮流控制
        this.myTeamId = TeamId.RIGHT; // 主要用于区分 HUD 显示
    }
    
    const loadingText = new PIXI.Text('Loading Assets...', { fill: 0xffffff, fontSize: 30 }); 
    loadingText.anchor.set(0.5);
    loadingText.position.set(GameConfig.designWidth/2, GameConfig.designHeight/2);
    this.uiLayer.addChild(loadingText);

    await ResourceManager.loadAll();
    
    this.uiLayer.removeChild(loadingText);
    this.isLoading = false;

    this.initGame();
  }

  initGame() {
    this.physics.init();
    this.rules = new GameRules(this.physics);
    
    if (this.gameMode === 'pve') {
        this.ai = new AIController(this.physics, TeamId.LEFT); 
        this.currentTurn = TeamId.RIGHT; // PVE 玩家先手
    } else if (this.gameMode === 'pvp_local') {
        this.ai = null;
        this.currentTurn = TeamId.RIGHT; // 默认蓝方先
    } else {
        // Online: this.currentTurn 已在 onEnter 设置
        this.ai = null;
    }

    this.createLayout();
    this.setupFormation();
    this.createUI();

    this.setupEvents();
    this.setupInteraction();

    this.isGameOver = false;
    
    // 初始化回合
    this.resetTurnTimer();
    this.updateUI();
  }
  
  // 响应屏幕尺寸变化
  onResize(width, height) {
      if (this.menuButton) {
          this.menuButton.alignToScreenBottomLeft();
      }
      // 如果将来有其他贴边 UI (如右上角设置)，也在这里调用它们的对齐方法
  }

  createLayout() {
    const { designWidth, designHeight, dimensions } = GameConfig;
    
    // 1. 草地背景
    const globalBgTexture = ResourceManager.get('bg_grass');
    if (globalBgTexture) {
        const globalBg = new PIXI.TilingSprite(
            globalBgTexture,
            designWidth,
            designHeight
        );
        globalBg.tileScale.set(0.5); 
        globalBg.tint = 0x666666; 
        this.bgLayer.addChild(globalBg);
    } else {
        const globalBg = new PIXI.Graphics();
        globalBg.beginFill(0x1a1a1a);
        globalBg.drawRect(0, 0, designWidth, designHeight);
        globalBg.endFill();
        this.bgLayer.addChild(globalBg);
    }
    const remainingHeight = designHeight - dimensions.topBarHeight;
    const marginY = (remainingHeight - dimensions.fieldHeight) / 2;
    const fieldStartX = (designWidth - dimensions.fieldWidth) / 2;
    const fieldStartY = dimensions.topBarHeight + marginY;

    this.fieldRect = { 
        x: fieldStartX, 
        y: fieldStartY, 
        w: dimensions.fieldWidth, 
        h: dimensions.fieldHeight 
    };

    this.createFieldVisuals(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    this.createPhysicsWalls(fieldStartX, fieldStartY+5, dimensions.fieldWidth - 5, dimensions.fieldHeight - 12);
    this.createGoals(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    
    // 2. 新增：广告牌 (使用 AdBoard 组件)
    this.createAdBoards(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
  }

  createFieldVisuals(x, y, w, h) {
    const centerX = x + w / 2;
    const centerY = y + h / 2;

      const bgTexture = ResourceManager.get('field_bg');
    if (bgTexture) {
        const bgSprite = new PIXI.Sprite(bgTexture);
        bgSprite.anchor.set(0.5);
        bgSprite.width = w;
        bgSprite.height = h;
        bgSprite.position.set(centerX, centerY);
        this.bgLayer.addChild(bgSprite);
    } else {
        const ground = new PIXI.Graphics();
        ground.beginFill(0x27ae60);
        ground.drawRect(x, y, w, h);
        ground.endFill();
        this.bgLayer.addChild(ground);
    }

      const borderTexture = ResourceManager.get('field_border');
    if (borderTexture) {
        const borderSprite = new PIXI.Sprite(borderTexture);
        borderSprite.anchor.set(0.5);
        
        const visualHeightPadding = 20; 
        borderSprite.height = h + visualHeightPadding;
        const visualWidthPadding = 20;
        const goalTotalDepth = GameConfig.dimensions.goalWidth * 2;
        borderSprite.width = w + goalTotalDepth + visualWidthPadding;

        borderSprite.position.set(centerX, centerY);
        
        this.overLayer.addChild(borderSprite);
    }
  }

  createAdBoards(fieldX, fieldY, fieldW, fieldH) {
    // 在球场左右两侧放置广告牌
    const adWidth = 200;
    const adHeight = 350;
    const distance = 160; 

    // 左侧广告牌
    const leftAd = new AdBoard(adWidth, adHeight, 0);
    leftAd.position.set(fieldX - distance - adWidth/2, fieldY + fieldH / 2);
    this.overLayer.addChild(leftAd);

    // 右侧广告牌
    const rightAd = new AdBoard(adWidth, adHeight, 1);
    rightAd.position.set(fieldX + fieldW + distance + adWidth/2, fieldY + fieldH / 2);
    this.overLayer.addChild(rightAd);
  }

  createPhysicsWalls(x, y, w, h) {
    const t = GameConfig.dimensions.wallThickness; 
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const goalOpening = GameConfig.dimensions.goalOpening;
    const sideWallLen = (h - goalOpening) / 2;

      const walls = [
      Matter.Bodies.rectangle(centerX, y - t/2, w + t*2, t, { isStatic: true, label: 'WallTop' }),
      Matter.Bodies.rectangle(centerX, y + h + t/2, w + t*2, t, { isStatic: true, label: 'WallBottom' }),
      Matter.Bodies.rectangle(x - t/2, y + sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallLeftTop' }),
      Matter.Bodies.rectangle(x - t/2, y + h - sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallLeftBottom' }),
      Matter.Bodies.rectangle(x + w + t/2, y + sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallRightTop' }),
      Matter.Bodies.rectangle(x + w + t/2, y + h - sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallRightBottom' })
      ];

    walls.forEach(body => {
        body.collisionFilter = { category: CollisionCategory.WALL, mask: CollisionCategory.DEFAULT | CollisionCategory.BALL | CollisionCategory.STRIKER };
        body.render.visible = false;
        body.restitution = GameConfig.physics.wallRestitution; 
        body.friction = GameConfig.physics.wallFriction;
        body.frictionStatic = GameConfig.physics.wallFriction; 
    });
      this.physics.add(walls);
  }

  createGoals(x, y, w, h) {
    const { goalWidth, goalOpening } = GameConfig.dimensions;
    const centerY = y + h / 2;

    const goalLeft = new Goal(x - goalWidth/2, centerY, goalWidth, goalOpening, TeamId.LEFT);
    const goalRight = new Goal(x + w + goalWidth/2, centerY, goalWidth, goalOpening, TeamId.RIGHT);
    
    this.goals.push(goalLeft, goalRight);
    
    this.physics.add(goalLeft.body);
    this.physics.add(goalRight.body);

    if (goalLeft.view) this.gameLayer.addChild(goalLeft.view);
    if (goalRight.view) this.gameLayer.addChild(goalRight.view);
  }

  setupFormation() {
    this.clearEntities();
    const { x, y, w, h } = this.fieldRect;
    const centerY = y + h / 2; const centerX = x + w / 2;
    this.ball = new Ball(centerX, centerY);
    this.addEntity(this.ball);
    const r = GameConfig.dimensions.strikerDiameter / 2;
    
    const leftFormation = [
      { x: -w * 0.45, y: 0 },         
      { x: -w * 0.30, y: -h * 0.15 }, 
      { x: -w * 0.30, y: h * 0.15 },  
      { x: -w * 0.12, y: -h * 0.20 }, 
      { x: -w * 0.12, y: h * 0.20 },  
    ];
    const rightFormation = leftFormation.map(pos => ({ x: -pos.x, y: pos.y }));
    
    // 给 Striker 增加 id 属性，方便网络同步查找
    leftFormation.forEach((pos, idx) => {
      const s = new Striker(centerX + pos.x, centerY + pos.y, r, TeamId.LEFT);
      s.id = `left_${idx}`; // 唯一标识
      this.strikers.push(s); this.addEntity(s);
    });
    rightFormation.forEach((pos, idx) => {
      const s = new Striker(centerX + pos.x, centerY + pos.y, r, TeamId.RIGHT);
      s.id = `right_${idx}`;
      this.strikers.push(s); this.addEntity(s);
    });
  }

  addEntity(entity) {
    this.gameLayer.addChild(entity.view);
    this.physics.add(entity.body);
  }

  clearEntities() { 
    this.strikers.forEach(s => {
        Matter.World.remove(this.physics.engine.world, s.body);
        this.gameLayer.removeChild(s.view); 
    });
    this.strikers = [];
    if (this.ball) {
        Matter.World.remove(this.physics.engine.world, this.ball.body);
        this.gameLayer.removeChild(this.ball.view); 
        this.ball = null;
    }
  }

  createUI() {
    this.hud = new GameHUD(this.gameMode);
    this.uiLayer.addChild(this.hud);

    // 新增：创建进球条幅，添加到 HUD 之上
    this.goalBanner = new GoalBanner();
    this.uiLayer.addChild(this.goalBanner);
    this.menuButton = new GameMenuButton(this.app, this.uiLayer);
    this.uiLayer.addChild(this.menuButton);
    this.uiLayer.addChild(this.aimGraphics);
    // 新增：创建粒子特效系统，添加到 gameLayer 的最上层，使其位于足球之上，但位于 UI 之下
    this.sparkSystem = new SparkSystem();
    this.gameLayer.addChild(this.sparkSystem);
  }

  setupEvents() {
    EventBus.on(Events.GOAL_SCORED, (data) => {
        AudioManager.playSFX('goal');
        if (this.hud) this.hud.updateScore(data.newScore[TeamId.LEFT], data.newScore[TeamId.RIGHT]);
        if (this.goalBanner) this.goalBanner.play();
        Platform.vibrateShort();
        setTimeout(() => {
            if (!this.isGameOver) this.setupFormation();
        }, 2000);
    }, this);

    EventBus.on(Events.GAME_OVER, (data) => {
        this.isGameOver = true;
        AudioManager.playSFX('win');
        const winnerName = data.winner === TeamId.LEFT ? "红方" : "蓝方";
        Platform.showToast(`${winnerName} 获胜!`);
        setTimeout(() => {
            if (this.gameMode === 'pvp_online') NetworkMgr.close();
            SceneManager.changeScene(this.gameMode === 'pvp_online' ? LobbyScene : MenuScene);
        }, 3000); 
    }, this);

    EventBus.on(Events.COLLISION_HIT, (data) => {
        if (this.sparkSystem) this.sparkSystem.emit(data.x, data.y, data.intensity);
    }, this);

    // 新增：网络消息监听
    if (this.gameMode === 'pvp_online') {
        EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
    }
  }

  onNetMessage(msg) {
      if (msg.type === NetMsg.MOVE) {
          // 收到对手移动指令
          const { id, force, nextTurn } = msg.payload;
          const striker = this.strikers.find(s => s.id === id);
          if (striker) {
              console.log(`[Game] Net Move: ${id}`, force);
              Matter.Body.applyForce(striker.body, striker.body.position, force);
              
              // 强制同步本地回合显示 (防止本地倒计时误差)
              this.currentTurn = nextTurn;
              this.onTurnActionComplete(true); // true 表示不重复切换回合，只触发动画
          }
      } 
      else if (msg.type === NetMsg.LEAVE) {
          Platform.showToast("对方已离开");
          setTimeout(() => SceneManager.changeScene(LobbyScene), 2000);
      }
  }

  setupInteraction() {
    this.container.interactive = true; 
    this.container.on('pointerdown', this.onPointerDown.bind(this));
    this.container.on('pointermove', this.onPointerMove.bind(this));
    this.container.on('pointerup', this.onPointerUp.bind(this));
    this.container.on('pointerupoutside', this.onPointerUp.bind(this));
  }

  onPointerDown(e) {
    if (this.isMoving || this.isGameOver || this.isLoading || this.repositionAnimations.length > 0) return;
    
    // 网络对战：只允许操作己方
    if (this.gameMode === 'pvp_online' && this.currentTurn !== this.myTeamId) {
        return;
    }
    // PVE: 玩家总是 RIGHT
    if (this.gameMode === 'pve' && this.currentTurn === TeamId.LEFT) return;

    const global = e.data.global;
    const local = this.container.toLocal(global); 
    const pointerId = e.id; 

    if (this.isMoving || this.isGameOver || this.isLoading) {
        return;
    }
    
    if (this.repositionAnimations.length > 0) {
        return;
    }
    
    if (this.ai && this.currentTurn === this.ai.teamId) {
        return;
    }

    if (this.isDragging && this.selectedBody) {
        this.aimingPointerId = pointerId;
        this.isDualControl = true;
        this.controlStartPos = { x: local.x, y: local.y };
        this.baseAimVector = { ...this.aimVector };
        return; 
    }
    
    // 查找点击的棋子
    let selectedStriker = null;
    let visualTarget = e.target;
    while (visualTarget && visualTarget !== this.container) {
        if (visualTarget.entity && typeof visualTarget.entity.teamId !== 'undefined') {
            selectedStriker = visualTarget.entity;
            break;
        }
        visualTarget = visualTarget.parent;
    }
    if (!selectedStriker) {
        const bodies = this.physics.queryPoint(local.x, local.y);
        const clickedBody = bodies.find(b => b.label === 'Striker');
        if (clickedBody) selectedStriker = clickedBody.entity;
    }

    if (selectedStriker) {
        if (selectedStriker.teamId === this.currentTurn) {
            // 网络对战：只能拖动自己的棋子
            if (this.gameMode === 'pvp_online' && selectedStriker.teamId !== this.myTeamId) return;

            this.selectedBody = selectedStriker.body;
            this.selectedEntityId = selectedStriker.id; // 记录ID用于网络同步
            this.isDragging = true;
            this.aimingPointerId = pointerId;
            this.isDualControl = false;
            this.dragStartPos = { x: selectedStriker.body.position.x, y: selectedStriker.body.position.y };
            this.aimVector = { x: 0, y: 0 };
            this.drawAimingLine();
        } else {
             console.log("[GameScene] Not your turn.");
        }
    }
  }

  onPointerMove(e) {
    if (!this.isDragging || !this.selectedBody) return;
    if (e.id !== this.aimingPointerId) return;
    const local = this.container.toLocal(e.data.global); 
    if (this.isDualControl) {
        const deltaX = local.x - this.controlStartPos.x;
        const deltaY = local.y - this.controlStartPos.y;
        this.aimVector = { x: this.baseAimVector.x + deltaX, y: this.baseAimVector.y + deltaY };
    } else {
        this.aimVector = { x: this.dragStartPos.x - local.x, y: this.dragStartPos.y - local.y };
    }
    this.drawAimingLine();
  }

  drawAimingLine() {
    if (!this.selectedBody) return;

    this.aimGraphics.clear();
    
    const startX = this.dragStartPos.x;
    const startY = this.dragStartPos.y;
    
    const dx = this.aimVector.x;
    const dy = this.aimVector.y;
    
    const rawDist = Math.sqrt(dx*dx + dy*dy);

    if (rawDist < 40) return;

    const maxDist = GameConfig.gameplay.maxDragDistance;
    const displayDist = Math.min(rawDist, maxDist); 
    
    const angle = Math.atan2(dy, dx); 
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const r = GameConfig.dimensions.strikerDiameter / 2;

    this.aimGraphics.beginFill(0x000000, 0.15); 
    this.aimGraphics.drawCircle(startX, startY, r + displayDist);
    this.aimGraphics.endFill();

    const backEdgeX = startX - cos * r;
    const backEdgeY = startY - sin * r;
    
    const dotGap = 20;   
    const dotRadius = 5; 
    
    this.aimGraphics.lineStyle(0);
    this.aimGraphics.beginFill(0x444444, 0.8); 
    
    for (let d = dotGap; d <= displayDist; d += dotGap) {
        const dotX = backEdgeX - cos * d;
        const dotY = backEdgeY - sin * d;
        this.aimGraphics.drawCircle(dotX, dotY, dotRadius);
    }
    this.aimGraphics.endFill();

    const frontEdgeX = startX + cos * r;
    const frontEdgeY = startY + sin * r;
    
    const arrowTipX = frontEdgeX + cos * displayDist;
    const arrowTipY = frontEdgeY + sin * displayDist;

    const headSize = 35;
    const headDepth = headSize * Math.cos(Math.PI / 6); 
    
    let shaftLen = displayDist - headDepth + 3;
    
    if (shaftLen > 0) {
        const shaftEndX = frontEdgeX + cos * shaftLen;
        const shaftEndY = frontEdgeY + sin * shaftLen;

        this.aimGraphics.lineStyle(18, 0xB8860B); 
        this.aimGraphics.moveTo(frontEdgeX, frontEdgeY);
        this.aimGraphics.lineTo(shaftEndX, shaftEndY);

        this.aimGraphics.lineStyle(12, 0xFFD700); 
        this.aimGraphics.moveTo(frontEdgeX, frontEdgeY);
        this.aimGraphics.lineTo(shaftEndX, shaftEndY);

        this.aimGraphics.lineStyle(4, 0xFFFACD, 0.6); 
        this.aimGraphics.moveTo(frontEdgeX, frontEdgeY);
        this.aimGraphics.lineTo(shaftEndX, shaftEndY);
    }

    const p1x = arrowTipX + cos * 5; 
    const p1y = arrowTipY + sin * 5;
    
    const p2x = arrowTipX - headSize * Math.cos(angle - Math.PI/6);
    const p2y = arrowTipY - headSize * Math.sin(angle - Math.PI/6);
    
    const p3x = arrowTipX - headSize * Math.cos(angle + Math.PI/6);
    const p3y = arrowTipY - headSize * Math.sin(angle + Math.PI/6);

    this.aimGraphics.lineStyle(3, 0xB8860B); 
    this.aimGraphics.beginFill(0xFFA500);    
    this.aimGraphics.drawPolygon([p1x, p1y, p2x, p2y, p3x, p3y]);
    this.aimGraphics.endFill();
    
    this.aimGraphics.lineStyle(0);
    this.aimGraphics.beginFill(0xFFFFFF, 0.6);
    this.aimGraphics.drawCircle(arrowTipX - cos * 8, arrowTipY - sin * 8, 4);
    this.aimGraphics.endFill();
  }

  onPointerUp(e) {
    if (this.isDragging && this.selectedBody) {
      if (e.id !== this.aimingPointerId) {
          console.log("Ignored pointer up from non-aiming finger");
          return;
      }
      const dx = this.aimVector.x;
      const dy = this.aimVector.y;
      const currentLen = Math.sqrt(dx*dx + dy*dy);
      
      if (currentLen > 40) {
          const maxLen = GameConfig.gameplay.maxDragDistance;
          const effectiveDist = Math.min(currentLen, maxLen);
          const angle = Math.atan2(dy, dx);
          const forceMultiplier = GameConfig.gameplay.forceMultiplier;
          const force = {
            x: Math.cos(angle) * effectiveDist * forceMultiplier,
            y: Math.sin(angle) * effectiveDist * forceMultiplier
          };

          if (this.gameMode === 'pvp_online') {
              // 联网模式：不直接应用，而是发送
              console.log(`[Game] Sending Move: ${this.selectedEntityId}`, force);
              NetworkMgr.send({
                  type: NetMsg.MOVE,
                  payload: {
                      id: this.selectedEntityId,
                      force: force
                  }
              });
              // 本地先执行，假设网络无延迟（或者等待服务器回包再执行也可，但为了手感通常预测执行）
              // 由于是回合制，这里我们采取“本地预测执行”策略
              Matter.Body.applyForce(this.selectedBody, this.selectedBody.position, force);
              this.onTurnActionComplete();
          } else {
              // 本地模式
              Matter.Body.applyForce(this.selectedBody, this.selectedBody.position, force);
              this.onTurnActionComplete();
          }
      }
      
      this.resetDrag();
    }
  }

  resetDrag() {
    this.aimGraphics.clear();
    this.isDragging = false;
    this.selectedBody = null;
    this.selectedEntityId = null;
    this.aimingPointerId = null; 
    this.isDualControl = false;
    this.aimVector = { x: 0, y: 0 };
    this.baseAimVector = { x: 0, y: 0 };
    this.controlStartPos = { x: 0, y: 0 };
  }

  onTurnActionComplete(isRemote = false) {
    this.isMoving = true;
    AudioManager.playSFX('collision');
    this.turnTimer = 0;
    if (this.hud) this.hud.updateTimerVisuals(this.currentTurn, 0);
  }

  update(delta) {
    super.update(delta);
    if (this.isLoading || !this.physics.engine) return;
    
    if (this.repositionAnimations.length > 0) this.updateRepositionAnimations(delta);
    
    this.physics.update(16.66);

    this.strikers.forEach(s => s.update());
    if (this.ball) this.ball.update();

    // 更新进球条幅动画
    if (this.goalBanner) {
        this.goalBanner.update(delta);
    }

    // 更新粒子系统
    if (this.sparkSystem) {
        this.sparkSystem.update(delta);
    }

    this.updateStrikerHighlights();
    this.checkTurnState();

    if (!this.isMoving && !this.isGameOver) {
        if (this.ai && this.currentTurn === this.ai.teamId) {
            this.processAITurn();
        }
        this.updateTurnTimer(delta);
    }
  }
  
  // 更新复位动画
  updateRepositionAnimations(delta) {
      this.repositionAnimations = this.repositionAnimations.filter(anim => {
          anim.time += delta;
          const progress = Math.min(anim.time / anim.duration, 1.0);
          
          const ease = 1 - Math.pow(1 - progress, 3);
          
          const curX = anim.start.x + (anim.end.x - anim.start.x) * ease;
          const curY = anim.start.y + (anim.end.y - anim.start.y) * ease;
          
          Matter.Body.setPosition(anim.body, { x: curX, y: curY });
          Matter.Body.setVelocity(anim.body, { x: 0, y: 0 });
          Matter.Body.setAngularVelocity(anim.body, 0);
          
          if (progress >= 1.0) {
              anim.body.isSensor = false;
              Matter.Body.setVelocity(anim.body, { x: 0, y: 0 });
              return false; 
          }
          return true; 
      });
  }

  updateStrikerHighlights() {
      const canInteract = !this.isMoving && !this.isGameOver && !this.isLoading && this.repositionAnimations.length === 0;
      const isSelecting = !!this.selectedBody; 
      const shouldShowAll = canInteract && !isSelecting;
      
      this.strikers.forEach(s => {
          let shouldGlow = false;
          if (shouldShowAll) {
              // 联网模式下，只高亮自己的棋子
              if (this.gameMode === 'pvp_online') {
                  if (s.teamId === this.currentTurn && s.teamId === this.myTeamId) shouldGlow = true;
              } else {
                  if (s.teamId === this.currentTurn) shouldGlow = true;
              }
          }
          s.setHighlight(shouldGlow);
      });
  }

  updateTurnTimer(delta) {
      this.turnTimer -= delta / 1000;
      const ratio = Math.max(0, this.turnTimer / this.maxTurnTime);
      if (this.hud) {
          this.hud.updateTimerVisuals(this.currentTurn, ratio);
      }
      if (this.turnTimer <= 0) {
          this.handleTurnTimeout();
      }
  }

  handleTurnTimeout() {
      // 网络模式下，客户端不主动触发超时逻辑，等待服务器指令(或由玩家自行操作)
      // 但为了体验，如果超时太久（例如对方掉线），可以弹提示。
      // 为简化，这里仅在本地模式触发 AI 代打
      if (this.gameMode === 'pvp_online') return;

      console.log(`[Game] Turn timeout for Team ${this.currentTurn}`);
      if (this.isDragging) this.resetDrag();
      
      const tempAI = new AIController(this.physics, this.currentTurn);
      const teamStrikers = this.strikers.filter(s => s.teamId === this.currentTurn);
      const decision = tempAI.think(teamStrikers, this.ball);
      
      if (decision) {
          Matter.Body.applyForce(decision.striker.body, decision.striker.body.position, decision.force);
          this.onTurnActionComplete();
          Platform.showToast("操作超时，系统代踢");
      } else {
          this.onTurnActionComplete();
      }
  }

  checkTurnState() {
    if (this.isMoving && this.physics.isSleeping() && this.repositionAnimations.length === 0) {
        this.isMoving = false;
        
        // 联网模式不需要本地执行 EnforceFairPlay 和 SwitchTurn，完全依赖服务器（或者简化为本地先执行）
        // 为了流畅性，我们依然本地执行切换，通过 onNetMessage 的 nextTurn 来校准
        
        this.enforceFairPlay();
        
        // 如果是联网模式，切换回合的逻辑其实已经在收到 MOVE 时处理了一部分
        // 但如果球动了很久，这里是物理停止的时刻。
        // 在本地模式下，这里真正切换回合。
        if (this.gameMode !== 'pvp_online') {
            this.switchTurn();
        } else {
            // 联网模式下，收到 MOVE 时已经更新了 currentTurn，这里只是重置 Timer UI 和状态
            // 但如果服务器没有发 TURN_SYNC，我们这里需要确保状态正确
            this.resetTurnTimer();
            this.updateUI();
        }
    }
  }

  enforceFairPlay() {
      // 保持原有逻辑 (略) ...
      // 这个逻辑必须两端一致，因为它是确定性的。只要两端物理引擎一致，这个就会一致。
      const { strikerDiameter, goalWidth } = GameConfig.dimensions;
      const r = strikerDiameter / 2;
      const fieldLeft = this.fieldRect.x; const fieldRight = this.fieldRect.x + this.fieldRect.w;
      const fieldTop = this.fieldRect.y; const fieldBottom = this.fieldRect.y + this.fieldRect.h;
      const minY = fieldTop + r + 20; const maxY = fieldBottom - r - 20;
      const offsetDist = goalWidth * 3;

      this.strikers.forEach(striker => {
          const pos = striker.body.position;
          let targetX = null; let needsReset = false;
          const randomX = (Math.random() - 0.5) * strikerDiameter; // 这里的随机性会导致不同步！
          // FIX: 在联网模式下，FairPlay 的随机复位会导致位置不同步。
          // 应该由服务器计算并发下，或者去除随机性。
          // 暂时简单处理：去除随机性，使用固定偏移。
          
          const safeX = this.gameMode === 'pvp_online' ? 0 : randomX;

          if (pos.x < fieldLeft - r + 5) { targetX = fieldLeft + offsetDist + safeX; needsReset = true; }
          else if (pos.x > fieldRight + r - 5) { targetX = fieldRight - offsetDist + safeX; needsReset = true; }

          if (needsReset) {
              let targetPos = { x: targetX, y: (minY + maxY) / 2 };
              // 联网模式不再尝试寻找不重叠位置（因为计算复杂且易导致不同步），直接复位到固定点
              if (this.gameMode !== 'pvp_online') {
                for (let i = 0; i < 10; i++) {
                    const randY = Math.random() * (maxY - minY) + minY;
                    const candidate = { x: targetX, y: randY };
                    
                    const safeDistance = r * 2 + 10;
                    let overlap = false;
                    
                    for (const other of this.strikers) {
                        if (other === striker) continue; 
                        const dx = other.body.position.x - candidate.x;
                        const dy = other.body.position.y - candidate.y;
                        if (dx * dx + dy * dy < safeDistance * safeDistance) {
                            overlap = true;
                            break;
                        }
                    }
                    
                    if (!overlap) {
                        targetPos = candidate;
                        break; 
                    }
                }
                
                if (!targetPos) {
                    targetPos = { x: targetX, y: (minY + maxY) / 2 };
                }
                
                console.log(`[FairPlay] Animating striker out to (${targetPos.x.toFixed(0)}, ${targetPos.y.toFixed(0)})`);
              }
              
              striker.body.isSensor = true;
              
              this.repositionAnimations.push({
                  body: striker.body,
                  start: { x: pos.x, y: pos.y },
                  end: targetPos,
                  time: 0,
                  duration: 600 
              });
          }
      });
  }

  switchTurn() {
    this.currentTurn = this.currentTurn === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
    this.resetTurnTimer();
    this.updateUI();
  }

  resetTurnTimer() {
      this.turnTimer = this.maxTurnTime;
      if (this.hud) {
          this.hud.updateTimerVisuals(this.currentTurn, 1.0);
          const opponent = this.currentTurn === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
          this.hud.updateTimerVisuals(opponent, 0);
      }
  }

  updateUI() {
    if (this.hud) {
        this.hud.updateTurn(this.currentTurn);
    }
  }

  processAITurn() {
    if (!this.aiTimer) {
        this.aiTimer = setTimeout(() => {
            const decision = this.ai.think(this.strikers.filter(s => s.teamId === this.ai.teamId), this.ball);
            if (decision) {
                Matter.Body.applyForce(decision.striker.body, decision.striker.body.position, decision.force);
                this.onTurnActionComplete();
            } else {
                this.switchTurn();
            }
            this.aiTimer = null;
        }, 1000);
    }
  }

  onExit() {
    super.onExit();
    EventBus.off(Events.GOAL_SCORED, this);
    EventBus.off(Events.GAME_OVER, this);
    EventBus.off(Events.COLLISION_HIT, this);
    if (this.gameMode === 'pvp_online') {
        EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
    }
    this.physics.clear();
    if (this.aiTimer) clearTimeout(this.aiTimer);
  }
}
