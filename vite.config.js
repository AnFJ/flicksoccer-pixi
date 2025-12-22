
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // 判断是否为 H5 构建模式
  const isH5 = mode === 'h5';

  return {
    root: './',
    base: './',
    define: {
      // Pixi.js 等库可能需要 process.env.NODE_ENV
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    build: {
      // H5 输出到 dist-h5，小游戏输出到 dist
      outDir: isH5 ? '../game_dist/flicksoccer' : 'dist',
      emptyOutDir: true,
      
      // H5 模式下不需要 lib 配置
      // 小游戏模式下需要 lib 配置，打包成单个 JS 文件
      lib: isH5 ? false : {
        entry: path.resolve(__dirname, 'src/main.js'),
        name: 'Game',
        // 强制输出文件名为 game.js (Vite 默认可能是 game.cjs)
        fileName: () => 'game.js', 
        formats: ['cjs'] // 小游戏使用 CommonJS 规范
      },
      
      rollupOptions: {
        // 小游戏模式下，不要排除任何依赖，全部打包进一个文件
        external: isH5 ? [] : [], 
        output: {
          // 确保全局变量不冲突
          extend: true,
        }
      },
      // 使用 esbuild 压缩
      minify: 'esbuild',
      sourcemap: false
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    }
  };
});
