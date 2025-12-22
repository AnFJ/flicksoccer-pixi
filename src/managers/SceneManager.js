
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
    
    // 生命周期，传入参数
    scene.onEnter(params);
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
