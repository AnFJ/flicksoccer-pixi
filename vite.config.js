
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
  // 判断构建模式
  const isH5 = mode === 'h5';
  const isDouyin = mode === 'douyin';
  
  // 确定输出目录
  // H5 -> ../game_dist/flicksoccer (或 dist-h5)
  // 抖音 -> dist-tt
  // 微信(默认) -> dist
  let outDir = 'dist';
  if (isH5) outDir = '../game_dist/flicksoccer';
  else if (isDouyin) outDir = 'dist-tt';

  // [修改] 根据模式选择入口文件
  let entryFile = 'src/main-mini.js';
  if (isDouyin) {
      entryFile = 'src/main-tt.js';
  }

  return {
    root: './',
    base: './', // H5 部署时通常使用相对路径
    define: {
      // Pixi.js 等库可能需要 process.env.NODE_ENV
      'process.env.NODE_ENV': JSON.stringify(mode === 'production' ? 'production' : 'development'),
    },
    build: {
      outDir: outDir,
      emptyOutDir: true,
      
      // H5 模式下不需要 lib 配置
      // 小游戏模式下需要 lib 配置，打包成单个 JS 文件
      lib: isH5 ? false : {
        entry: path.resolve(__dirname, entryFile), // [修改] 使用动态入口
        name: 'Game',
        // 强制输出文件名为 game.js
        fileName: () => 'game.js', 
        formats: ['cjs'] // 小游戏使用 CommonJS 规范
      },
      
      rollupOptions: {
        // 小游戏模式下，不要排除任何依赖，全部打包进一个文件
        external: isH5 ? [] : [], 
        output: {
          // 确保全局变量不冲突
          extend: true,
          // [移除] 移除 banner "use strict"; 以兼容旧适配器代码
        }
      },
      // 使用 esbuild 压缩
      minify: 'esbuild',
      // 小游戏环境下使用 inline sourcemap，避免开发者工具加载 .map 文件 404
      sourcemap: isDouyin ?  'inline': true
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@foosball': path.resolve(__dirname, 'src/subpackages/foosball')
      }
    },
    plugins: [
      // [新增] 开发服务器中间件：映射分包资源路径
      {
        name: 'serve-subpackages-in-dev',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            // 将 /subpackages/... 请求重写为 /src/subpackages/...
            // 这样 Vite 开发服务器就能在 src 目录下找到资源
            if (req.url.startsWith('/subpackages/')) {
              req.url = '/src' + req.url;
            }
            next();
          });
        }
      },
      // 自定义内联插件：构建完成后复制静态资源 assets 文件夹及配置文件
      {
        name: 'copy-static-assets',
        closeBundle() {
          const srcAssets = path.resolve(__dirname, 'assets');
          const destAssets = path.resolve(__dirname, outDir, 'assets');
          const srcAssetsOrigin = path.resolve(__dirname, 'assets-origin');
          const destAssetsOrigin = path.resolve(__dirname, outDir, 'assets-origin');
          
          // 1. 复制通用资源文件
          if (fs.existsSync(srcAssets)) {
            try {
              console.log(`[Vite] Copying assets from ${srcAssets} to ${destAssets}...`);
              copyRecursiveSync(srcAssets, destAssets);
              copyRecursiveSync(srcAssetsOrigin, destAssetsOrigin);
              console.log('[Vite] Assets copy complete.');
            } catch (err) {
              console.error('[Vite] Failed to copy assets:', err);
            }
          }

          // 2. [新增] 复制分包资源 (src/subpackages/*/assets -> dist/subpackages/*/assets)
          const srcSubPkgDir = path.resolve(__dirname, 'src/subpackages');
          if (fs.existsSync(srcSubPkgDir)) {
              try {
                  fs.readdirSync(srcSubPkgDir).forEach(pkgName => {
                      const srcPkgAssets = path.join(srcSubPkgDir, pkgName, 'assets');
                      if (fs.existsSync(srcPkgAssets)) {
                          const destPkgAssets = path.resolve(__dirname, outDir, 'subpackages', pkgName, 'assets');
                          console.log(`[Vite] Copying subpackage assets for ${pkgName}...`);
                          copyRecursiveSync(srcPkgAssets, destPkgAssets);
                      }
                  });
              } catch (err) {
                  console.error('[Vite] Failed to copy subpackages:', err);
              }
          }

          // 3. 复制小游戏核心配置文件 (根据平台区分)
          if (!isH5) {
              const srcGameJson = path.resolve(__dirname, 'game.json');
              const destGameJson = path.resolve(__dirname, outDir, 'game.json');
              
              // 复制 game.json (通用)
              if (fs.existsSync(srcGameJson)) {
                  fs.copyFileSync(srcGameJson, destGameJson);
                  console.log(`[Vite] Copied game.json`);
              }

              // 复制项目配置文件 project.config.json
              if (isDouyin) {
                  // 抖音: 使用 tt-project.config.json 但重命名为 project.config.json 方便 IDE 识别
                  const srcTTConfig = path.resolve(__dirname, 'tt-project.config.json');
                  const destConfig = path.resolve(__dirname, outDir, 'project.config.json');
                  if (fs.existsSync(srcTTConfig)) {
                      fs.copyFileSync(srcTTConfig, destConfig);
                      console.log(`[Vite] Copied tt-project.config.json to project.config.json for Douyin`);
                  }
              } else {
                  // 微信: 使用 project.config.json
                  const srcWxConfig = path.resolve(__dirname, 'project.config.json');
                  const destConfig = path.resolve(__dirname, outDir, 'project.config.json');
                  if (fs.existsSync(srcWxConfig)) {
                      fs.copyFileSync(srcWxConfig, destConfig);
                      console.log(`[Vite] Copied project.config.json for WeChat`);
                  }
              }
          }
          
          console.log(`[Vite] Build & Copy complete. Output: "${outDir}"`);
        }
      }
    ]
  };
});
