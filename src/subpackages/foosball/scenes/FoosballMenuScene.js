
import * as PIXI from 'pixi.js';
import BaseScene from '../../../scenes/BaseScene.js';
import SceneManager from '../../../managers/SceneManager.js';
import MenuScene from '../../../scenes/MenuScene.js';
import FoosballGameScene from './FoosballGameScene.js'; 
import Button from '../../../ui/Button.js';
import BackButton from '../../../ui/BackButton.js';
import { GameConfig } from '../../../config.js';
import ResourceManager from '../../../managers/ResourceManager.js';
import Platform from '../../../managers/Platform.js';

export default class FoosballMenuScene extends BaseScene {
    onEnter() {
        super.onEnter();
        const { designWidth, designHeight } = GameConfig;

        // 1. 背景 (仅使用专属背景图 fb_menu_bg，移除兜底逻辑)
        const bgTex = ResourceManager.get('fb_menu_bg');
        if (bgTex) {
            const bg = new PIXI.Sprite(bgTex);
            bg.anchor.set(0.5);
            bg.position.set(designWidth / 2, designHeight / 2);
            
            // 适配策略：高度撑满屏幕，宽度等比缩放
            bg.height = designHeight;
            bg.scale.x = bg.scale.y; 
            
            this.container.addChild(bg);
        }

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
                SceneManager.changeScene(FoosballGameScene);
            }
        });
        startBtn.position.set(designWidth / 2 - 180, startY);
        this.container.addChild(startBtn);

        // 返回按钮
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
