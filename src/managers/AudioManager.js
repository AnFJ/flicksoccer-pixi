
import Platform from './Platform.js';

class AudioManager {
  constructor() {
    this.bgmAudio = null;
    this.sounds = {};
    this.isMuted = false;
  }

  init() {
    // 预加载音效 (示例逻辑，实际需根据 adapter 加载资源)
    // 在小游戏中通常使用 wx.createInnerAudioContext
    this.registerSound('collision', 'assets/sounds/collision.mp3'); // 通用/射门音效
    this.registerSound('goal', 'assets/sounds/goal.mp3');
    this.registerSound('win', 'assets/sounds/win.mp3');
    
    // [新增] 物理碰撞具体音效 (请确保 assets 目录下有对应文件，否则可临时复用 collision.mp3)
    this.registerSound('hit_ball', 'assets/sounds/hit_ball.mp3');       // 足球碰撞棋子
    this.registerSound('hit_wall', 'assets/sounds/hit_wall.mp3');       // 足球碰撞墙壁
    this.registerSound('hit_striker', 'assets/sounds/hit_striker.mp3'); // 棋子互撞
    this.registerSound('hit_post', 'assets/sounds/hit_post.mp3');       // 足球撞门柱
  }

  registerSound(key, src) {
    if (Platform.env === 'web') return; // Web 环境简化处理
    
    // 小程序环境创建音频实例
    const provider = Platform.getProvider();
    if (provider) {
      const ctx = provider.createInnerAudioContext();
      ctx.src = src;
      this.sounds[key] = ctx;
    }
  }

  playBGM(src) {
    if (this.isMuted) return;
    // BGM 逻辑实现
    console.log('[Audio] Play BGM');
  }

  stopBGM() {
    // 停止 BGM
  }

  playSFX(key) {
    if (this.isMuted) return;
    
    if (this.sounds[key]) {
      // 停止并重播，支持密集触发
      this.sounds[key].stop();
      this.sounds[key].play();
    } else {
      console.log(`[Audio] Play SFX: ${key}`);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stopBGM();
  }
}

export default new AudioManager();