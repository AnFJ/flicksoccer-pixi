
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
    this.registerSound('collision', 'assets/sounds/collision.mp3');
    this.registerSound('goal', 'assets/sounds/goal.mp3');
    this.registerSound('win', 'assets/sounds/win.mp3');
    
    this.registerSound('hit_ball', 'assets/sounds/hit_ball.mp3');
    this.registerSound('hit_wall', 'assets/sounds/hit_wall.mp3');
    this.registerSound('hit_striker', 'assets/sounds/hit_striker.mp3'); 
    this.registerSound('hit_post', 'assets/sounds/hit_post.mp3');

    // 碰撞分级音效
    this.registerSound('ball_hit_striker_1', 'assets/sounds/ball_hit_striker_1.mp3');
    this.registerSound('ball_hit_striker_2', 'assets/sounds/ball_hit_striker_2.mp3');
    this.registerSound('ball_hit_striker_3', 'assets/sounds/ball_hit_striker_3.mp3');

    this.registerSound('striker_hit_striker_1', 'assets/sounds/striker_hit_striker_1.mp3');
    this.registerSound('striker_hit_striker_2', 'assets/sounds/striker_hit_striker_2.mp3');
    this.registerSound('striker_hit_striker_3', 'assets/sounds/striker_hit_striker_3.mp3');

    this.registerSound('striker_hit_edge', 'assets/sounds/striker_hit_edge.mp3');

    this.registerSound('skill_fire', 'assets/sounds/skill_fire.mp3');
    this.registerSound('skill_lightning', 'assets/sounds/skill_lightning.mp3');

    // 2. 远程音频注册 (需先下载/获取路径)
    // 定义远程文件列表
    const remoteAudios = [
        { key: 'crowd_bg_loop', file: 'crowd_bg_loop.mp3' },
        { key: 'crowd_cheer_1', file: 'crowd_cheer_1.mp3' },
        { key: 'crowd_cheer_2', file: 'crowd_cheer_2.mp3' },
        { key: 'crowd_cheer_3', file: 'crowd_cheer_3.mp3' },
        { key: 'crowd_sigh_1', file: 'crowd_sigh_1.mp3' }, // 假设这些也可能被移到远程，如果还在本地请保留在上方
        { key: 'crowd_sigh_2', file: 'crowd_sigh_2.mp3' },
        { key: 'crowd_sigh_3', file: 'crowd_sigh_3.mp3' },
        { key: 'crowd_anticipation_1', file: 'crowd_anticipation_1.mp3' },
        { key: 'crowd_anticipation_2', file: 'crowd_anticipation_2.mp3' }
    ];

    // 本地可能还保留的
    // 如果这些也被移走了，请将其移动到 remoteAudios 列表，这里为了演示，只处理您明确提到的几个
    // 注意：您提到的 'cowd' 应该是 'crowd' 的笔误，这里使用 crowd
    
    // 处理远程加载
    await Promise.all(remoteAudios.map(async (item) => {
        const path = await Platform.loadRemoteAsset(item.file);
        this.registerSound(item.key, path);
    }));
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