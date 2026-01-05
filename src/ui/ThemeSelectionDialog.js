
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import { Formations } from '../config/FormationConfig.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class ThemeSelectionDialog extends PIXI.Container {
  constructor(onClose) {
    super();
    this.onClose = onClose;
    this.currentTab = 0;
    this.tempTheme = { ...AccountMgr.userInfo.theme };
    
    // 配置
    this.tabs = ['棋子', '球场', '足球', '阵型'];
    this.totalStrikers = 7;
    this.totalFields = 4;
    this.totalBalls = 3;

    this.init();
  }

  init() {
    const { designWidth, designHeight } = GameConfig;
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x000000, 0.85);
    overlay.drawRect(0, 0, designWidth, designHeight);
    overlay.interactive = true;
    this.addChild(overlay);

    const panelW = 1200;
    const panelH = 800;
    const panel = new PIXI.Graphics();
    panel.beginFill(0x2c3e50);
    panel.lineStyle(4, 0xecf0f1);
    panel.drawRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 30);
    panel.position.set(designWidth/2, designHeight/2);
    this.addChild(panel);

    const title = new PIXI.Text('个性化主题', { fontSize: 50, fill: 0xffffff, fontWeight: 'bold' });
    title.anchor.set(0.5);
    title.position.set(0, -panelH/2 + 50);
    panel.addChild(title);

    this.tabContainer = new PIXI.Container();
    this.tabContainer.position.set(0, -panelH/2 + 130);
    panel.addChild(this.tabContainer);
    this.renderTabs();

    this.contentContainer = new PIXI.Container();
    panel.addChild(this.contentContainer);
    this.renderContent();

    const btnY = panelH/2 - 70;
    const saveBtn = new Button({
        text: '保存并应用', width: 260, height: 80, color: 0x2ecc71,
        onClick: () => {
            AccountMgr.updateTheme(this.tempTheme);
            if (this.onClose) this.onClose();
            this.parent.removeChild(this);
        }
    });
    saveBtn.position.set(-280, btnY - 40);
    panel.addChild(saveBtn);

    const cancelBtn = new Button({
        text: '取消', width: 200, height: 80, color: 0x95a5a6,
        onClick: () => {
            if (this.onClose) this.onClose();
            this.parent.removeChild(this);
        }
    });
    cancelBtn.position.set(80, btnY - 40);
    panel.addChild(cancelBtn);
  }

  renderTabs() {
      this.tabContainer.removeChildren();
      const tabW = 240;
      const gap = 20;
      const totalW = this.tabs.length * tabW + (this.tabs.length - 1) * gap;
      const startX = -totalW / 2;

      this.tabs.forEach((label, idx) => {
          const isSelected = this.currentTab === idx;
          const btn = new Button({
              text: label, width: tabW, height: 64, 
              color: isSelected ? 0x3498db : 0x7f8c8d,
              onClick: () => {
                  this.currentTab = idx;
                  this.renderTabs();
                  this.renderContent();
              }
          });
          btn.position.set(startX + idx * (tabW + gap), -32);
          this.tabContainer.addChild(btn);
      });
  }

  renderContent() {
      this.contentContainer.removeChildren();
      
      // 如果是阵型 Tab，单独处理
      if (this.currentTab === 3) {
          this.renderFormationContent();
          return;
      }

      // 棋子、球场、足球的网格布局
      let items = [];
      let typeKey = '';
      if (this.currentTab === 0) { items = Array.from({length:this.totalStrikers}, (_,i)=>i+1); typeKey='striker'; }
      else if (this.currentTab === 1) { items = Array.from({length:this.totalFields}, (_,i)=>i+1); typeKey='field'; }
      else { items = Array.from({length:this.totalBalls}, (_,i)=>i+1); typeKey='ball'; }

      const cols = 4;
      const itemW = 240, itemH = 200;
      const startX = -((cols * itemW + (cols-1)*30) / 2) + itemW/2;
      const startY = -60;

      items.forEach((id, idx) => {
          const col = idx % cols;
          const row = Math.floor(idx / cols);
          const isSelected = this.tempTheme[typeKey] === id;
          
          const container = new PIXI.Container();
          container.position.set(startX + col * (itemW+30), startY + row * (itemH+20));
          
          const bg = new PIXI.Graphics();
          bg.beginFill(0x34495e);
          bg.lineStyle(4, isSelected ? 0xF1C40F : 0x555555);
          bg.drawRoundedRect(-itemW/2, -itemH/2, itemW, itemH, 15);
          container.addChild(bg);

          if (this.currentTab === 0) this.renderStrikerPreview(container, id);
          else if (this.currentTab === 1) this.renderFieldPreview(container, id, itemW-20, itemH-20);
          else this.renderBallPreview(container, id, 60);

          bg.interactive = true;
          bg.on('pointerdown', () => {
              this.tempTheme[typeKey] = id;
              this.renderContent();
          });
          this.contentContainer.addChild(container);
      });
  }

  // 渲染阵型内容 (列表 + 预览)
  renderFormationContent() {
      const listX = -350;
      const startY = -150;
      const gapY = 85;

      Formations.forEach((fmt, idx) => {
          const isSelected = fmt.id === this.tempTheme.formationId;
          const btn = new Button({
              text: `${fmt.name} (${fmt.desc})`,
              width: 350, height: 70,
              color: isSelected ? 0xF1C40F : 0x34495e,
              textColor: isSelected ? 0x000000 : 0xFFFFFF,
              fontSize: 28,
              onClick: () => {
                  this.tempTheme.formationId = fmt.id;
                  this.renderContent();
              }
          });
          btn.position.set(listX, startY + idx * gapY);
          this.contentContainer.addChild(btn);
      });

      // 复用预览逻辑
      this.renderFormationPreview(250, 40, this.tempTheme.formationId);
  }

  renderFormationPreview(x, y, formationId) {
      const w = 350, h = 320, goalPadding = 60;
      const container = new PIXI.Container();
      container.position.set(x, y);

      const bgMask = new PIXI.Graphics().beginFill(0xffffff).drawRect(-w/2, -h/2, w, h).endFill();
      container.addChild(bgMask);

      const fieldTex = ResourceManager.get('half_field');
      if (fieldTex) {
          const bg = new PIXI.Sprite(fieldTex);
          bg.anchor.set(0.5); bg.width = w; bg.height = h;
          bg.mask = bgMask; container.addChild(bg);
      }

      const fmt = Formations.find(f => f.id === formationId) || Formations[0];
      const strikerTex = ResourceManager.get(`striker_red_${this.tempTheme.striker}`);

      fmt.positions.forEach(pos => {
          const range = w/2 - (-w/2 + goalPadding);
          const px = w/2 + (pos.x / 0.5) * range;
          const py = pos.y * h;

          if (strikerTex) {
              const s = new PIXI.Sprite(strikerTex);
              s.width = s.height = 40; s.anchor.set(0.5); s.position.set(px, py);
              container.addChild(s);
          }
      });
      this.contentContainer.addChild(container);
  }

  renderStrikerPreview(container, id) {
      const rTex = ResourceManager.get(`striker_red_${id}`);
      const bTex = ResourceManager.get(`striker_blue_${id}`);
      if (rTex) { const s1 = new PIXI.Sprite(rTex); s1.width = s1.height = 80; s1.anchor.set(0.5); s1.position.set(-20, 10); container.addChild(s1); }
      if (bTex) { const s2 = new PIXI.Sprite(bTex); s2.width = s2.height = 80; s2.anchor.set(0.5); s2.position.set(20, -10); container.addChild(s2); }
  }

  renderFieldPreview(container, id, w, h) {
      const tex = ResourceManager.get(`field_${id}`);
      if (tex) { const sp = new PIXI.Sprite(tex); sp.anchor.set(0.5); sp.scale.set(Math.min(w/tex.width, h/tex.height)); container.addChild(sp); }
  }

  renderBallPreview(container, id, radius) {
      const tex = ResourceManager.get(id===1 ? 'ball_texture' : `ball_texture_${id}`);
      if (tex) {
          const b = new PIXI.TilingSprite(tex, radius*4, radius*4);
          b.anchor.set(0.5); b.tileScale.set(0.25); b.width = b.height = radius*2;
          const m = new PIXI.Graphics().beginFill(0xffffff).drawCircle(0, 0, radius).endFill();
          b.mask = m; container.addChild(m, b);
      }
  }
}
