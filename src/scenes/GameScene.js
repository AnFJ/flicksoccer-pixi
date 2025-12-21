import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import PhysicsEngine from '../core/PhysicsEngine.js';
import GameRules from '../core/GameRules.js';
import AIController from '../core/AIController.js';
import Striker from '../entities/Striker.js';
import Ball from '../entities/Ball.js';
import Goal from '../entities/Goal.js';
import EventBus from '../managers/EventBus.js';
import AudioManager from '../managers/AudioManager.js';
import Platform from '../managers/Platform.js';
import { GameConfig } from '../config.js';
import { TeamId, CollisionCategory, Events } from '../constants.js';

export default class GameScene extends BaseScene {
  constructor() {
    super();
    this.physics = new PhysicsEngine();
    this.rules = null;
    this.ai = null;
    
    // 实体管理
    this.strikers = [];
    this.ball = null;
    this.goals = [];

    // 游戏状态
    this.currentTurn = TeamId.RIGHT; // 默认右方先手
    this.isMoving = false; 
    this.isGameOver = false;

    // 交互
    this.selectedBody = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.isDragging = false;
    this.aimGraphics = new PIXI.Graphics();
    
    // UI
    this.scoreText = null;
    this.turnText = null;
  }

  onEnter() {
    super.onEnter();
    this.initGame();
  }

  initGame() {
    // 1. 物理初始化
    this.physics.init();
    this.rules = new GameRules(this.physics);
    
    // 2. 初始化 AI (默认为左侧)
    this.ai = new AIController(this.physics, TeamId.LEFT); 

    // 3. 场景搭建
    this.createLayout();
    this.setupFormation();
    this.createUI();

    // 4. 事件监听
    this.setupEvents();
    this.setupInteraction();

    // 5. 初始状态
    this.isGameOver = false;
    this.updateUI();
  }

