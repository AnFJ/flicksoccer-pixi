
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import LobbyScene from './LobbyScene.js';
import GameScene from './GameScene.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import BackButton from '../ui/BackButton.js'; // [新增]
import EventBus from '../managers/EventBus.js';
import { Events, NetMsg, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';
import Platform from '../managers/Platform.js';
import FormationSelectionDialog from '../ui/FormationSelectionDialog.js';
import { Formations } from '../config/FormationConfig.js';
import ResourceManager from '../managers/ResourceManager.js'; 

export default class RoomScene extends BaseScene {
  constructor() {
    super();
    this.players = [];
    this.readyBtn = null;
    this.formationBtn = null;
    this.inviteBtn = null; 
    this.exitBtn = null; 
    this.isReady = false;
    this.statusText = null;
    this.p1Container = null;
    this.p2Container = null;
    // 引用 theme 对象内的 formationId
    this.myFormationId = AccountMgr.userInfo.theme.formationId || 0;
  }

  onEnter(params) {
    super.onEnter(params);
    this.roomId = params.roomId || "----";
    const { designWidth, designHeight } = GameConfig;

    // [新增] 保存房间ID，方便异常中断后的恢复 (虽然游戏结束时会清理，但作为双重保险)
    if (params.roomId) {
        Platform.setStorage('last_room_id', params.roomId);
    }

    // 1. 背景 (使用球场图 + 遮罩)
    const bgTex = ResourceManager.get('bg_result_field');
    if (bgTex) {
        const bg = new PIXI.Sprite(bgTex);
        bg.anchor.set(0.5);
        bg.position.set(designWidth / 2, designHeight / 2);
        
        // Cover 模式适配
        const scale = Math.max(designWidth / bg.texture.width, designHeight / bg.texture.height);
        bg.scale.set(scale);
        
        this.container.addChild(bg);
    } else {
        const bg = new PIXI.Graphics().beginFill(0x2c3e50).drawRect(0, 0, designWidth, designHeight);
        this.container.addChild(bg);
    }

    // 添加深色半透明遮罩
    const overlay = new PIXI.Graphics();
    overlay.beginFill(0x000000, 0.6); // 60% 透明度黑色
    overlay.drawRect(0, 0, designWidth, designHeight);
    overlay.endFill();
    this.container.addChild(overlay);

    // 2. 标题 (始终水平居中)
    const title = new PIXI.Text(`房间号: ${this.roomId}`, { fontSize: 60, fill: 0xFFD700, fontWeight: 'bold' });
    title.anchor.set(0.5); title.position.set(designWidth / 2, 100);
    this.container.addChild(title);
    this.titleText = title; // 保存引用以便适配

    // 3. 离开按钮 (使用 BackButton 组件)
    this.exitBtn = new BackButton({
        text: '离开', 
        onClick: () => { NetworkMgr.send({ type: NetMsg.LEAVE }); NetworkMgr.close(); SceneManager.changeScene(LobbyScene); }
    });
    this.container.addChild(this.exitBtn);

    this.p1Container = this.createPlayerSlot(designWidth * 0.25, designHeight / 2);
    this.p2Container = this.createPlayerSlot(designWidth * 0.75, designHeight / 2);

    // [修改] 邀请好友按钮 (调整位置到 P2 头像下方)
    this.inviteBtn = new Button({
        text: '邀请好友', width: 220, height: 60, color: 0xe67e22, fontSize: 28,
        onClick: () => {
            Platform.shareRoom(this.roomId);
        }
    });
    // P2 container x is designWidth * 0.75. Button width 220.
    // 中心对齐计算: x = designWidth * 0.75 - 110, y = designHeight / 2 + 230
    this.inviteBtn.position.set(designWidth * 0.75 - 110, designHeight / 2 + 230);
    this.container.addChild(this.inviteBtn);

    const fmt = Formations.find(f => f.id === this.myFormationId) || Formations[0];
    this.formationBtn = new Button({
        text: `阵型: ${fmt.name}`, width: 260, height: 64, color: 0x3498db, fontSize: 26,
        onClick: () => this.openFormationDialog()
    });
    this.formationBtn.visible = false;
    this.container.addChild(this.formationBtn);

    this.readyBtn = new Button({
        text: '准备', width: 300, height: 100, color: 0x27ae60,
        onClick: () => this.toggleReady()
    });
    this.readyBtn.position.set(designWidth / 2 - 150, designHeight - 160);
    this.readyBtn.visible = false; 
    this.container.addChild(this.readyBtn);

    this.statusText = new PIXI.Text('正在连接服务器...', { fontSize: 36, fill: 0x00FF00 });
    this.statusText.anchor.set(0.5); this.statusText.position.set(designWidth / 2, designHeight - 240);
    this.container.addChild(this.statusText);

    EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);

    // [核心新增] 如果是从结算页"再来一局"回来的，Socket 还是连接状态
    // 此时不需要重新连接，而是主动请求刷新状态
    if (NetworkMgr.isConnected && NetworkMgr.socket) {
        this.statusText.text = "正在同步房间状态...";
        NetworkMgr.send({ type: NetMsg.GET_STATE });
        
        // [新增] 自动准备逻辑
        if (params.autoReady) {
            console.log('[RoomScene] Auto ready triggered');
            this.isReady = true;
            this.sendReady();
            
            // 预先更新按钮样式 (防止闪烁，虽然后续网络消息会覆盖)
            const btnW = 300, btnH = 100;
            this.readyBtn.bg.clear().beginFill(0xe67e22).drawRoundedRect(-btnW/2,-btnH/2,btnW,btnH,20);
            this.readyBtn.label.text = '取消准备';
        }
    }

    // 执行首次布局对齐
    this.alignUI();
  }

  // [新增] 响应屏幕尺寸变化
  onResize(width, height) {
      this.alignUI();
  }

  // [新增] UI 贴边适配逻辑
  alignUI() {
      if (!this.app) return;
      
      const margin = 20; // 边距
      
      // 1. 自动适配离开按钮
      if (this.exitBtn) {
          this.exitBtn.updateLayout();
      }

      // 计算屏幕边界用于其他元素布局
      const globalTopLeft = new PIXI.Point(margin, margin);
      const localTopLeft = this.container.toLocal(globalTopLeft);
      const globalTopRight = new PIXI.Point(this.app.screen.width - margin, margin);
      const localTopRight = this.container.toLocal(globalTopRight);

      // 2. 调整标题 (始终水平居中)
      if (this.titleText) {
          const centerX = (localTopLeft.x + localTopRight.x) / 2;
          this.titleText.x = centerX;
      }
  }

  createPlayerSlot(x, y) {
      const container = new PIXI.Container();
      container.position.set(x, y);
      const bg = new PIXI.Graphics().beginFill(0x34495e).drawCircle(0, 0, 100);
      container.addChild(bg);
      const name = new PIXI.Text('等待加入...', { fontSize: 36, fill: 0xffffff });
      name.anchor.set(0.5); name.position.set(0, 140);
      container.nameText = name; container.addChild(name);
      const fmtText = new PIXI.Text('', { fontSize: 24, fill: 0xaaaaaa });
      fmtText.anchor.set(0.5); fmtText.position.set(0, 180);
      container.fmtText = fmtText; container.addChild(fmtText);
      const readyTag = new PIXI.Text('READY', { fontSize: 40, fill: 0x2ecc71, fontWeight: 'bold' });
      readyTag.anchor.set(0.5); readyTag.visible = false;
      container.readyTag = readyTag; container.addChild(readyTag);
      this.container.addChild(container);
      return container;
  }

  updatePlayerSlot(container, player, isMe) {
      if (!player) {
          container.nameText.text = '等待加入...'; container.fmtText.text = ''; container.readyTag.visible = false;
          if (container.avatarSprite) { container.removeChild(container.avatarSprite); container.avatarSprite = null; }
          return;
      }
      container.nameText.text = player.nickname;
      container.readyTag.visible = player.ready;
      const fid = player.theme?.formationId || 0; 
      const f = Formations.find(it => it.id === fid) || Formations[0];
      if (isMe) {
          container.fmtText.visible = false; this.formationBtn.visible = true;
          this.formationBtn.position.set(container.x - 130, container.y + 160);
          this.formationBtn.label.text = `阵型: ${f.name}`;
      } else {
          container.fmtText.visible = true; container.fmtText.text = `阵型: ${f.name}`;
      }

      if (!container.avatarSprite && player.avatar) {
          PIXI.Texture.fromURL(player.avatar).then(tex => {
              if (container.destroyed) return;
              const sp = new PIXI.Sprite(tex);
              sp.anchor.set(0.5); sp.width = sp.height = 180;
              const mask = new PIXI.Graphics().beginFill(0xffffff).drawCircle(0,0,90).endFill();
              sp.mask = mask; container.addChildAt(sp, 1); container.addChildAt(mask, 2);
              container.avatarSprite = sp;
          }).catch(()=>{});
      }
  }

  openFormationDialog() {
      const dialog = new FormationSelectionDialog('single_online', (p1Id) => {
          this.myFormationId = p1Id;
          AccountMgr.updateFormation(p1Id);
          this.formationBtn.label.text = `阵型: ${Formations.find(it=>it.id===p1Id).name}`;
          this.sendReady();
      }, () => {});
      this.container.addChild(dialog);
  }

  toggleReady() {
      this.isReady = !this.isReady;
      this.sendReady();
      const btnW = 300, btnH = 100;
      // 绘图必须从中心开始坐标 (-btnW/2, -btnH/2) 绘制，以匹配 Button 组件的中心点
      this.readyBtn.bg.clear().beginFill(this.isReady ? 0xe67e22 : 0x27ae60).drawRoundedRect(-btnW/2,-btnH/2,btnW,btnH,20);
      this.readyBtn.label.text = this.isReady ? '取消准备' : '准备';
  }

  sendReady() {
      NetworkMgr.send({ type: NetMsg.READY, payload: { ready: this.isReady, formationId: this.myFormationId } });
  }

  onNetMessage(msg) {
      if (msg.type === NetMsg.PLAYER_JOINED) {
          const players = msg.payload.players; this.players = players;
          this.statusText.text = msg.payload.status === 'PLAYING' ? "对局进行中..." : "等待玩家准备...";
          this.readyBtn.visible = msg.payload.status !== 'PLAYING';
          const myId = AccountMgr.userInfo.id;
          const me = players.find(p => p.id === myId);
          if (me) {
              this.isReady = me.ready;
              this.readyBtn.label.text = this.isReady ? '取消准备' : '准备';
              const btnW = 300, btnH = 100;
              this.readyBtn.bg.clear().beginFill(this.isReady ? 0xe67e22 : 0x27ae60).drawRoundedRect(-btnW/2, -btnH/2, btnW, btnH, 20);
          }
          this.updatePlayerSlot(this.p1Container, players.find(p=>p.teamId===0), players.find(p=>p.teamId===0)?.id === myId);
          this.updatePlayerSlot(this.p2Container, players.find(p=>p.teamId===1), players.find(p=>p.teamId===1)?.id === myId);
          
          // [修改] 如果对方存在(P2)，隐藏邀请按钮
          const hasP2 = players.some(p => p.teamId === 1);
          if (this.inviteBtn) this.inviteBtn.visible = !hasP2;

      } else if (msg.type === NetMsg.START) {
          SceneManager.changeScene(GameScene, { mode: 'pvp_online', players: this.players, startTurn: msg.payload.currentTurn });
      } else if (msg.type === NetMsg.GAME_RESUME) {
          // 处理断线重连或中途加入的情况
          const { players, currentTurn, scores, positions } = msg.payload;
          SceneManager.changeScene(GameScene, { 
              mode: 'pvp_online', 
              players: players, 
              startTurn: currentTurn,
              snapshot: { scores, positions }
          });
      } else if (msg.type === 'ERROR') {
          Platform.showToast('进入房间失败'); SceneManager.changeScene(LobbyScene);
      } else if (msg.type === NetMsg.PLAYER_LEFT_GAME) {
          // 如果在等待界面有人离开了，更新UI
          const leftId = msg.payload.userId;
          this.players = this.players.filter(p => p.id !== leftId);
          this.updatePlayerSlot(this.p1Container, this.players.find(p=>p.teamId===0), this.players.find(p=>p.teamId===0)?.id === AccountMgr.userInfo.id);
          this.updatePlayerSlot(this.p2Container, this.players.find(p=>p.teamId===1), this.players.find(p=>p.teamId===1)?.id === AccountMgr.userInfo.id);
          
          // [修改] 如果对方离开了，重新显示邀请按钮
          const hasP2 = this.players.some(p => p.teamId === 1);
          if (this.inviteBtn) this.inviteBtn.visible = !hasP2;
      }
  }

  onExit() { super.onExit(); EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this); }
}
