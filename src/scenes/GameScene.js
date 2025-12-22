
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
import ResourceManager from '../managers/ResourceManager.js'; // 导入资源管理器
import { GameConfig } from '../config.js';
import { TeamId, CollisionCategory, Events } from '../constants.js';

export default class GameScene extends BaseScene {
  constructor() {
    super();
    this.physics = new PhysicsEngine();
    this.rules = null;
    this.ai = null;
    
    this.strikers = [];
    this.ball = null;
    this.goals = [];

    this.currentTurn = TeamId.RIGHT; 
    this.isMoving = false; 
    this.isGameOver = false;

    this.selectedBody = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.currentPointerPos = { x: 0, y: 0 }; 
    this.isDragging = false;
    this.aimGraphics = new PIXI.Graphics();
    
    this.scoreText = null;
    this.turnText = null;
    
    this.isLoading = true; // 加载状态
  }

  async onEnter() {
    super.onEnter();
    
    // 显示加载中提示
    const loadingText = new PIXI.Text({ text: 'Loading Assets...', style: { fill: 0xffffff, fontSize: 30 }});
    loadingText.anchor.set(0.5);
    loadingText.position.set(GameConfig.designWidth/2, GameConfig.designHeight/2);
    this.container.addChild(loadingText);

    // 预加载资源
    await ResourceManager.loadAll();
    
    // 移除加载提示
    this.container.removeChild(loadingText);
    this.isLoading = false;

    this.initGame();
  }

  initGame() {
    this.physics.init();
    this.rules = new GameRules(this.physics);
    this.ai = new AIController(this.physics, TeamId.LEFT); 

    this.createLayout();
    this.setupFormation();
    this.createUI();

    this.setupEvents();
    this.setupInteraction();

    this.isGameOver = false;
    this.updateUI();
  }

