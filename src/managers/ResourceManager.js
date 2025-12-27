
import * as PIXI from 'pixi.js';

class ResourceManager {
  constructor() {
    this.resources = {};
    // 定义资源清单
    this.manifest = {
      // 修改：引入新的球场素材
      field_bg: 'assets/images/field_bg.png',
      field_border: 'assets/images/field_border.png',
      // 新增：全局背景草地 (注意是 png)
      bg_grass: 'assets/images/grass_texture.png',
      
      // 新增：游戏主背景图 (登录/菜单页)
      // 请确保 assets/images/ 目录下有 main_bg.png 文件
      main_bg: 'assets/images/main_bg.png',

      // --- 足球相关 ---
      // ball_texture: 你生成的无缝平铺纹理
      ball_texture: 'assets/images/ball_texture.png', 
      // ball_overlay: 可选的光影遮罩 (如果没有这张图，Ball.js 会自动用代码生成一个)
      // ball_overlay: 'assets/images/ball_overlay.png',
      
      ball: 'assets/images/ball.png', // 旧的备用
      striker_red: 'assets/images/striker_red.png',
      striker_blue: 'assets/images/striker_blue.png'
    };
  }

  /**
   * 加载所有必要资源 (适配 PixiJS v6 Loader)
   */
  loadAll() {
    return new Promise((resolve, reject) => {
      const loader = PIXI.Loader.shared;
      
      // 防止重复添加导致报错
      for (const [key, url] of Object.entries(this.manifest)) {
        if (!loader.resources[key]) {
            loader.add(key, url);
        }
      }

      loader.load((loader, resources) => {
        // 将加载好的资源映射到 this.resources
        for (const [key, resource] of Object.entries(resources)) {
          // v6 中 resource.texture 是纹理对象
          if (resource.texture) {
            this.resources[key] = resource.texture;
            console.log(`[Resource] Loaded: ${key}`);
          } else if (resource.error) {
            console.warn(`[Resource] Failed to load ${key}, using fallback.`);
            this.resources[key] = null;
          }
        }
        resolve();
      });

      loader.onError.add((err) => {
        console.error('[Resource] Loader Error:', err);
        // 不reject，允许部分资源缺失继续运行
      });
    });
  }

  /**
   * 获取纹理
   * @param {string} key 
   * @returns {PIXI.Texture|null}
   */
  get(key) {
    return this.resources[key] || null;
  }
}

export default new ResourceManager();
