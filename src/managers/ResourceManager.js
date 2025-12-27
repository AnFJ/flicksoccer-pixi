
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
      main_bg: 'assets/images/main_bg.png',
      
      // 新增：菜单通用按钮背景图
      // 请确保 assets/images/ 目录下有 btn_menu.png 文件
      btn_menu: 'assets/images/btn_menu.png',

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
      let needLoad = false;
      
      // 检查哪些还没添加进 Loader
      for (const [key, url] of Object.entries(this.manifest)) {
        if (!loader.resources[key]) {
            loader.add(key, url);
            needLoad = true;
        }
      }

      // 如果所有资源都已经加载过或在队列中，直接检查是否加载完成
      if (!needLoad) {
          // 再次检查是否真的有纹理数据了（防止add了但还没load完的情况）
          // 简单起见，如果不需要add新资源，我们假设它已经准备好了或者正在加载中
          // 我们可以直接调用 load，Pixi Loader 会处理空队列回调
      }

      loader.load((loader, resources) => {
        // 将加载好的资源映射到 this.resources
        for (const [key, resource] of Object.entries(resources)) {
          // v6 中 resource.texture 是纹理对象
          if (resource.texture) {
            this.resources[key] = resource.texture;
          } else if (resource.error) {
            console.warn(`[Resource] Failed to load ${key}, using fallback.`);
            this.resources[key] = null;
          }
        }
        console.log('[Resource] All resources loaded/ready.');
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
    // 优先从自己缓存取，取不到尝试从 loader 取
    return this.resources[key] || (PIXI.Loader.shared.resources[key] && PIXI.Loader.shared.resources[key].texture) || null;
  }
}

export default new ResourceManager();
