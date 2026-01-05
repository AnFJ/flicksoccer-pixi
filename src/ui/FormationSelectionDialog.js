
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
    this.p2FormationId = 0; // 默认 P2 也是楔形阵
    this.currentEditSide = 0; // 0: P1, 1: P2

    this.init();
  }

  init() {
    const { designWidth, designHeight } = GameConfig;
    
    // 1. 全屏遮罩
    const overlay = new PIXI.Graphics().beginFill(0x000000, 0.85).drawRect(0, 0, designWidth, designHeight);
    overlay.interactive = true;
    this.addChild(overlay);

    // 2. 主面板
    const panelW = 1200, panelH = 800;
    const panel = new PIXI.Graphics().beginFill(0x2c3e50).lineStyle(4, 0xecf0f1).drawRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 30);
    panel.position.set(designWidth/2, designHeight/2);
    this.addChild(panel);

    // 3. 标题
    const title = new PIXI.Text('选择出战阵型', { 
        fontFamily: 'Arial', fontSize: 50, fill: 0xffffff, fontWeight: 'bold' 
    });
    title.anchor.set(0.5); 
    title.position.set(0, -panelH/2 + 50);
    panel.addChild(title);

    // 内容容器
    this.contentContainer = new PIXI.Container();
    panel.addChild(this.contentContainer);

    // [修复] 只有 dual 模式显示 Tab，且必须添加到 panel 上
    if (this.mode === 'dual') {
        this.createTabs(panel, panelH);
    }
    
    this.renderSelectionArea();

    // 底部按钮
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

  /**
   * [修复] 修改 createTabs 逻辑，确保它在面板内居中显示
   */
  createTabs(panel, panelH) {
      this.tabContainer = new PIXI.Container();
      // 位置在标题下方
      this.tabContainer.position.set(0, -panelH/2 + 150);
      panel.addChild(this.tabContainer);

      const tabW = 320, gap = 40, labels = ['红方 (P1)', '蓝方 (P2)'];
      const totalW = labels.length * tabW + (labels.length - 1) * gap;
      const startX = -totalW / 2;

      this.tabs = labels.map((label, idx) => {
          const isSelected = idx === this.currentEditSide;
          const btn = new Button({
              text: label, width: tabW, height: 74, 
              color: isSelected ? 0xe74c3c : 0x7f8c8d, // 选中的如果是红方显示红色，蓝方逻辑在 onClick 里改
              onClick: () => {
                  this.currentEditSide = idx;
                  // 更新所有 Tab 按钮颜色
                  this.tabs.forEach((b, i) => {
                      const color = (i === this.currentEditSide) ? (i === 0 ? 0xe74c3c : 0x3498db) : 0x7f8c8d;
                      b.drawBg(color);
                  });
                  this.renderSelectionArea();
              }
          });
          // 特殊处理初始颜色
          if (idx === 1 && !isSelected) btn.drawBg(0x7f8c8d);
          else if (idx === 1 && isSelected) btn.drawBg(0x3498db);

          btn.position.set(startX + idx * (tabW + gap), -37);
          this.tabContainer.addChild(btn);
          return btn;
      });
  }

  renderSelectionArea() {
    this.contentContainer.removeChildren();
    
    // 根据当前编辑的是哪一方，决定选中的阵型ID
    const currentId = this.currentEditSide === 0 ? this.p1FormationId : this.p2FormationId;
    const startY = -160, gapY = 90;

    Formations.forEach((fmt, idx) => {
        const isSelected = fmt.id === currentId;
        const btn = new Button({
            text: `${fmt.name} (${fmt.desc})`,
            width: 350, height: 75,
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

    // 右侧预览区
    this.renderPreview(250, 20, currentId);
  }

  renderPreview(x, y, formationId) {
      const w = 400, h = 360, goalPadding = 60;
      const container = new PIXI.Container();
      container.position.set(x, y);

      const bgMask = new PIXI.Graphics().beginFill(0xffffff).drawRect(-w/2, -h/2, w, h).endFill();
      container.addChild(bgMask);

      const fieldTex = ResourceManager.get('half_field');
      if (fieldTex) {
          const bg = new PIXI.Sprite(fieldTex);
          bg.anchor.set(0.5); bg.width = w; bg.height = h;
          // 如果是编辑蓝方(右方)，预览图水平翻转，模拟右半场
          if (this.currentEditSide === 1) bg.scale.x *= -1;
          bg.mask = bgMask; container.addChild(bg);
      }

      const fmt = Formations.find(f => f.id === formationId) || Formations[0];
      const isRed = this.currentEditSide === 0;
      // 使用当前玩家配置的主题棋子皮肤
      const theme = AccountMgr.userInfo.theme;
      const strikerTex = ResourceManager.get(`striker_${isRed?'red':'blue'}_${theme.striker}`);

      fmt.positions.forEach(pos => {
          const range = w/2 - (-w/2 + goalPadding);
          let px, py = pos.y * h;
          
          if (isRed) {
              // P1 阵型配置 x 为负数 (-0.5 ~ 0)，转换到本地预览坐标
              px = w/2 + (pos.x / 0.5) * range;
          } else {
              // P2 镜像
              px = -w/2 - (pos.x / 0.5) * range;
          }

          if (strikerTex) {
              const s = new PIXI.Sprite(strikerTex);
              s.width = s.height = 45; s.anchor.set(0.5); s.position.set(px, py);
              container.addChild(s);
          }
      });
      this.contentContainer.addChild(container);
  }
}
