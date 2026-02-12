
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';
import Platform from '../managers/Platform.js';
import { GameConfig } from '../config.js';
import { SkillType } from '../constants.js';

export default class InventoryView extends PIXI.Container {
  constructor(onClose) {
    super();
    this.onClose = onClose;
    
    // UI 引用
    this.coinsText = null;
    this.itemTexts = {}; // 存储道具文本引用方便更新

    this.init();
  }

  init() {
    const { designWidth, designHeight } = GameConfig;
    const info = AccountMgr.userInfo;

    // 1. 全屏遮罩
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x000000, 0.85);
    overlay.drawRect(0, 0, designWidth, designHeight);
    overlay.interactive = true;
    this.addChild(overlay);

    // 2. 主面板容器
    const panelW = 900;
    const panelH = 700;
    
    // [修改] 使用 Container 作为父容器，保持原点在中心
    const panel = new PIXI.Container();
    panel.position.set(designWidth/2, designHeight/2);
    this.addChild(panel);

    // [修改] 背景绘制逻辑：优先使用图片，兜底使用绘图
    const bgTex = ResourceManager.get('dialog_bg'); // 复用主题背景
    // 使用九宫格拉伸
    const bg = new PIXI.NineSlicePlane(bgTex, 30, 30, 30, 30);
    bg.width = panelW;
    bg.height = panelH;
    // 居中定位 (NineSlicePlane 默认锚点在左上角)
    bg.x = -panelW / 2;
    bg.y = -panelH / 2;
    panel.addChild(bg);

    // 3. 标题
    const title = new PIXI.Text('我的背包', {
        fontFamily: 'Arial', fontSize: 50, fill: 0xffffff, fontWeight: 'bold'
    });
    title.anchor.set(0.5);
    title.position.set(0, -panelH/2 + 60);
    panel.addChild(title);

    // 4. 顶部信息栏 (金币 & 等级)
    const statsContainer = new PIXI.Container();
    statsContainer.position.set(0, -panelH/2 + 135);
    panel.addChild(statsContainer);

    // --- 金币区域 ---
    const coinZone = new PIXI.Container();
    coinZone.position.set(-200, 0);
    
    // 金币文本
    this.coinsText = new PIXI.Text(`金币: ${info.coins}`, {
        fontFamily: 'Arial', fontSize: 36, fill: 0xFFD700
    });
    this.coinsText.anchor.set(0.5);
    this.coinsText.position.set(0, 0); // 相对 coinZone
    coinZone.addChild(this.coinsText);

    // [新增] 金币广告按钮 (在文字右侧)
    const coinAdBtn = this.createMiniAdButton("+500", () => this.handleAdReward('coins'));
    coinAdBtn.position.set(160, 0); // 放在文字右边
    coinZone.addChild(coinAdBtn);

    statsContainer.addChild(coinZone);

    // --- 等级区域 ---
    const levelText = new PIXI.Text(`等级: Lv.${info.level}`, {
        fontFamily: 'Arial', fontSize: 36, fill: 0x3498db
    });
    levelText.anchor.set(0.5);
    levelText.position.set(200, 0);
    statsContainer.addChild(levelText);

    // 5. 道具网格 (下移起始Y坐标)
    this.createItemGrid(panel, 0, -40);

    // 6. [修改] 关闭按钮 (放在面板外面，正下方)
    const btnW = 200;
    const closeBtn = new Button({
        text: '关闭', width: btnW, height: 70, color: 0x95a5a6,
        onClick: () => {
            if (this.onClose) this.onClose();
            if (this.parent) this.parent.removeChild(this);
        }
    });
    closeBtn.position.set(designWidth/2 - btnW/2, designHeight/2 + panelH/2 - 100);
    
