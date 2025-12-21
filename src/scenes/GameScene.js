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
    
    // 2. 初始化 AI
    // 左侧 (TeamId.LEFT) 为 AI, 右侧 (TeamId.RIGHT) 为玩家
    this.ai = new AIController(this.physics, TeamId.LEFT); 

    // 3. 场景搭建
    this.createField();
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
   * 绘制球场 (横向)
   */
  createField() {
    const { designWidth, designHeight } = GameConfig;
    // 球场尺寸: 宽 1824, 高 926
    const fieldW = 1824; 
    const fieldH = 926; 
    
    // 计算居中位置
    const startX = (designWidth - fieldW) / 2;
    const startY = (designHeight - fieldH) / 2; 

    this.fieldRect = { x: startX, y: startY, w: fieldW, h: fieldH };

    // --- 绘制视觉层 ---
    const ground = new PIXI.Graphics();
    
    // 草地背景
    ground.rect(startX, startY, fieldW, fieldH);
    ground.fill(0x27ae60);
    
    // 草地条纹 (装饰)
    const stripeWidth = fieldW / 10;
    for(let i=0; i<10; i+=2) {
        ground.rect(startX + i * stripeWidth, startY, stripeWidth, fieldH);
        ground.fill({ color: 0x000000, alpha: 0.05 });
    }

    // 边框
    ground.rect(startX, startY, fieldW, fieldH);
    ground.stroke({ width: 5, color: 0xffffff });

    // 中线 (垂直)
    ground.moveTo(startX + fieldW / 2, startY);
    ground.lineTo(startX + fieldW / 2, startY + fieldH);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    
    // 中圈
    ground.circle(startX + fieldW/2, startY + fieldH/2, 150);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    
    // 禁区 (左)
    ground.rect(startX, startY + fieldH/2 - 250, 250, 500);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });

    // 禁区 (右)
    ground.rect(startX + fieldW - 250, startY + fieldH/2 - 250, 250, 500);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });

    this.container.addChildAt(ground, 0);

    // --- 物理墙壁 ---
    const t = GameConfig.physics.wallThickness;
    const centerX = startX + fieldW / 2;
    const centerY = startY + fieldH / 2;

    const walls = [
      // 上墙
      Matter.Bodies.rectangle(centerX, startY - t/2, fieldW, t, { isStatic: true, label: 'WallTop' }),
      // 下墙
      Matter.Bodies.rectangle(centerX, startY + fieldH + t/2, fieldW, t, { isStatic: true, label: 'WallBottom' }),
      // 左墙 (上半段)
      Matter.Bodies.rectangle(startX - t/2, startY + fieldH/2 - 200 - fieldH/4, t, fieldH/2 - 100, { isStatic: true, label: 'WallLeftTop' }),
      // 左墙 (下半段)
      Matter.Bodies.rectangle(startX - t/2, startY + fieldH/2 + 200 + fieldH/4, t, fieldH/2 - 100, { isStatic: true, label: 'WallLeftBottom' }),
      // 右墙 (上半段)
      Matter.Bodies.rectangle(startX + fieldW + t/2, startY + fieldH/2 - 200 - fieldH/4, t, fieldH/2 - 100, { isStatic: true, label: 'WallRightTop' }),
      // 右墙 (下半段)
      Matter.Bodies.rectangle(startX + fieldW + t/2, startY + fieldH/2 + 200 + fieldH/4, t, fieldH/2 - 100, { isStatic: true, label: 'WallRightBottom' })
    ];

    walls.forEach(w => {
        w.collisionFilter = { category: CollisionCategory.WALL, mask: CollisionCategory.DEFAULT | CollisionCategory.BALL | CollisionCategory.STRIKER };
        w.render.visible = false;
    });
    this.physics.add(walls);

    // --- 球门 ---
    // 球门深度 201 (题目), 宽度 107 (题目太小，改为 300 以适应游戏性) -> 配合横屏改为 高300, 宽80
    const goalW = 80;
    const goalH = 300;
    
    // 左球门 (属于 Left Team 防守)
    const goalLeft = new Goal(startX - goalW/2, centerY, goalW, goalH, TeamId.LEFT);
    // 右球门 (属于 Right Team 防守)
    const goalRight = new Goal(startX + fieldW + goalW/2, centerY, goalW, goalH, TeamId.RIGHT);
    
    this.goals.push(goalLeft, goalRight);
    this.container.addChild(goalLeft.view, goalRight.view);
    this.physics.add(goalLeft.body);
    this.physics.add(goalRight.body);
  }

  /**
   * 布置阵型 5v5 (左右对抗)
   */
  setupFormation() {
    this.clearEntities();

    const { x, y, w, h } = this.fieldRect;
    const centerY = y + h / 2;
    const centerX = x + w / 2;

    // 创建足球
    this.ball = new Ball(centerX, centerY);
    this.addEntity(this.ball);

    const r = 40; 

    // 左侧阵型 (Red) - 坐标相对于 CenterX, CenterY
    const leftFormation = [
      { x: -w * 0.45, y: 0 },         // 守门员
      { x: -w * 0.3, y: -h * 0.2 },   // 后卫上
      { x: -w * 0.3, y: h * 0.2 },    // 后卫下
      { x: -w * 0.1, y: -h * 0.15 },  // 前锋上
      { x: -w * 0.1, y: h * 0.15 },   // 前锋下
    ];

    // 右侧阵型 (Blue) - 镜像
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
    const { designWidth, designHeight } = GameConfig;
    
    // 顶部背景条
    const topBar = new PIXI.Graphics();
    topBar.rect(0, 0, designWidth, 100);
    topBar.fill({ color: 0x000000, alpha: 0.5 });
    this.container.addChild(topBar);

    // 比分板 (顶部居中)
    this.scoreText = new PIXI.Text({
        text: '0 : 0',
        style: { fontFamily: 'Arial', fontSize: 60, fill: 0xffffff, fontWeight: 'bold' }
    });
    this.scoreText.anchor.set(0.5);
    this.scoreText.position.set(designWidth / 2, 50);
    this.container.addChild(this.scoreText);

    // 回合提示 (比分下方)
    this.turnText = new PIXI.Text({
        text: '等待开球...',
        style: { fontFamily: 'Arial', fontSize: 30, fill: 0x3498db }
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(designWidth / 2, 120);
    this.container.addChild(this.turnText);

    // 玩家头像区域 (左上角)
    this.createAvatar(40, 10, TeamId.LEFT, "AI Player");
    
    // 玩家头像区域 (右上角)
    this.createAvatar(designWidth - 140, 10, TeamId.RIGHT, "Player");

    this.container.addChild(this.aimGraphics);

    // 退出按钮 (左下角)
    const exitBtn = new PIXI.Container();
    const btnBg = new PIXI.Graphics();
    btnBg.roundRect(0, 0, 120, 50, 10);
    btnBg.fill(0x95a5a6);
    const btnText = new PIXI.Text({ text: '退出', style: { fontSize: 24, fill: 0xffffff }});
    btnText.anchor.set(0.5);
    btnText.position.set(60, 25);
    exitBtn.addChild(btnBg, btnText);
    exitBtn.position.set(20, designHeight - 70);
    exitBtn.eventMode = 'static';
    exitBtn.cursor = 'pointer';
    exitBtn.on('pointerdown', () => SceneManager.changeScene(MenuScene));
    this.container.addChild(exitBtn);
  }

  createAvatar(x, y, teamId, name) {
      const container = new PIXI.Container();
      container.position.set(x, y);
      
      const bg = new PIXI.Graphics();
      bg.roundRect(0, 0, 100, 80, 10);
      bg.fill(0x333333);
      
      // 颜色标识
      const colorStrip = new PIXI.Graphics();
      colorStrip.rect(0, 75, 100, 5);
      colorStrip.fill(teamId === TeamId.LEFT ? 0xe74c3c : 0x3498db);

      const nameText = new PIXI.Text({
          text: name,
          style: { fontSize: 18, fill: 0xaaaaaa }
      });
      nameText.anchor.set(0.5);
      nameText.position.set(50, 40);

      container.addChild(bg, colorStrip, nameText);
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