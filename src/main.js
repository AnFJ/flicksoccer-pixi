
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
// import './adapter/weapp-adapter.js';// 2. 加载适配器 (模拟 window/document)
import './libs/weapp-adapter/index.js' 
import * as PIXI from 'pixi.js';
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import LoginScene from './scenes/LoginScene.js';
import { GameConfig } from './config.js';

const app = new PIXI.Application();

async function initGame() {
  try {
    const isMiniGame = (typeof wx !== 'undefined' || typeof tt !== 'undefined');

    let canvasTarget;
    if (isMiniGame) {
      // @ts-ignore
      canvasTarget = window.canvas || canvas;
    } else {
      canvasTarget = undefined;
    }

    // 初始化 Pixi 应用
    // 使用配置中的设计分辨率 2400 x 1080
    await app.init({
      canvas: canvasTarget, 
      width: GameConfig.designWidth,
      height: GameConfig.designHeight,
      background: '#1a1a1a',
      resolution: window.devicePixelRatio || 2,
      autoDensity: true,
      antialias: true
    });

    if (!isMiniGame) {
      document.body.appendChild(app.canvas);
      resizeWebCanvas();
      window.addEventListener('resize', resizeWebCanvas);
    } else {
      // 小游戏环境通常由 adapter 处理缩放，
      // 但如果需要手动干预，可以在这里基于 wx.getSystemInfoSync() 进行缩放
    }

    SceneManager.init(app);

    app.ticker.add((ticker) => {
      SceneManager.update(ticker.deltaTime);
    });

    // 默认进入登录场景
    await SceneManager.changeScene(LoginScene);
    
    console.log(`[Main] Game Initialized (Environment: ${isMiniGame ? 'MiniGame' : 'Web'})`);

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

/**
 * H5 端的 Canvas 适配逻辑
 * 策略：Fit Height (高度适配)
 * 无论屏幕宽高比如何，优先填满屏幕高度，宽度按比例缩放。
 * 如果屏幕比设计稿更宽，左右会看到更多内容（或黑边，取决于容器）。
 * 如果屏幕比设计稿更窄，两边会被裁切（但我们已经把核心 UI 居中，应该没问题）。
 */
function resizeWebCanvas() {
  const canvas = app.canvas;
  if (!canvas) return;

  const wWidth = window.innerWidth;
  const wHeight = window.innerHeight;

  // 计算缩放比例：屏幕高度 / 设计稿高度 (1080)
  const scale = wHeight / GameConfig.designHeight;
  
  // 设置 Canvas 的 CSS 尺寸
  // 宽度按比例计算，高度填满屏幕
  canvas.style.width = `${GameConfig.designWidth * scale}px`;
  canvas.style.height = `${wHeight}px`; 
  
  // 居中显示
  // canvas.style.position = 'absolute';
  // canvas.style.left = '50%';
  // canvas.style.top = '50%';
  // canvas.style.transform = 'translate(-50%, -50%)';
}

initGame();
