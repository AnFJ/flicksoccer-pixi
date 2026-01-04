
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';
import Platform from '../managers/Platform.js';

export default class ThemeSelectionDialog extends PIXI.Container {
  constructor(onClose) {
    super();
    this.onClose = onClose;
    
    // 当前选中的 Tab (0:棋子, 1:球场, 2:足球)
    this.currentTab = 0;
    
    // 临时存储的选择，点击确认后才保存
    this.tempTheme = { ...AccountMgr.userInfo.theme };
    
    // 配置数据
    this.tabs = ['棋子样式', '球场风格', '足球纹理'];
    this.totalStrikers = 7;
    this.totalFields = 4;
    this.totalBalls = 3;

    this.init();
  }

  init() {
    const { designWidth, designHeight } = GameConfig;

    // 1. 全屏遮罩
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x000000, 0.85);
    overlay.drawRect(0, 0, designWidth, designHeight);
    overlay.interactive = true;
    this.addChild(overlay);

    // 2. 主面板
    const panelW = 900;
    const panelH = 750;
    const panel = new PIXI.Graphics();
    panel.beginFill(0x2c3e50);
    panel.lineStyle(4, 0xecf0f1);
    panel.drawRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 30);
    panel.endFill();
    panel.position.set(designWidth/2, designHeight/2);
    this.addChild(panel);

    // 3. 标题
    const title = new PIXI.Text('个性化主题', {
        fontFamily: 'Arial', fontSize: 50, fill: 0xffffff, fontWeight: 'bold'
    });
    title.anchor.set(0.5);
    title.position.set(0, -panelH/2 + 50);
    panel.addChild(title);

    // 4. Tab 按钮栏
    this.tabContainer = new PIXI.Container();
    this.tabContainer.position.set(0, -panelH/2 + 130);
    panel.addChild(this.tabContainer);
    this.renderTabs();

    // 5. 内容区域
    this.contentContainer = new PIXI.Container();
    this.contentContainer.position.set(0, 0); // 相对于 Panel 中心
    panel.addChild(this.contentContainer);
    this.renderContent();

    // 6. 底部按钮 (确认 & 取消)
    const btnY = panelH/2 - 70;
    const btnW = 200;

    const confirmBtn = new Button({
        text: '保存', width: btnW, height: 70, color: 0x2ecc71,
        onClick: () => {
            // 保存数据并同步
            AccountMgr.updateTheme(this.tempTheme);
            Platform.showToast('主题保存成功');
            if (this.onClose) this.onClose();
            if (this.parent) this.parent.removeChild(this);
        }
    });
    confirmBtn.position.set(-120, btnY);
    panel.addChild(confirmBtn);

    const cancelBtn = new Button({
        text: '取消', width: btnW, height: 70, color: 0x95a5a6,
        onClick: () => {
            if (this.onClose) this.onClose();
            if (this.parent) this.parent.removeChild(this);
        }
    });
    cancelBtn.position.set(120, btnY);
    panel.addChild(cancelBtn);
  }

  renderTabs() {
      this.tabContainer.removeChildren();
      const tabW = 250;
      const tabH = 70;
      const gap = 20;
      const startX = -((this.tabs.length * tabW) + (this.tabs.length - 1) * gap) / 2 + tabW/2;

      this.tabs.forEach((label, idx) => {
          const isSelected = this.currentTab === idx;
          const color = isSelected ? 0x3498db : 0x7f8c8d;
          
          const btn = new Button({
              text: label, width: tabW, height: tabH, color: color,
              fontSize: 32,
              onClick: () => {
                  if (this.currentTab !== idx) {
                      this.currentTab = idx;
                      this.renderTabs(); // 刷新高亮
                      this.renderContent(); // 刷新内容
                  }
              }
          });
          btn.position.set(startX + idx * (tabW + gap), 0);
          this.tabContainer.addChild(btn);
      });
  }

  renderContent() {
      this.contentContainer.removeChildren();
      
      let items = [];
      let typeKey = '';

      if (this.currentTab === 0) { // 棋子
          for(let i=1; i<=this.totalStrikers; i++) items.push(i);
          typeKey = 'striker';
      } else if (this.currentTab === 1) { // 球场
          for(let i=1; i<=this.totalFields; i++) items.push(i);
          typeKey = 'field';
      } else { // 足球
          for(let i=1; i<=this.totalBalls; i++) items.push(i);
          typeKey = 'ball';
      }

      // 布局参数
      const cols = 3;
      const itemW = 240;
      const itemH = 200;
      const gapX = 30;
      const gapY = 30;
      
      // 计算网格起始位置
      // 内容区高度大约 400
      const totalRows = Math.ceil(items.length / cols);
      const startX = -((cols * itemW) + (cols - 1) * gapX) / 2 + itemW/2;
      const startY = -80; // 稍微偏上

      items.forEach((id, idx) => {
          const row = Math.floor(idx / cols);
          const col = idx % cols;
          
          const x = startX + col * (itemW + gapX);
          const y = startY + row * (itemH + gapY);

          const isSelected = this.tempTheme[typeKey] === id;

          const itemContainer = new PIXI.Container();
          itemContainer.position.set(x, y);

          // 背景框
          const bg = new PIXI.Graphics();
          bg.beginFill(0x34495e);
          bg.lineStyle(4, isSelected ? 0xF1C40F : 0x555555); // 选中则金边
          bg.drawRoundedRect(-itemW/2, -itemH/2, itemW, itemH, 15);
          bg.endFill();
          itemContainer.addChild(bg);

          // 预览内容
          if (this.currentTab === 0) {
              this.renderStrikerPreview(itemContainer, id);
          } else if (this.currentTab === 1) {
              this.renderFieldPreview(itemContainer, id, itemW - 20, itemH - 20);
          } else {
              this.renderBallPreview(itemContainer, id, 60);
          }

          // 选中标记
          if (isSelected) {
              const check = new PIXI.Text('✔', { fontSize: 40, fill: 0xF1C40F, fontWeight: 'bold' });
              check.position.set(itemW/2 - 30, -itemH/2 + 30);
              check.anchor.set(0.5);
              itemContainer.addChild(check);
          }

          // 交互
          bg.interactive = true;
          bg.buttonMode = true;
          bg.on('pointertap', () => {
              this.tempTheme[typeKey] = id;
              this.renderContent(); // 刷新选中状态
          });

          this.contentContainer.addChild(itemContainer);
      });
  }

  renderStrikerPreview(container, id) {
      // 显示一对棋子 (红在下，蓝在上稍微错开)
      const rTex = ResourceManager.get(`striker_red_${id}`);
      const bTex = ResourceManager.get(`striker_blue_${id}`);
      
      const size = 80;

      if (rTex) {
          const s1 = new PIXI.Sprite(rTex);
          s1.width = size; s1.height = size;
          s1.anchor.set(0.5);
          s1.position.set(-20, 10);
          container.addChild(s1);
      }

      if (bTex) {
          const s2 = new PIXI.Sprite(bTex);
          s2.width = size; s2.height = size;
          s2.anchor.set(0.5);
          s2.position.set(20, -10);
          container.addChild(s2);
      }
  }

  renderFieldPreview(container, id, w, h) {
      const tex = ResourceManager.get(`field_${id}`);
      if (tex) {
          const sp = new PIXI.Sprite(tex);
          sp.anchor.set(0.5);
          // 保持比例缩放适应框
          const scale = Math.min(w / tex.width, h / tex.height);
          sp.scale.set(scale);
          
          // 圆角遮罩
          const mask = new PIXI.Graphics();
          mask.beginFill(0xffffff);
          mask.drawRoundedRect(-w/2, -h/2, w, h, 10);
          mask.endFill();
          sp.mask = mask;
          container.addChild(mask);
          container.addChild(sp);
      }
  }

  renderBallPreview(container, id, radius) {
      // 模拟 Ball.js 的渲染 (TilingSprite + Mask)
      const texKey = id === 1 ? 'ball_texture' : `ball_texture_${id}`;
      const tex = ResourceManager.get(texKey);
      
      if (tex) {
          const ballContainer = new PIXI.Container();
          
          const mask = new PIXI.Graphics();
          mask.beginFill(0xffffff);
          mask.drawCircle(0, 0, radius);
          mask.endFill();
          ballContainer.addChild(mask);
          ballContainer.mask = mask;

          const ballSprite = new PIXI.TilingSprite(tex, radius*4, radius*4);
          ballSprite.anchor.set(0.5);
          ballSprite.tileScale.set(0.25); // 预览图缩小纹理
          ballSprite.width = radius*2;
          ballSprite.height = radius*2;
          ballContainer.addChild(ballSprite);

          // 简单的阴影效果
          const shadow = new PIXI.Graphics();
          shadow.beginFill(0x000000, 0.3);
          shadow.drawEllipse(0, radius + 10, radius, radius/3);
          shadow.endFill();
          
          container.addChild(shadow);
          container.addChild(ballContainer);
      }
  }
}
