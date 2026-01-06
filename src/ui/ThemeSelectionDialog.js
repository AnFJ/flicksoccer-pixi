
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import { Formations } from '../config/FormationConfig.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';
import Platform from '../managers/Platform.js';

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
          
          const isUnlocked = AccountMgr.isThemeUnlocked(typeKey, id);
          const isSelected = this.tempTheme[typeKey] === id;
          
          const container = new PIXI.Container();
          container.position.set(startX + col * (itemW+30), startY + row * (itemH+20));
          
          const bg = new PIXI.Graphics();
          bg.beginFill(0x34495e);
          // 锁定状态显示灰色边框，选中显示金色，未选中显示深灰
          const borderColor = isSelected ? 0xF1C40F : (isUnlocked ? 0x555555 : 0x7f8c8d);
          bg.lineStyle(4, borderColor);
          bg.drawRoundedRect(-itemW/2, -itemH/2, itemW, itemH, 15);
          container.addChild(bg);

          // 预览内容
          if (this.currentTab === 0) this.renderStrikerPreview(container, id);
          else if (this.currentTab === 1) this.renderFieldPreview(container, id, itemW-20, itemH-20);
          else this.renderBallPreview(container, id, 60);

          // 如果未解锁，添加遮罩和提示
          if (!isUnlocked) {
              const lockOverlay = new PIXI.Graphics();
              lockOverlay.beginFill(0x000000, 0.6);
              lockOverlay.drawRoundedRect(-itemW/2, -itemH/2, itemW, itemH, 15);
              lockOverlay.endFill();
              container.addChild(lockOverlay);

              // 统一显示视频图标 (移除关卡解锁的特殊判断)
              this.renderVideoIcon(container, itemW/2 - 30, itemH/2 - 30);
          }

          // 交互
          container.hitArea = new PIXI.Rectangle(-itemW/2, -itemH/2, itemW, itemH);
          container.interactive = true;
          container.buttonMode = true;
          container.on('pointerdown', () => {
              if (isUnlocked) {
                  this.tempTheme[typeKey] = id;
                  this.renderContent();
              } else {
                  // 所有未解锁的都尝试通过广告解锁
                  this.tryUnlock(typeKey, id);
              }
          });
          
          this.contentContainer.addChild(container);
      });
  }

  renderFormationContent() {
      const listX = -350;
      const startY = -150;
      const gapY = 85;

      Formations.forEach((fmt, idx) => {
          const isUnlocked = AccountMgr.isThemeUnlocked('formation', fmt.id);
          const isSelected = fmt.id === this.tempTheme.formationId;
          
          const btnColor = isSelected ? 0xF1C40F : 0x34495e;

          const btn = new Button({
              text: `${fmt.name} (${fmt.desc})`,
              width: 350, height: 70,
              color: btnColor,
              textColor: isSelected ? 0x000000 : (isUnlocked ? 0xFFFFFF : 0x95a5a6),
              fontSize: 28,
              onClick: () => {
                  if (isUnlocked) {
                      this.tempTheme.formationId = fmt.id;
                      this.renderContent();
                  } else {
                      this.tryUnlock('formation', fmt.id);
                  }
              }
          });
          btn.position.set(listX, startY + idx * gapY);
          
          if (isSelected) {
              btn.label.style.fontWeight = 'normal';
          }

          if (!isUnlocked) {
             this.renderVideoIcon(btn, -140, 0, 0.6); 
          }

          this.contentContainer.addChild(btn);
      });

      this.renderFormationPreview(250, 40, this.tempTheme.formationId);
  }

  // 绘制通用的视频/锁图标
  renderVideoIcon(parent, x, y, scale = 1.0) {
      const icon = new PIXI.Container();
      icon.position.set(x, y);
      icon.scale.set(scale);

      // 背景圆
      const bg = new PIXI.Graphics();
      bg.beginFill(0xe67e22); // 橙色
      bg.lineStyle(2, 0xffffff);
      bg.drawCircle(0, 0, 24);
      bg.endFill();
      
      // 播放三角
      const tri = new PIXI.Graphics();
      tri.beginFill(0xffffff);
      tri.moveTo(-6, -8);
      tri.lineTo(10, 0);
      tri.lineTo(-6, 8);
      tri.endFill();

      icon.addChild(bg, tri);
      parent.addChild(icon);
  }

  async tryUnlock(type, id) {
      const adUnitId = GameConfig.adConfig[Platform.env].rewardedVideo[`theme_${type}`];
      
      if (!adUnitId) {
          Platform.showToast("广告配置缺失，无法解锁");
          return;
      }

      Platform.showToast("观看完整视频解锁主题");
      
      const success = await Platform.showRewardedVideoAd(adUnitId);
      
      setTimeout(() => {
          if (success) {
              const unlocked = AccountMgr.unlockTheme(type, id);
              if (unlocked) {
                  Platform.showToast("解锁成功！");
                  // 自动选中
                  if (type === 'formation') this.tempTheme.formationId = id;
                  else this.tempTheme[type] = id;
                  
                  if (!this._destroyed) {
                      this.renderContent();
                  }
              }
          }
      }, 500);
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
