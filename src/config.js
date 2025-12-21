// 游戏全局配置
export const GameConfig = {
  // 屏幕参考尺寸 (横屏设计稿)
  designWidth: 1920,
  designHeight: 1080,
  
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
    maxDragDistance: 200,    // 最大拖拽瞄准距离
    forceMultiplier: 0.02,   // 力度系数
    turnTimeLimit: 30        // 每回合秒数 (可选)
  },

  // API 地址 (Cloudflare Worker)
  apiBaseUrl: "https://your-worker.your-name.workers.dev"
};