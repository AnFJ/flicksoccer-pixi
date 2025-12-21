import * as PIXI from 'pixi.js';
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
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
        // 小游戏环境下，强制适配
        const { windowWidth, windowHeight } = isMiniGame && wx.getSystemInfoSync ? wx.getSystemInfoSync() : { windowWidth: GameConfig.designWidth, windowHeight: GameConfig.designHeight };
        // 这里可以添加额外的小游戏适配逻辑，通常 adapter 会处理好全屏 Canvas
    }

    SceneManager.init(app);

    app.ticker.add((ticker) => {
      SceneManager.update(ticker.deltaTime);
    });

    await SceneManager.changeScene(GameScene); // 默认进入 LoginScene 流程，这里方便测试直接进 GameScene 或者改为 LoginScene
    
    console.log(`[Main] Game Initialized (Environment: ${isMiniGame ? 'MiniGame' : 'Web'})`);

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

function resizeWebCanvas() {
  const canvas = app.canvas;
  if (!canvas) return;

  const wWidth = window.innerWidth;
  const wHeight = window.innerHeight;

  // 横屏适配逻辑：高度适配，宽度按比例缩放
  // 我们希望高度填满屏幕，宽度随之变化
  const scale = wHeight / GameConfig.designHeight;
  
  canvas.style.width = `${GameConfig.designWidth * scale}px`;
  canvas.style.height = `${wHeight}px`; // 填满高度
  
  // 如果宽度超出了屏幕（比如设计是 16:9，屏幕是 4:3），则允许左右裁剪？或者保持 contain？
  // 用户需求是 "高度适配，长度居中"，通常意味着我们优先保证高度充满。
  // 如果屏幕比设计更宽（21:9），左右会有黑边（或者显示更多背景）。
  // 如果屏幕比设计更窄（4:3 IPad），左右会显示不全。
  // 为了预览体验，这里使用 contain 策略保证全显示
  const scaleX = wWidth / GameConfig.designWidth;
  const scaleY = wHeight / GameConfig.designHeight;
  const finalScale = Math.min(scaleX, scaleY);
  canvas.style.width = `${GameConfig.designWidth * finalScale}px`;
  canvas.style.height = `${GameConfig.designHeight * finalScale}px`;
}

initGame();