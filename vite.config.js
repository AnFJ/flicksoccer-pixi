import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  build: {
    // 输出目录
    outDir: 'dist',
    // 库模式构建，因为小游戏不需要 index.html
    lib: {
      entry: path.resolve(__dirname, 'src/main.js'),
      name: 'Game',
      fileName: 'game', // 输出为 game.js
      formats: ['cjs']  // 小游戏通常支持 CommonJS 格式较好，或者 IIFE
    },
    rollupOptions: {
      // 确保外部化处理那些你不想打包进库的依赖
      // 对于小游戏，我们通常把 pixi 和 matter 都打包进去
      external: [],
      output: {
        // 全局变量定义，防止某些库报错
        globals: {}
      }
    },
    // 压缩代码，减小体积
    minify: 'terser',
    sourcemap: false
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  }
});