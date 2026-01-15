
import './adapter/symbol.js';       
import './adapter/tt-adapter.js'    
import SceneManager from './managers/SceneManager.js';
import LoginScene from './scenes/LoginScene.js';
import Platform from './managers/Platform.js'; 
import XMLDocument from './adapter/dom-adapter/XMLDocument.js';

import * as PIXI from 'pixi.js'
import { install } from '@pixi/unsafe-eval'
import Interaction from './adapter/pixi-interaction.js'

console.log('--- Douyin MiniGame Start (Official Adapter) ---');

// --- 1. Polyfills 补丁 ---
PIXI.settings.CREATE_IMAGE_BITMAP = false;
PIXI.utils.isWebGLSupported = () => true;
if (!GameGlobal.XMLDocument) {
    GameGlobal.XMLDocument = XMLDocument;
}
if (!GameGlobal.DOMParser) {
    GameGlobal.DOMParser = class DOMParser {
        parseFromString(str) {
            return new XMLDocument(str);
        }
    }
}
if (typeof window === 'undefined') {
    GameGlobal.window = GameGlobal;
}

// --- 2. PixiJS 配置 ---
PIXI.settings.SORTABLE_CHILDREN = true;
PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.MEDIUM;
PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.MEDIUM;
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR;

install(PIXI);

// --- 3. 注册 Interaction ---
if (PIXI.extensions && PIXI.extensions._queue) {
  const extensions = PIXI.extensions._queue["renderer-canvas-plugin"];
  if (extensions) {
    for (let i = extensions.length - 1; i >= 0; i--) {
      const ext = extensions[i]
      if (ext.name === 'interaction') {
        PIXI.extensions.remove(ext);
      }
    }
  }
}
PIXI.extensions.add({
    name: 'interaction',
    ref: Interaction, 
    type: [PIXI.ExtensionType.RendererPlugin, PIXI.ExtensionType.CanvasRendererPlugin]
  }
);

async function initGame() {
  try {
    Platform.checkUpdate();

    const systemInfo = tt.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;
    const screenHeight = systemInfo.windowHeight;
    const dpr = systemInfo.devicePixelRatio;

    console.log(`[Main] Screen: ${screenWidth}x${screenHeight}, DPR: ${dpr}`);

    const canvasTarget = window.canvas || GameGlobal.screencanvas;

    const PIXIData = {
      view: canvasTarget, 
      width: screenWidth,   
      height: screenHeight, 
      backgroundColor: 0x1a1a1a,
      resolution: dpr,      
      autoDensity: true,
      antialias: false,
      preserveDrawingBuffer: false
    };

    const app = new PIXI.Application(PIXIData);
    
    if (typeof globalThis !== 'undefined') {
        // @ts-ignore
        globalThis.__PIXI_APP__ = app;
    }

    SceneManager.init(app);

    app.ticker.add((delta) => {
      SceneManager.update(app.ticker.deltaMS);
    });

    await SceneManager.changeScene(LoginScene);
    
    console.log(`[Main] Game Initialized (Pixi v${PIXI.VERSION})`);

  } catch (err) {
    console.error('Game Init Failed:', err);
  }
}

initGame();
