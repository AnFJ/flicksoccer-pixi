
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import { Formations } from '../config/FormationConfig.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';

export default class FormationSelectionDialog extends PIXI.Container {
  /**
   * @param {string} mode 'single' | 'dual' | 'single_online'
   * @param {Function} onConfirm (p1FormationId, p2FormationId) => void
   * @param {Function} onCancel
   */
  constructor(mode, onConfirm, onCancel) {
    super();
    this.mode = mode; // 'single' (PVE) or 'dual' (Local PVP) or 'single_online'
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    // 状态
    this.p1FormationId = AccountMgr.userInfo.formationId || 0;
    this.p2FormationId = 0; // 本地P2默认
    this.currentEditSide = 0; // 0: Player 1 (Red), 1: Player 2 (Blue)

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
    const panelW = 1200;
    const panelH = 800;
    const panel = new PIXI.Graphics();
    panel.beginFill(0x2c3e50);
    panel.lineStyle(4, 0xecf0f1);
    panel.drawRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 30);
    panel.endFill();
    panel.position.set(designWidth/2, designHeight/2);
    this.addChild(panel);

    // 3. 标题
    const title = new PIXI.Text('选择出战阵型', {
        fontFamily: 'Arial', fontSize: 50, fill: 0xffffff, fontWeight: 'bold'
    });
    title.anchor.set(0.5);
    title.position.set(0, -panelH/2 + 50);
    panel.addChild(title);

    // 4. 内容容器
    this.contentContainer = new PIXI.Container();
    panel.addChild(this.contentContainer);

    // 5. 顶部 Tab (仅 Dual 模式显示)
    if (this.mode === 'dual') {
        this.createTabs(panelH);
    }

    // 6. 渲染选择区域
    this.renderSelectionArea();

    // 7. 底部按钮布局优化
    const btnY = panelH/2 - 70;
    const confirmW = 240;
    const cancelW = 200;
    const btnGap = 40;
    const totalBtnW = confirmW + cancelW + btnGap;
    const btnStartX = -totalBtnW / 2;

    const confirmBtn = new Button({
        text: this.mode === 'single_online' ? '确定' : '开始比赛', 
        width: confirmW, height: 80, color: 0x2ecc71,
        onClick: () => {
            if (this.mode === 'single') {
                AccountMgr.updateFormation(this.p1FormationId);
            }
            if (this.onConfirm) this.onConfirm(this.p1FormationId, this.p2FormationId);
            if (this.parent) this.parent.removeChild(this);
        }
    });
    confirmBtn.position.set(btnStartX, btnY - 40);
    
    const cancelBtn = new Button({
        text: '取消', width: cancelW, height: 80, color: 0x95a5a6,
        onClick: () => {
            if (this.onCancel) this.onCancel();
            if (this.parent) this.parent.removeChild(this);
        }
    });
    cancelBtn.position.set(btnStartX + confirmW + btnGap, btnY - 40);

