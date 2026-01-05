
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import { Formations } from '../config/FormationConfig.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class FormationSelectionDialog extends PIXI.Container {
  /**
   * @param {string} mode 'single' | 'dual' | 'single_online'
   */
  constructor(mode, onConfirm, onCancel) {
    super();
    this.mode = mode;
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    // 状态
    this.p1FormationId = AccountMgr.userInfo.theme.formationId || 0;
    this.p2FormationId = 0;
    this.currentEditSide = 0; 

    this.init();
  }

  init() {
    const { designWidth, designHeight } = GameConfig;
    const overlay = new PIXI.Graphics().beginFill(0x000000, 0.85).drawRect(0, 0, designWidth, designHeight);
    overlay.interactive = true;
    this.addChild(overlay);

    const panelW = 1200, panelH = 800;
    const panel = new PIXI.Graphics().beginFill(0x2c3e50).lineStyle(4, 0xecf0f1).drawRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 30);
    panel.position.set(designWidth/2, designHeight/2);
    this.addChild(panel);

    const title = new PIXI.Text('选择出战阵型', { fontSize: 50, fill: 0xffffff, fontWeight: 'bold' });
    title.anchor.set(0.5); title.position.set(0, -panelH/2 + 50);
    panel.addChild(title);

    this.contentContainer = new PIXI.Container();
    panel.addChild(this.contentContainer);

    if (this.mode === 'dual') this.createTabs(panelH);
    this.renderSelectionArea();

    const btnY = panelH/2 - 70;
    const confirmBtn = new Button({
        text: this.mode === 'single_online' ? '确定' : '开始比赛', 
        width: 240, height: 80, color: 0x2ecc71,
        onClick: () => {
            if (this.mode === 'single') AccountMgr.updateFormation(this.p1FormationId);
            if (this.onConfirm) this.onConfirm(this.p1FormationId, this.p2FormationId);
            if (this.parent) this.parent.removeChild(this);
        }
    });
    confirmBtn.position.set(-240, btnY - 40);
    panel.addChild(confirmBtn);
    
    const cancelBtn = new Button({
        text: '取消', width: 200, height: 80, color: 0x95a5a6,
        onClick: () => {
            if (this.onCancel) this.onCancel();
            if (this.parent) this.parent.removeChild(this);
        }
    });
    cancelBtn.position.set(40, btnY - 40);
    panel.addChild(cancelBtn);
  }

  createTabs(panelH) {
      this.tabContainer = new PIXI.Container();
      this.tabContainer.position.set(0, -panelH/2 + 120);
      this.addChild(this.tabContainer);
      const tabW = 300, labels = ['红方 (P1)', '蓝方 (P2)'];
      const startX = -( (labels.length * tabW + 20) / 2 );

      this.tabs = labels.map((label, idx) => {
          const btn = new Button({
              text: label, width: tabW, height: 60, 
              color: idx === this.currentEditSide ? 0x3498db : 0x7f8c8d,
              onClick: () => {
                  this.currentEditSide = idx;
                  this.tabs.forEach((b, i) => b.drawBg(i === idx ? 0x3498db : 0x7f8c8d));
                  this.renderSelectionArea();
              }
          });
          btn.position.set(startX + idx * (tabW + 20), -30);
          this.tabContainer.addChild(btn);
          return btn;
      });
  }

  renderSelectionArea() {
    this.contentContainer.removeChildren();
    const currentId = this.currentEditSide === 0 ? this.p1FormationId : this.p2FormationId;
    const startY = -180, gapY = 90;

    Formations.forEach((fmt, idx) => {
        const isSelected = fmt.id === currentId;
        const btn = new Button({
            text: `${fmt.name} (${fmt.desc})`,
            width: 350, height: 70,
            color: isSelected ? 0xF1C40F : 0x34495e,
            textColor: isSelected ? 0x000000 : 0xFFFFFF,
            fontSize: 28,
            onClick: () => {
                if (this.currentEditSide === 0) this.p1FormationId = fmt.id;
                else this.p2FormationId = fmt.id;
                this.renderSelectionArea();
            }
        });
        btn.position.set(-350, startY + idx * gapY);
        this.contentContainer.addChild(btn);
    });

    this.renderPreview(250, 0, currentId);
  }

  renderPreview(x, y, formationId) {
      const w = 350, h = 320, goalPadding = 60;
      const container = new PIXI.Container();
      container.position.set(x, y);

      const bgMask = new PIXI.Graphics().beginFill(0xffffff).drawRect(-w/2, -h/2, w, h).endFill();
      container.addChild(bgMask);

      const fieldTex = ResourceManager.get('half_field');
      if (fieldTex) {
          const bg = new PIXI.Sprite(fieldTex);
          bg.anchor.set(0.5); bg.width = w; bg.height = h;
          if (this.currentEditSide === 1) bg.scale.x *= -1;
          bg.mask = bgMask; container.addChild(bg);
      }

      const fmt = Formations.find(f => f.id === formationId) || Formations[0];
      const isRed = this.currentEditSide === 0;
      const theme = AccountMgr.userInfo.theme;
      const strikerTex = ResourceManager.get(`striker_${isRed?'red':'blue'}_${theme.striker}`);

      fmt.positions.forEach(pos => {
          const range = w/2 - (-w/2 + goalPadding);
          let px, py = pos.y * h;
          if (isRed) px = w/2 + (pos.x / 0.5) * range;
          else px = -w/2 - (pos.x / 0.5) * range;

          if (strikerTex) {
              const s = new PIXI.Sprite(strikerTex);
              s.width = s.height = 40; s.anchor.set(0.5); s.position.set(px, py);
              container.addChild(s);
          }
      });
      this.contentContainer.addChild(container);
  }
}
