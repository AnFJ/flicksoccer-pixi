
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
// import './libs/weapp-adapter/index.js' // 优化：H5不需要此适配器；小程序由入口文件 game.js 负责加载，此处移除以兼容 H5。
import * as PIXI from 'pixi.js';
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import LoginScene from './scenes/LoginScene.js';
import { GameConfig } from './config.js';

// 移除 v8 的 new Application() 空构造
// const app = new PIXI.Application(); 

async function initGame() {
  try {
    const isMiniGame = (typeof wx !== 'undefined' || typeof tt !== 'undefined');

    let canvasTarget;
    if (isMiniGame) {
      // @ts-ignore
      canvasTarget = window.canvas || canvas;
    } else {
      canvasTarget = undefined; // Web 端让 Pixi 自己创建 Canvas
    }

    // 初始化 Pixi 应用 (v7 写法：直接在构造函数传参)
    // 颜色使用 backgroundColor (v7) 而不是 background (v8)
    const app = new PIXI.Application({
      view: canvasTarget, // v7 使用 view 属性接收 canvas
      width: GameConfig.designWidth,
      height: GameConfig.designHeight,
      backgroundColor: 0x1a1a1a, // v7 属性名
      resolution: window.devicePixelRatio || 2,
      autoDensity: true,
      antialias: true
    });

    // 将 app 挂载到全局方便调试（可选）
    // @ts-ignore
    globalThis.__PIXI_APP__ = app;

    if (!isMiniGame) {
      document.body.appendChild(app.view); // v7 使用 app.view
      resizeWebCanvas(app);
      window.addEventListener('resize', () => resizeWebCanvas(app));
    } else {
      // 小游戏环境适配逻辑
    }

    SceneManager.init(app);

    app.ticker.add((delta) => {
      // v7 ticker 回调参数通常是 frame delta (1 左右)，需要根据需求转换
      // 这里的 delta 只是帧数倍率，SceneManager.update 需要具体的 ms 还是帧率取决于实现
      // 这里直接传 ticker.deltaMS 会更精确，或者保持原样
      SceneManager.update(app.ticker.deltaMS);
    });

    // 默认进入登录场景
    await SceneManager.changeScene(LoginScene);
    
    console.log(`[Main] Game Initialized (Environment: ${isMiniGame ? 'MiniGame' : 'Web'}, Pixi v${PIXI.VERSION})`);

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

/**
 * H5 端的 Canvas 适配逻辑
 */
function resizeWebCanvas(app) {
  const canvas = app.view; // v7 使用 view
  if (!canvas) return;

  const wWidth = window.innerWidth;
  const wHeight = window.innerHeight;

  // Fit Height 策略
  const scale = wHeight / GameConfig.designHeight;
  
  canvas.style.width = `${GameConfig.designWidth * scale}px`;
  canvas.style.height = `${wHeight}px`; 
}

initGame();
