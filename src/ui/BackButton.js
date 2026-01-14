
import * as PIXI from 'pixi.js';
import Button from './Button.js';

/**
 * 通用的左上角返回/离开按钮
 * 特性：自动适配屏幕左上角，支持自定义边距
 */
export default class BackButton extends Button {
    constructor(options = {}) {
        // 默认配置
        const defaults = {
            text: '返回',
            width: 160,
            height: 60,
            color: 0x95a5a6, // 默认灰色
            margin: 40       // 默认屏幕边距
        };
        
        const finalOptions = { ...defaults, ...options };
        super(finalOptions);
        
        this.margin = finalOptions.margin;
    }

    /**
     * 更新布局位置到左上角
     * 需在场景 onResize 或 alignUI 中调用
     */
    updateLayout() {
        if (!this.parent) return;
        
        // 1. 获取屏幕左上角带边距的全局坐标
        const globalPos = new PIXI.Point(this.margin, this.margin/2);
        
        // 2. 转换为父容器内的局部坐标
        const localPos = this.parent.toLocal(globalPos);
        
        // 3. 设置位置 (Button 的锚点逻辑是左上角)
        this.position.set(localPos.x, localPos.y);
    }
}
