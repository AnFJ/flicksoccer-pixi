
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import { Formations } from '../config/FormationConfig.js';
import AccountMgr from '../managers/AccountMgr.js';

export default class FormationSelectionDialog extends PIXI.Container {
  /**
   * @param {string} mode 'single' | 'dual' (单人/网络 或 本地双人)
   * @param {Function} onConfirm (p1FormationId, p2FormationId) => void
   * @param {Function} onCancel
   */
  constructor(mode, onConfirm, onCancel) {
    super();
    this.mode = mode; // 'single' (PVE/Online) or 'dual' (Local PVP)
    this.onConfirm = onConfirm;
    this.onCancel = onCancel;

    // 状态
    this.p1FormationId = AccountMgr.userInfo.formationId || 0;
    this.p2FormationId = 0; // 本地P2默认
    this.currentEditSide = 0; // 0: Player 1, 1: Player 2 (仅在 dual 模式有效)

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

    // 7. 底部按钮
    const btnY = panelH/2 - 70;
    const btnSpacing = 200;

    const confirmBtn = new Button({
        text: '开始比赛', width: 240, height: 80, color: 0x2ecc71,
        onClick: () => {
            if (this.mode === 'single') {
                // 保存玩家的选择
                AccountMgr.updateFormation(this.p1FormationId);
            }
            if (this.onConfirm) this.onConfirm(this.p1FormationId, this.p2FormationId);
            if (this.parent) this.parent.removeChild(this);
        }
    });
    confirmBtn.position.set(-btnSpacing/2 - 120, btnY - 40);
    
    // 如果是网络对战准备阶段调用的，可以改文案
    if (this.mode === 'single_online') {
         confirmBtn.options.text = "确定";
    }

    const cancelBtn = new Button({
        text: '取消', width: 200, height: 80, color: 0x95a5a6,
        onClick: () => {
            if (this.onCancel) this.onCancel();
            if (this.parent) this.parent.removeChild(this);
        }
    });
    cancelBtn.position.set(btnSpacing/2 + 100 - 100, btnY - 40);

    panel.addChild(confirmBtn);
    panel.addChild(cancelBtn);
  }

  createTabs(panelH) {
      this.tabContainer = new PIXI.Container();
      this.tabContainer.position.set(0, -panelH/2 + 120);
      this.contentContainer.parent.addChild(this.tabContainer);

      const tabW = 300;
      const tabH = 60;
      
      this.tabs = [];
      ['红方 (P1)', '蓝方 (P2)'].forEach((label, idx) => {
          const btn = new Button({
              text: label, width: tabW, height: tabH, 
              color: idx === this.currentEditSide ? 0x3498db : 0x7f8c8d,
              onClick: () => {
                  this.currentEditSide = idx;
                  this.updateTabs();
                  this.renderSelectionArea();
              }
          });
          btn.position.set((idx - 0.5) * (tabW + 20), 0);
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
    const previewX = 200;
    const previewY = 0;
    this.renderPreview(previewX, previewY, currentId);
  }

  renderPreview(x, y, formationId) {
      const w = 400;
      const h = 500;
      
      const container = new PIXI.Container();
      container.position.set(x, y);

      // 1. 半场背景
      const bg = new PIXI.Graphics();
      bg.beginFill(0x27ae60); // 草地绿
      bg.lineStyle(4, 0xFFFFFF);
      bg.drawRect(-w/2, -h/2, w, h);
      
      // 中线
      bg.moveTo(-w/2, 0); // 这里的预览为了方便看，我们把球场竖起来画 (Rotate 90deg conceptually)
      // 但实际上 config 是横向坐标。
      // 我们这里统一：预览图是半场，左边是球门线，右边是中线。
      
      // 为了美观，画成竖版：下方是本方球门，上方是中线
      // 坐标转换：Config.x (负数) -> Preview.y (正数，因为下是正)
      // Config.y -> Preview.x
      
      // 画禁区
      bg.lineStyle(2, 0xFFFFFF, 0.5);
      bg.drawRect(-80, h/2 - 60, 160, 60);
      
      // [修复] PIXI v6 中没有 drawArc 方法，应使用 arc 方法
      // 为了避免与上一个路径（矩形）产生连线，先 moveTo 到圆弧起点
      const arcCenterX = 0;
      const arcCenterY = h/2 - 60;
      const arcRadius = 40;
      const startAngle = Math.PI;
      
      bg.moveTo(arcCenterX + Math.cos(startAngle) * arcRadius, arcCenterY + Math.sin(startAngle) * arcRadius);
      bg.arc(arcCenterX, arcCenterY, arcRadius, Math.PI, 0);

      bg.endFill();
      container.addChild(bg);

      // 2. 绘制棋子点
      const fmt = Formations.find(f => f.id === formationId) || Formations[0];
      const positions = fmt.positions;

      // 坐标映射
      // Config x: [-0.5, 0] -> Preview y: [h/2, -h/2] (实际上是 0.5w -> 0w)
      // Config x: -0.45 (靠近底线) -> y: h/2 - padding
      // Config x: 0 (中线) -> y: -h/2
      
      // 实际上 Config x 是相对于整个球场宽度的比例。半场宽度是 W_field/2
      // config.x = -0.45 意味着在左半场的左侧。
      
      // 映射逻辑：
      // Preview X = config.y * (w / (H_field_ratio)) 
      // Preview Y = config.x * (h / (W_field_ratio/2)) * direction
      
      // 简单映射：
      // config.x range: -0.5 ~ 0
      // preview y range: h/2 ~ -h/2
      // y = - (config.x + 0.25) * scale? No.
      
      // Let's assume bottom is Goal (config x = -0.5), Top is Center (config x = 0)
      const scaleY = h / 0.5; // full height represents half field width (0.5)
      const scaleX = w / 1.0; // full width represents field height (ratio approx 0.6)
      
      positions.forEach(pos => {
          const dot = new PIXI.Graphics();
          const color = this.currentEditSide === 0 ? 0xe74c3c : 0x3498db; // 红/蓝
          dot.beginFill(color);
          dot.lineStyle(2, 0xFFFFFF);
          dot.drawCircle(0, 0, 15);
          dot.endFill();
          
          // 转换坐标到竖屏预览
          // config.x (-0.5 ~ 0) -> y (h/2 ~ -h/2)
          // config.x = -0.5 => y = h/2 (Bottom)
          // config.x = 0 => y = -h/2 (Top)
          // y = - (config.x * 2 + 1) * (h/2)  => - (2x + 1) * h/2
          const py = -(pos.x * 2 + 0.5) * h; // approximate
          
          // config.y (-0.5 ~ 0.5) -> x (-w/2 ~ w/2)
          const px = pos.y * 1.5 * w; 

          dot.position.set(px, py);
          container.addChild(dot);
      });

      this.contentContainer.addChild(container);
  }
}
