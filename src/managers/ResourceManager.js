
import * as PIXI from 'pixi.js';
import Platform from './Platform.js'; // [新增]

class ResourceManager {
  constructor() {
    this.resources = {};
    
    // 1. 登录页优先加载的资源
    this.loginManifest = {
        login_bg: 'assets/images/main_bg.png', 
    };

    // 2. 游戏主体资源 (仅限主包内资源)
    this.gameManifest = {
      half_field: 'assets/images/half_field.png',
      field_border: 'assets/images/field_border.png',
      bg_grass: 'assets/images/grass_texture.png',
      ball: 'assets/images/ball.png', 
      shadow: 'assets/images/shadow.png',

      // UI
      main_bg: 'assets/images/main_bg.png',
      btn_menu: 'assets/images/btn/btn_menu.png',
      hud_bg: 'assets/images/hud_bg.png',
      foosball_icon_btn: 'assets/images/icon/foosball_btn.png',
      live_flick_icon_btn: 'assets/images/icon/liveflick_btn.png',
      btn_boutique_games: 'assets/images/icon/btn_boutique_games.png',
      
      // 菜单与HUD
      btn_result_end: 'assets/images/btn/result_end_btn.png',
      btn_result_continue: 'assets/images/btn/result_continue_btn.png',
      icon_star_full: 'assets/images/icon/full_star.png',
      icon_star_half: 'assets/images/icon/half_star.png',
      tutorial_hand: 'assets/images/btn/tutorial_hand.png',

      // 菜单功能图标
      icon_social: 'assets/images/icon/icon_social.png',
      icon_bag: 'assets/images/icon/icon_bag.png',
      icon_checkin: 'assets/images/icon/icon_checkin.png',
      icon_theme: 'assets/images/icon/icon_theme.png', 

      // 技能按键背景素材
      skill_aim_bg: 'assets/images/icon/skill_aim_bg.png',
      skill_force_bg: 'assets/images/icon/skill_force_bg.png',
      skill_unstoppable_bg: 'assets/images/icon/skill_unstoppable_bg.png',

      // AI 头像
      ai_hot: 'assets/images/avatars/ai_hot.png',
      ai_troll: 'assets/images/avatars/ai_troll.png',
      ai_robot: 'assets/images/avatars/ai_robot.png',
      ai_noble: 'assets/images/avatars/ai_noble.png',
      ai_cute: 'assets/images/avatars/ai_cute.png'
    };

    // 3. [新增] 延迟加载的分包资源 (不纳入初次加载进度条)
    this.subManifest = {
      dialog_bg: 'subpackages/static_assets/assets/dialog_bg.png',
      result_bg: 'subpackages/static_assets/assets/result_bg.png',
      result_content_bg: 'subpackages/static_assets/assets/result_content_bg.png',
      bg_result_field: 'subpackages/static_assets/assets/pure_field_bg.png',
      bg_result_victory: 'subpackages/static_assets/assets/victory_field_bg.png',
      bg_result_failed: 'subpackages/static_assets/assets/failed_field_bg.png',
      field_2: 'subpackages/static_assets/assets/field_combined2.png',
      share_friend_btn: 'subpackages/static_assets/assets/share_friend_btn.png'
    };

    // [新增] 桌上足球分包资源清单
    this.foosballManifest = {
      fb_menu_bg: 'subpackages/foosball/assets/images/menu_bg.png', // [新增] 分包菜单背景
      fb_bg: 'subpackages/foosball/assets/images/fb_bg.png',
      fb_rod_metal: 'subpackages/foosball/assets/images/fb_rod_metal.png',
      fb_puppet_red: 'subpackages/foosball/assets/images/fb_puppet_red.png',
      fb_puppet_blue: 'subpackages/foosball/assets/images/fb_puppet_blue.png',
      fb_bumper: 'subpackages/foosball/assets/images/fb_bumper.png',
      fb_table_frame: 'subpackages/foosball/assets/images/fb_table_frame.png'
    };

    // 动态注册主题资源
    this.gameManifest['field_1'] = `assets/images/fieldtheme/field_combined1.png`;
    
    // 分包资源放入 subManifest
    this.subManifest['field_2'] = `subpackages/static_assets/assets/field_combined2.png`;

    this.gameManifest['ball_texture'] = `assets/images/footballtheme/ball_texture1.png`;
    for (let i = 1; i <= 4; i++) {
        this.gameManifest[`ball_texture_${i}`] = `assets/images/footballtheme/ball_texture${i}.png`;
    }

    this.gameManifest['striker_red'] = `assets/images/strikerstheme/red_1.png`;
    this.gameManifest['striker_blue'] = `assets/images/strikerstheme/blue_1.png`;
    
    for (let i = 1; i <= 7; i++) {
        this.gameManifest[`striker_red_${i}`] = `assets/images/strikerstheme/red_${i}.png`;
        this.gameManifest[`striker_blue_${i}`] = `assets/images/strikerstheme/blue_${i}.png`;
    }
  }

  loadLoginResources() {
      return this._loadManifest(this.loginManifest);
  }

  loadGameResources(onProgress) {
      return this._loadManifest(this.gameManifest, onProgress);
  }

  /**
   * [新增] 静默加载所有分包资源，不阻塞主流程
   */
  async loadBackgroundSubResources() {
      console.log('[Resource] Background loading sub-resources start...');
      // 此处不传 onProgress，避免影响界面进度条
      await this._loadManifest(this.subManifest);
      console.log('[Resource] Background loading sub-resources complete.');
  }

  loadFoosballResources(onProgress) {
      if (this.get('fb_bg')) {
          if (onProgress) onProgress(100);
          return Promise.resolve();
      }
      return this._loadManifest(this.foosballManifest, onProgress);
  }

  _loadManifest(manifest, onProgress) {
    return new Promise(async (resolve, reject) => {
      const loader = new PIXI.Loader(); // [核心修复] 使用独立 Loader 实例，防止与主包加载冲突
      let count = 0;
      const loadQueue = [];

      for (const [key, rawUrl] of Object.entries(manifest)) {
        // 先检查 ResourceManager 缓存
        if (this.resources[key]) {
            continue;
        }
        
        // 再检查全局纹理缓存 (PIXI 内部缓存)
        if (PIXI.utils.TextureCache[key] || PIXI.utils.BaseTextureCache[key]) {
            this.resources[key] = PIXI.utils.TextureCache[key];
            continue;
        }

        count++;
        loadQueue.push({ key, url: rawUrl });
      }

      if (count === 0) {
          if (onProgress) onProgress(100);
          resolve();
          return;
      }

      loadQueue.forEach(item => {
          loader.add(item.key, item.url);
      });

      let loadedCount = 0;
      loader.onProgress.add(() => {
          loadedCount++;
          if (onProgress) {
              onProgress((loadedCount / count) * 100);
          }
      });

      loader.load((loader, resources) => {
        for (const [key, resource] of Object.entries(resources)) {
          if (resource.texture) {
            this.resources[key] = resource.texture;
          } else if (resource.error) {
            console.warn(`[Resource] Failed to load ${key}:`, resource.error);
          }
        }
        resolve();
      });

      loader.onError.add((err) => {
        console.error('[Resource] Loader Error:', err);
      });
    });
  }

  get(key) {
    return this.resources[key] || null;
  }
}

export default new ResourceManager();
