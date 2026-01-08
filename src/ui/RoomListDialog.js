
import * as PIXI from 'pixi.js';
import Button from './Button.js';
import { GameConfig } from '../config.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import Platform from '../managers/Platform.js';

export default class RoomListDialog extends PIXI.Container {
  constructor(onJoin, onClose) {
    super();
    this.onJoin = onJoin;
    this.onClose = onClose;
    
    this.init();
    this.loadData();
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
    const panelW = 1000;
    const panelH = 800;
    const panel = new PIXI.Graphics();
    panel.beginFill(0x2c3e50);
    panel.lineStyle(4, 0xecf0f1);
    panel.drawRoundedRect(-panelW/2, -panelH/2, panelW, panelH, 30);
    panel.endFill();
    panel.position.set(designWidth/2, designHeight/2);
    this.addChild(panel);

    // 3. 标题
    const title = new PIXI.Text('当前匹配中的房间', {
        fontFamily: 'Arial', fontSize: 48, fill: 0xffffff, fontWeight: 'bold'
    });
    title.anchor.set(0.5);
    title.position.set(0, -panelH/2 + 60);
    panel.addChild(title);

    // 4. 列表容器
    this.listContainer = new PIXI.Container();
    this.listContainer.position.set(0, -panelH/2 + 130);
    panel.addChild(this.listContainer);

    // 5. 提示/加载文字
    this.statusText = new PIXI.Text('正在获取列表...', {
        fontFamily: 'Arial', fontSize: 32, fill: 0x999999
    });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(0, 50); // 居中
    panel.addChild(this.statusText);

    // 6. 关闭按钮
    const closeBtn = new Button({
        text: '关闭', width: 200, height: 70, color: 0x95a5a6,
        onClick: () => {
            if (this.onClose) this.onClose();
            if (this.parent) this.parent.removeChild(this);
        }
    });
    closeBtn.position.set(-100, panelH/2 - 100);
    panel.addChild(closeBtn);
  }

  async loadData() {
      try {
          const rooms = await NetworkMgr.getRoomList();
          if (rooms && rooms.length > 0) {
              this.renderList(rooms);
              this.statusText.visible = false;
          } else {
              this.statusText.text = "暂无匹配中的房间";
          }
      } catch (e) {
          console.error(e);
          this.statusText.text = "获取失败，请重试";
          this.statusText.interactive = true;
          this.statusText.once('pointerdown', () => this.loadData());
      }
  }

  renderList(rooms) {
      this.listContainer.removeChildren();
      
      const itemH = 120;
      const gap = 20;
      const startY = 0;

      rooms.forEach((room, index) => {
          const item = this.createRoomItem(room);
          item.position.set(0, startY + index * (itemH + gap));
          this.listContainer.addChild(item);
      });
  }

  createRoomItem(room) {
      const w = 900;
      const h = 120;
      const container = new PIXI.Container();

      // 背景
      const bg = new PIXI.Graphics();
      bg.beginFill(0x34495e);
      bg.drawRoundedRect(-w/2, 0, w, h, 15);
      bg.endFill();
      container.addChild(bg);

      // 头像 (简单圆)
      const avatarSize = 80;
      const avatarX = -w/2 + 60;
      const avatarY = h/2;
      
      const avatarBg = new PIXI.Graphics();
      avatarBg.beginFill(0x95a5a6);
      avatarBg.drawCircle(avatarX, avatarY, avatarSize/2);
      avatarBg.endFill();
      container.addChild(avatarBg);

      // 如果有头像URL
      if (room.host_info && room.host_info.avatar && room.host_info.avatar.startsWith('http')) {
          const sp = new PIXI.Sprite();
          sp.anchor.set(0.5);
          sp.position.set(avatarX, avatarY);
          const mask = new PIXI.Graphics().beginFill(0xffffff).drawCircle(avatarX, avatarY, avatarSize/2).endFill();
          sp.mask = mask;
          container.addChild(sp, mask);
          
          PIXI.Texture.fromURL(room.host_info.avatar).then(tex => {
              sp.texture = tex;
              sp.width = sp.height = avatarSize;
          }).catch(()=>{});
      } else {
          // 文字头像
          const char = (room.host_info?.nickname || 'H').charAt(0).toUpperCase();
          const txt = new PIXI.Text(char, {fontSize: 32, fill: 0xffffff, fontWeight: 'bold'});
          txt.anchor.set(0.5);
          txt.position.set(avatarX, avatarY);
          container.addChild(txt);
      }

      // 信息文本
      const infoX = avatarX + 60;
      const hostName = room.host_info?.nickname || 'Unknown';
      const level = room.host_info?.level || 1;
      
      const nameText = new PIXI.Text(hostName, {
          fontFamily: 'Arial', fontSize: 32, fill: 0xffffff, fontWeight: 'bold'
      });
      nameText.anchor.set(0, 0.5);
      nameText.position.set(infoX, h/2 - 15);
      
      const lvlText = new PIXI.Text(`Lv.${level}`, {
          fontFamily: 'Arial', fontSize: 24, fill: 0xF1C40F
      });
      lvlText.anchor.set(0, 0.5);
      lvlText.position.set(infoX, h/2 + 20);
      
      container.addChild(nameText, lvlText);

      // 右侧操作区布局参数
      const btnW = 140;
      const btnH = 60;
      const paddingRight = 30;
      const gap = 20;

      // 房间号 (在按钮左侧)
      const roomText = new PIXI.Text(`房间号: ${room.room_id}`, {
          fontFamily: 'Arial', fontSize: 28, fill: 0xcccccc
      });
      roomText.anchor.set(1, 0.5);
      // 位置：右边界(w/2) - 按钮宽 - 右边距 - 文字与按钮间距
      roomText.position.set(w/2 - btnW - paddingRight - gap, h/2);
      container.addChild(roomText);

      // 加入按钮 (靠右对齐)
      const joinBtn = new Button({
          text: '加入', width: btnW, height: btnH, color: 0x27ae60, fontSize: 28,
          onClick: () => {
              if (this.onJoin) this.onJoin(room.room_id);
              if (this.parent) this.parent.removeChild(this);
          }
      });
      // 位置：右边界(w/2) - 按钮宽 - 右边距
      // Button 的锚点是 top-left，所以 set 的坐标是其左上角
      joinBtn.position.set(w/2 - btnW - paddingRight, h/2 - btnH/2); 
      container.addChild(joinBtn);

      return container;
  }
}
