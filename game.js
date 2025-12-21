import './adapter/weapp-adapter.js'; // 确保 adapter 最先执行

// 引用打包后的逻辑代码
// 注意：在执行 npm run build 后，代码会生成在 dist/game.js
require('./dist/game.js');