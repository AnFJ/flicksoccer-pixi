class EventBus {
  constructor() {
    this.events = {};
  }

  /**
   * 监听事件
   * @param {string} eventName 
   * @param {Function} callback 
   * @param {Object} context 
   */
  on(eventName, callback, context = null) {
    if (!this.events[eventName]) {
      this.events[eventName] = [];
    }
    this.events[eventName].push({ callback, context });
  }

  /**
   * 取消监听
   * @param {string} eventName 
   * @param {Function} callback 
   */
  off(eventName, callback) {
    if (!this.events[eventName]) return;
    this.events[eventName] = this.events[eventName].filter(
      listener => listener.callback !== callback
    );
  }

  /**
   * 触发事件
   * @param {string} eventName 
   * @param  {...any} args 
   */
  emit(eventName, ...args) {
    if (!this.events[eventName]) return;
    this.events[eventName].forEach(listener => {
      const { callback, context } = listener;
      callback.apply(context, args);
    });
  }
}

// 导出单例
export default new EventBus();