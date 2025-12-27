
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
// import './libs/weapp-adapter/index.js' // H5不需要此适配器；小程序由入口文件 game.js 负责加载。
import * as PIXI from 'pixi.js';
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import LoginScene from './scenes/LoginScene.js';
import { GameConfig } from './config.js';

async function initGame() {
  try {
    const isMiniGame = (typeof wx !== 'undefined' || typeof tt !== 'undefined');

    let canvasTarget;
    let width, height;
    
    // 初始化 Pixi 应用配置
    const appOptions = {
      backgroundColor: 0x1a1a1a,
      resolution: window.devicePixelRatio || 2,
      autoDensity: true,
      antialias: false
    };

    if (isMiniGame) {
      // @ts-ignore
      canvasTarget = window.canvas || canvas;
      appOptions.view = canvasTarget;
      appOptions.width = GameConfig.designWidth; 
      appOptions.height = GameConfig.designHeight;
    } else {
      // Web 端使用全屏适配，不指定 view 让 Pixi 自动创建
      appOptions.width = window.innerWidth;
      appOptions.height = window.innerHeight;
      appOptions.resizeTo = window; // H5 启用自动 Resize 监听
    }
    
    // 兼容性优化
    PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.MEDIUM;
    PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.MEDIUM;

    const app = new PIXI.Application(appOptions);

    // 将 app 挂载到全局方便调试
    // @ts-ignore
    if (typeof globalThis !== 'undefined') {
        globalThis.__PIXI_APP__ = app;
    }

    if (!isMiniGame && document.body) {
      document.body.appendChild(app.view);
      // 移除旧的 resizeWebCanvas 逻辑，改由 Pixi resizeTo 接管
    }

    SceneManager.init(app);

    app.ticker.add((delta) => {
      SceneManager.update(app.ticker.deltaMS);
    });

    // 默认进入登录场景
    await SceneManager.changeScene(LoginScene);
    
    console.log(`[Main] Game Initialized (Environment: ${isMiniGame ? 'MiniGame' : 'Web'}, Pixi v${PIXI.VERSION})`);

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

// 移除旧的 resizeWebCanvas 函数

initGame();
