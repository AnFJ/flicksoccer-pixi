
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import LoginScene from './scenes/LoginScene.js';
import { GameConfig } from './config.js';

import '@iro/wechat-adapter'
import * as PIXI from 'pixi.js'
import { install } from '@pixi/unsafe-eval'

// 核心修改：引入本地的 Interaction 类
// @ts-ignore
import Interaction from './adapter/pixi-interaction.js'
// import Interaction from '@iro/interaction'

// PixiJS 设置
PIXI.settings.SORTABLE_CHILDREN = true
PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL_LEGACY 
PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.HIGH
PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR

// 安装 unsafe-eval
install(PIXI)

// 移除默认的 interaction 插件
if (PIXI.extensions && PIXI.extensions._queue) {
  const extensions = PIXI.extensions._queue["renderer-canvas-plugin"];
  if (extensions) {
    for (let i = extensions.length - 1; i >= 0; i--) {
      const ext = extensions[i]
      if (ext.name === 'interaction') {
        PIXI.extensions.remove(ext);
        console.log('Removed default interaction plugin successfully.');
      }
    }
  }
}

// 注册本地的 Interaction 类
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
    }

    // --- 核心修复 ---
    // 获取真机系统信息
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;   // 逻辑宽度 (e.g. 375 / 414)
    const screenHeight = systemInfo.windowHeight; // 逻辑高度 (e.g. 667 / 896)
    const dpr = systemInfo.devicePixelRatio;

    console.log(`[Main] Screen: ${screenWidth}x${screenHeight}, DPR: ${dpr}`);

    // 初始化 Pixi 应用
    // 关键点：使用【屏幕实际逻辑宽高】初始化，而不是设计稿宽高
    const app = new PIXI.Application({
      view: canvasTarget, 
      width: screenWidth,   // <--- 使用屏幕宽
      height: screenHeight, // <--- 使用屏幕高
      backgroundColor: 0x1a1a1a,
      resolution: dpr,      // <--- 使用设备像素比
      autoDensity: true,
      antialias: true
    });

    // 将 app 挂载到全局方便调试
    // @ts-ignore
    if (typeof globalThis !== 'undefined') {
        globalThis.__PIXI_APP__ = app;
    }

    // 初始化场景管理器，并告知应用
    SceneManager.init(app);

    app.ticker.add((delta) => {
      SceneManager.update(app.ticker.deltaMS);
    });

    // 默认进入登录场景
    await SceneManager.changeScene(LoginScene);
    
    console.log(`[Main] Game Initialized (Pixi v${PIXI.VERSION})`);

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

// H5 逻辑在此文件已移除，由 main.js 处理
initGame();