    // 注意：将按钮直接添加到 this (InventoryView)，而不是 panel
    this.addChild(closeBtn);
  }

  createItemGrid(parent, startX, startY) {
      const items = [
          { type: SkillType.SUPER_AIM, label: '超距瞄准', tex: 'skill_aim_bg' },
          { type: SkillType.UNSTOPPABLE, label: '无敌战车', tex: 'skill_unstoppable_bg' },
          { type: SkillType.SUPER_FORCE, label: '大力水手', tex: 'skill_force_bg' }
      ];

      const itemSize = 180;
      const gap = 80; // 增加间距以容纳下方按钮
      
      const totalW = items.length * itemSize + (items.length - 1) * gap;
      let currentX = startX - totalW / 2 + itemSize / 2;

      items.forEach((itemCfg) => {
          const container = new PIXI.Container();
          container.position.set(currentX, startY);

          // 背景框
          const bg = new PIXI.Graphics();
          bg.beginFill(0x34495e);
          bg.drawRoundedRect(-itemSize/2, -itemSize/2, itemSize, itemSize, 15);
          bg.endFill();
          container.addChild(bg);

          // 图标
          const tex = ResourceManager.get(itemCfg.tex);
          if (tex) {
              const sprite = new PIXI.Sprite(tex);
              sprite.width = itemSize - 40;
              sprite.height = itemSize - 40;
              sprite.anchor.set(0.5);
              container.addChild(sprite);
          } else {
              const placeholder = new PIXI.Text(itemCfg.label[0], { fontSize: 60, fill: 0x555555 });
              placeholder.anchor.set(0.5);
              container.addChild(placeholder);
          }

          // 名称 + 数量
          const count = AccountMgr.getItemCount(itemCfg.type);
          const nameText = new PIXI.Text(`${itemCfg.label} x ${count}`, {
              fontFamily: 'Arial', fontSize: 24, fill: 0xecf0f1
          });
          nameText.anchor.set(0.5);
          nameText.position.set(0, itemSize/2 + 25);
          container.addChild(nameText);
          
          // 保存引用
          this.itemTexts[itemCfg.type] = nameText;
          this.itemTexts[itemCfg.type + '_label'] = itemCfg.label; // 保存原始标签名方便拼接

          // [新增] 道具广告按钮 (位于文字下方)
          const adBtn = this.createMiniAdButton("+5", () => this.handleAdReward(itemCfg.type));
          adBtn.position.set(0, itemSize/2 + 75);
          container.addChild(adBtn);

          parent.addChild(container);
          currentX += itemSize + gap;
      });
  }

  /**
   * 创建迷你广告按钮
   */
  createMiniAdButton(rewardText, onClick) {
      const w = 120;
      const h = 50;
      const btn = new PIXI.Container();
      
      // 背景
      const bg = new PIXI.Graphics();
      bg.beginFill(0xe67e22); // 橙色
      bg.drawRoundedRect(-w/2, -h/2, w, h, 25); // 胶囊形
      bg.endFill();
      btn.addChild(bg);

      // 图标 (简单的播放三角形)
      const icon = new PIXI.Graphics();
      icon.beginFill(0xffffff);
      icon.moveTo(0, 0);
      icon.lineTo(12, 8);
      icon.lineTo(0, 16);
      icon.endFill();
      icon.position.set(-35, -8);
      btn.addChild(icon);

      // 文字
      const text = new PIXI.Text(rewardText, {
          fontFamily: 'Arial', fontSize: 22, fill: 0xffffff, fontWeight: 'bold'
      });
      text.anchor.set(0.5);
      text.position.set(15, 0);
      btn.addChild(text);

      // 交互
      btn.interactive = true;
      btn.buttonMode = true;
      btn.on('pointerdown', () => btn.scale.set(0.9));
      btn.on('pointerup', () => {
          btn.scale.set(1.0);
          onClick();
      });
      btn.on('pointerupoutside', () => btn.scale.set(1.0));

      return btn;
  }

  /**
   * 处理广告观看逻辑
   * @param {string} type 'coins' | 'super_aim' | 'unstoppable' | 'super_force'
   */
  async handleAdReward(type) {
      // 获取配置的广告ID
      let adUnitId = "";
      const platform = Platform.env;
      const config = GameConfig.adConfig[platform] || {};
      
      if (config.rewardedVideo) {
          adUnitId = config.rewardedVideo[type];
      }

      if (!adUnitId) {
          Platform.showToast('暂无广告配置');
          return;
      }

      // 调用平台播放广告
      const success = await Platform.showRewardedVideoAd(adUnitId);
      
      if (success) {
          if (type === 'coins') {
              AccountMgr.addCoins(500);
              Platform.showToast('获得 500 金币!');
          } else {
              AccountMgr.addItem(type, 5);
              // 获取中文名提示
              const itemLabel = this.itemTexts[type + '_label'] || "道具";
              Platform.showToast(`获得 ${itemLabel} x5 !`);
          }
          
          // [修复] 延迟刷新 UI，防止广告关闭瞬间适配器上下文未恢复导致的 insertTextView/position 错误
          setTimeout(() => {
              // Pixi v6 检查方式：_destroyed 为内部属性，或者判断 parent 是否为空
              if (this._destroyed || !this.parent) return;
              this.refreshUI();
          }, 500);
      }
  }

  refreshUI() {
      // 安全检查，防止异步回调时界面已被销毁
      if (this._destroyed || !this.parent) return;

      // 刷新金币
      if (this.coinsText) {
          this.coinsText.text = `金币: ${AccountMgr.userInfo.coins}`;
      }
      
      // 刷新道具数量
      for (const key in this.itemTexts) {
          // 过滤掉 _label 后缀的辅助键
          if (!key.endsWith('_label')) {
              const count = AccountMgr.getItemCount(key);
              const label = this.itemTexts[key + '_label'];
              if (this.itemTexts[key] && label) {
                  this.itemTexts[key].text = `${label} x ${count}`;
              }
          }
      }
  }
}
