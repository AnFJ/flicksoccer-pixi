
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
    console.log(`[BaseScene] Exiting scene...`);
    
    // 移除所有事件监听
    this.container.removeAllListeners();
    
    // [核心修复] 使用 destroy 彻底销毁容器及其子元素
    // children: true  -> 递归销毁子对象 (Sprite, Graphics 等)
    // texture: false  -> 不销毁纹理 (因为纹理通常由 ResourceManager 管理，或者是复用的)
    // baseTexture: false -> 不销毁基础纹理
    this.container.destroy({
        children: true,
        texture: false,
        baseTexture: false
    });
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
