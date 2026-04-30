
import * as PIXI from 'pixi.js';
import NetworkMgr from './NetworkMgr.js';

/**
 * 广告牌配置管理器 (支持运营配置化)
 */
class AdManager {
    constructor() {
        this.adConfigs = null; // 格式: { 'trigger': { leftImageUrl, rightImageUrl, appId, path } }
        this.isFetching = false;
    }

    /**
     * 从服务器获取广告配置
     */
    async fetchConfig() {
        if (this.isFetching) return;
        this.isFetching = true;
        
        try {
            console.log('[AdManager] Fetching ad config...');
            const response = await NetworkMgr.get('/api/game/ad-config');
            
            if (response && response.adConfig) {
                this.init(response.adConfig);
            }
        } catch (e) {
            console.error('[AdManager] Fetch config failed:', e);
        } finally {
            this.isFetching = false;
        }
    }

    /**
     * 初始化广告配置
     * @param {Object} adConfig 后端返回的筛选后的配置列表
     */
    init(adConfig) {
        console.log('[AdManager] Initialized with config:', adConfig);
        this.adConfigs = adConfig;
        this.preloadImages();
    }

    /**
     * [新增] 预加载所有配置中的图片到 PIXI 缓存
     */
    async preloadImages() {
        if (!this.adConfigs) return;
        
        const urls = new Set();
        Object.values(this.adConfigs).forEach(config => {
            if (config.leftImageUrl) urls.add(config.leftImageUrl);
            if (config.rightImageUrl) urls.add(config.rightImageUrl);
        });

        if (urls.size === 0) return;
        console.log(`[AdManager] Preloading ${urls.size} ad images...`);
        
        // 使用 PIXI 内部纹理缓存进行预加载
        const promises = Array.from(urls).map(url => {
            return PIXI.Texture.fromURL(url).catch(e => {
                console.warn(`[AdManager] Preload failed: ${url}`, e);
            });
        });

        await Promise.all(promises);
        console.log('[AdManager] All ad images preloaded.');
    }

    /**
     * 根据触发时机和位置获取广告配置
     * @param {string} trigger 触发类型: default, screaming, goal_us, goal_them, round1, round2, round3
     * @param {string} position 位置: left, right
     */
    getAd(trigger, position) {
        if (!this.adConfigs) return null;

        // 1. 尝试获取该 trigger 的配置
        let config = this.adConfigs[trigger];

        // 2. 如果没有该 trigger 的配置，回到兜底 (default)
        if (!config && trigger !== 'default') {
            config = this.adConfigs['default'];
        }

        if (!config) return null;

        // 3. 根据位置获取图片链接
        const imageUrl = position === 'left' ? config.leftImageUrl : config.rightImageUrl;

        if (!imageUrl) return null;

        return {
            imageUrl,
            appId: config.appId,
            path: config.path
        };
    }

    /**
     * 辅助函数：是否拥有任何动态配置项
     */
    hasAnyConfig() {
        return this.adConfigs && Object.keys(this.adConfigs).length > 0;
    }
}

export default new AdManager();
