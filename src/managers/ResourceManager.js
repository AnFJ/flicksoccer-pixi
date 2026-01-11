
import * as PIXI from 'pixi.js';
import Platform from './Platform.js'; // [新增]

class ResourceManager {
  constructor() {
    this.resources = {};
    
    // 1. 登录页优先加载的资源
    this.loginManifest = {
        login_bg: 'assets/images/main_bg.png', 
    };

    // 2. 游戏主体资源
    this.gameManifest = {
      half_field: 'assets/images/half_field.png', // [新增] 半场预览图
      field_border: 'assets/images/field_border.png',
      bg_grass: 'assets/images/grass_texture.png',
      ball: 'assets/images/ball.png', 

      // UI
      main_bg: 'assets/images/main_bg.png',
      btn_menu: 'assets/images/btn_menu.png',
      hud_bg: 'assets/images/hud_bg.png',

      // 菜单功能图标
      icon_social: 'assets/images/icon_social.png',
      icon_bag: 'assets/images/icon_bag.png',
      icon_checkin: 'assets/images/icon_checkin.png',
      icon_theme: 'assets/images/icon_theme.png', // [新增] 主题图标 (如果没有图会回退到文字)

      // 技能按键背景素材
      skill_aim_bg: 'assets/images/skill_aim_bg.png',
      skill_force_bg: 'assets/images/skill_force_bg.png',
      skill_unstoppable_bg: 'assets/images/skill_unstoppable_bg.png',

      // [新增] AI 头像 (占位路径，请确保资源存在)
      ai_hot: 'assets/images/avatars/ai_hot.png',
      ai_troll: 'assets/images/avatars/ai_troll.png',
      ai_robot: 'assets/images/avatars/ai_robot.png',
      ai_noble: 'assets/images/avatars/ai_noble.png',
      ai_cute: 'assets/images/avatars/ai_cute.png'
    };

    // [新增] 动态注册主题资源
    // 1. 球场
    // field_1 保持本地
    this.gameManifest['field_1'] = `assets/images/fieldtheme/field_combined1.png`;
    // field_2 改为远程资源 (标记 remote:)
    this.gameManifest['field_2'] = `remote:field_combined2.png`;

    // 2. 足球纹理 (改为4套: 1默认 + 2奖励)
    // 注意：代码里默认使用了 ball_texture 作为 key，这里我们把 ball_texture1 设为默认的 ball_texture 以兼容旧逻辑
    this.gameManifest['ball_texture'] = `assets/images/footballtheme/ball_texture1.png`;
    for (let i = 1; i <= 4; i++) {
        this.gameManifest[`ball_texture_${i}`] = `assets/images/footballtheme/ball_texture${i}.png`;
    }

    // 3. 棋子 (改为7套: 1默认 + 2奖励)
    // 兼容旧逻辑：striker_red, striker_blue 映射到第1套
    this.gameManifest['striker_red'] = `assets/images/strikerstheme/red_1.png`;
    this.gameManifest['striker_blue'] = `assets/images/strikerstheme/blue_1.png`;
    
    for (let i = 1; i <= 7; i++) {
        this.gameManifest[`striker_red_${i}`] = `assets/images/strikerstheme/red_${i}.png`;
        this.gameManifest[`striker_blue_${i}`] = `assets/images/strikerstheme/blue_${i}.png`;
    }
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
    return new Promise(async (resolve, reject) => {
      const loader = PIXI.Loader.shared;
      
      let count = 0;
      
      // 预处理Manifest：分离本地和远程资源
      const loadQueue = [];

      for (const [key, rawUrl] of Object.entries(manifest)) {
        if (loader.resources[key]) {
            // 已加载，更新引用 (如果是Texture)
            if (loader.resources[key].texture) {
                this.resources[key] = loader.resources[key].texture;
            }
            continue;
        }

        count++;
        
        if (rawUrl.startsWith('remote:')) {
            const fileName = rawUrl.split(':')[1];
            loadQueue.push({ key, type: 'remote', fileName });
        } else {
            loadQueue.push({ key, type: 'local', url: rawUrl });
        }
      }

      if (count === 0) {
          if (onProgress) onProgress(100);
          resolve();
          return;
      }

      // 如果有远程资源，先并行下载/获取本地路径
      const remoteItems = loadQueue.filter(item => item.type === 'remote');
      if (remoteItems.length > 0) {
          // 这里简单处理：并行请求所有远程路径
          await Promise.all(remoteItems.map(async (item) => {
              try {
                  const localPathOrUrl = await Platform.loadRemoteAsset(item.fileName);
                  // 将解析后的路径添加到 loader
                  loader.add(item.key, localPathOrUrl);
              } catch (e) {
                  console.warn(`[Resource] Failed to resolve remote asset: ${item.fileName}`, e);
                  // 失败则不添加，让 loader 后续处理或忽略
              }
          }));
      }

      // 添加本地资源到 loader
      loadQueue.filter(item => item.type === 'local').forEach(item => {
          loader.add(item.key, item.url);
      });

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
