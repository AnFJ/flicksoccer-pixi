
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import LobbyScene from './LobbyScene.js';
import GameScene from './GameScene.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import EventBus from '../managers/EventBus.js';
import { Events, NetMsg, TeamId } from '../constants.js';
import { GameConfig } from '../config.js';
import Platform from '../managers/Platform.js';
import FormationSelectionDialog from '../ui/FormationSelectionDialog.js';
import { Formations } from '../config/FormationConfig.js';

export default class RoomScene extends BaseScene {
  constructor() {
    super();
    this.players = [];
    this.readyBtn = null;
    this.formationBtn = null;
    this.isReady = false;
    this.statusText = null;
    this.p1Container = null;
    this.p2Container = null;
    // [修改] 引用 theme 对象内的 formationId
    this.myFormationId = AccountMgr.userInfo.theme.formationId || 0;
  }

  onEnter(params) {
    super.onEnter(params);
    this.roomId = params.roomId || "----";
    const { designWidth, designHeight } = GameConfig;

    const bg = new PIXI.Graphics().beginFill(0x2c3e50).drawRect(0, 0, designWidth, designHeight);
    this.container.addChild(bg);

    const title = new PIXI.Text(`房间号: ${this.roomId}`, { fontSize: 60, fill: 0xFFD700, fontWeight: 'bold' });
    title.anchor.set(0.5); title.position.set(designWidth / 2, 100);
    this.container.addChild(title);

    const exitBtn = new Button({
        text: '离开', width: 160, height: 60, color: 0x95a5a6,
        onClick: () => { NetworkMgr.close(); SceneManager.changeScene(LobbyScene); }
    });
    exitBtn.position.set(50, 50);
    this.container.addChild(exitBtn);

    this.p1Container = this.createPlayerSlot(designWidth * 0.25, designHeight / 2);
    this.p2Container = this.createPlayerSlot(designWidth * 0.75, designHeight / 2);

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
          return;
      }
      container.nameText.text = player.nickname;
      container.readyTag.visible = player.ready;
      const fid = player.theme?.formationId || 0; // [修改]
      const f = Formations.find(it => it.id === fid) || Formations[0];
      if (isMe) {
          container.fmtText.visible = false; this.formationBtn.visible = true;
          this.formationBtn.position.set(container.x - 130, container.y + 160);
          this.formationBtn.label.text = `阵型: ${f.name}`;
      } else {
          container.fmtText.visible = true; container.fmtText.text = `阵型: ${f.name}`;
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
      this.readyBtn.bg.clear().beginFill(this.isReady ? 0xe67e22 : 0x27ae60).drawRoundedRect(-btnW/2,-btnH/2,btnW,btnH,20);
      this.readyBtn.label.text = this.isReady ? '取消准备' : '准备';
  }

  sendReady() {
      NetworkMgr.send({ type: NetMsg.READY, payload: { ready: this.isReady, theme: AccountMgr.userInfo.theme } });
  }

  onNetMessage(msg) {
      if (msg.type === NetMsg.PLAYER_JOINED) {
          const players = msg.payload.players; this.players = players;
          this.statusText.text = msg.payload.status === 'PLAYING' ? "对局进行中..." : "等待玩家准备...";
          this.readyBtn.visible = msg.payload.status !== 'PLAYING';
          const myId = AccountMgr.userInfo.id;
          this.updatePlayerSlot(this.p1Container, players.find(p=>p.teamId===0), players.find(p=>p.teamId===0)?.id === myId);
          this.updatePlayerSlot(this.p2Container, players.find(p=>p.teamId===1), players.find(p=>p.teamId===1)?.id === myId);
      } else if (msg.type === NetMsg.START) {
          SceneManager.changeScene(GameScene, { mode: 'pvp_online', players: this.players, startTurn: msg.payload.currentTurn });
      } else if (msg.type === 'ERROR') {
          Platform.showToast('进入房间失败'); SceneManager.changeScene(LobbyScene);
      }
  }

  onExit() { super.onExit(); EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this); }
}
