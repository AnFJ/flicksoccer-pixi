
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
import { GameConfig } from '../config.js';
import { TeamId, CollisionCategory, Events } from '../constants.js';

// 引入拆分后的 UI 组件
import AdBoard from '../ui/AdBoard.js';
import GameMenuButton from '../ui/GameMenuButton.js';
import GameHUD from '../ui/GameHUD.js';
// 引入进球条幅
import GoalBanner from '../ui/GoalBanner.js';
// 新增：引入火星特效
import SparkSystem from '../vfx/SparkSystem.js';
// 修复报错：引入 MenuScene
import MenuScene from './MenuScene.js';

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

    // --- 倒计时相关 ---
    this.turnTimer = 0;
    this.maxTurnTime = GameConfig.gameplay.turnTimeLimit || 30; // 默认30秒

    this.selectedBody = null;
    
    // --- 瞄准核心数据 ---
    this.dragStartPos = { x: 0, y: 0 };
    this.aimVector = { x: 0, y: 0 };
    
    // --- 双指接管数据 ---
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
    } else {
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
    const centerY = y + h / 2;
    const centerX = x + w / 2;

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

    leftFormation.forEach(pos => {
      const s = new Striker(centerX + pos.x, centerY + pos.y, r, TeamId.LEFT);
      this.strikers.push(s);
      this.addEntity(s);
    });

    rightFormation.forEach(pos => {
      const s = new Striker(centerX + pos.x, centerY + pos.y, r, TeamId.RIGHT);
      this.strikers.push(s);
      this.addEntity(s);
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
        if (this.hud) {
            this.hud.updateScore(data.newScore[TeamId.LEFT], data.newScore[TeamId.RIGHT]);
        }
        
        // 播放进球动画
        if (this.goalBanner) {
            this.goalBanner.play();
        }
        
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
        setTimeout(() => SceneManager.changeScene(MenuScene), 3000); 
    }, this);

    // 新增：监听碰撞火星事件
    EventBus.on(Events.COLLISION_HIT, (data) => {
        if (this.sparkSystem) {
            this.sparkSystem.emit(data.x, data.y, data.intensity);
        }
    }, this);
  }

  setupInteraction() {
    this.container.interactive = true; 
    
    this.container.on('pointerdown', this.onPointerDown.bind(this));
    this.container.on('pointermove', this.onPointerMove.bind(this));
    this.container.on('pointerup', this.onPointerUp.bind(this));
    this.container.on('pointerupoutside', this.onPointerUp.bind(this));
  }

  // ... (onPointerDown, onPointerMove, drawAimingLine, drawDashedLine, onPointerUp, resetDrag 保持不变) ...
  onPointerDown(e) {
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
        console.log(`[GameScene] Switching control to new pointer: ${pointerId}`);
        this.aimingPointerId = pointerId;
        this.isDualControl = true;
        this.controlStartPos = { x: local.x, y: local.y };
        this.baseAimVector = { ...this.aimVector };
        return; 
    }
    
    let visualTarget = e.target;
    let selectedStriker = null;

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
        if (clickedBody) {
             selectedStriker = clickedBody.entity;
        }
    }

    if (selectedStriker) {
        if (selectedStriker.teamId === this.currentTurn) {
            this.selectedBody = selectedStriker.body;
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
        this.aimVector = {
            x: this.baseAimVector.x + deltaX,
            y: this.baseAimVector.y + deltaY
        };
    } else {
        this.aimVector = {
            x: this.dragStartPos.x - local.x,
            y: this.dragStartPos.y - local.y
        };
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
      const maxLen = GameConfig.gameplay.maxDragDistance;
      const effectiveDist = Math.min(currentLen, maxLen);
      const angle = Math.atan2(dy, dx);
      const forceMultiplier = GameConfig.gameplay.forceMultiplier;
      const force = {
        x: Math.cos(angle) * effectiveDist * forceMultiplier,
        y: Math.sin(angle) * effectiveDist * forceMultiplier
      };

      if (currentLen > 40) {
        Matter.Body.applyForce(this.selectedBody, this.selectedBody.position, force);
        this.onTurnActionComplete();
      }
      
      this.resetDrag();
    }
  }

  resetDrag() {
    this.aimGraphics.clear();
    this.isDragging = false;
    this.selectedBody = null;
    this.aimingPointerId = null; 
    this.isDualControl = false;
    this.aimVector = { x: 0, y: 0 };
    this.baseAimVector = { x: 0, y: 0 };
    this.controlStartPos = { x: 0, y: 0 };
  }

  onTurnActionComplete() {
    this.isMoving = true;
    AudioManager.playSFX('collision');
    this.turnTimer = 0;
    if (this.hud) {
        this.hud.updateTimerVisuals(this.currentTurn, 0);
    }
  }

  update(delta) {
    super.update(delta);
    
    if (this.isLoading || !this.physics.engine) {
        return;
    }
    
    if (this.repositionAnimations.length > 0) {
        this.updateRepositionAnimations(delta);
    } 
    
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

    if (!this.isMoving && !this.isGameOver && this.ai && this.currentTurn === this.ai.teamId) {
        this.processAITurn();
    } 
    else if (!this.isMoving && !this.isGameOver) {
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
              if (s.teamId === this.currentTurn) {
                  shouldGlow = true;
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
      console.log(`[Game] Turn timeout for Team ${this.currentTurn}, forcing move.`);
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
        
        this.enforceFairPlay();
        
        this.switchTurn();
    }
  }

  enforceFairPlay() {
      const { strikerDiameter, goalWidth } = GameConfig.dimensions;
      const r = strikerDiameter / 2;
      const fieldLeft = this.fieldRect.x;
      const fieldRight = this.fieldRect.x + this.fieldRect.w;

      const fieldTop = this.fieldRect.y;
      const fieldBottom = this.fieldRect.y + this.fieldRect.h;

      const minY = fieldTop + r + 20;
      const maxY = fieldBottom - r - 20;

      const offsetDist = goalWidth * 3;

      this.strikers.forEach(striker => {
          const pos = striker.body.position;
          let targetX = null;
          let needsReset = false;

          const randomX = (Math.random() - 0.5) * strikerDiameter;

          if (pos.x < fieldLeft - r + 5) {
              targetX = fieldLeft + offsetDist + randomX;
              needsReset = true;
          }
          else if (pos.x > fieldRight + r - 5) {
              targetX = fieldRight - offsetDist + randomX;
              needsReset = true;
          }

          if (needsReset) {
              let targetPos = null;
              
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
    // 新增：移除特效事件监听
    EventBus.off(Events.COLLISION_HIT, this);
    this.physics.clear();
    if (this.aiTimer) clearTimeout(this.aiTimer);
  }
}
