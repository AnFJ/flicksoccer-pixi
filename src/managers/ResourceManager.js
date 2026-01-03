
import * as PIXI from 'pixi.js';

class ResourceManager {
  constructor() {
    this.resources = {};
    
    // 1. 登录页优先加载的资源
    this.loginManifest = {
        login_bg: 'assets/images/main_bg.png', 
    };

    // 2. 游戏主体资源
    this.gameManifest = {
      field_combined: 'assets/images/field_combined.png', 
      field_border: 'assets/images/field_border.png',
      bg_grass: 'assets/images/grass_texture.png',
      
      // --- 足球相关 ---
      ball_texture: 'assets/images/ball_texture.png', 
      ball: 'assets/images/ball.png', 
      striker_red: 'assets/images/striker_red.png',
      striker_blue: 'assets/images/striker_blue.png',

      // UI
      main_bg: 'assets/images/main_bg.png',
      btn_menu: 'assets/images/btn_menu.png',
      hud_bg: 'assets/images/hud_bg.png',

      // [新增] 技能按键背景素材
      skill_aim_bg: 'assets/images/skill_aim_bg.png',
      skill_force_bg: 'assets/images/skill_force_bg.png',
      skill_unstoppable_bg: 'assets/images/skill_unstoppable_bg.png'
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
      for (const [key, url] of Object.entries(manifest)) {
        if (!loader.resources[key]) {
            loader.add(key, url);
            count++;
        } else {
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

      if (onProgress) {
          loader.onProgress.add((loader) => {
              onProgress(loader.progress);
          });
      }

      loader.load((loader, resources) => {
        for (const [key, resource] of Object.entries(resources)) {
          if (resource.texture) {
            this.resources[key] = resource.texture;
          } else if (resource.error) {
            console.warn(`[Resource] Failed to load ${key}, using fallback.`);
            this.resources[key] = null;
          }
        }
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
