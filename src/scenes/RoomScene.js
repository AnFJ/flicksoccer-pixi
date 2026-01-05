
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
import FormationSelectionDialog from '../ui/FormationSelectionDialog.js'; // [新增]
import { Formations } from '../config/FormationConfig.js'; // [新增]

export default class RoomScene extends BaseScene {
  constructor() {
    super();
    this.players = [];
    this.readyBtn = null;
    this.formationBtn = null; // [新增]
    this.isReady = false;
    this.statusText = null;
    
    // UI 容器
    this.p1Container = null;
    this.p2Container = null;

    // 当前选中的阵型ID
    this.myFormationId = AccountMgr.userInfo.formationId || 0;
  }

  onEnter(params) {
    super.onEnter(params);
    this.roomId = params.roomId || "----";
    const { designWidth, designHeight } = GameConfig;

    // 背景
    const bg = new PIXI.Graphics();
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    // 房间号标题
    const title = new PIXI.Text(`房间号: ${this.roomId}`, {
        fontFamily: 'Arial', fontSize: 60, fill: 0xFFD700, fontWeight: 'bold'
    });
    title.anchor.set(0.5);
    title.position.set(designWidth / 2, 100);
    this.container.addChild(title);

    // 退出按钮
    const exitBtn = new Button({
        text: '离开', width: 160, height: 60, color: 0x95a5a6,
        onClick: () => {
            NetworkMgr.close();
            Platform.removeStorage('last_room_id');
            SceneManager.changeScene(LobbyScene);
        }
    });
    exitBtn.position.set(50, 50);
    this.container.addChild(exitBtn);

    // VS 图标
    const vsText = new PIXI.Text('VS', {
        fontFamily: 'Arial Black', fontSize: 100, fill: 0xffffff, fontStyle: 'italic'
    });
    vsText.anchor.set(0.5);
    vsText.position.set(designWidth / 2, designHeight / 2);
    this.container.addChild(vsText);

    // 初始化两个玩家位
    this.p1Container = this.createPlayerSlot(designWidth * 0.25, designHeight / 2);
    this.p2Container = this.createPlayerSlot(designWidth * 0.75, designHeight / 2);

    // [新增] 阵型选择按钮 (位于准备按钮上方)
    const fmt = Formations.find(f => f.id === this.myFormationId) || Formations[0];
    this.formationBtn = new Button({
        text: `阵型: ${fmt.name}`, width: 300, height: 70, color: 0x3498db,
        onClick: () => this.openFormationDialog()
    });
    this.formationBtn.position.set(designWidth / 2 - 150, designHeight - 300);
    this.formationBtn.visible = false;
    this.container.addChild(this.formationBtn);

    // 准备按钮 (初始隐藏，连接成功后显示)
    this.readyBtn = new Button({
        text: '准备', width: 300, height: 100, color: 0x27ae60,
        onClick: () => this.toggleReady()
    });
    this.readyBtn.position.set(designWidth / 2 - 150, designHeight - 200);
    this.readyBtn.visible = false; // 还没连接成功
    this.container.addChild(this.readyBtn);

    this.statusText = new PIXI.Text('正在连接服务器...', { fontFamily: 'Arial', fontSize: 36, fill: 0x00FF00 });
    this.statusText.anchor.set(0.5);
    this.statusText.position.set(designWidth / 2, designHeight - 380);
    this.container.addChild(this.statusText);

    // 监听网络事件
    EventBus.on(Events.NET_MESSAGE, this.onNetMessage, this);
  }

  createPlayerSlot(x, y) {
      const container = new PIXI.Container();
      container.position.set(x, y);

      // 空头像占位
      const bg = new PIXI.Graphics();
      bg.beginFill(0x34495e);
      bg.drawCircle(0, 0, 100);
      bg.endFill();
      container.addChild(bg);
      
      // 文本
      const name = new PIXI.Text('等待加入...', { fontFamily: 'Arial', fontSize: 36, fill: 0xffffff });
      name.anchor.set(0.5);
      name.position.set(0, 140);
      container.nameText = name; // 挂载引用方便修改
      container.addChild(name);
      
      // [新增] 阵型显示
      const fmtText = new PIXI.Text('', { fontFamily: 'Arial', fontSize: 24, fill: 0xaaaaaa });
      fmtText.anchor.set(0.5);
      fmtText.position.set(0, 180);
      container.fmtText = fmtText;
      container.addChild(fmtText);

      // 准备标签
      const readyTag = new PIXI.Text('READY', { fontFamily: 'Arial Black', fontSize: 40, fill: 0x2ecc71 });
      readyTag.anchor.set(0.5);
      readyTag.position.set(0, 0);
      readyTag.visible = false;
      container.readyTag = readyTag;
      container.addChild(readyTag);

      // 头像Sprite引用
      container.avatarSprite = null;

      this.container.addChild(container);
      return container;
  }

  updatePlayerSlot(container, player) {
      if (!player) {
          // Reset
          container.nameText.text = '等待加入...';
          container.fmtText.text = '';
          container.readyTag.visible = false;
          if (container.avatarSprite) {
              container.removeChild(container.avatarSprite);
              container.avatarSprite = null;
          }
          return;
      }

      container.nameText.text = player.nickname;
      container.readyTag.visible = player.ready;

      // [新增] 显示该玩家选择的阵型
      const fid = player.formationId || 0;
      const f = Formations.find(it => it.id === fid) || Formations[0];
      container.fmtText.text = `阵型: ${f.name}`;

      // 加载头像
      if (!container.avatarSprite && player.avatar) {
          PIXI.Texture.fromURL(player.avatar).then(tex => {
              if (container.destroyed) return;
              const sp = new PIXI.Sprite(tex);
              sp.anchor.set(0.5);
              sp.width = 180;
              sp.height = 180;
              // 圆形遮罩
              const mask = new PIXI.Graphics();
              mask.beginFill(0xffffff);
              mask.drawCircle(0,0,90);
              mask.endFill();
              sp.mask = mask;
              
              container.addChildAt(sp, 1); // 背景之上
              container.addChildAt(mask, 2);
              container.avatarSprite = sp;
          }).catch(()=>{});
      }
  }

