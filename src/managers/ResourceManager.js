
import * as PIXI from 'pixi.js';

class ResourceManager {
  constructor() {
    this.resources = {};
    
    // 1. 登录页优先加载的资源
    this.loginManifest = {
        login_bg: 'assets/images/main_bg.png', // 暂时复用球场图作为登录背景，你可以换成专门的图
    };

    // 2. 游戏主体资源
    this.gameManifest = {
      field_bg: 'assets/images/field_bg.png',
      field_border: 'assets/images/field_border.png',
      bg_grass: 'assets/images/grass_texture.png',
      
      // --- 足球相关 ---
      ball_texture: 'assets/images/ball_texture.png', 
      
      ball: 'assets/images/ball.png', 
      striker_red: 'assets/images/striker_red.png',
      striker_blue: 'assets/images/striker_blue.png',

      // UI
      main_bg: 'assets/images/main_bg.png',
      btn_menu: 'assets/images/btn_menu.png' // 假设你有这个按钮图，或者你需要添加它
    };
  }

  /**
   * 仅加载登录页背景
   */
  loadLoginResources() {
      return this._loadManifest(this.loginManifest);
  }

  /**
   * 加载剩余游戏资源
   * @param {Function} onProgress (progress: number) => void (0~100)
   */
  loadGameResources(onProgress) {
      return this._loadManifest(this.gameManifest, onProgress);
  }

  /**
   * 通用加载内部实现
   */
  _loadManifest(manifest, onProgress) {
    return new Promise((resolve, reject) => {
      const loader = PIXI.Loader.shared;
      
      let count = 0;
      // 筛选出尚未加载的资源
      for (const [key, url] of Object.entries(manifest)) {
        if (!loader.resources[key]) {
            loader.add(key, url);
            count++;
        } else {
            // 如果已经加载过，确保引用存在
            if (loader.resources[key].texture) {
                this.resources[key] = loader.resources[key].texture;
            }
        }
      }

      if (count === 0) {
          if (onProgress) onProgress(100);
          resolve();
          return;
      }

      // 绑定进度回调
      if (onProgress) {
          loader.onProgress.add((loader) => {
              onProgress(loader.progress); // Pixi loader progress is 0-100
          });
      }

      loader.load((loader, resources) => {
        // 将加载好的资源映射到 this.resources
        for (const [key, resource] of Object.entries(resources)) {
          if (resource.texture) {
            this.resources[key] = resource.texture;
          } else if (resource.error) {
            console.warn(`[Resource] Failed to load ${key}, using fallback.`);
            this.resources[key] = null;
          }
        }
        
        // 清理监听器，防止多次调用叠加
        loader.onProgress.detachAll();
        
        resolve();
      });

      loader.onError.add((err) => {
        console.error('[Resource] Loader Error:', err);
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
