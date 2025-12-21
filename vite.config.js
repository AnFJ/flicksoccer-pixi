import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig(({ mode }) => {
  // 判断是否为 H5 构建模式
  const isH5 = mode === 'h5';

  return {
    // 如果是 H5 构建，根目录就是当前目录（为了找到 index.html）
    root: './',
    base: './', // 相对路径，确保 H5 在任何目录下都能运行
    build: {
      // H5 输出到 dist-h5，小游戏输出到 dist
      outDir: isH5 ? '../game_dist/flicksoccer' : 'dist',
      // 小游戏每次构建清空 dist，H5 同理
      emptyOutDir: true,
      
      // H5 模式下不需要 lib 配置，Vite 会自动以 index.html 为入口打包
      // 小游戏模式下需要 lib 配置，打包成单个 JS 文件
      lib: isH5 ? false : {
        entry: path.resolve(__dirname, 'src/main.js'),
        name: 'Game',
        fileName: 'game', 
        formats: ['cjs'] // 小游戏用 CommonJS
      },
      
      rollupOptions: {
        external: [],
        output: {
          globals: {}
        }
      },
      // 修改这里：使用 esbuild 进行压缩，无需安装 terser，且构建速度更快
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