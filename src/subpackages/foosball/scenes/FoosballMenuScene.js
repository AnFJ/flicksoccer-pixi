
import * as PIXI from 'pixi.js';
import BaseScene from '../../../scenes/BaseScene.js';
import SceneManager from '../../../managers/SceneManager.js';
import MenuScene from '../../../scenes/MenuScene.js';
import FoosballGameScene from './FoosballGameScene.js'; // [修改] 导入游戏场景
import Button from '../../../ui/Button.js';
import BackButton from '../../../ui/BackButton.js';
import { GameConfig } from '../../../config.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import Platform from '../../../managers/Platform.js';

export default class FoosballMenuScene extends BaseScene {
    onEnter() {
        super.onEnter();
        const { designWidth, designHeight } = GameConfig;

        // 1. 背景 (绿色桌台风格)
        const bgTex = ResourceManager.get('fb_bg') || ResourceManager.get('bg_grass');
        if (bgTex) {
            const bg = new PIXI.TilingSprite(bgTex, designWidth, designHeight);
            bg.tileScale.set(0.5);
            bg.tint = 0x27ae60; // 染成深绿色
            this.container.addChild(bg);
        } else {
            const bg = new PIXI.Graphics();
            bg.beginFill(0x27ae60);
            bg.drawRect(0, 0, designWidth, designHeight);
            bg.endFill();
            this.container.addChild(bg);
        }

        // 装饰性线条 (模拟足球场白线)
        const lines = new PIXI.Graphics();
        lines.lineStyle(4, 0xFFFFFF, 0.3);
        lines.drawRect(50, 50, designWidth - 100, designHeight - 100);
        lines.moveTo(designWidth / 2, 50);
        lines.lineTo(designWidth / 2, designHeight - 50);
        lines.drawCircle(designWidth / 2, designHeight / 2, 100);
        this.container.addChild(lines);

        // 2. 标题
        const title = new PIXI.Text('德式桌球争霸', {
            fontFamily: 'Arial Black', fontSize: 80, fill: 0xFFD700,
            stroke: 0x000000, strokeThickness: 6,
            dropShadow: true, dropShadowBlur: 4
        });
        title.anchor.set(0.5);
        title.position.set(designWidth / 2, 200);
        this.container.addChild(title);

        // 3. 按钮组
        const startY = designHeight / 2 + 50;
        
        const startBtn = new Button({
            text: '开始比赛', width: 360, height: 100, color: 0xe67e22,
            fontSize: 40,
            onClick: () => {
                // [修改] 跳转到游戏场景
                SceneManager.changeScene(FoosballGameScene);
            }
        });
        startBtn.position.set(designWidth / 2 - 180, startY);
        this.container.addChild(startBtn);

        // 返回按钮 (使用通用组件)
        const backBtn = new BackButton({
            text: '返回大厅',
            onClick: () => SceneManager.changeScene(MenuScene)
        });
        this.container.addChild(backBtn);
        this.backBtn = backBtn;

        // 4. 简单说明文字
        const helpText = new PIXI.Text('操作说明：\n左手控制后卫，右手控制前锋\n上下滑动移动，点击射门', {
            fontFamily: 'Arial', fontSize: 32, fill: 0xeeeeee, align: 'center'
        });
        helpText.anchor.set(0.5);
        helpText.position.set(designWidth / 2, designHeight - 150);
        this.container.addChild(helpText);
        
        this.alignUI();
    }

    onResize() {
        this.alignUI();
    }

    alignUI() {
        if (this.backBtn) this.backBtn.updateLayout();
    }
}
