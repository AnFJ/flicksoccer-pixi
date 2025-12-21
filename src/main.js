import * as PIXI from 'pixi.js';
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import { GameConfig } from './config.js';

// 小游戏环境下的 Canvas
// 注意：在 weapp-adapter 作用下，window.canvas 或 canvas 全局变量应该可用
// 如果是 Pixi v8，推荐显式传递 canvas
const canvas = window.canvas || canvas;

// 创建 Pixi 应用
const app = new PIXI.Application();

async function initGame() {
  try {
    // 1. 初始化 Pixi Application
    await app.init({
      canvas: canvas, // 传入小游戏的 canvas
      width: GameConfig.designWidth,
      height: GameConfig.designHeight,
      background: '#1a1a1a',
      resolution: window.devicePixelRatio || 2,
      autoDensity: true,
      antialias: true
    });

    // 2. 初始化场景管理器
    SceneManager.init(app);

    // 3. 启动 Pixi Ticker (主循环)
    app.ticker.add((ticker) => {
      // ticker.deltaTime 是帧间隔因子
      SceneManager.update(ticker.deltaTime);
    });

    // 4. 进入第一个场景 (直接进游戏测试)
    await SceneManager.changeScene(GameScene);
    
    console.log('Game Initialized Successfully');

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

// 启动
initGame();