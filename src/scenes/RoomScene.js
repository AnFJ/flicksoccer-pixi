
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

export default class RoomScene extends BaseScene {
  constructor() {
    super();
    this.players = [];
    this.readyBtn = null;
    this.isReady = false;
    this.statusText = null;
    
    // UI 容器
    this.p1Container = null;
    this.p2Container = null;
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
            // 主动退出房间，清除重连缓存
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
    this.statusText.position.set(designWidth / 2, designHeight - 250);
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
          container.readyTag.visible = false;
          if (container.avatarSprite) {
              container.removeChild(container.avatarSprite);
              container.avatarSprite = null;
          }
          return;
      }

      container.nameText.text = player.nickname;
      container.readyTag.visible = player.ready;

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

  toggleReady() {
      this.isReady = !this.isReady;
      NetworkMgr.send({
          type: NetMsg.READY,
          payload: { ready: this.isReady }
      });

      // 更新按钮视觉
      this.readyBtn.bg.clear();
      this.readyBtn.bg.beginFill(this.isReady ? 0xe67e22 : 0x27ae60);
      this.readyBtn.bg.drawRoundedRect(0, 0, 300, 100, 20);
      this.readyBtn.bg.endFill();
      this.readyBtn.label.text = this.isReady ? '取消准备' : '准备';
  }

  onNetMessage(msg) {
      // 1. 处理连接成功/状态更新
      if (msg.type === NetMsg.PLAYER_JOINED) {
          // [新增] 成功加入房间，缓存房间号以便重连
          if (this.roomId) {
              Platform.setStorage('last_room_id', this.roomId);
          }

          const players = msg.payload.players;
          this.players = players;
          
          // 如果房间状态是 PLAYING，说明是重连进来的
          if (msg.payload.status === 'PLAYING') {
               this.statusText.text = "检测到对局进行中，正在恢复...";
               this.readyBtn.visible = false;
          } else {
               this.statusText.text = "等待玩家准备...";
               this.statusText.style.fill = 0xaaaaaa;
               this.readyBtn.visible = true; 
          }

          // 根据 teamId 分配位置 (0:左, 1:右)
          const p1 = players.find(p => p.teamId === 0);
          const p2 = players.find(p => p.teamId === 1);

          this.updatePlayerSlot(this.p1Container, p1);
          this.updatePlayerSlot(this.p2Container, p2);

          // 检查自己是哪一个
          const myId = AccountMgr.userInfo.id;
          const me = players.find(p => p.id === myId);
          if (me) {
              this.isReady = me.ready; // 同步状态
              this.readyBtn.label.text = this.isReady ? '取消准备' : '准备';
              // 更新颜色
              this.readyBtn.bg.clear();
              this.readyBtn.bg.beginFill(this.isReady ? 0xe67e22 : 0x27ae60);
              this.readyBtn.bg.drawRoundedRect(0, 0, 300, 100, 20);
              this.readyBtn.bg.endFill();
          }
      }
      // 2. 处理游戏开始
      else if (msg.type === NetMsg.START) {
          const entryFee = GameConfig.gameplay.economy.entryFee;
          // 网络对战开始：只检查金币，扣费在结算时
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
              // 理论上在大厅已经检查过了，这里是为了防止异常
              Platform.showToast("金币不足！无法开始游戏");
              NetworkMgr.close();
              SceneManager.changeScene(LobbyScene);
          }
      }
      // 3. 处理游戏恢复 (重连)
      else if (msg.type === NetMsg.GAME_RESUME) {
          Platform.showToast('正在恢复对局...');
          setTimeout(() => {
              SceneManager.changeScene(GameScene, {
                  mode: 'pvp_online',
                  players: msg.payload.players,
                  startTurn: msg.payload.currentTurn,
                  snapshot: msg.payload // 传递恢复数据
              });
          }, 500);
      }
      // 4. 处理离开/断开
      else if (msg.type === NetMsg.LEAVE) {
          this.statusText.text = "连接已断开";
          // 如果是被动断开，不清除 last_room_id，以便重连
      }
      // 5. 处理错误
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
