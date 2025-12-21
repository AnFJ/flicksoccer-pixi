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
    goalOpening: 201,       // 球门开口大小 (Y轴方向/宽度)
    strikerDiameter: 100,   // 棋子直径
    ballDiameter: 41,       // 足球直径
    wallThickness: 100      // 墙壁厚度 (隐形墙)
  },

  // 物理配置
  physics: {
    gravity: { x: 0, y: 0 }, // 俯视视角无重力
    frictionAir: 0.02,       // 模拟草地摩擦力
    restitution: 0.8,        // 碰撞弹性
    wallThickness: 100       // 墙壁厚度
  },

  // 玩法规则
  gameplay: {
    maxScore: 2,             // 获胜分数
    maxDragDistance: 250,    // 最大拖拽瞄准距离 (稍微调大以适应大屏)
    forceMultiplier: 0.02,   // 力度系数
    turnTimeLimit: 30        // 每回合秒数 (可选)
  },

  // API 地址 (Cloudflare Worker)
  apiBaseUrl: "https://your-worker.your-name.workers.dev"
};