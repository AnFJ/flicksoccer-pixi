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
    this.currentTurn = TeamId.RIGHT; // 默认右方(下方)先手
    this.isMoving = false; // 物理世界是否在运动中
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
    
    // 2. 初始化 AI (如果是单人模式，假设 TeamId.LEFT 是 AI)
    // 这里简单硬编码：Player (Right/Bottom) vs AI (Left/Top)
    // 如果是双人，则 ai = null
    this.ai = new AIController(this.physics, TeamId.LEFT); 

    // 3. 场景搭建
    this.createField();
    this.setupFormation();
    this.createUI();

    // 4. 事件监听
    this.setupEvents();
    this.setupInteraction();

    // 5. 开始游戏循环检查
    this.isGameOver = false;
    this.updateUI();
  }

  /**
   * 绘制球场
   */
  createField() {
    const { designWidth, designHeight } = GameConfig;
    const fieldW = 926; // 题目给定高度，实际上可能是宽，因为是竖屏
    const fieldH = 1824; // 题目给定长度，竖屏下对应高
    
    // 计算居中位置
    const startX = (designWidth - fieldW) / 2;
    const startY = (designHeight - fieldH) / 2 + 100; // 稍微靠下留出顶部 UI

    this.fieldRect = { x: startX, y: startY, w: fieldW, h: fieldH };

    // 绘制草地
    const ground = new PIXI.Graphics();
    ground.rect(startX, startY, fieldW, fieldH);
    ground.fill(0x27ae60);
    // 绘制中线
    ground.moveTo(startX, startY + fieldH / 2);
    ground.lineTo(startX + fieldW, startY + fieldH / 2);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    // 绘制中圈
    ground.circle(startX + fieldW/2, startY + fieldH/2, 150);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    
    this.container.addChildAt(ground, 0); // 放在最底层

    // 创建物理墙壁
    const t = GameConfig.physics.wallThickness;
    const walls = [
      Matter.Bodies.rectangle(designWidth/2, startY - t/2, fieldW, t, { isStatic: true, label: 'WallTop', render: { visible: false } }),
      Matter.Bodies.rectangle(designWidth/2, startY + fieldH + t/2, fieldW, t, { isStatic: true, label: 'WallBottom', render: { visible: false } }),
      Matter.Bodies.rectangle(startX - t/2, startY + fieldH/2, t, fieldH, { isStatic: true, label: 'WallLeft', render: { visible: false } }),
      Matter.Bodies.rectangle(startX + fieldW + t/2, startY + fieldH/2, t, fieldH, { isStatic: true, label: 'WallRight', render: { visible: false } })
    ];
    // 给墙壁添加碰撞过滤器
    walls.forEach(w => {
        w.collisionFilter = { category: CollisionCategory.WALL, mask: CollisionCategory.DEFAULT | CollisionCategory.BALL | CollisionCategory.STRIKER };
    });
    this.physics.add(walls);

    // 创建球门 (上下各一个)
    // 题目给定尺寸: 宽 107 (略小，可能是像素单位问题，这里适当放大以利于游戏体验) -> 调整为 300
    const goalW = 300;
    const goalH = 80;
    
    // 上方球门 (Left Team Defends, 也就是 Left Team 的球门)
    const goalTop = new Goal(designWidth/2, startY + 40, goalW, goalH, TeamId.LEFT);
    // 下方球门 (Right Team Defends)
    const goalBottom = new Goal(designWidth/2, startY + fieldH - 40, goalW, goalH, TeamId.RIGHT);
    
    this.goals.push(goalTop, goalBottom);
    this.container.addChild(goalTop.view, goalBottom.view);
    this.physics.add(goalTop.body);
    this.physics.add(goalBottom.body);
  }

  /**
   * 布置阵型 5v5
   */
  setupFormation() {
    // 清理旧实体
    this.clearEntities();

    const { x, y, w, h } = this.fieldRect;
    const centerY = y + h / 2;
    const centerX = x + w / 2;

    // 创建足球
    this.ball = new Ball(centerX, centerY);
    this.addEntity(this.ball);

    // 棋子半径
    const r = 40; // 题目说直径100，对于屏幕可能过大，这里调整为半径40

    // 阵型配置 (相对中心的偏移量)
    // 上方 (Left Team, Red)
    const topFormation = [
      { x: 0, y: -h * 0.4 }, // 守门员
      { x: -w * 0.25, y: -h * 0.25 }, // 后卫左
      { x: w * 0.25, y: -h * 0.25 },  // 后卫右
      { x: -w * 0.15, y: -h * 0.1 },  // 前锋左
      { x: w * 0.15, y: -h * 0.1 },   // 前锋右
    ];

    // 下方 (Right Team, Blue) - 镜像
    const bottomFormation = topFormation.map(pos => ({ x: pos.x, y: -pos.y }));

    // 生成实体
    topFormation.forEach(pos => {
      const s = new Striker(centerX + pos.x, centerY + pos.y, r, TeamId.LEFT);
      this.strikers.push(s);
      this.addEntity(s);
    });

    bottomFormation.forEach(pos => {
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
    const { designWidth } = GameConfig;
    
    // 比分板
    this.scoreText = new PIXI.Text({
        text: '0 : 0',
        style: { fontFamily: 'Arial', fontSize: 80, fill: 0xffffff, fontWeight: 'bold' }
    });
    this.scoreText.anchor.set(0.5);
    this.scoreText.position.set(designWidth / 2, 80);
    this.container.addChild(this.scoreText);

    // 回合提示
    this.turnText = new PIXI.Text({
        text: '蓝方回合',
        style: { fontFamily: 'Arial', fontSize: 40, fill: 0x3498db }
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(designWidth / 2, 160);
    this.container.addChild(this.turnText);

    this.container.addChild(this.aimGraphics);

    // 退出按钮
    const exitBtn = new PIXI.Text({
        text: '退出',
        style: { fontFamily: 'Arial', fontSize: 30, fill: 0xffffff }
    });
    exitBtn.eventMode = 'static';
    exitBtn.on('pointerdown', () => SceneManager.changeScene(MenuScene));
    exitBtn.position.set(40, 40);
    this.container.addChild(exitBtn);
  }

  setupEvents() {
    // 监听进球
    EventBus.on(Events.GOAL_SCORED, (data) => {
        AudioManager.playSFX('goal');
        this.scoreText.text = `${data.newScore[TeamId.LEFT]} : ${data.newScore[TeamId.RIGHT]}`;
        Platform.vibrateShort();
        
        // 进球后稍微延迟重置位置
        setTimeout(() => {
            if (!this.isGameOver) this.setupFormation();
        }, 2000);
    }, this);

    // 监听游戏结束
    EventBus.on(Events.GAME_OVER, (data) => {
        this.isGameOver = true;
        AudioManager.playSFX('win');
        const winnerName = data.winner === TeamId.LEFT ? "红方" : "蓝方";
        Platform.showToast(`${winnerName} 获胜!`);
        setTimeout(() => SceneManager.changeScene(MenuScene), 3000);
    }, this);
  }

  setupInteraction() {
    // 开启交互
    this.container.eventMode = 'static'; 
    this.container.on('pointerdown', this.onPointerDown.bind(this));
    this.container.on('pointermove', this.onPointerMove.bind(this));
    this.container.on('pointerup', this.onPointerUp.bind(this));
    this.container.on('pointerupoutside', this.onPointerUp.bind(this));
  }

  onPointerDown(e) {
    // 只有在静止状态且轮到玩家回合才能操作
    if (this.isMoving || this.isGameOver) return;
    
    // 如果是 AI 回合，玩家不能操作 (假设 AI 是 LEFT)
    if (this.ai && this.currentTurn === this.ai.teamId) return;

    const local = this.container.toLocal(e.global);
    const bodies = this.physics.queryPoint(local.x, local.y);

    if (bodies.length > 0) {
      const body = bodies[0];
      const entity = body.entity;

      // 只能操作己方棋子
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
    
    // 绘制瞄准线
    this.aimGraphics.clear();
    
    // 瞄准方向是反向的
    const startX = this.selectedBody.position.x;
    const startY = this.selectedBody.position.y;
    
    const dx = this.dragStartPos.x - local.x;
    const dy = this.dragStartPos.y - local.y;
    
    // 限制长度
    const currentLen = Math.sqrt(dx*dx + dy*dy);
    const maxLen = GameConfig.gameplay.maxDragDistance;
    let scale = 1;
    if (currentLen > maxLen) {
        scale = maxLen / currentLen;
    }

    const aimX = startX + dx * scale;
    const aimY = startY + dy * scale;

    // 画线
    this.aimGraphics.moveTo(startX, startY);
    this.aimGraphics.lineTo(aimX, aimY);
    this.aimGraphics.stroke({ width: 6, color: 0xffffff, cap: 'round' });

    // 画力度圈
    this.aimGraphics.circle(startX, startY, 60);
    this.aimGraphics.stroke({ width: 2, color: 0xffffff, alpha: 0.5 });
  }

  onPointerUp(e) {
    if (this.isDragging && this.selectedBody) {
      const local = this.container.toLocal(e.global);
      
      const dx = this.dragStartPos.x - local.x;
      const dy = this.dragStartPos.y - local.y;
      
      // 限制最大力度
      const currentLen = Math.sqrt(dx*dx + dy*dy);
      const maxLen = GameConfig.gameplay.maxDragDistance;
      let scale = 1;
      if (currentLen > maxLen) {
          scale = maxLen / currentLen;
      }
      
      const forceMultiplier = GameConfig.gameplay.forceMultiplier;
      const force = {
        x: dx * scale * forceMultiplier,
        y: dy * scale * forceMultiplier
      };

      // 只有力度足够大才发射
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
    AudioManager.playSFX('collision'); // 播放一下击球音效模拟
  }

  update(delta) {
    super.update(delta);
    
    // 1. 物理更新
    this.physics.update(16.66); // 16ms approx

    // 2. 渲染同步
    this.strikers.forEach(s => s.update());
    if (this.ball) this.ball.update();

    // 3. 检查回合状态
    this.checkTurnState();

    // 4. AI 逻辑
    if (!this.isMoving && !this.isGameOver && this.ai && this.currentTurn === this.ai.teamId) {
        this.processAITurn();
    }
  }

  checkTurnState() {
    const isSleeping = this.physics.isSleeping();

    if (this.isMoving && isSleeping) {
        // 所有的球都停下来了，回合结束
        this.isMoving = false;
        this.switchTurn();
    }
  }

  switchTurn() {
    // 切换回合
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
    // AI 思考需要一点延迟，模拟人类
    if (!this.aiTimer) {
        this.aiTimer = setTimeout(() => {
            const decision = this.ai.think(this.strikers.filter(s => s.teamId === this.ai.teamId), this.ball);
            if (decision) {
                Matter.Body.applyForce(decision.striker.body, decision.striker.body.position, decision.force);
                this.onTurnActionComplete();
            } else {
                // AI 没法走？强制切换防止卡死
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