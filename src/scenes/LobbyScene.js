
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

export default class LobbyScene extends BaseScene {
  constructor() {
    super();
    this.inputDisplay = null;
    this.roomNumber = "";
  }

  onEnter() {
    super.onEnter();
    const { designWidth, designHeight } = GameConfig;

    // 1. 背景
    const bg = new PIXI.Graphics();
    bg.beginFill(0x2c3e50);
    bg.drawRect(0, 0, designWidth, designHeight);
    bg.endFill();
    this.container.addChild(bg);

    // 2. 标题
    const title = new PIXI.Text('加入对战', {
        fontFamily: 'Arial', fontSize: 60, fill: 0xffffff, fontWeight: 'bold'
    });
    title.anchor.set(0.5);
    title.position.set(designWidth / 2, 100);
    this.container.addChild(title);

    // 3. 房间号显示框
    this.createInputDisplay(designWidth, designHeight);

    // 4. 数字键盘
    this.createKeypad(designWidth, designHeight);

    // 5. 快速开始按钮 (模拟匹配) & 返回
    const quickBtn = new Button({
        text: '快速匹配', width: 300, height: 80, color: 0x27ae60,
        onClick: () => {
            // 随机生成一个房间号 1000~9999
            const randomRoom = Math.floor(1000 + Math.random() * 9000).toString();
            this.joinRoom(randomRoom);
        }
    });
    quickBtn.position.set(designWidth / 2 - 320, designHeight - 150);
    this.container.addChild(quickBtn);

    const backBtn = new Button({
      text: '返回', width: 300, height: 80, color: 0x95a5a6,
      onClick: () => SceneManager.changeScene(MenuScene)
    });
    backBtn.position.set(designWidth / 2 + 20, designHeight - 150);
    this.container.addChild(backBtn);
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
      const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'CLR', '0', 'GO'];
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
          if (key === 'CLR') color = 0xc0392b;

          const btn = new Button({
              text: key, width: keyW, height: keyH, color: color,
              onClick: () => this.onKeyPress(key)
          });
          
          btn.position.set(startX + col * (keyW + gap), startY + row * (keyH + gap));
          this.container.addChild(btn);
      });
  }

  onKeyPress(key) {
      if (key === 'CLR') {
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
      // 注意：RoomScene 内部会监听 Socket 消息来更新状态
      SceneManager.changeScene(RoomScene, { roomId: roomId });
  }
}