  createLayout() {
    const { designWidth, designHeight, dimensions } = GameConfig;
    
    // 顶部栏
    const topBarBg = new PIXI.Graphics();
    topBarBg.rect(0, 0, designWidth, dimensions.topBarHeight);
    topBarBg.fill(0x111111); // 深色背景
    this.container.addChild(topBarBg);

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

    // 使用新方法创建球场视觉
    this.createFieldVisuals(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    
    this.createPhysicsWalls(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
    this.createGoals(fieldStartX, fieldStartY, dimensions.fieldWidth, dimensions.fieldHeight);
  }

  createFieldVisuals(x, y, w, h) {
    // 1. 基础草地 (使用纹理平铺)
    const grassTexture = ResourceManager.get('grass');
    let ground;

    if (grassTexture) {
        // 使用 TilingSprite 实现无缝平铺
        ground = new PIXI.TilingSprite({
            texture: grassTexture,
            width: w,
            height: h
        });
        // 调整纹理缩放，避免草看起来太大
        ground.tileScale.set(0.5); 
    } else {
        // 降级方案：纯色
        ground = new PIXI.Graphics();
        ground.rect(0, 0, w, h);
        ground.fill(0x27ae60);
    }
    ground.position.set(x, y);
    this.container.addChild(ground);

    // 2. 绘制球场线 (画在草地之上)
    // 使用 Graphics 绘制线框，保证清晰度
    const lines = new PIXI.Graphics();
    const lineColor = 0xffffff;
    const lineAlpha = 0.6;
    const lineWidth = 5;

    // 边框
    lines.rect(0, 0, w, h);
    lines.stroke({ width: lineWidth, color: lineColor, alpha: lineAlpha });

    // 中线
    lines.moveTo(w / 2, 0);
    lines.lineTo(w / 2, h);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });
    
    // 中圈
    lines.circle(w / 2, h / 2, 150);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });
    // 中点
    lines.circle(w / 2, h / 2, 10);
    lines.fill({ color: lineColor, alpha: lineAlpha });
    
    // 禁区
    const boxW = 250;
    const boxH = 500;
    // 左禁区
    lines.rect(0, h/2 - boxH/2, boxW, boxH);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });
    // 右禁区
    lines.rect(w - boxW, h/2 - boxH/2, boxW, boxH);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });

    // 角球区 (四个角落的弧线)
    const cornerR = 40;
    lines.arc(0, 0, cornerR, 0, Math.PI/2);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });
    
    lines.arc(0, h, cornerR, -Math.PI/2, 0);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });

    lines.arc(w, 0, cornerR, Math.PI/2, Math.PI);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });

    lines.arc(w, h, cornerR, Math.PI, Math.PI * 1.5);
    lines.stroke({ width: lineWidth - 1, color: lineColor, alpha: lineAlpha });

    // 将线框添加到 ground 的坐标系中或者直接叠加
    // 简单起见，直接叠加在 container，位置偏移
    lines.position.set(x, y);
    this.container.addChild(lines);
    
    // 3. 暗角/光照效果 (Vignette)
    // 用一个四周黑中间透明的渐变图或者简单画个矩形遮罩
    // 这里简单用 Graphics 模拟四角变暗
    const vignette = new PIXI.Graphics();
    vignette.rect(0, 0, w, h);
    vignette.fill({ color: 0x000000, alpha: 0.1 }); // 简单压暗
    // 实际上 Pixi 没法直接画径向渐变填充，除非用 Texture 或 Shader
    // 这里略过复杂渐变，保持简洁
    vignette.position.set(x, y);
    // this.container.addChild(vignette); // 可选
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
    if (this.isMoving || this.isGameOver || this.isLoading) return;
    if (this.ai && this.currentTurn === this.ai.teamId) return;

    const local = this.container.toLocal(e.global);
    const bodies = this.physics.queryPoint(local.x, local.y);

    if (bodies.length > 0) {
      const clickedBody = bodies.find(b => b.label === 'Striker');
      
      if (clickedBody) {
        const entity = clickedBody.entity;
        if (entity instanceof Striker && entity.teamId === this.currentTurn) {
          this.selectedBody = clickedBody;
          this.isDragging = true;
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

  drawAimingLine() {
    if (!this.selectedBody) return;

    this.aimGraphics.clear();
    
    const startX = this.dragStartPos.x;
    const startY = this.dragStartPos.y;
    
    const rawEndX = this.currentPointerPos.x;
    const rawEndY = this.currentPointerPos.y;

    const dx = startX - rawEndX;
    const dy = startY - rawEndY;
    const rawDist = Math.sqrt(dx*dx + dy*dy);

    if (rawDist < 10) return;

    const maxDist = GameConfig.gameplay.maxDragDistance;
    const displayDist = Math.min(rawDist, maxDist);
    
    const angle = Math.atan2(dy, dx); 
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const visualEndX = startX - cos * displayDist;
    const visualEndY = startY - sin * displayDist;

    this.drawDashedLine(this.aimGraphics, startX, startY, visualEndX, visualEndY, 10, 5);

    const arrowLen = displayDist * 3; 
    const arrowEndX = startX + cos * arrowLen;
    const arrowEndY = startY + sin * arrowLen;

    const powerRatio = displayDist / maxDist;
    const startColor = GameConfig.visuals.aimLineColorStart; 
    const endColor = GameConfig.visuals.aimLineColorEnd;     
    const color = powerRatio > 0.8 ? endColor : startColor;

    this.aimGraphics.moveTo(startX, startY);
    this.aimGraphics.lineTo(arrowEndX, arrowEndY);
    this.aimGraphics.stroke({ width: 6, color: color });

    const headLen = 20;
    this.aimGraphics.poly([
        arrowEndX, arrowEndY,
        arrowEndX - headLen * Math.cos(angle - Math.PI/6), arrowEndY - headLen * Math.sin(angle - Math.PI/6),
        arrowEndX - headLen * Math.cos(angle + Math.PI/6), arrowEndY - headLen * Math.sin(angle + Math.PI/6)
    ]);
    this.aimGraphics.fill(color);

    this.aimGraphics.circle(startX, startY, 60);
    this.aimGraphics.stroke({ width: 4, color: 0xffffff, alpha: 0.3 + powerRatio * 0.7 });
    
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
    
    this.physics.update(16.66);

    this.strikers.forEach(s => s.update());
    if (this.ball) this.ball.update();

    this.checkTurnState();

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
