
import * as PIXI from 'pixi.js';
import Platform from './Platform.js'; // [新增]

class ResourceManager {
  constructor() {
    this.resources = {};
    
    // 1. 登录页优先加载的资源
    this.loginManifest = {
        login_bg: 'assets/images/main_bg.png', 
    };

    // 2. 游戏主体资源 (主包资源)
    this.gameManifest = {
      half_field: 'assets/images/half_field.png', // [新增] 半场预览图
      field_border: 'assets/images/field_border.png',
      bg_grass: 'assets/images/grass_texture.png',
      ball: 'assets/images/ball.png', 
      
      // [新增] 通用柔光阴影贴图 (优化 DrawCall 关键)
      shadow: 'assets/images/shadow.png',

      // UI
      main_bg: 'assets/images/main_bg.png',
      btn_menu: 'assets/images/btn/btn_menu.png',
      hud_bg: 'assets/images/hud_bg.png',
      
      // 德式桌球新入口按钮
      foosball_icon_btn: 'assets/images/icon/foosball_btn.png',
      
      // [新增] 实况弹指入口按钮
      live_flick_icon_btn: 'assets/images/icon/liveflick_btn.png',
      
      // [新增] 对话框背景 (外部素材)
      dialog_bg: 'remote:dialog_bg.png',
      
      // [新增] 结果页素材
      result_bg: 'remote:result_bg.png', // 金属边框对话框
      result_content_bg: 'remote:result_content_bg.png', // 红蓝对战条
      bg_result_field: 'remote:pure_field_bg.png', // [保留] 备用通用背景
      bg_result_victory: 'remote:victory_field_bg.png', // [新增] 胜利背景
      bg_result_failed: 'remote:failed_field_bg.png',   // [新增] 失败背景

      // 结果页按钮与图标
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

      // [新增] AI 头像
      ai_hot: 'assets/images/avatars/ai_hot.png',
      ai_troll: 'assets/images/avatars/ai_troll.png',
      ai_robot: 'assets/images/avatars/ai_robot.png',
      ai_noble: 'assets/images/avatars/ai_noble.png',
      ai_cute: 'assets/images/avatars/ai_cute.png'
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
    this.gameManifest['field_2'] = `remote:field_combined2.png`;

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

  loadFoosballResources(onProgress) {
      if (this.get('fb_bg')) {
          if (onProgress) onProgress(100);
          return Promise.resolve();
      }
      return this._loadManifest(this.foosballManifest, onProgress);
  }

  _loadManifest(manifest, onProgress) {
    return new Promise(async (resolve, reject) => {
      const loader = PIXI.Loader.shared;
      let count = 0;
      const loadQueue = [];

      for (const [key, rawUrl] of Object.entries(manifest)) {
        if (loader.resources[key]) {
            if (loader.resources[key].texture) {
                this.resources[key] = loader.resources[key].texture;
            }
            continue;
        }
        count++;
        if (rawUrl.startsWith('http') || rawUrl.startsWith('https')) {
             loadQueue.push({ key, type: 'local', url: rawUrl });
        } else if (rawUrl.startsWith('remote:')) {
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

      const remoteItems = loadQueue.filter(item => item.type === 'remote');
      if (remoteItems.length > 0) {
          await Promise.all(remoteItems.map(async (item) => {
              try {
                  const localPathOrUrl = await Platform.loadRemoteAsset(item.fileName);
                  loader.add(item.key, localPathOrUrl);
              } catch (e) {
                  console.warn(`[Resource] Failed to resolve remote asset: ${item.fileName}`, e);
              }
          }));
      }

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

  get(key) {
    return this.resources[key] || null;
  }
}

export default new ResourceManager();
