
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import LoginScene from './scenes/LoginScene.js';
import { GameConfig } from './config.js';

import '@iro/wechat-adapter'
import * as PIXI from 'pixi.js'
import { install } from '@pixi/unsafe-eval'
// @ts-expect-error
import Interaction from '@iro/interaction'

// PixiJS 设置
PIXI.settings.SORTABLE_CHILDREN = true
PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL_LEGACY  // 根据目标环境调整
PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.HIGH
PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR

// 安装 unsafe-eval
install(PIXI)

// 更安全地移除默认的 interaction 插件
const extensions = PIXI.extensions._queue["renderer-canvas-plugin"];
for (let i = extensions.length - 1; i >= 0; i--) {
  const ext = extensions[i]
  if (ext.name === 'interaction') {
    let a = PIXI.extensions.remove(ext);
    console.log('Removed default interaction plugin:', a, PIXI.extensions._queue["renderer-canvas-plugin"]);
  }
}
console.log('PIXI.extensions before remove:', PIXI.extensions)
// PIXI.extensions.removeByName('interaction')

// const interactionExt = PIXI.extensions.get('interaction')
// if (interactionExt) {
//     PIXI.extensions.remove(interactionExt)
// }


// 添加 @iro/interaction
PIXI.extensions.add(
  {
    name: 'interaction',
    ref: Interaction,
    type: [PIXI.ExtensionType.RendererPlugin, PIXI.ExtensionType.CanvasRendererPlugin]
  }
)

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
    const {
      devicePixelRatio,
      windowWidth: width,
      windowHeight: height,
    } = wx.getSystemInfoSync()
    console.log('[System Info]', wx.getSystemInfoSync(), {
      width,
      height, devicePixelRatio
    });
    // 初始化 Pixi 应用 (v6.5.10 标准写法)
    const app = new PIXI.Application({
      view: canvasTarget, // 指定 canvas 元素
      width: GameConfig.designWidth,
      height: GameConfig.designHeight,
      // width: width,
      // height: height,
      backgroundColor: 0x1a1a1a, // 背景色
      resolution: devicePixelRatio || 2,
      autoDensity: true, // CSS 像素校正
      antialias: true
    });

    // 将 app 挂载到全局方便调试
    // @ts-ignore
    if (typeof globalThis !== 'undefined') {
        globalThis.__PIXI_APP__ = app;
    }

    if (!isMiniGame && document.body) {
      document.body.appendChild(app.view);
      resizeWebCanvas(app);
      window.addEventListener('resize', () => resizeWebCanvas(app));
    }

    SceneManager.init(app);

    app.ticker.add((delta) => {
      // v6 ticker 回调参数 delta 是帧率系数 (frame-dependent)
      // 使用 app.ticker.deltaMS 获取两帧之间的毫秒数，更适合物理计算
      SceneManager.update(app.ticker.deltaMS);
    });

    // 默认进入登录场景
    await SceneManager.changeScene(LoginScene);
    // SceneManager.changeScene(GameScene, { mode: 'pve' }) 
    
    console.log(`[Main] Game Initialized (Environment: ${isMiniGame ? 'MiniGame' : 'Web'}, Pixi v${PIXI.VERSION})`);

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

/**
 * H5 端的 Canvas 适配逻辑
 */
function resizeWebCanvas(app) {
  const canvas = app.view;
  if (!canvas) return;

  const wWidth = window.innerWidth;
  const wHeight = window.innerHeight;

  // Fit Height 策略：保持高度充满，宽度按比例缩放
  const scale = wHeight / GameConfig.designHeight;
  
  canvas.style.width = `${GameConfig.designWidth * scale}px`;
  canvas.style.height = `${wHeight}px`; 
}

initGame();
