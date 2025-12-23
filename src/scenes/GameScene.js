
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
import ResourceManager from '../managers/ResourceManager.js'; 
import { GameConfig } from '../config.js';
import { TeamId, CollisionCategory, Events } from '../constants.js';

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

    this.selectedBody = null;
    this.dragStartPos = { x: 0, y: 0 };
    this.currentPointerPos = { x: 0, y: 0 }; 
    this.isDragging = false;
    this.aimGraphics = new PIXI.Graphics();
    
    this.scoreText = null;
    this.turnText = null;
    
    this.isLoading = true;

    // --- 定义分层容器 ---
    this.bgLayer = new PIXI.Container();   // 背景 (草地)
    this.gameLayer = new PIXI.Container(); // 游戏物体 (球、人)
    this.overLayer = new PIXI.Container(); // 前景 (球筐、边框)
    this.uiLayer = new PIXI.Container();   // UI
    
    this.container.addChild(this.bgLayer);
    this.container.addChild(this.gameLayer);
    this.container.addChild(this.overLayer);
    this.container.addChild(this.uiLayer);
  }

  async onEnter(params = {}) {
    super.onEnter(params);
    this.gameMode = params.mode || 'pve';
    
    const loadingText = new PIXI.Text('Loading Assets...', { fill: 0xffffff, fontSize: 30 }); // v7 style
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
    this.updateUI();
  }

  createLayout() {
    const { designWidth, designHeight, dimensions } = GameConfig;
    
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
    } else {
        console.warn("Missing field_border texture!");
    }
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

    // Pixi v7 Debug Drawing
    if (GameConfig.debug && GameConfig.debug.showPhysicsWalls) {
        const debugG = new PIXI.Graphics();
        
        // 设置样式 (v7 style)
        debugG.lineStyle(2, 0x00FFFF);
        debugG.beginFill(0x00FFFF, 0.3);

        walls.forEach(body => {
            const v = body.vertices;
            debugG.moveTo(v[0].x, v[0].y);
            for (let i = 1; i < v.length; i++) {
                debugG.lineTo(v[i].x, v[i].y);
            }
            debugG.lineTo(v[0].x, v[0].y);
        });

        debugG.endFill();
        this.gameLayer.addChild(debugG);
    }
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
    
    // 阵型位置
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
    const { designWidth, dimensions } = GameConfig;
    
    const hudContainer = new PIXI.Container();
    const hudY = 20; 
    hudContainer.position.set(designWidth / 2, hudY);
    this.uiLayer.addChild(hudContainer);

    // 1. 计分板背景 (v7 API)
    const boardW = 600; 
    const boardH = 120;
    const hudBg = new PIXI.Graphics();
    hudBg.beginFill(0x000000, 0.6);
    hudBg.lineStyle(2, 0xffffff, 0.2);
    hudBg.drawRoundedRect(-boardW / 2, 0, boardW, boardH, 20);
    hudBg.endFill();
    hudContainer.addChild(hudBg);

    // 2. 比分文本
    this.scoreText = new PIXI.Text('0 : 0', {
        fontFamily: 'Arial', 
        fontSize: 60, 
        fill: 0xffffff, 
        fontWeight: 'bold',
        dropShadow: true,
        dropShadowColor: '#000000',
        dropShadowBlur: 4,
        dropShadowDistance: 2
    });
    this.scoreText.anchor.set(0.5);
    this.scoreText.position.set(0, boardH * 0.4); 
    hudContainer.addChild(this.scoreText);

    // 3. 回合文本
    this.turnText = new PIXI.Text('等待开球...', {
        fontFamily: 'Arial', 
        fontSize: 22, 
        fill: 0xcccccc 
    });
    this.turnText.anchor.set(0.5);
    this.turnText.position.set(0, boardH * 0.8);
    hudContainer.addChild(this.turnText);

    const avatarOffset = 220; 
    const avatarY = boardH / 2;

    const leftName = this.gameMode === 'pve' ? "AI Player" : "Player 2";
    
    this.createAvatar(hudContainer, -avatarOffset, avatarY, TeamId.LEFT, leftName);
    this.createAvatar(hudContainer, avatarOffset, avatarY, TeamId.RIGHT, "Player 1");

    this.uiLayer.addChild(this.aimGraphics);

    // 退出按钮 (v7 API)
    const exitBtn = new PIXI.Container();
    const btnBg = new PIXI.Graphics();
    btnBg.beginFill(0x7f8c8d);
    btnBg.drawRoundedRect(0, 0, 100, 40, 10);
    btnBg.endFill();
    const btnText = new PIXI.Text('退出', { fontSize: 20, fill: 0xffffff });
    btnText.anchor.set(0.5);
    btnText.position.set(50, 20);
    exitBtn.addChild(btnBg, btnText);
    exitBtn.position.set(designWidth - 120, GameConfig.designHeight - 60);
    exitBtn.eventMode = 'static';
    exitBtn.cursor = 'pointer';
    exitBtn.on('pointerdown', () => SceneManager.changeScene(MenuScene));
    this.uiLayer.addChild(exitBtn);
  }

  createAvatar(parent, x, y, teamId, name) {
      const isLeft = teamId === TeamId.LEFT;
      const container = new PIXI.Container();
      container.position.set(x, y);
      
      const radius = 35;
      const teamColor = isLeft ? 0xe74c3c : 0x3498db;

      // v7 API
      const bg = new PIXI.Graphics();
      bg.lineStyle(3, teamColor);
      bg.beginFill(0x333333);
      bg.drawCircle(0, 0, radius);
      bg.endFill();

      const letter = new PIXI.Text(name.charAt(0), {
          fontSize: 30, fill: teamColor, fontWeight: 'bold' 
      });
      letter.anchor.set(0.5);
      
      const nameText = new PIXI.Text(name, {
          fontSize: 18, fill: 0xaaaaaa 
      });
      nameText.anchor.set(0.5, 0); 
      nameText.position.set(0, radius + 5); 

      container.addChild(bg, letter, nameText);
      parent.addChild(container); 
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

    // 先画虚线
    this.drawDashedLine(this.aimGraphics, startX, startY, visualEndX, visualEndY, 10, 5);

    const arrowLen = displayDist * 3; 
    const arrowEndX = startX + cos * arrowLen;
    const arrowEndY = startY + sin * arrowLen;

    const powerRatio = displayDist / maxDist;
    const startColor = GameConfig.visuals.aimLineColorStart; 
    const endColor = GameConfig.visuals.aimLineColorEnd;     
    const color = powerRatio > 0.8 ? endColor : startColor;

    // Pixi v7 API: 设置线样式
    this.aimGraphics.lineStyle(6, color);
    this.aimGraphics.moveTo(startX, startY);
    this.aimGraphics.lineTo(arrowEndX, arrowEndY);
    // lineStyle 不需要 close

    // 箭头头部
    const headLen = 20;
    this.aimGraphics.lineStyle(0); // 清除描边
    this.aimGraphics.beginFill(color);
    this.aimGraphics.drawPolygon([
        arrowEndX, arrowEndY,
        arrowEndX - headLen * Math.cos(angle - Math.PI/6), arrowEndY - headLen * Math.sin(angle - Math.PI/6),
        arrowEndX - headLen * Math.cos(angle + Math.PI/6), arrowEndY - headLen * Math.sin(angle + Math.PI/6)
    ]);
    this.aimGraphics.endFill();

    // 底部圆圈
    this.aimGraphics.lineStyle(4, 0xffffff, 0.3 + powerRatio * 0.7);
    this.aimGraphics.beginFill(0x000000, 0); // 空填充
    this.aimGraphics.drawCircle(startX, startY, 60);
    this.aimGraphics.endFill();
    
    if (rawDist >= maxDist) {
        this.aimGraphics.lineStyle(2, 0xFF0000, 0.8);
        this.aimGraphics.drawCircle(startX, startY, 65);
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
    
    // Pixi v7 API
    g.lineStyle(2, GameConfig.visuals.dashedLineColor, 0.6);

    while (currDist < dist) {
        const nextDist = Math.min(currDist + dashLen, dist);
        
        g.moveTo(x1 + cos * currDist, y1 + sin * currDist);
        g.lineTo(x1 + cos * nextDist, y1 + sin * nextDist);
        
        currDist = nextDist + gapLen;
    }
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
        
        let str = "";
        if (isLeft) {
            str = this.gameMode === 'pve' ? "红方回合 (AI)" : "红方回合 (Player 2)";
        } else {
            str = "蓝方回合 (Player 1)";
        }

        this.turnText.text = str;
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
