import path from 'path';

// 游戏全局配置
export const GameConfig = {
  // 屏幕参考尺寸 (横屏设计稿 1080*2400)
  designWidth: 2400,
  designHeight: 1080,
  
  // [新增] 资源配置
  resourceConfig: {
      // 请替换为实际的 CDN 地址，末尾不要带 /
      // H5 开发环境下可以直接指向本地文件夹
      cdnUrl: "https://game.afragin.dpdns.org/flicksoccer/assets-origin" 
  },

  // 调试配置
  debug: {
    showGoalZones: false,    // 设为 true 可显示球门的物理墙(红)和感应区(黄)
    showPhysicsWalls: false  // 设为 true 可显示球场边界物理墙(青色)
  },
  
  // 尺寸配置 (单位: px, 基于 1080p 高度)
  dimensions: {
    topBarHeight: 140,      // [修改] 顶部栏高度增加，容纳更丰富的UI
    fieldWidth: 1494,       // 球场长度
    fieldHeight: 926,       // 球场高度
    goalWidth: 107,         // 球门深度
    goalOpening: 301,       // 球门开口大小
    strikerDiameter: 100,   // 棋子直径
    ballDiameter: 41,       // 足球直径
    wallThickness: 100      // 墙壁厚度
  },

  // 视觉配置
  visuals: {
    strikerThickness: 15,    // 棋子圆柱体厚度
    shadowOffset: 8,         // [修改] 减小阴影偏移 (12 -> 8)，更贴地
    aimLineColorStart: 0x2ecc71, // 瞄准线起始颜色
    aimLineColorEnd: 0xe74c3c,   // 瞄准线结束颜色
    dashedLineColor: 0xffffff,   // 后方虚线颜色
    
    // --- 新增 UI 配色 ---
    ui: {
      topBarBg: 0x2c3e50,      // 顶部栏深色背景
      topBarAccent: 0x34495e,  // 顶部栏装饰色
      scoreBoxBg: 0xecf0f1,    // 计分板背景 (亮色)
      scoreText: 0x2c3e50,     // 分数文字颜色 (深色)
      menuBtnColor: 0x27ae60,  // 菜单按钮绿色
      menuBtnShadow: 0x1e8449, // 菜单按钮阴影色
      adBoardColors: [0xf1c40f, 0x3498db, 0xe74c3c], // 广告牌随机色
      // 场景内广告牌配置 (互推/自家广告) - H5 或加载失败时显示
      adBoardConfig: [
          {
              imageUrl: "https://youke2.picui.cn/s1/2025/12/26/694e3dc16f5a9.png",
              targetAppId: "", // 点击跳转的小程序AppID (留空则不跳转)
              path: ""         // 跳转路径
          },
          {
              imageUrl: "https://youke2.picui.cn/s1/2025/12/26/694e3dc15fce2.png",
              targetAppId: "",
              path: ""
          }
      ]
    }
  },

  // 物理配置
  physics: {
    gravity: { x: 0, y: 0 }, 
    
    strikerFixedRotation: true, 
    ballFixedRotation: true,  

    // [优化] 低速急停配置 - 调整参数以减少卡顿感
    stoppingFriction: {
        enabled: true,
        threshold: 1.6,      // [提高] 从 0.5 提到 3.0，让阻尼更早介入，解决"低速无限滑"
        damping: 0.92,       // [提高] 阻尼系数稍微温和一点 (原 0.90)，配合高阈值
        minSpeed: 0.12       // [提高] 强制静止的阈值 (原 0.08)，更早切断速度
    },

    frictionAir: 0.016,       
    restitution: 0.8,        
    strikerDensity: 0.0007,   
    
    ballFrictionAir: 0.014,  // [提高] 从 0.01 提到 0.025，模拟草地摩擦，防止太滑
    ballRestitution: 0.9,    
    ballDensity: 0.0028,      

    wallFriction: 0.0,       
    // [新增] 墙壁静摩擦力设为0。MatterJS 默认为 0.5，这会导致球贴墙时被"粘住"。
    wallFrictionStatic: 0.05, 
    wallRestitution: 1.0,    
    wallThickness: 100       
  },

  // 玩法规则
  gameplay: {
    maxScore: 2,             
    maxDragDistance: 160,      // [修改] 增加一倍 (80 -> 160)，让瞄准线更长
    forceMultiplier: 0.0030,   // [修改] 减半 (0.0040 -> 0.0020)，保持最大力度不变
    turnTimeLimit: 60,
    
    // [新增] 技能配置
    // unlockLevel: 对应技能解锁所需的玩家等级
    skills: {
        // [修改] 配合奖励节奏: Level 3 解锁瞄准
        superAim: { bounces: 3, distance: 2000, unlockLevel: 3 },
        // [修改] 配合奖励节奏: Level 10 解锁大力
        superForce: { multiplier: 2.5, unlockLevel: 10 },
        // [修改] 配合奖励节奏: Level 7 解锁战车
        unstoppable: { duration: 3000, unlockLevel: 7 }
    },

    // [新增] 经济系统配置
    economy: {
        entryFee: 50,    // 入场费
        winReward: 100   // 胜利奖励
    }
  },

  // [新增] 网络同步配置
  network: {
      snapshotInterval: 50, // 旧的快照间隔 (保留兼容)
      aimSyncInterval: 100, // 拖拽瞄准线同步间隔 (ms)
      
      // [核心新增] 轨迹回放配置
      trajectorySendInterval: 100, // 发送端：每多少毫秒打包发送一次轨迹数据包
      replayBufferTime: 500,       // 接收端：开始播放前需要缓冲的时间 (ms)
  },

  // [修改] 平台广告ID配置 (数组对应左右两个广告位)
  // rewardedVideo: 激励视频广告ID (Coins, Aim, Unstoppable, Force, ThemeTypes)
  adConfig: {
      web: {
          banners: ['adunit-66e3cd5a02de9eab', 'adunit-4def66cc33414e78'],
          rewardedVideo: {
              coins: 'adunit-26a38148682bce5a',
              super_aim: 'adunit-0d8e4a176de1bc31',
              unstoppable: 'adunit-bc43ef817678099c',
              super_force: 'adunit-8aa62d2e44801ab1',
              // [新增] 主题解锁广告ID
              theme_striker: 'adunit-88bdd3cb911f5642',
              theme_field: 'adunit-80528d8bc18b8441',
              theme_ball: 'adunit-6b851044132039f5',
              theme_formation: 'adunit-342edcf7c048abe3',
              // [新增] 模式解锁
              unlock_mode: 'adunit-mode-unlock-placeholder' // 请替换为真实ID
          }
      },
      wechat: {
          banners: ['adunit-66e3cd5a02de9eab', 'adunit-4def66cc33414e78'],
          rewardedVideo: {
              coins: 'adunit-26a38148682bce5a',
              super_aim: 'adunit-0d8e4a176de1bc31',
              unstoppable: 'adunit-bc43ef817678099c',
              super_force: 'adunit-8aa62d2e44801ab1',
              // [新增] 主题解锁广告ID
              theme_striker: 'adunit-88bdd3cb911f5642',
              theme_field: 'adunit-80528d8bc18b8441',
              theme_ball: 'adunit-6b851044132039f5',
              theme_formation: 'adunit-342edcf7c048abe3',
              // [新增] 模式解锁
              unlock_mode: 'adunit-mode-unlock-placeholder' // 请替换为真实ID
          }
      },
      douyin: {
          banners: ['adunit-left-placeholder', 'adunit-right-placeholder'],
          rewardedVideo: {
              coins: 'adunit-dy-coins',
              super_aim: 'adunit-dy-aim',
              unstoppable: 'adunit-dy-car',
              super_force: 'adunit-dy-force',
              // [新增] 主题解锁广告ID
              theme_striker: 'adunit-dy-striker',
              theme_field: 'adunit-dy-field',
              theme_ball: 'adunit-dy-ball',
              theme_formation: 'adunit-dy-formation',
              // [新增] 模式解锁
              unlock_mode: 'adunit-mode-unlock-placeholder'
          }
      }
  },

  // API 地址
  apiBaseUrl: "https://flicksoccer.afragin.dpdns.org"
};