
// 游戏全局配置
export const GameConfig = {
  // 屏幕参考尺寸 (横屏设计稿 1080*2400)
  designWidth: 2400,
  designHeight: 1080,
  
  // 调试配置 (新增)
  debug: {
    showGoalZones: false,    // 设为 true 可显示球门的物理墙(红)和感应区(黄)
    showPhysicsWalls: false  // 设为 true 可显示球场边界物理墙(青色)
  },
  
  // 尺寸配置 (单位: px, 基于 1080p 高度)
  dimensions: {
    topBarHeight: 100,      // 顶部栏高度
    fieldWidth: 1494,       // 球场长度
    fieldHeight: 926,       // 球场高度
    goalWidth: 107,         // 球门深度 (X轴方向)
    goalOpening: 301,       // 球门开口大小 (Y轴方向/宽度)
    strikerDiameter: 100,   // 棋子直径
    ballDiameter: 41,       // 足球直径
    wallThickness: 100      // 墙壁厚度 (隐形墙)
  },

  // 视觉配置 (新增)
  visuals: {
    strikerThickness: 15,    // 棋子圆柱体厚度 (像素)
    shadowOffset: 5,        // 阴影偏移
    aimLineColorStart: 0x2ecc71, // 瞄准线起始颜色 (绿)
    aimLineColorEnd: 0xe74c3c,   // 瞄准线结束颜色 (红)
    dashedLineColor: 0xffffff    // 后方虚线颜色
  },

  // 物理配置 (手感调整核心区域)
  physics: {
    gravity: { x: 0, y: 0 }, // 俯视视角无重力
    
    // --- 旋转控制 (新增) ---
    strikerFixedRotation: true, // 棋子是否锁定旋转 (true=不转, false=会转)。建议 true，保持头像直立。
    ballFixedRotation: false,   // 足球是否锁定旋转 (true=不转, false=会转)。建议 false，更真实。

    // --- 棋子(Striker)物理参数 ---
    // [手感调整] 阻力从 0.04 降至 0.02。阻力越小，滑行越顺滑。配合力度减小，实现"慢速长距离"。
    frictionAir: 0.016,       
    restitution: 0.8,        // [弹性] 棋子碰撞反弹系数 (0~1)
    strikerDensity: 0.0007,   // [新增] 棋子密度。比足球(0.0025)重，撞击更有力。
    
    // --- 足球(Ball)物理参数 ---
    // [手感调整] 阻力从 0.02 降至 0.01。
    ballFrictionAir: 0.01,  
    ballRestitution: 0.9,    // [弹性] 足球更弹
    ballDensity: 0.0028,      // [密度] 决定质量，质量越小越容易被撞飞

    wallThickness: 100       // 墙壁厚度
  },

  // 玩法规则
  gameplay: {
    maxScore: 2,             // 获胜分数
    
    // --- 瞄准力度参数 ---
    maxDragDistance: 80,    // [力度上限] 瞄准条拉长的最大像素距离
    // [手感调整] 力度系数从 0.011 降至 0.0055。
    // 因为阻力减半了，所以初速度减半也能滑到同样的距离。
    forceMultiplier: 0.0040,   
    
    turnTimeLimit: 30        // 每回合秒数 (可选)
  },

  // API 地址 (Cloudflare Worker)
  apiBaseUrl: "https://your-worker.your-name.workers.dev"
};
