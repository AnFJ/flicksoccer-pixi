
import * as PIXI from 'pixi.js';

class ResourceManager {
  constructor() {
    this.resources = {};
    // 定义资源清单
    this.manifest = {
      // 修改：引入新的球场素材
      field_bg: 'assets/images/field_bg.jpg',
      field_border: 'assets/images/field_border.png',
      // 新增：全局背景草地 (注意是 png)
      bg_grass: 'assets/images/grass_texture.png',
      
      ball: 'assets/images/ball.png',
      striker_red: 'assets/images/striker_red.png',
      striker_blue: 'assets/images/striker_blue.png',
      shadow: 'assets/images/shadow.png'
    };
  }

  /**
   * 加载所有必要资源
   */
  async loadAll() {
    const promises = [];
    
    for (const [key, url] of Object.entries(this.manifest)) {
      // 使用 PIXI.Assets 加载
      // 添加一个错误捕获，如果图片不存在，不影响游戏运行
      const p = PIXI.Assets.load(url)
        .then(texture => {
          this.resources[key] = texture;
          console.log(`[Resource] Loaded: ${key}`);
        })
        .catch(err => {
          console.warn(`[Resource] Failed to load ${key} (${url}), using fallback graphics.`);
          this.resources[key] = null;
        });
      promises.push(p);
    }

    await Promise.all(promises);
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
