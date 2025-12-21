
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
    this.currentPointerPos = { x: 0, y: 0 }; // 记录当前手指位置
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
    const topBarBg = new PIXI.Graphics();
    topBarBg.rect(0, 0, designWidth, dimensions.topBarHeight);
    topBarBg.fill(0x1a1a1a); 
    topBarBg.moveTo(0, dimensions.topBarHeight);
    topBarBg.lineTo(designWidth, dimensions.topBarHeight);
    topBarBg.stroke({ width: 2, color: 0x444444 });
    this.container.addChild(topBarBg);

    // --- 2. 球场区域 ---
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

    this.createFieldGraphics(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    this.createPhysicsWalls(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    this.createGoals(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
  }

  createFieldGraphics(x, y, w, h) {
    const ground = new PIXI.Graphics();
    ground.rect(x, y, w, h);
    ground.fill(0x27ae60);
    
    // 装饰性条纹
    const stripeWidth = w / 10;
    for(let i=0; i<10; i+=2) {
        ground.rect(x + i * stripeWidth, y, stripeWidth, h);
        ground.fill({ color: 0x000000, alpha: 0.05 });
    }

    ground.rect(x, y, w, h);
    ground.stroke({ width: 5, color: 0xffffff });

    ground.moveTo(x + w / 2, y);
    ground.lineTo(x + w / 2, y + h);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    
    ground.circle(x + w/2, y + h/2, 150);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    
    const boxW = 250;
    const boxH = 500;
    ground.rect(x, y + h/2 - boxH/2, boxW, boxH);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });
    ground.rect(x + w - boxW, y + h/2 - boxH/2, boxW, boxH);
    ground.stroke({ width: 4, color: 0xffffff, alpha: 0.5 });

    this.container.addChildAt(ground, 0); 
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
        body.restitution = 1.0; 
    });
    this.physics.add(walls);
  }

  createGoals(x, y, w, h) {
    const { goalWidth, goalOpening } = GameConfig.dimensions;
    const centerY = y + h / 2;

    const goalLeft = new Goal(x - goalWidth/2, centerY, goalWidth, goalOpening, TeamId.LEFT);
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

    this.scoreText = new PIXI.Text({
        text: '0 : 0',
        style: { fontFamily: 'Arial', fontSize: 50, fill: 0xffffff, fontWeight: 'bold' }
    });
    this.scoreText.anchor.set(0.5);
    this.scoreText.position.set(designWidth / 2, centerY);
    this.container.addChild(this.scoreText);

    this.turnText = new PIXI.Text({
        text: '等待开球...',
        style: { fontFamily: 'Arial', fontSize: 24, fill: 0x3498db }
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(designWidth / 2, centerY + 35);
    this.container.addChild(this.turnText);

    this.createAvatar(60, centerY, TeamId.LEFT, "AI Player");
    this.createAvatar(designWidth - 60, centerY, TeamId.RIGHT, "Player");

    this.container.addChild(this.aimGraphics);

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
    // 扩大一点点击范围判定
    const bodies = this.physics.queryPoint(local.x, local.y);

    if (bodies.length > 0) {
      // 过滤掉墙壁等，只看 Striker
      const clickedBody = bodies.find(b => b.label === 'Striker');
      
      if (clickedBody) {
        const entity = clickedBody.entity;
        if (entity instanceof Striker && entity.teamId === this.currentTurn) {
          this.selectedBody = clickedBody;
          this.isDragging = true;
          // 记录初始点击位置（一般使用棋子中心作为拉动的原点）
          this.dragStartPos = { x: clickedBody.position.x, y: clickedBody.position.y };
          this.currentPointerPos = { x: local.x, y: local.y };
          this.drawAimingLine();
        }
      }
    }
  }

  onPointerMove(e) {
    if (!this.isDragging || !this.selectedBody) return;

    const local = this.container.toLocal(e.global);
    this.currentPointerPos = { x: local.x, y: local.y };
    
    this.drawAimingLine();
  }

  /**
   * 绘制瞄准线：箭头 + 后方虚线
   */
  drawAimingLine() {
    if (!this.selectedBody) return;

    this.aimGraphics.clear();
    
    const startX = this.dragStartPos.x;
    const startY = this.dragStartPos.y;
    
    // 原始手指位置
    const rawEndX = this.currentPointerPos.x;
    const rawEndY = this.currentPointerPos.y;

    // 1. 计算拉动向量 (从手指指向棋子中心 = 发力方向)
    const dx = startX - rawEndX;
    const dy = startY - rawEndY;
    const rawDist = Math.sqrt(dx*dx + dy*dy);

    if (rawDist < 10) return; // 距离太小不显示

    // 2. 核心修改：计算“限制后”的虚拟手指位置
    // 如果拉动超过最大距离，我们把视觉终点锁死在最大半径上
    const maxDist = GameConfig.gameplay.maxDragDistance;
    const displayDist = Math.min(rawDist, maxDist);
    
    const angle = Math.atan2(dy, dx); // 发力方向角度
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    // 这里的 visualEndX 是从中心向后延伸 displayDist 长度的点
    // 注意：dx/dy 是 Start - End，所以方向是指向 Start 的反方向。
    // 为了画“拉弹弓”的效果（虚线指向手指），我们需要反向计算。
    // 虚线终点 = Start - (DirectionVector * displayDist)
    const visualEndX = startX - cos * displayDist;
    const visualEndY = startY - sin * displayDist;

    // --- 绘制后方虚线 (从棋子中心指向虚拟手指位置) ---
    this.drawDashedLine(this.aimGraphics, startX, startY, visualEndX, visualEndY, 10, 5);

    // --- 绘制前方箭头 (从棋子中心指向发射方向) ---
    // 箭头长度 = 3倍的(限制后的)拉动长度
    const arrowLen = displayDist * 3; 
    const arrowEndX = startX + cos * arrowLen;
    const arrowEndY = startY + sin * arrowLen;

    // 颜色插值：根据力度从绿色变红色
    const powerRatio = displayDist / maxDist;
    const startColor = GameConfig.visuals.aimLineColorStart; // Green
    const endColor = GameConfig.visuals.aimLineColorEnd;     // Red
    // 简单的颜色混合 (这里简化处理，直接用红色或绿色，或者你可以写个 mixColor 函数)
    const color = powerRatio > 0.8 ? endColor : startColor;

    this.aimGraphics.moveTo(startX, startY);
    this.aimGraphics.lineTo(arrowEndX, arrowEndY);
    this.aimGraphics.stroke({ width: 6, color: color });

    // 画箭头头
    const headLen = 20;
    this.aimGraphics.poly([
        arrowEndX, arrowEndY,
        arrowEndX - headLen * Math.cos(angle - Math.PI/6), arrowEndY - headLen * Math.sin(angle - Math.PI/6),
        arrowEndX - headLen * Math.cos(angle + Math.PI/6), arrowEndY - headLen * Math.sin(angle + Math.PI/6)
    ]);
    this.aimGraphics.fill(color);

    // --- 绘制力度圈 (棋子周围的圆环) ---
    this.aimGraphics.circle(startX, startY, 60);
    this.aimGraphics.stroke({ width: 4, color: 0xffffff, alpha: 0.3 + powerRatio * 0.7 });
    
    // 如果拉满，画个额外的圈提示
    if (rawDist >= maxDist) {
        this.aimGraphics.circle(startX, startY, 65);
        this.aimGraphics.stroke({ width: 2, color: 0xFF0000, alpha: 0.8 });
    }
  }

  drawDashedLine(g, x1, y1, x2, y2, dashLen, gapLen) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const angle = Math.atan2(dy, dx);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    
    let currDist = 0;
    
    while (currDist < dist) {
        const nextDist = Math.min(currDist + dashLen, dist);
        
        g.moveTo(x1 + cos * currDist, y1 + sin * currDist);
        g.lineTo(x1 + cos * nextDist, y1 + sin * nextDist);
        
        currDist = nextDist + gapLen;
    }
    g.stroke({ width: 2, color: GameConfig.visuals.dashedLineColor, alpha: 0.6 });
  }

  onPointerUp(e) {
    if (this.isDragging && this.selectedBody) {
      const local = this.container.toLocal(e.global);
      
      const dx = this.dragStartPos.x - local.x;
      const dy = this.dragStartPos.y - local.y;
      
      const currentLen = Math.sqrt(dx*dx + dy*dy);
      const maxLen = GameConfig.gameplay.maxDragDistance;
      
      // 力度计算：使用限制后的距离
      const effectiveDist = Math.min(currentLen, maxLen);
      
      const angle = Math.atan2(dy, dx);
      const forceMultiplier = GameConfig.gameplay.forceMultiplier;
      
      const force = {
        x: Math.cos(angle) * effectiveDist * forceMultiplier,
        y: Math.sin(angle) * effectiveDist * forceMultiplier
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
    this.currentPointerPos = { x:0, y:0 };
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
