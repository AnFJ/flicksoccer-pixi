
import * as PIXI from 'pixi.js';
import Matter from 'matter-js';
import { GameConfig } from '../config.js';
import { CollisionCategory, TeamId } from '../constants.js';
import ResourceManager from '../managers/ResourceManager.js';
import AdBoard from '../ui/AdBoard.js';
import Goal from '../entities/Goal.js';

/**
 * GameLayout 负责场景的视觉分层、球场搭建和静态物理边界
 */
export default class GameLayout {
    constructor(scene) {
        this.scene = scene;
        
        // 分层容器
        this.layers = {
            bg: new PIXI.Container(),
            game: new PIXI.Container(),
            over: new PIXI.Container(),
            ui: new PIXI.Container()
        };

        this.fieldRect = null;
        this.goals = [];
        this.adBoards = []; // [新增] 存储广告牌实例
    }

    /**
     * 初始化布局
     */
    init() {
        const { designWidth, designHeight, dimensions } = GameConfig;

        // 将层级添加到场景主容器
        this.scene.container.addChild(this.layers.bg);
        this.scene.container.addChild(this.layers.game);
        this.scene.container.addChild(this.layers.over);
        this.scene.container.addChild(this.layers.ui);

        // 计算球场实际坐标区域
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

        this._createGlobalBackground(designWidth, designHeight);
        this._createFieldVisuals();
        this._createPhysicsWalls();
        this._createGoals();
        this._createAdBoards();
    }

    /** 创建全屏背景（草地）- 作为底层兜底，防止黑边 */
    _createGlobalBackground(w, h) {
        const grassTex = ResourceManager.get('bg_grass');
        if (grassTex) {
            const bg = new PIXI.TilingSprite(grassTex, w, h);
            bg.tileScale.set(0.5);
            bg.tint = 0x444444; // 压得更暗一些，因为主要视觉由新的大图提供
            this.layers.bg.addChild(bg);
        }
    }

    /** 创建球场视觉元素 */
    _createFieldVisuals() {
        const { x, y, w, h } = this.fieldRect;
        const centerX = x + w / 2;
        const centerY = y + h / 2;

        // [核心修改] 使用合并后的长图 (27:9)
        const combinedTex = ResourceManager.get('field_combined');
        if (combinedTex) {
            const sprite = new PIXI.Sprite(combinedTex);
            sprite.anchor.set(0.5);
            
            // 需求：图片高度和球场高度一致
            sprite.height = h;
            
            // 需求：图片宽度保持自由比例 (不强制压缩/拉伸为 3:1)
            // 设置高度后，scale.y 已经改变。将 scale.x 设为相同值即可保持原始比例。
            sprite.scale.x = sprite.scale.y;

            sprite.position.set(centerX, centerY);
            this.layers.bg.addChild(sprite);
        }

        // 球场边框线 (放在上面)
        const borderTex = ResourceManager.get('field_border');
        if (borderTex) {
            const border = new PIXI.Sprite(borderTex);
            border.anchor.set(0.5);
            const goalDepth = GameConfig.dimensions.goalWidth * 2;
            border.width = w + goalDepth;
            border.height = h + 14;
            border.position.set(centerX, centerY);
            this.layers.over.addChild(border);
        }
    }

    /** 创建物理墙壁 */
    _createPhysicsWalls() {
        const { x, y, w, h } = this.fieldRect;
        const t = GameConfig.dimensions.wallThickness;
        const centerX = x + w / 2;
        const goalOpening = GameConfig.dimensions.goalOpening;
        const sideWallLen = (h - goalOpening) / 2;

        const wallOptions = {
            isStatic: true,
            restitution: GameConfig.physics.wallRestitution,
            friction: GameConfig.physics.wallFriction,
            collisionFilter: { category: CollisionCategory.WALL }
        };

        // [修改] 垂直方向的内缩修正值 (px)
        // 增加这个值会让上下墙壁向中心靠拢，解决球“陷进”底边的问题
        const vCorrection = 10; 

        const walls = [
            // Top Wall: 增加 vCorrection 使其下移
            Matter.Bodies.rectangle(centerX, y - t / 2 + vCorrection, w + t * 2, t, { ...wallOptions, label: 'WallTop' }),
            
            // Bottom Wall: 减去 vCorrection 使其上移 (修复底部位置过低)
            Matter.Bodies.rectangle(centerX, y + h + t / 2 - vCorrection, w + t * 2, t, { ...wallOptions, label: 'WallBottom' }),
            
            Matter.Bodies.rectangle(x - t / 2, y + sideWallLen / 2, t, sideWallLen, { ...wallOptions, label: 'WallLeftTop' }),
            Matter.Bodies.rectangle(x - t / 2, y + h - sideWallLen / 2, t, sideWallLen, { ...wallOptions, label: 'WallLeftBottom' }),
            Matter.Bodies.rectangle(x + w + t / 2, y + sideWallLen / 2, t, sideWallLen, { ...wallOptions, label: 'WallRightTop' }),
            Matter.Bodies.rectangle(x + w + t / 2, y + h - sideWallLen / 2, t, sideWallLen, { ...wallOptions, label: 'WallRightBottom' })
        ];

        this.scene.physics.add(walls);
    }

    /** 创建球门 */
    _createGoals() {
        const { x, y, w, h } = this.fieldRect;
        const { goalWidth, goalOpening } = GameConfig.dimensions;
        const centerY = y + h / 2;

        const leftGoal = new Goal(x - goalWidth / 2, centerY, goalWidth, goalOpening, TeamId.LEFT);
        const rightGoal = new Goal(x + w + goalWidth / 2, centerY, goalWidth, goalOpening, TeamId.RIGHT);

        this.goals = [leftGoal, rightGoal];
        this.goals.forEach(g => {
            this.scene.physics.add(g.body);
            if (g.view) this.layers.game.addChild(g.view);
        });
    }

    /** 创建广告牌 */
    _createAdBoards() {
        const { x, y, w, h } = this.fieldRect;
        const adW = 200, adH = 350, dist = 160;
        
        // 重置数组
        this.adBoards = [];

        const leftAd = new AdBoard(adW, adH, 0);
        leftAd.position.set(x - dist - adW / 2, y + h / 2);
        this.layers.over.addChild(leftAd);
        this.adBoards.push(leftAd);

        const rightAd = new AdBoard(adW, adH, 1);
        rightAd.position.set(x + w + dist + adW / 2, y + h / 2);
        this.layers.over.addChild(rightAd);
        this.adBoards.push(rightAd);
    }
}
