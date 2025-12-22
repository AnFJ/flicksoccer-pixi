
import './src/adapter/symbol.js';       // 1. 加载 Symbol Polyfill (防报错)
// import './src/adapter/weapp-adapter.js';// 2. 加载微信/抖音适配器 (模拟 window/document)
import './src/libs/weapp-adapter/index.js' 
// 3. 引用 Vite 打包后的游戏主逻辑
// 注意：必须在 npm run build 生成 dist/game.js 后才能运行
import './dist/game.js';
