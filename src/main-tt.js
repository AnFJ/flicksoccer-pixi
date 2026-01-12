
import './adapter/symbol.js';       // 1. 加载 Symbol Polyfill
import './adapter/tt-adapter.js'    // 2. 加载官方 TT 适配器
import SceneManager from './managers/SceneManager.js';
import LoginScene from './scenes/LoginScene.js';
import Platform from './managers/Platform.js'; 
// XML 解析补丁 (Pixi 需要)
import XMLDocument from './adapter/dom-adapter/XMLDocument.js';

import * as PIXI from 'pixi.js'
import { install } from '@pixi/unsafe-eval'
import Interaction from './adapter/pixi-interaction.js'

console.log('--- Douyin MiniGame Start (Official Adapter) ---');

// --- 1. Polyfills 补丁 ---
// [关键修复] 不要尝试修改 window.ImageBitmap，因为在官方适配器中它是只读的
// 只需配置 Pixi 不使用 ImageBitmap 即可
PIXI.settings.CREATE_IMAGE_BITMAP = false;

// [核心修复] 强制 Pixi 认为 WebGL 支持
// 原因: 在抖音真机(Krypton引擎)下，Pixi 内部创建临时 Canvas 进行兼容性检查(isWebGLSupported)往往会失败
// 但实际上主屏幕 Canvas 是支持 WebGL 的。因此直接绕过检查。
PIXI.utils.isWebGLSupported = () => true;

// 官方适配器通常不包含 XML 解析，这会导致 Pixi BitmapFontLoader 报错
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
// 确保 window 引用存在 (Pixi 依赖)
if (typeof window === 'undefined') {
    GameGlobal.window = GameGlobal;
}

// --- 2. PixiJS 配置 ---
PIXI.settings.SORTABLE_CHILDREN = true
// 降低 Shader 精度以兼容旧设备
PIXI.settings.PRECISION_VERTEX = PIXI.PRECISION.MEDIUM
PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.MEDIUM
PIXI.settings.SCALE_MODE = PIXI.SCALE_MODES.LINEAR

// 安装 unsafe-eval
install(PIXI)

// --- 3. 注册 Interaction 插件 ---
// 移除 Pixi 默认的 Interaction (因为它依赖 DOM 结构)
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
// 注册适配小游戏的 Interaction
PIXI.extensions.add({
    name: 'interaction',
    ref: Interaction, 
    type: [PIXI.ExtensionType.RendererPlugin, PIXI.ExtensionType.CanvasRendererPlugin]
});

async function initGame() {
  try {
    // [新增] 启动时检查更新
    Platform.checkUpdate();

    // 获取系统信息
    const systemInfo = tt.getSystemInfoSync();
    const screenWidth = systemInfo.windowWidth;
    const screenHeight = systemInfo.windowHeight;
    const dpr = systemInfo.devicePixelRatio;

    console.log(`[Main] Screen: ${screenWidth}x${screenHeight}, DPR: ${dpr}`);

    // 初始化 Pixi 应用
    // 注意：tt-adapter 通常将主 Canvas 挂载为 window.canvas 或 GameGlobal.screencanvas
    const canvasTarget = window.canvas || GameGlobal.screencanvas;

    // --- 4. 关键修复：WebGL 参数解包补丁 (通过拦截 getContext 实现) ---
    // 官方适配器会将原生 Canvas 包装成 JS 对象，导致 gl.texImage2D 报错 "Overload resolution failed"
    // 我们需要拦截该调用，将 Wrapper 解包为原生 Canvas
    if (canvasTarget && !canvasTarget.__isContextHooked) {
        canvasTarget.__isContextHooked = true;
        
        // 拦截 getContext 以获取并修补返回的 context 对象
        const originalGetContext = canvasTarget.getContext;
        
        canvasTarget.getContext = function(...args) {
            const context = originalGetContext.apply(this, args);
            
            // 确保只 Hook 一次 context 实例，且只针对 WebGL
            if (context && !context.__isTexHooked && (args[0] === 'webgl' || args[0] === 'experimental-webgl')) {
                context.__isTexHooked = true;
                console.log("[Main] Patching WebGL Context methods...");

                const _texImage2D = context.texImage2D;
                context.texImage2D = function(...tArgs) {
                    // texImage2D 签名可能有多种，通常是 6 个参数: 
                    // (target, level, internalformat, format, type, source)
                    if (tArgs.length === 6) {
                        const source = tArgs[5];
                        // 检查是否是 Adapter 的 Canvas Wrapper (特征：有 .canvas 属性且是原生 Canvas)
                        if (source && typeof source === 'object' && source.canvas && source.tagName === 'CANVAS') {
                            tArgs[5] = source.canvas;
                        }
                    }
                    return _texImage2D.apply(this, tArgs);
                };

                const _texSubImage2D = context.texSubImage2D;
                context.texSubImage2D = function(...tArgs) {
                    // texSubImage2D(target, level, xoffset, yoffset, format, type, source) -> 7 args
                    if (tArgs.length === 7) {
                        const source = tArgs[6];
                        if (source && typeof source === 'object' && source.canvas && source.tagName === 'CANVAS') {
                            tArgs[6] = source.canvas;
                        }
                    }
                    return _texSubImage2D.apply(this, tArgs);
                };
            }
            return context;
        };
    }

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
    
    // 将 app 挂载到全局方便调试
    // @ts-ignore
    if (typeof globalThis !== 'undefined') {
        globalThis.__PIXI_APP__ = app;
    }

    // 初始化场景管理器
    SceneManager.init(app);

    app.ticker.add((delta) => {
      SceneManager.update(app.ticker.deltaMS);
    });

    // 进入登录场景
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
