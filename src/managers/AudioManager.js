
import Platform from './Platform.js';

class AudioManager {
  constructor() {
    this.bgmAudio = null; // 当前背景音实例
    this.bgmVolume = 0.6; // 背景音标准音量
    this.sounds = {};
    this.isMuted = false;
  }

  async init() {
    console.log('[Audio] Initializing sounds...');
    
    // 1. 本地音频注册
    this.registerSound('collision', 'subpackages/static_assets/assets/sounds/collision.mp3');
    this.registerSound('goal', 'subpackages/static_assets/assets/sounds/goal.mp3');
    this.registerSound('win', 'subpackages/static_assets/assets/sounds/win.mp3');
    
    this.registerSound('hit_ball', 'subpackages/static_assets/assets/sounds/hit_ball.mp3');
    this.registerSound('hit_wall', 'subpackages/static_assets/assets/sounds/hit_wall.mp3');
    this.registerSound('hit_striker', 'subpackages/static_assets/assets/sounds/hit_striker.mp3'); 
    this.registerSound('hit_post', 'subpackages/static_assets/assets/sounds/hit_post.mp3');

    // 碰撞分级音效
    this.registerSound('ball_hit_striker_1', 'subpackages/static_assets/assets/sounds/ball_hit_striker_1.mp3');
    this.registerSound('ball_hit_striker_2', 'subpackages/static_assets/assets/sounds/ball_hit_striker_2.mp3');
    this.registerSound('ball_hit_striker_3', 'subpackages/static_assets/assets/sounds/ball_hit_striker_3.mp3');

    this.registerSound('striker_hit_striker_1', 'subpackages/static_assets/assets/sounds/striker_hit_striker_1.mp3');
    this.registerSound('striker_hit_striker_2', 'subpackages/static_assets/assets/sounds/striker_hit_striker_2.mp3');
    this.registerSound('striker_hit_striker_3', 'subpackages/static_assets/assets/sounds/striker_hit_striker_3.mp3');

    this.registerSound('striker_hit_edge', 'subpackages/static_assets/assets/sounds/striker_hit_edge.mp3');

    this.registerSound('skill_fire', 'subpackages/static_assets/assets/sounds/skill_fire.mp3');
    this.registerSound('skill_lightning', 'subpackages/static_assets/assets/sounds/skill_lightning.mp3');

    // 2. 远程音频注册 (已移至分包)
    const remoteAudios = [
        { key: 'crowd_bg_loop', file: 'crowd_bg_loop.mp3' },
        { key: 'crowd_cheer_1', file: 'crowd_cheer_1.mp3' },
        { key: 'crowd_cheer_2', file: 'crowd_cheer_2.mp3' },
        { key: 'crowd_cheer_3', file: 'crowd_cheer_3.mp3' },
        { key: 'crowd_sigh_1', file: 'crowd_sigh_1.mp3' },
        { key: 'crowd_sigh_2', file: 'crowd_sigh_2.mp3' },
        { key: 'crowd_sigh_3', file: 'crowd_sigh_3.mp3' },
        { key: 'crowd_anticipation_1', file: 'crowd_anticipation_1.mp3' },
        { key: 'crowd_anticipation_2', file: 'crowd_anticipation_2.mp3' }
    ];

    // 处理分包加载
    remoteAudios.forEach((item) => {
        const path = `subpackages/static_assets/assets/remote-sounds/${item.file}`;
        this.registerSound(item.key, path);
    });
  }

