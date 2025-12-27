
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
    
    // 监听 Web 端 Resize 事件
    if (typeof window !== 'undefined') {
        window.addEventListener('resize', () => {
            // 延迟一帧确保 Pixi renderer 已经更新尺寸
            requestAnimationFrame(() => this.resize());
        });
    }
  }

  /**
   * 响应屏幕尺寸变化
   */
  resize() {
      if (!this.app || !this.currentScene || !this.currentScene.container) return;

      // 1. 重新计算场景容器的缩放和位置
      this.resizeScene(this.currentScene.container);

      // 2. 通知当前场景进行内部布局更新 (例如 UI 贴边)
      if (this.currentScene.onResize) {
          this.currentScene.onResize(this.app.screen.width, this.app.screen.height);
      }
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
    
    // 执行屏幕适配
    this.resizeScene(scene.container);

    // 生命周期，传入参数
    scene.onEnter(params);
  }

  /**
   * 将场景容器进行智能适配
   * 策略：
   * 1. 宽屏 (> 16:10): 锁定高度，不缩放，只裁剪左右视野。
   * 2. 窄屏 (<= 16:10): 锁定 16:10 的安全宽度，整体缩放以适应屏幕宽度。
   */
  resizeScene(container) {
    if (!this.app || !container) return;

    const screenWidth = this.app.screen.width;
    const screenHeight = this.app.screen.height;
    const designWidth = GameConfig.designWidth;
    const designHeight = GameConfig.designHeight;

    // 设定临界比例 16:10 = 1.6
    const thresholdRatio = 16 / 10;
    // 计算当前屏幕长宽比
    const screenRatio = screenWidth / screenHeight;

    let scale;

    if (screenRatio >= thresholdRatio) {
        // --- 宽屏模式 (比如 16:9, 19.5:9, 21:9) ---
        // 此时屏幕够宽，我们优先填满高度。
        // 画面不会整体缩小，只是左右两侧的可视区域会根据屏幕宽度变化。
        scale = screenHeight / designHeight;
    } else {
        // --- 窄屏模式 (比如 4:3, 3:2, 16:10) ---
        // 此时屏幕较窄，如果继续保持高度适配，左右两侧的核心内容会被切掉。
        // 所以我们基于 "16:10 的安全宽度" 进行宽度适配。
        // 这样画面会整体缩小，上下可能会出现黑边，但保证了左右不被切太多。
        const safeWidth = designHeight * thresholdRatio; // 1080 * 1.6 = 1728
        scale = screenWidth / safeWidth;
    }

    // 设置缩放
    container.scale.set(scale);

    // 始终居中显示
    // 实际内容宽 = designWidth * scale
    container.position.x = (screenWidth - designWidth * scale) / 2;
    container.position.y = (screenHeight - designHeight * scale) / 2;

    // console.log(`[SceneManager] Resize: ${screenWidth}x${screenHeight} (Ratio: ${screenRatio.toFixed(2)}), Scale: ${scale.toFixed(3)}`);
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
