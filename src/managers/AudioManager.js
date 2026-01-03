
import Platform from './Platform.js';

class AudioManager {
  constructor() {
    this.bgmAudio = null;
    this.sounds = {};
    this.isMuted = false;
  }

  init() {
    console.log('[Audio] Initializing sounds...');
    // 注册基础音效
    this.registerSound('collision', 'assets/sounds/collision.mp3');
    this.registerSound('goal', 'assets/sounds/goal.mp3');
    this.registerSound('win', 'assets/sounds/win.mp3');
    
    // 注册物理碰撞音效
    this.registerSound('hit_ball', 'assets/sounds/hit_ball.mp3');
    this.registerSound('hit_wall', 'assets/sounds/hit_wall.mp3');
    this.registerSound('hit_striker', 'assets/sounds/hit_striker.mp3');
    this.registerSound('hit_post', 'assets/sounds/hit_post.mp3');
  }

  registerSound(key, src) {
    if (Platform.env === 'web') {
        // [新增] Web 环境支持 (使用 HTML5 Audio)
        const audio = new Audio();
        audio.src = src;
        // 预加载
        audio.load(); 
        this.sounds[key] = audio;
        return;
    }
    
    // 小程序环境 (微信/抖音)
    const provider = Platform.getProvider();
    if (provider) {
      const ctx = provider.createInnerAudioContext();
      ctx.src = src;
      this.sounds[key] = ctx;
    }
  }

  playBGM(src) {
    if (this.isMuted) return;
    console.log('[Audio] Play BGM (Not implemented fully)');
  }

  stopBGM() {
    // 停止 BGM
  }

  playSFX(key) {
    if (this.isMuted) return;
    
    const sound = this.sounds[key];
    if (sound) {
      if (Platform.env === 'web') {
          // Web: HTML5 Audio 处理
          // 重置时间以支持快速连点，或者 cloneNode() 支持并发
          if (!sound.paused) {
              sound.currentTime = 0;
          }
          // 处理浏览器自动播放策略限制的报错
          sound.play().catch(e => {
              // 忽略用户未交互前的报错
          });
      } else {
          // MiniGame: InnerAudioContext 处理
          sound.stop();
          sound.play();
      }
    } else {
      // 只有开发模式才打印，避免刷屏
      // console.log(`[Audio] Warning: Sound key '${key}' not found or not loaded.`);
    }
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stopBGM();
  }
}

export default new AudioManager();