    panel.addChild(confirmBtn);
    panel.addChild(cancelBtn);
  }

  createTabs(panelH) {
      this.tabContainer = new PIXI.Container();
      this.tabContainer.position.set(0, -panelH/2 + 120);
      this.contentContainer.parent.addChild(this.tabContainer);

      const tabW = 300;
      const tabH = 60;
      const gap = 20;
      const labels = ['红方 (P1)', '蓝方 (P2)'];
      
      // [修复] 计算总宽度以实现真正居中
      const totalW = labels.length * tabW + (labels.length - 1) * gap;
      const startX = -totalW / 2;

      this.tabs = [];
      labels.forEach((label, idx) => {
          const btn = new Button({
              text: label, width: tabW, height: tabH, 
              color: idx === this.currentEditSide ? 0x3498db : 0x7f8c8d,
              onClick: () => {
                  this.currentEditSide = idx;
                  this.updateTabs();
                  this.renderSelectionArea();
              }
          });
          // 按钮坐标是左上角，根据 startX 依次排列，垂直方向相对于容器中心 y=0 对齐
          btn.position.set(startX + idx * (tabW + gap), -tabH / 2);
          this.tabContainer.addChild(btn);
          this.tabs.push(btn);
      });
  }

  updateTabs() {
      this.tabs.forEach((btn, idx) => {
          const isSelected = idx === this.currentEditSide;
          btn.drawBg(isSelected ? 0x3498db : 0x7f8c8d);
      });
  }

  renderSelectionArea() {
    this.contentContainer.removeChildren();

    const currentId = this.currentEditSide === 0 ? this.p1FormationId : this.p2FormationId;

    // 左侧：阵型列表
    const listX = -350;
    const startY = -200;
    const gapY = 90;

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
        btn.position.set(listX, startY + idx * gapY);
        this.contentContainer.addChild(btn);
    });

    // 右侧：预览图
    const previewX = 250;
    const previewY = 0;
    this.renderPreview(previewX, previewY, currentId);
  }

  renderPreview(x, y, formationId) {
      const w = 350; // 维持压缩后的宽度，优化纵横比
      const h = 320; 
      const goalPadding = 60; // 球门偏移
      
      const container = new PIXI.Container();
      container.position.set(x, y);

      // 获取用户主题配置
      const theme = AccountMgr.userInfo.theme || { striker: 1, field: 1 };
      const strikerId = theme.striker || 1;
      
      const isRedSide = this.currentEditSide === 0;

      // 1. 背景遮罩 (裁剪显示区域)
      const bgMask = new PIXI.Graphics();
      bgMask.beginFill(0xffffff);
      bgMask.drawRect(-w/2, -h/2, w, h);
      bgMask.endFill();
      container.addChild(bgMask);

      // 2. 球场背景 (使用 half_field.png)
      const fieldTex = ResourceManager.get('half_field');
      
      if (fieldTex) {
          const bg = new PIXI.Sprite(fieldTex);
          bg.anchor.set(0.5);
          bg.width = w;
          bg.height = h;

          if (!isRedSide) {
              bg.scale.x *= -1;
          }
          
          bg.mask = bgMask;
          container.addChild(bg);
      } else {
          const bg = new PIXI.Graphics();
          bg.beginFill(0x27ae60);
          bg.drawRect(-w/2, -h/2, w, h);
          bg.endFill();
          container.addChild(bg);
      }

      // 3. 绘制棋子
      const fmt = Formations.find(f => f.id === formationId) || Formations[0];
      const positions = fmt.positions;

      const colorStr = isRedSide ? 'red' : 'blue';
      const texKey = `striker_${colorStr}_${strikerId}`;
      const strikerTex = ResourceManager.get(texKey);

      positions.forEach(pos => {
          let px, py;
          const range = w/2 - (-w/2 + goalPadding);

          if (isRedSide) {
              px = w/2 + (pos.x / 0.5) * range;
              py = pos.y * h;
          } else {
              px = -w/2 - (pos.x / 0.5) * range;
              py = pos.y * h;
          }

          if (strikerTex) {
              const sprite = new PIXI.Sprite(strikerTex);
              sprite.width = 40;
              sprite.height = 40;
              sprite.anchor.set(0.5);
              sprite.position.set(px, py);
              const shadow = new PIXI.Graphics();
              shadow.beginFill(0x000000, 0.4);
              shadow.drawCircle(0, 0, 18);
              shadow.endFill();
              shadow.position.set(px + 3, py + 3);
              
              container.addChild(shadow);
              container.addChild(sprite);
          } else {
              const dot = new PIXI.Graphics();
              const color = isRedSide ? 0xe74c3c : 0x3498db;
              dot.beginFill(color);
              dot.lineStyle(2, 0xFFFFFF);
              dot.drawCircle(0, 0, 18);
              dot.endFill();
              dot.position.set(px, py);
              container.addChild(dot);
          }
      });

      this.contentContainer.addChild(container);
  }
}
