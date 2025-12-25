
import { defineConfig } from 'vite';
import path from 'path';
import fs from 'fs';

// 简单的递归复制文件夹函数
function copyRecursiveSync(src, dest) {
  const exists = fs.existsSync(src);
  const stats = exists && fs.statSync(src);
  const isDirectory = exists && stats.isDirectory();

  if (isDirectory) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach((childItemName) => {
      copyRecursiveSync(path.join(src, childItemName), path.join(dest, childItemName));
    });
  } else {
    // 如果目标目录不存在，先创建
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true });
    }
    fs.copyFileSync(src, dest);
  }
}

export default defineConfig(({ mode }) => {
  // 判断是否为 H5 构建模式
  const isH5 = mode === 'h5';
  
  // 确定输出目录
  const outDir = isH5 ? '../game_dist/flicksoccer' : 'dist';

  return {
    root: './',
    base: './', // H5 部署时通常使用相对路径
    define: {
      // Pixi.js 等库可能需要 process.env.NODE_ENV
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    build: {
      // H5 输出到 dist-h5，小游戏输出到 dist
      outDir: outDir,
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
      sourcemap: true
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src')
      }
    },
    plugins: [
      // 自定义内联插件：构建完成后复制静态资源 assets 文件夹
      {
        name: 'copy-static-assets',
        closeBundle() {
          const srcAssets = path.resolve(__dirname, 'assets');
          const destAssets = path.resolve(__dirname, outDir, 'assets');
          
          if (fs.existsSync(srcAssets)) {
            try {
              console.log(`[Vite] Copying assets from ${srcAssets} to ${destAssets}...`);
              copyRecursiveSync(srcAssets, destAssets);
              console.log('[Vite] Assets copy complete.');
            } catch (err) {
              console.error('[Vite] Failed to copy assets:', err);
            }
          }

          // 2. 复制小游戏核心配置文件
          const configFiles = [
            'game.json',
            'project.config.json',
            'tt-project.config.json'
          ];

          configFiles.forEach(file => {
             const srcFile = path.resolve(__dirname, file);
             const destFile = path.resolve(__dirname, outDir, file);
             if (fs.existsSync(srcFile)) {
                 fs.copyFileSync(srcFile, destFile);
                 console.log(`[Vite] Copied ${file}`);
             }
          });
          
          console.log('[Vite] Build & Copy complete. Please open the "dist" folder in WeChat DevTools.');
        }
      }
    ]
  };
});
