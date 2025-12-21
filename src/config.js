// 游戏全局配置
export const GameConfig = {
  // 屏幕参考尺寸 (横屏设计稿 1080*2400)
  designWidth: 2400,
  designHeight: 1080,
  
  // 尺寸配置 (单位: px, 基于 1080p 高度)
  dimensions: {
    topBarHeight: 100,      // 顶部栏高度
    fieldWidth: 1824,       // 球场长度
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
    shadowOffset: 10,        // 阴影偏移
    aimLineColorStart: 0x2ecc71, // 瞄准线起始颜色 (绿)
    aimLineColorEnd: 0xe74c3c,   // 瞄准线结束颜色 (红)
    dashedLineColor: 0xffffff    // 后方虚线颜色
  },

  // 物理配置 (手感调整核心区域)
  physics: {
    gravity: { x: 0, y: 0 }, // 俯视视角无重力
    
    // --- 棋子(Striker)物理参数 ---
    frictionAir: 0.04,       // [阻尼] 棋子空气摩擦力 (数值越大减速越快，建议 0.01~0.05)
    restitution: 0.8,        // [弹性] 棋子碰撞反弹系数 (0~1)
    
    // --- 足球(Ball)物理参数 ---
    ballFrictionAir: 0.02,  // [阻尼] 足球空气摩擦力 (通常比棋子滑得稍微远一点，所以数值稍小)
    ballRestitution: 0.9,    // [弹性] 足球更弹
    ballDensity: 0.0025,      // [密度] 决定质量，质量越小越容易被撞飞

    wallThickness: 100       // 墙壁厚度
  },

  // 玩法规则
  gameplay: {
    maxScore: 2,             // 获胜分数
    
    // --- 瞄准力度参数 ---
    maxDragDistance: 80,    // [力度上限] 瞄准条拉长的最大像素距离
    forceMultiplier: 0.011,   // [力度系数] 像素距离转换为物理力的倍率 (如果你觉得球踢不动，把这个调大，比如 0.025 或 0.03)
    
    turnTimeLimit: 30        // 每回合秒数 (可选)
  },

  // API 地址 (Cloudflare Worker)
  apiBaseUrl: "https://your-worker.your-name.workers.dev"
};