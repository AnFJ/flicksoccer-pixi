
import { GameConfig } from '../config.js';

class SceneManager {
  constructor() {
    this.app = null;
    this.currentScene = null;
  }

  /**
   * 初始化
   * @param {PIXI.Application} app 
   */
  init(app) {
    this.app = app;
  }

  /**
   * 切换场景
   * @param {BaseScene} SceneClass - 场景类构造函数
   * @param {Object} params - 传递给新场景的参数
   */
  async changeScene(SceneClass, params = {}) {
    if (this.currentScene) {
      this.currentScene.onExit();
      this.app.stage.removeChild(this.currentScene.container);
      this.currentScene = null;
    }

    // 创建新场景
    const scene = new SceneClass();
    scene.app = this.app;
    this.currentScene = scene;

    // 添加到舞台
    this.app.stage.addChild(scene.container);
    
    // --- 核心修复：执行屏幕适配 ---
    // 因为 App 现在是屏幕大小，而场景内容是 2400x1080，所以必须缩放
    this.resizeScene(scene.container);

    // 生命周期，传入参数
    scene.onEnter(params);
  }

  /**
   * 将场景容器缩放并居中以适应屏幕
   */
  resizeScene(container) {
    if (!this.app || !container) return;

    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;
    const designWidth = GameConfig.designWidth;
    const designHeight = GameConfig.designHeight;

    // 计算缩放比例 (Show All / Letterbox 模式：保证内容全部显示)
    const scaleX = screenWidth / designWidth;
    const scaleY = screenHeight / designHeight;
    const scale = Math.min(scaleX, scaleY);

    // 设置缩放
    container.scale.set(scale);

    // 居中显示
    // 实际内容宽 = designWidth * scale
    container.position.x = (screenWidth - designWidth * scale) / 2;
    container.position.y = (screenHeight - designHeight * scale) / 2;

    console.log(`[SceneManager] Resized scene to fit screen. Scale: ${scale.toFixed(3)}`);
  }

  /**
   * 游戏主循环调用
   * @param {number} delta 
   */
  update(delta) {
    if (this.currentScene) {
      this.currentScene.update(delta);
    }
  }
}

export default new SceneManager();