  /**
   * 创建布局：顶部栏 + 球场
   */
  createLayout() {
    const { designWidth, designHeight, dimensions } = GameConfig;
    
    // --- 1. 顶部区域 (玩家信息栏) ---
    // 高度固定 100px
    const topBarBg = new PIXI.Graphics();
    topBarBg.rect(0, 0, designWidth, dimensions.topBarHeight);
    topBarBg.fill(0x1a1a1a); 
    // 下边框
    topBarBg.moveTo(0, dimensions.topBarHeight);
    topBarBg.lineTo(designWidth, dimensions.topBarHeight);
    topBarBg.stroke({ width: 2, color: 0x444444 });
    this.container.addChild(topBarBg);

    // --- 2. 球场区域 ---
    // 球场位于顶部栏下方。为了美观，我们在剩余空间(1080-100 = 980)中垂直居中球场(926)
    // 剩余高度
    const remainingHeight = designHeight - dimensions.topBarHeight;
    // 垂直边距
    const marginY = (remainingHeight - dimensions.fieldHeight) / 2;
    
    // 球场起始坐标 (左上角)
    // X轴居中
    const fieldStartX = (designWidth - dimensions.fieldWidth) / 2;
    const fieldStartY = dimensions.topBarHeight + marginY;

    this.fieldRect = { 
        x: fieldStartX, 
        y: fieldStartY, 
        w: dimensions.fieldWidth, 
        h: dimensions.fieldHeight 
    };

    this.createFieldGraphics(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    this.createPhysicsWalls(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    this.createGoals(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
  }

  createFieldGraphics(x, y, w, h) {
    const ground = new PIXI.Graphics();
    
    // 草地背景
    ground.rect(x, y, w, h);
    ground.fill(0x27ae60);
    
    // 装饰性条纹 (10条)
    const stripeWidth = w / 10;
    for(let i=0; i<10; i+=2) {
        ground.rect(x + i * stripeWidth, y, stripeWidth, h);
        ground.fill({ color: 0x000000, alpha: 0.05 });
    }

    // 边框 (白线)
    ground.rect(x, y, w, h);
    ground.stroke({ width: 5, color: 0xffffff });

    // 中线
    ground.moveTo(x + w / 2, y);
    ground.lineTo(x + w / 2, y + h);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    
    // 中圈 (半径150)
    ground.circle(x + w/2, y + h/2, 150);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    
    // 禁区 (宽250, 高500 - 这里的比例可以根据球场高度自适应，暂时保持视觉比例)
    const boxW = 250;
    const boxH = 500;
    // 左禁区
    ground.rect(x, y + h/2 - boxH/2, boxW, boxH);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    // 右禁区
    ground.rect(x + w - boxW, y + h/2 - boxH/2, boxW, boxH);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });

    this.container.addChildAt(ground, 0); // 最底层
  }

  createPhysicsWalls(x, y, w, h) {
    const t = GameConfig.dimensions.wallThickness; // 墙壁厚度
    const centerX = x + w / 2;
    const centerY = y + h / 2;
    const goalOpening = GameConfig.dimensions.goalOpening;

    // 计算侧墙长度 (球场高度减去球门开口，再除以2)
    const sideWallLen = (h - goalOpening) / 2;

    const walls = [
      // 上墙 (完整)
      Matter.Bodies.rectangle(centerX, y - t/2, w + t*2, t, { isStatic: true, label: 'WallTop' }),
      // 下墙 (完整)
      Matter.Bodies.rectangle(centerX, y + h + t/2, w + t*2, t, { isStatic: true, label: 'WallBottom' }),
      
      // 左上墙
      Matter.Bodies.rectangle(x - t/2, y + sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallLeftTop' }),
      // 左下墙
      Matter.Bodies.rectangle(x - t/2, y + h - sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallLeftBottom' }),
      
      // 右上墙
      Matter.Bodies.rectangle(x + w + t/2, y + sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallRightTop' }),
      // 右下墙
      Matter.Bodies.rectangle(x + w + t/2, y + h - sideWallLen/2, t, sideWallLen, { isStatic: true, label: 'WallRightBottom' })
    ];

    walls.forEach(body => {
        body.collisionFilter = { category: CollisionCategory.WALL, mask: CollisionCategory.DEFAULT | CollisionCategory.BALL | CollisionCategory.STRIKER };
        body.render.visible = false;
        // 增加弹性，让球反弹更自然
        body.restitution = 1.0; 
    });
    this.physics.add(walls);
  }

  createGoals(x, y, w, h) {
    const { goalWidth, goalOpening } = GameConfig.dimensions;
    const centerY = y + h / 2;

    // 左球门 (Left Team Goal)
    // 位置：球场左边缘外侧
    // 宽度：config.goalWidth (X轴深度)
    // 高度：config.goalOpening (Y轴开口)
    const goalLeft = new Goal(x - goalWidth/2, centerY, goalWidth, goalOpening, TeamId.LEFT);
    
    // 右球门 (Right Team Goal)
    const goalRight = new Goal(x + w + goalWidth/2, centerY, goalWidth, goalOpening, TeamId.RIGHT);
    
    this.goals.push(goalLeft, goalRight);
    this.container.addChild(goalLeft.view, goalRight.view);
    this.physics.add(goalLeft.body);
    this.physics.add(goalRight.body);
  }

  setupFormation() {
    this.clearEntities();

    const { x, y, w, h } = this.fieldRect;
    const centerY = y + h / 2;
    const centerX = x + w / 2;

    // 创建足球
    this.ball = new Ball(centerX, centerY);
    this.addEntity(this.ball);

    // 棋子半径 (直径/2)
    const r = GameConfig.dimensions.strikerDiameter / 2;

    // --- 阵型坐标 (相对于中心点) ---
    // 5个棋子: 1个守门员, 2后卫, 2前锋
    
    // 左侧阵型 (红方)
    const leftFormation = [
      { x: -w * 0.45, y: 0 },          // 守门员 (靠近球门)
      { x: -w * 0.30, y: -h * 0.15 },  // 后卫上
      { x: -w * 0.30, y: h * 0.15 },   // 后卫下
      { x: -w * 0.12, y: -h * 0.20 },  // 前锋上
      { x: -w * 0.12, y: h * 0.20 },   // 前锋下
    ];

    // 右侧阵型 (蓝方) - 镜像X坐标
    const rightFormation = leftFormation.map(pos => ({ x: -pos.x, y: pos.y }));

    // 生成左侧实体
    leftFormation.forEach(pos => {
      const s = new Striker(centerX + pos.x, centerY + pos.y, r, TeamId.LEFT);
      this.strikers.push(s);
      this.addEntity(s);
    });

    // 生成右侧实体
    rightFormation.forEach(pos => {
      const s = new Striker(centerX + pos.x, centerY + pos.y, r, TeamId.RIGHT);
      this.strikers.push(s);
      this.addEntity(s);
    });
  }

  addEntity(entity) {
    this.container.addChild(entity.view);
    this.physics.add(entity.body);
  }

  clearEntities() {
    this.strikers.forEach(s => {
        Matter.World.remove(this.physics.engine.world, s.body);
        this.container.removeChild(s.view);
    });
    this.strikers = [];
    if (this.ball) {
        Matter.World.remove(this.physics.engine.world, this.ball.body);
        this.container.removeChild(this.ball.view);
        this.ball = null;
    }
  }

  createUI() {
    const { designWidth, dimensions } = GameConfig;
    const centerY = dimensions.topBarHeight / 2;

    // 比分板 (顶部居中)
    this.scoreText = new PIXI.Text({
        text: '0 : 0',
        style: { fontFamily: 'Arial', fontSize: 50, fill: 0xffffff, fontWeight: 'bold' }
    });
    this.scoreText.anchor.set(0.5);
    this.scoreText.position.set(designWidth / 2, centerY);
    this.container.addChild(this.scoreText);

    // 回合提示 (比分板下方一点，或者在比分板左右)
    this.turnText = new PIXI.Text({
        text: '等待开球...',
        style: { fontFamily: 'Arial', fontSize: 24, fill: 0x3498db }
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(designWidth / 2, centerY + 35);
    this.container.addChild(this.turnText);

    // 玩家头像区域 (左上角)
    this.createAvatar(60, centerY, TeamId.LEFT, "AI Player");
    
    // 玩家头像区域 (右上角)
    this.createAvatar(designWidth - 60, centerY, TeamId.RIGHT, "Player");

    this.container.addChild(this.aimGraphics);

    // 退出按钮 (放在右下角，不遮挡球场)
    const exitBtn = new PIXI.Container();
    const btnBg = new PIXI.Graphics();
    btnBg.roundRect(0, 0, 100, 40, 10);
    btnBg.fill(0x7f8c8d);
    const btnText = new PIXI.Text({ text: '退出', style: { fontSize: 20, fill: 0xffffff }});
    btnText.anchor.set(0.5);
    btnText.position.set(50, 20);
    exitBtn.addChild(btnBg, btnText);
    exitBtn.position.set(designWidth - 120, GameConfig.designHeight - 60);
    exitBtn.eventMode = 'static';
    exitBtn.cursor = 'pointer';
    exitBtn.on('pointerdown', () => SceneManager.changeScene(MenuScene));
    this.container.addChild(exitBtn);
  }

  createAvatar(x, y, teamId, name) {
      const isLeft = teamId === TeamId.LEFT;
      const container = new PIXI.Container();
      container.position.set(x, y);
      
      // 简化版头像
      const bg = new PIXI.Graphics();
      bg.circle(0, 0, 35);
      bg.fill(0x333333);
      bg.stroke({ width: 3, color: isLeft ? 0xe74c3c : 0x3498db });

      const nameText = new PIXI.Text({
          text: name,
          style: { fontSize: 20, fill: 0xaaaaaa }
      });
      nameText.anchor.set(isLeft ? 0 : 1, 0.5);
      nameText.position.set(isLeft ? 50 : -50, 0);

      container.addChild(bg, nameText);
      this.container.addChild(container);
  }

  setupEvents() {
    EventBus.on(Events.GOAL_SCORED, (data) => {
        AudioManager.playSFX('goal');
        this.scoreText.text = `${data.newScore[TeamId.LEFT]} : ${data.newScore[TeamId.RIGHT]}`;
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
  }

  setupInteraction() {
    this.container.eventMode = 'static'; 
    this.container.on('pointerdown', this.onPointerDown.bind(this));
    this.container.on('pointermove', this.onPointerMove.bind(this));
    this.container.on('pointerup', this.onPointerUp.bind(this));
    this.container.on('pointerupoutside', this.onPointerUp.bind(this));
  }

  onPointerDown(e) {
    if (this.isMoving || this.isGameOver) return;
    if (this.ai && this.currentTurn === this.ai.teamId) return;

    const local = this.container.toLocal(e.global);
    const bodies = this.physics.queryPoint(local.x, local.y);

    if (bodies.length > 0) {
      const body = bodies[0];
      const entity = body.entity;

      if (entity instanceof Striker && entity.teamId === this.currentTurn) {
        this.selectedBody = body;
        this.isDragging = true;
        this.dragStartPos = { x: local.x, y: local.y };
      }
    }
  }

  onPointerMove(e) {
    if (!this.isDragging || !this.selectedBody) return;

    const local = this.container.toLocal(e.global);
    this.aimGraphics.clear();
    
    const startX = this.selectedBody.position.x;
    const startY = this.selectedBody.position.y;
    
    const dx = this.dragStartPos.x - local.x;
    const dy = this.dragStartPos.y - local.y;
    
    const currentLen = Math.sqrt(dx*dx + dy*dy);
    const maxLen = GameConfig.gameplay.maxDragDistance;
    let scale = 1;
    if (currentLen > maxLen) scale = maxLen / currentLen;

    const aimX = startX + dx * scale;
    const aimY = startY + dy * scale;

    this.aimGraphics.moveTo(startX, startY);
    this.aimGraphics.lineTo(aimX, aimY);
    this.aimGraphics.stroke({ width: 6, color: 0xffffff, cap: 'round' });

    this.aimGraphics.circle(startX, startY, 60);
    this.aimGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
  }

  onPointerUp(e) {
    if (this.isDragging && this.selectedBody) {
      const local = this.container.toLocal(e.global);
      
      const dx = this.dragStartPos.x - local.x;
      const dy = this.dragStartPos.y - local.y;
      
      const currentLen = Math.sqrt(dx*dx + dy*dy);
      const maxLen = GameConfig.gameplay.maxDragDistance;
      let scale = 1;
      if (currentLen > maxLen) scale = maxLen / currentLen;
      
      const forceMultiplier = GameConfig.gameplay.forceMultiplier;
      const force = {
        x: dx * scale * forceMultiplier,
        y: dy * scale * forceMultiplier
      };

      if (currentLen > 10) {
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
  }

  onTurnActionComplete() {
    this.isMoving = true;
    AudioManager.playSFX('collision');
  }

  update(delta) {
    super.update(delta);
    
    // 物理步长
    this.physics.update(16.66);

    // 渲染同步
    this.strikers.forEach(s => s.update());
    if (this.ball) this.ball.update();

    // 回合检查
    this.checkTurnState();

    // AI
    if (!this.isMoving && !this.isGameOver && this.ai && this.currentTurn === this.ai.teamId) {
        this.processAITurn();
    }
  }

  checkTurnState() {
    if (this.isMoving && this.physics.isSleeping()) {
        this.isMoving = false;
        this.switchTurn();
    }
  }

  switchTurn() {
    this.currentTurn = this.currentTurn === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
    this.updateUI();
  }

  updateUI() {
    if (this.turnText) {
        const isLeft = this.currentTurn === TeamId.LEFT;
        this.turnText.text = isLeft ? "红方回合 (AI)" : "蓝方回合 (Player)";
        this.turnText.style.fill = isLeft ? 0xe74c3c : 0x3498db;
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
    this.physics.clear();
    if (this.aiTimer) clearTimeout(this.aiTimer);
  }
}