  registerSound(key, src) {
    if (!src) return; // 路径为空则跳过

    if (Platform.env === 'web') {
        // Web 环境支持 (使用 HTML5 Audio)
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

  /**
   * 播放循环背景音
   */
  playBGM(key) {
    if (this.isMuted) return;
    this.stopBGM(); // 先停止当前的

    const audio = this.sounds[key];
    if (audio) {
        audio.loop = true;
        // 设置初始音量
        if (typeof audio.volume !== 'undefined') {
            audio.volume = this.bgmVolume; 
        }
        audio.play();
        this.bgmAudio = audio;
    }
  }

  stopBGM() {
    if (this.bgmAudio) {
        // 小程序的 stop, Web 的 pause
        if (this.bgmAudio.stop) this.bgmAudio.stop();
        else if (this.bgmAudio.pause) this.bgmAudio.pause();
        this.bgmAudio = null;
    }
  }

  /**
   * 播放音效
   */
  playSFX(key) {
    if (this.isMuted) return;
    
    const sound = this.sounds[key];
    if (sound) {
      if (Platform.env === 'web') {
          // Web: HTML5 Audio 处理
          // 重置时间以支持快速连点
          if (!sound.paused) {
              sound.currentTime = 0;
          }
          // 确保音量正常 (音效一般满音量)
          sound.volume = 1.0; 
          sound.play().catch(e => {});
      } else {
          // MiniGame: InnerAudioContext 处理
          sound.volume = 1.0;
          sound.stop();
          sound.play();
      }
    }
  }

  /**
   * 播放高潮/加油/预判欢呼，并处理背景音避让 (Ducking)
   * @param {string} specificKey 可选，指定播放某个key，否则随机高潮欢呼
   */
  playClimaxCheer(specificKey = null) {
      if (this.isMuted) return;

      let key = specificKey;
      if (!key) {
          // 默认逻辑：随机选择一个加油欢呼
          const cheerIndex = Math.floor(Math.random() * 3) + 1;
          key = `crowd_cheer_${cheerIndex}`;
      }
      
      const cheerSound = this.sounds[key];
      if (!cheerSound) return;

      console.log(`[Audio] Playing Interaction Sound: ${key}`);

      // 2. 淡出背景音
      this._fadeBGM(0.1, 500); // 500ms 内降到 0.1

      // 3. 播放欢呼
      if (Platform.env === 'web') {
          cheerSound.currentTime = 0;
          cheerSound.volume = 1.0;
          cheerSound.play().catch(()=>{});
          
          // 监听播放结束恢复背景音
          const restore = () => {
              this._fadeBGM(this.bgmVolume, 1000); // 1秒内恢复
              cheerSound.removeEventListener('ended', restore);
          };
          cheerSound.addEventListener('ended', restore);
      } else {
          // 小程序
          cheerSound.volume = 1.0;
          cheerSound.stop();
          cheerSound.play();
          
          const restore = () => {
              this._fadeBGM(this.bgmVolume, 1000);
              if (cheerSound.offEnded) cheerSound.offEnded(restore);
          };
          if (cheerSound.onEnded) cheerSound.onEnded(restore);
      }
  }

  /**
   * 内部方法：淡入淡出背景音
   * @param {number} targetVolume 目标音量
   * @param {number} duration 持续时间 ms
   */
  _fadeBGM(targetVolume, duration) {
      if (!this.bgmAudio) return;
      
      const startVolume = this.bgmAudio.volume !== undefined ? this.bgmAudio.volume : 1;
      const startTime = Date.now();
      
      // 清除旧的 interval
      if (this.fadeInterval) clearInterval(this.fadeInterval);

      this.fadeInterval = setInterval(() => {
          if (!this.bgmAudio) {
              clearInterval(this.fadeInterval);
              return;
          }

          const elapsed = Date.now() - startTime;
          const progress = Math.min(elapsed / duration, 1.0);
          
          // 线性插值
          const newVol = startVolume + (targetVolume - startVolume) * progress;
          
          if (typeof this.bgmAudio.volume !== 'undefined') {
              this.bgmAudio.volume = newVol;
          }

          if (progress >= 1.0) {
              clearInterval(this.fadeInterval);
          }
      }, 50);
  }

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
        this.stopBGM();
    } else {
        // 如果解除静音且之前在游戏场景，可能需要恢复背景音
        // 这里简单处理：让外部调用 playBGM
    }
  }
}

export default new AudioManager();