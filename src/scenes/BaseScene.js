
import * as PIXI from 'pixi.js';

export default class BaseScene {
  constructor() {
    this.container = new PIXI.Container();
    this.app = null; // 由 SceneManager 注入
  }

  /**
   * 场景进入时调用
   * @param {Object} params - 上个场景传来的参数
   */
  onEnter(params = {}) {
    console.log(`[BaseScene] Entering scene... Params:`, params);
  }

  /**
   * 场景退出时调用
   */
  onExit() {
    console.log(`[BaseScene] Exiting scene: ${this.constructor.name}`);
    
    // 移除所有容器级别的事件监听
    if (this.container) {
        this.container.removeAllListeners();
        
        // [核心修复] 使用 destroy 彻底销毁容器及其子元素
        if (!this.container.destroyed) {
            this.container.destroy({
                children: true,
                texture: false,
                baseTexture: false
            });
        }
    }
  }

  /**
   * 警告：请使用 onExit 而不是 onDestroy
   */
  onDestroy() {
      console.warn(`[BaseScene] ${this.constructor.name} called onDestroy, but SceneManager uses onExit!`);
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