  openFormationDialog() {
      // 弹出阵型选择
      // 模式 single_online (只有确认按钮)
      const dialog = new FormationSelectionDialog('single_online', (p1Id) => {
          this.myFormationId = p1Id;
          AccountMgr.updateFormation(p1Id);
          
          // 更新按钮文字
          const f = Formations.find(it => it.id === p1Id) || Formations[0];
          this.formationBtn.label.text = `阵型: ${f.name}`;
          
          // 如果已经准备了，需要重新发送 Ready 消息以同步新阵型
          if (this.isReady) {
              this.sendReady();
          } else {
              // 如果没准备，仅发送一次状态同步（这里借用 READY 消息但 ready=false）
              // 或者后端支持 UPDATE_INFO。目前简化：发送 ready=false 携带新数据
              NetworkMgr.send({
                  type: NetMsg.READY,
                  payload: { ready: false, formationId: this.myFormationId }
              });
          }
      }, () => {});
      
      this.container.addChild(dialog);
  }

  toggleReady() {
      this.isReady = !this.isReady;
      this.sendReady();

      // 更新按钮视觉
      this.readyBtn.bg.clear();
      this.readyBtn.bg.beginFill(this.isReady ? 0xe67e22 : 0x27ae60);
      this.readyBtn.bg.drawRoundedRect(0, 0, 300, 100, 20);
      this.readyBtn.bg.endFill();
      this.readyBtn.label.text = this.isReady ? '取消准备' : '准备';
      
      // 准备时锁定阵型选择？暂不锁定，允许随时改
  }
  
  sendReady() {
      NetworkMgr.send({
          type: NetMsg.READY,
          payload: { 
              ready: this.isReady,
              formationId: this.myFormationId // [新增] 同步阵型
          }
      });
  }

  onNetMessage(msg) {
      if (msg.type === NetMsg.PLAYER_JOINED) {
          if (this.roomId) {
              Platform.setStorage('last_room_id', this.roomId);
          }

          const players = msg.payload.players;
          this.players = players;
          
          if (msg.payload.status === 'PLAYING') {
               this.statusText.text = "检测到对局进行中，正在恢复...";
               this.readyBtn.visible = false;
               this.formationBtn.visible = false;
          } else {
               this.statusText.text = "等待玩家准备...";
               this.statusText.style.fill = 0xaaaaaa;
               this.readyBtn.visible = true; 
               this.formationBtn.visible = true;
          }

          const p1 = players.find(p => p.teamId === 0);
          const p2 = players.find(p => p.teamId === 1);

          this.updatePlayerSlot(this.p1Container, p1);
          this.updatePlayerSlot(this.p2Container, p2);

          const myId = AccountMgr.userInfo.id;
          const me = players.find(p => p.id === myId);
          if (me) {
              this.isReady = me.ready; 
              this.readyBtn.label.text = this.isReady ? '取消准备' : '准备';
              this.readyBtn.bg.clear();
              this.readyBtn.bg.beginFill(this.isReady ? 0xe67e22 : 0x27ae60);
              this.readyBtn.bg.drawRoundedRect(0, 0, 300, 100, 20);
              this.readyBtn.bg.endFill();
              
              // 同步本地阵型ID (如果是刚连入，保持本地配置；如果是重连，使用服务器配置)
              // 这里简化：始终优先显示本地 AccountMgr 的配置，通过 sendReady 同步给服务器
          }
      }
      else if (msg.type === NetMsg.START) {
          const entryFee = GameConfig.gameplay.economy.entryFee;
          if (AccountMgr.userInfo.coins >= entryFee) {
              Platform.showToast(`游戏开始！`);
              setTimeout(() => {
                  SceneManager.changeScene(GameScene, { 
                      mode: 'pvp_online',
                      players: this.players,
                      startTurn: msg.payload.currentTurn 
                  });
              }, 1000);
          } else {
              Platform.showToast("金币不足！无法开始游戏");
              NetworkMgr.close();
              SceneManager.changeScene(LobbyScene);
          }
      }
      else if (msg.type === NetMsg.GAME_RESUME) {
          Platform.showToast('正在恢复对局...');
          setTimeout(() => {
              SceneManager.changeScene(GameScene, {
                  mode: 'pvp_online',
                  players: msg.payload.players,
                  startTurn: msg.payload.currentTurn,
                  snapshot: msg.payload 
              });
          }, 500);
      }
      else if (msg.type === NetMsg.LEAVE) {
          this.statusText.text = "连接已断开";
      }
      else if (msg.type === 'ERROR') {
          console.warn('Room Error:', msg.payload);
          Platform.showToast('连接失败或房间已满');
          this.statusText.text = "连接失败";
          
          setTimeout(() => {
              NetworkMgr.close();
              SceneManager.changeScene(LobbyScene);
          }, 1500);
      }
  }

  onExit() {
      super.onExit();
      EventBus.off(Events.NET_MESSAGE, this.onNetMessage, this);
  }
}
