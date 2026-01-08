
import minigame from './minigame'

let hasGlobalCanvas = false;
let globalCanvas = null;

try {
    // 尝试获取环境现有的主 Canvas (Krypton 引擎通常已注入)
    if (typeof GameGlobal !== 'undefined' && GameGlobal.canvas) {
        hasGlobalCanvas = true;
        globalCanvas = GameGlobal.canvas;
    } else if (typeof window !== 'undefined' && window.canvas) {
        hasGlobalCanvas = true;
        globalCanvas = window.canvas;
    } else if (typeof canvas !== 'undefined') {
        // @ts-ignore
        hasGlobalCanvas = true;
        globalCanvas = canvas;
    }
} catch(e) {
    console.warn('[Adapter] Failed to detect global canvas:', e);
}

function Canvas() {
  let canvas;
  
  if (hasGlobalCanvas && globalCanvas) {
      canvas = globalCanvas;
  } else {
      canvas = minigame.createCanvas();
  }

  // 确保 Pixi 需要的属性存在
  if (!canvas.style) {
      canvas.style = {cursor: null};
  }
  
  // 部分环境可能丢失 tagName，手动补全以骗过 Pixi 检查
  if (!canvas.tagName) {
      canvas.tagName = 'CANVAS';
  }

  // 抖音/微信真机上有时需要手动 update 宽高属性以同步 innerWidth
  if (canvas.width === 0 || canvas.height === 0) {
      const info = minigame.getSystemInfoSync();
      canvas.width = info.windowWidth;
      canvas.height = info.windowHeight;
  }

  return canvas;
}

const canvas = new Canvas()

export {
  canvas,
  Canvas
}
