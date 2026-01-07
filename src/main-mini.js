
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import LoginScene from './scenes/LoginScene.js';
import { GameConfig } from './config.js';

import './adapter/dom-adapter/index.js'
// import '@iro/wechat-adapter'
import * as PIXI from 'pixi.js'
import { install } from '@pixi/unsafe-eval'

// 核心修改：引入本地的 Interaction 类
// @ts-ignore
import Interaction from './adapter/pixi-interaction.js'
// import Interaction from '@iro/interaction'

// PixiJS 设置
PIXI.settings.SORTABLE_CHILDREN = true

// 兼容性优化 1: 移除强制 WEBGL_LEGACY，让 Pixi 自动检测最佳 WebGL 版本
// PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL_LEGACY 

// 兼容性优化 2: 降低 Shader 精度
// iPhone 7 等旧设备在 HIGH 精度下可能会因为显存或驱动问题导致 WebGL Context 创建失败
PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.MEDIUM
PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.MEDIUM

PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR

// 安装 unsafe-eval (适配微信小游戏禁止 eval 的限制)
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
      // 确保能获取到全局 canvas
      canvasTarget = window.canvas || (typeof canvas !== 'undefined' ? canvas : null);
    }

    // 获取真机系统信息
    const systemInfo = wx.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;   // 逻辑宽度
    const screenHeight = systemInfo.windowHeight; // 逻辑高度
    const dpr = systemInfo.devicePixelRatio;

    console.log(`[Main] Screen: ${screenWidth}x${screenHeight}, DPR: ${dpr}`);

    // 初始化 Pixi 应用
    // 关键兼容性修复：antialias: false
    const app = new PIXI.Application({
      view: canvasTarget, 
      width: screenWidth,   
      height: screenHeight, 
      backgroundColor: 0x1a1a1a,
      resolution: dpr,      
      autoDensity: true,
      antialias: false, // 兼容性优化 3: 关闭抗锯齿，极大降低旧设备 WebGL 崩溃概率
      preserveDrawingBuffer: false // 显式关闭，节省内存
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
    // 如果是 WebGL 不支持的错误，且是在真机上，尝试提示用户
    if (err.message && err.message.indexOf('WebGL') !== -1) {
        console.error('CRITICAL: WebGL Context creation failed. Try using pixi.js-legacy for Canvas fallback.');
    }
  }
}

// H5 逻辑在此文件已移除，由 main.js 处理
initGame();
