
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import BaseScene from '../../../scenes/BaseScene.js';
import SceneManager from '../../../managers/SceneManager.js';
import FoosballMenuScene from './FoosballMenuScene.js';
import FoosballPhysics from '../systems/FoosballPhysics.js';
import FoosballRod from '../entities/FoosballRod.js';
import GameLayout from '../../../core/GameLayout.js';
import { GameConfig } from '../../../config.js';
import { FoosballConfig } from '../config/FoosballConfig.js';
import Button from '../../../ui/Button.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import Platform from '../../../managers/Platform.js';
import Ball from '../../../entities/Ball.js';

export default class FoosballGameScene extends BaseScene {
    constructor() {
        super();
        this.physics = new FoosballPhysics();
        this.layout = new GameLayout(this);
        this.ball = null;
        this.rods = [];
        this.scores = [0, 0];
        this.touches = new Map();
    }

    onEnter() {
        super.onEnter();
        const { designWidth, designHeight } = GameConfig;

        this.container.addChild(this.layout.layers.bg);
        this.container.addChild(this.layout.layers.game);
        this.container.addChild(this.layout.layers.over);
        this.container.addChild(this.layout.layers.ui);

        this.physics.init();
        this.setupPitchArea(designWidth, designHeight);
        this.setupFoosballVisuals(designWidth, designHeight);
        this.createBall();
        this.createRods();
        this.createUI(designWidth, designHeight);

        this.container.interactive = true;
        this.container.on('pointerdown', this.onTouchStart, this);
        this.container.on('pointermove', this.onTouchMove, this);
        this.container.on('pointerup', this.onTouchEnd, this);
        this.container.on('pointerupoutside', this.onTouchEnd, this);
    }

    setupPitchArea(w, h) {
        const pitchW = FoosballConfig.pitch.width;
        const pitchH = FoosballConfig.pitch.height;
        this.layout.fieldRect = {
            x: (w - pitchW) / 2,
            y: (h - pitchH) / 2 + 30,
            w: pitchW,
            h: pitchH
        };
        this.layout._createPhysicsWalls();
    }

    setupFoosballVisuals(w, h) {
        const { x, y, w: fieldW, h: fieldH } = this.layout.fieldRect;
        const cx = w / 2, cy = y + fieldH / 2;
        const bgTex = ResourceManager.get('fb_bg');
        const frameTex = ResourceManager.get('fb_table_frame');

        if (bgTex) {
            const bg = new PIXI.Sprite(bgTex);
            bg.anchor.set(0.5); bg.position.set(cx, cy);
            bg.width = fieldW; bg.height = fieldH;
            this.layout.layers.bg.addChild(bg);
        }
        
        if (frameTex) {
            const frame = new PIXI.Sprite(frameTex);
            frame.anchor.set(0.5); frame.position.set(cx, cy);
            frame.width = fieldW * 1.15; frame.height = fieldH * 1.25;
            this.layout.layers.over.addChild(frame);
        }

        const mask = new PIXI.Graphics().beginFill(0xffffff).drawRect(x, y, fieldW, fieldH).endFill();
        this.layout.layers.game.addChild(mask);
        this.layout.layers.game.mask = mask;
    }

    createRods() {
        const { x, y, w, h } = this.layout.fieldRect;
        const constraints = { minY: y + 80, maxY: y + h - 80 };
        const step = w / (FoosballConfig.rod.count + 1);

        FoosballConfig.rod.layout.forEach((cfg, index) => {
            const rodX = x + step * (index + 1);
            const rod = new FoosballRod(this, rodX, cfg.teamId, cfg.puppets, constraints);
            this.rods.push(rod);
        });
    }

    createBall() {
        const { x, y, w, h } = this.layout.fieldRect;
        this.ball = new Ball(x + w/2, y + h/2, 1);
        this.ball.body.restitution = 1.0; 
        this.ball.body.frictionAir = 0.006;
        this.physics.add(this.ball.body);
        this.layout.layers.game.addChild(this.ball.view);
    }

    createUI(w, h) {
        const style = { fontFamily: 'Arial Black', fontSize: 80, fill: 0xFFD700, stroke: 0x000000, strokeThickness: 10 };
        this.scoreText = new PIXI.Text('0 - 0', style);
        this.scoreText.anchor.set(0.5);
        this.scoreText.position.set(w / 2, 80);
        this.layout.layers.ui.addChild(this.scoreText);

        const exitBtn = new Button({
            text: '退出', width: 140, height: 60, color: 0xe74c3c,
            onClick: () => SceneManager.changeScene(FoosballMenuScene)
        });
        exitBtn.position.set(40, 40);
        this.layout.layers.ui.addChild(exitBtn);
    }

    onTouchStart(e) {
        const id = e.data.identifier;
        this.touches.set(id, { lastY: e.data.global.y, isTap: true });
    }

    onTouchMove(e) {
        const touch = this.touches.get(e.data.identifier);
        if (!touch) return;
        const dy = e.data.global.y - touch.lastY;
        if (Math.abs(dy) > 5) touch.isTap = false;

        // 玩家控制所有红方杆子
        this.rods.filter(r => r.teamId === 0).forEach(r => {
            r.moveTo(r.y + dy * 1.5);
        });
        touch.lastY = e.data.global.y;
    }

    onTouchEnd(e) {
        const touch = this.touches.get(e.data.identifier);
        if (touch && touch.isTap) {
            // 点击射门
            this.rods.filter(r => r.teamId === 0).forEach(r => r.kick());
        }
        this.touches.delete(e.data.identifier);
    }

    update(delta) {
        this.physics.update(16.66);
        if (this.ball) this.ball.update(delta);
        this.rods.forEach(r => r.update());
        this.updateAI();
        this.checkGoal();
    }

    updateAI() {
        if (!this.ball) return;
        const bPos = this.ball.body.position;
        // AI 控制蓝方杆子
        this.rods.filter(r => r.teamId === 1).forEach(r => {
            const diff = bPos.y - r.y;
            if (Math.abs(diff) > 5) r.moveTo(r.y + Math.sign(diff) * 5);
            // 射门逻辑：球在球员左侧近距离时踢球
            if (bPos.x < r.x && bPos.x > r.x - 100 && Math.abs(diff) < 60) {
                if (Math.random() < 0.1) r.kick();
            }
        });
    }

    checkGoal() {
        const bx = this.ball.body.position.x;
        const rect = this.layout.fieldRect;
        if (bx < rect.x) this.onGoal(1);
        else if (bx > rect.x + rect.w) this.onGoal(0);
    }

    onGoal(teamId) {
        this.scores[teamId]++;
        this.scoreText.text = `${this.scores[0]} - ${this.scores[1]}`;
        Platform.showToast(teamId === 0 ? "红方得分！" : "蓝方得分！");
        this.resetBall();
    }

    resetBall() {
        const { x, y, w, h } = this.layout.fieldRect;
        Matter.Body.setPosition(this.ball.body, { x: x + w/2, y: y + h/2 });
        Matter.Body.setVelocity(this.ball.body, { x: 0, y: 0 });
    }

    onExit() {
        this.physics.clear();
        super.onExit();
    }
}
