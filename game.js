
import './src/adapter/symbol.js';       // 1. Polyfill
// import './src/adapter/canvas-patch.js'; // 2. (已移除) 停止使用劫持补丁
// import './src/libs/weapp-adapter/index.js' // 3. (已移除) 避免与 main-mini.js 中的 dom-adapter 冲突

// 4. 引用 Vite 打包后的游戏主逻辑 (内部包含了 src/adapter/dom-adapter)
import './dist/game.js';
