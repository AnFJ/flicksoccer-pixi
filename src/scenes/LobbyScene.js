
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import RoomScene from './RoomScene.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import Platform from '../managers/Platform.js';
import RoomListDialog from '../ui/RoomListDialog.js'; // [新增]

export default class LobbyScene extends BaseScene {
  constructor() {
    super();
    this.inputDisplay = null;
    this.roomNumber = "";
    this.loadingText = null;
    this.isUIInitialized = false; // 防止重复初始化
  }

  async onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    // 1. 基础背景 (始终显示)
    const bg = new PIXI.Graphics();
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    // 2. 标题 (始终显示)
    const title = new PIXI.Text('加入对战', {
        fontFamily: 'Arial', fontSize: 60, fill: 0xffffff, fontWeight: 'bold'
    });
    title.anchor.set(0.5);
    title.position.set(designWidth / 2, 100);
    this.container.addChild(title);

    // 3. 显示临时加载状态
    this.loadingText = new PIXI.Text('正在检测对局状态...', {
        fontFamily: 'Arial', fontSize: 36, fill: 0xAAAAAA
    });
    this.loadingText.anchor.set(0.5);
    this.loadingText.position.set(designWidth / 2, designHeight / 2);
    this.container.addChild(this.loadingText);

    // 4. 执行检查逻辑
    await this.checkAndInit(designWidth, designHeight);
  }

  async checkAndInit(w, h) {
      const lastRoomId = Platform.getStorage('last_room_id');
      let foundActiveSession = false;
      
      if (lastRoomId) {
          console.log(`[Lobby] Found last room: ${lastRoomId}, checking status...`);
          try {
              const res = await NetworkMgr.checkRoomStatus(lastRoomId);
              
              // 状态为 PLAYING 或 WAITING (如果不满员) 都提示重连
              // 这里主要针对 PLAYING 状态
              if (res && res.exists && (res.status === 'PLAYING' || res.status === 'WAITING')) {
                  foundActiveSession = true;
                  
                  // 隐藏加载文字
                  if (this.loadingText) this.loadingText.visible = false;
                  
                  // 弹出确认框
                  this.showRejoinDialog(w, h, lastRoomId);
              } else {
                  // 房间已结束或无效，清除缓存
                  Platform.removeStorage('last_room_id');
                  console.log('[Lobby] Previous room invalid or ended.');
              }
          } catch (e) {
              console.warn('[Lobby] Check room failed', e);
              // 网络错误也当作没对局处理，或者保留ID下次再试？
              // 这里选择为了体验流畅，如果检测失败就进入普通大厅，但不清除ID
          }
      }

      // 如果没有发现活跃对局（或已处理完毕），且 UI 还没初始化，则初始化正常大厅
      if (!foundActiveSession) {
          this.initNormalLobby(w, h);
      }
  }

  /**
   * 显示重连确认对话框
   */
  showRejoinDialog(w, h, roomId) {
      const dialog = new PIXI.Container();
      
      // 1. 全屏遮罩 (阻挡点击)
      const overlay = new PIXI.Graphics();
      overlay.beginFill(0x000000, 0.7);
      overlay.drawRect(0, 0, w, h);
      overlay.interactive = true; // 吞噬点击事件
      dialog.addChild(overlay);

      // 2. 对话框背景
      const boxW = 800;
      const boxH = 500;
      const box = new PIXI.Graphics();
      box.beginFill(0xFFFFFF);
      box.drawRoundedRect(-boxW/2, -boxH/2, boxW, boxH, 30);
      box.endFill();
      box.position.set(w/2, h/2);
      dialog.addChild(box);

      // 3. 提示文字
      const titleText = new PIXI.Text('发现未完成对局', {
          fontFamily: 'Arial', fontSize: 50, fill: 0x333333, fontWeight: 'bold'
      });
      titleText.anchor.set(0.5);
      titleText.position.set(0, -120);
      box.addChild(titleText);

      const msgText = new PIXI.Text(`房间号：${roomId}\n是否重新进入游戏？`, {
          fontFamily: 'Arial', fontSize: 40, fill: 0x666666, align: 'center', lineHeight: 60
      });
      msgText.anchor.set(0.5);
      msgText.position.set(0, 0);
      box.addChild(msgText);

      // 4. 按钮
      // 计算居中位置
      const btnWidth = 280;
      const gap = 40;
      // 两个按钮总宽 = 280*2 + 40 = 600
      // 左边按钮起始 x = -300
      
      // 确认按钮 (绿色)
      const confirmBtn = new Button({
          text: '继续游戏', width: btnWidth, height: 90, color: 0x2ecc71,
          onClick: () => {
              // 移除对话框
              this.container.removeChild(dialog);
              // 进入房间
              this.joinRoom(roomId);
          }
      });
      confirmBtn.position.set(-300, 120); // [修改] 上调至 120 (原150)，增加底部留白
      box.addChild(confirmBtn);

      // 取消按钮 (红色/灰色)
      const cancelBtn = new Button({
          text: '放弃', width: btnWidth, height: 90, color: 0x95a5a6,
          onClick: () => {
              // 1. 清除本地缓存
              Platform.removeStorage('last_room_id');
              // 2. 移除对话框
              this.container.removeChild(dialog);
              // 3. 初始化正常大厅 UI
              this.initNormalLobby(w, h);
          }
      });
      cancelBtn.position.set(20, 120); // [修改] 上调至 120
      box.addChild(cancelBtn);

      this.container.addChild(dialog);
  }

  /**
   * 初始化正常的大厅 UI (输入框、键盘、按钮)
   */
  initNormalLobby(designWidth, designHeight) {
      if (this.isUIInitialized) return;
      this.isUIInitialized = true;

      // 移除加载文字
      if (this.loadingText) {
          this.container.removeChild(this.loadingText);
          this.loadingText = null;
      }

      // 1. 房间号显示框
      this.createInputDisplay(designWidth, designHeight);

      // 2. 数字键盘
      this.createKeypad(designWidth, designHeight);

      // 3. 按钮区域
      const btnY = designHeight - 150;
      
      // 快速创建按钮
      const quickBtn = new Button({
          text: '快速创建', width: 240, height: 80, color: 0x27ae60,
          onClick: () => {
              const randomRoom = Math.floor(1000 + Math.random() * 9000).toString();
              this.joinRoom(randomRoom);
          }
      });
      quickBtn.position.set(designWidth / 2 - 380, btnY);
      this.container.addChild(quickBtn);

      // [新增] 查看房间列表按钮
      const listBtn = new Button({
          text: '房间列表', width: 240, height: 80, color: 0xe67e22,
          onClick: () => {
              this.openRoomListDialog();
          }
      });
      listBtn.position.set(designWidth / 2 - 120, btnY);
      this.container.addChild(listBtn);

      // 返回按钮
      const backBtn = new Button({
        text: '返回', width: 240, height: 80, color: 0x95a5a6,
        onClick: () => SceneManager.changeScene(MenuScene)
      });
      backBtn.position.set(designWidth / 2 + 140, btnY);
      this.container.addChild(backBtn);
  }

  // [新增] 打开房间列表弹窗
  openRoomListDialog() {
      const dialog = new RoomListDialog(
          // On Join
          (roomId) => {
              this.joinRoom(roomId);
          },
          // On Close
          () => {}
      );
      this.container.addChild(dialog);
  }

  createInputDisplay(w, h) {
      const boxW = 500;
      const boxH = 100;
      const y = 220;

      const bg = new PIXI.Graphics();
      bg.beginFill(0xffffff);
      bg.drawRoundedRect(-boxW/2, -boxH/2, boxW, boxH, 15);
      bg.endFill();
      bg.position.set(w/2, y);
      this.container.addChild(bg);

      this.inputDisplay = new PIXI.Text('请输入4位房号', {
          fontFamily: 'Arial', fontSize: 50, fill: 0x999999, letterSpacing: 10
      });
      this.inputDisplay.anchor.set(0.5);
      this.inputDisplay.position.set(w/2, y);
      this.container.addChild(this.inputDisplay);
  }

  createKeypad(w, h) {
      const startY = 320;
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '清空', '0', 'GO'];
      const keyW = 180;
      const keyH = 100;
      const gap = 20;
      
      const gridW = keyW * 3 + gap * 2;
      const startX = (w - gridW) / 2;

      keys.forEach((key, index) => {
          const row = Math.floor(index / 3);
          const col = index % 3;
          
          let color = 0x34495e;
          if (key === 'GO') color = 0x2980b9;
          if (key === '清空') color = 0xc0392b;

          const btn = new Button({
              text: key, width: keyW, height: keyH, color: color,
              onClick: () => this.onKeyPress(key)
          });
          
          btn.position.set(startX + col * (keyW + gap), startY + row * (keyH + gap));
          this.container.addChild(btn);
      });
  }

  onKeyPress(key) {
      if (key === '清空') {
          this.roomNumber = "";
      } else if (key === 'GO') {
          if (this.roomNumber.length === 4) {
              this.joinRoom(this.roomNumber);
          } else {
              Platform.showToast('请输入4位房间号');
          }
          return;
      } else {
          if (this.roomNumber.length < 4) {
              this.roomNumber += key;
          }
      }
      
      // 更新显示
      if (this.roomNumber.length > 0) {
          this.inputDisplay.text = this.roomNumber;
          this.inputDisplay.style.fill = 0x333333;
      } else {
          this.inputDisplay.text = "请输入4位房号";
          this.inputDisplay.style.fill = 0x999999;
      }
  }

  joinRoom(roomId) {
      const user = AccountMgr.userInfo;
      Platform.showToast(`正在进入房间 ${roomId}...`);
      
      // 1. 发起 Socket 连接
      NetworkMgr.connectRoom(roomId, user.id, user);

      // 2. 跳转到房间等待场景 (传入 roomId)
      SceneManager.changeScene(RoomScene, { roomId: roomId });
  }
}
