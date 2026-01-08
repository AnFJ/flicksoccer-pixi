
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
import './adapter/dom-adapter/index.js' // 2. Adapter (必须在业务逻辑之前加载)

import SceneManager from './managers/SceneManager.js';
import GameScene from './scenes/GameScene.js';
import LoginScene from './scenes/LoginScene.js';
// import { GameConfig } from './config.js';

import * as PIXI from 'pixi.js'
import { install } from '@pixi/unsafe-eval'

// @ts-ignore
import Interaction from './adapter/pixi-interaction.js'

// PixiJS 设置
PIXI.settings.SORTABLE_CHILDREN = true

// [修改] 不再强制使用 LEGACY (WebGL 1.0)。
// 抖音小游戏 Krypton 引擎支持 WebGL 2.0，强制降级可能反而导致 context 创建失败或性能问题。
// PIXI.settings.PREFER_ENV = PIXI.ENV.WEBGL_LEGACY 

// [新增] 忽略性能警告，强制尝试创建 Context
PIXI.settings.FAIL_IF_MAJOR_PERFORMANCE_CAVEAT = false;

// 降低 Shader 精度以提升兼容性
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
    // 获取环境全局对象
    let minigame = null;
    if (typeof wx !== 'undefined') minigame = wx;
    else if (typeof tt !== 'undefined') minigame = tt;

    const isMiniGame = !!minigame;
    console.log(`[Main] Environment detected: ${isMiniGame ? (minigame === wx ? 'WeChat' : 'Douyin') : 'Web'}`);

    let canvasTarget;
    if (isMiniGame) {
      // @ts-ignore
      canvasTarget = window.canvas || (typeof canvas !== 'undefined' ? canvas : null);
    }

    // 获取系统信息
    let screenWidth = 750;
    let screenHeight = 1334;
    let dpr = 2;

    if (minigame) {
        const systemInfo = minigame.getSystemInfoSync();
        screenWidth = systemInfo.windowWidth;
        screenHeight = systemInfo.windowHeight;
        dpr = systemInfo.devicePixelRatio;
    }

    console.log(`[Main] Screen: ${screenWidth}x${screenHeight}, DPR: ${dpr},canvasTarget: ${canvasTarget}`);

    // [修改] 移除手动创建 Context 的逻辑
    // 原因：手动创建可能使用了不被当前设备/引擎支持的属性组合 (如 stencil)，导致 create 失败。
    // PixiJS 内部有完善的尝试机制 (try WebGL2 -> try WebGL1 -> try attributes)，交给它处理更稳妥。

    // 初始化 Pixi 应用
    const PIXIData = {
      view: canvasTarget, 
      width: screenWidth,   
      height: screenHeight, 
      backgroundColor: 0x1a1a1a,
      resolution: dpr,      
      autoDensity: true,
      antialias: false, // 明确关闭抗锯齿，性能优先
      preserveDrawingBuffer: false
    };
    console.log("PIXI Application Data:", PIXIData);
    const app = new PIXI.Application(PIXIData);
    console.log('PIXI app inited', app);
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
    if (err && err.message) {
        console.error('Error Details:', err.message);
    }
  }
}

initGame();
