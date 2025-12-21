import * as PIXI from 'pixi.js';

export default class BaseScene {
  constructor() {
    this.container = new PIXI.Container();
    this.app = null; // 由 SceneManager 注入
  }

  /**
   * 场景进入时调用
   */
  onEnter() {
    console.log(`[BaseScene] Entering scene...`);
  }

  /**
   * 场景退出时调用
   */
  onExit() {
    console.log(`[BaseScene] Exiting scene...`);
    this.container.removeAllListeners();
    this.container.removeChildren();
  }

  /**
   * 每帧更新
   * @param {number} delta 
   */
  update(delta) {
    // 子类实现
  }

  /**
   * 调整尺寸
   */
  onResize(width, height) {
    // 子类实现
  }
}