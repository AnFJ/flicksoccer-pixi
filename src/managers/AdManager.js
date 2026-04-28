
/**
 * 广告牌配置管理器 (支持运营配置化)
 */
class AdManager {
    constructor() {
        this.adConfigs = null; // 格式: { 'trigger_position': { imageUrl, position, trigger, appId, path } }
    }

    /**
     * 初始化广告配置
     * @param {Object} adConfig 后端返回的筛选后的配置列表
     */
    init(adConfig) {
        console.log('[AdManager] Initialized with config:', adConfig);
        this.adConfigs = adConfig;
    }

    /**
     * 根据触发时机和位置获取广告配置
     * @param {string} trigger 触发类型: default, screaming, goal_us, goal_them, round1, round2, round3
     * @param {string} position 位置: left, right
     */
    getAd(trigger, position) {
        if (!this.adConfigs) return null;

        // 1. 尝试获取精准匹配的广告
        const key = `${trigger}_${position}`;
        if (this.adConfigs[key]) {
            return this.adConfigs[key];
        }

        // 2. 如果没有精准匹配，则回到兜底(default)配置
        const defaultKey = `default_${position}`;
        if (this.adConfigs[defaultKey]) {
            return this.adConfigs[defaultKey];
        }

        return null;
    }

    /**
     * 辅助函数：是否拥有任何动态配置项
     */
    hasAnyConfig() {
        return this.adConfigs && Object.keys(this.adConfigs).length > 0;
    }
}

export default new AdManager();
