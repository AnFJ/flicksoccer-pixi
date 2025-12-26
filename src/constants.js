
// 场景枚举
export const SceneNames = {
  LOGIN: 'LoginScene',
  MENU: 'MenuScene',
  LOBBY: 'LobbyScene',
  GAME: 'GameScene'
};

// 物理碰撞分类 (Bit Mask)
export const CollisionCategory = {
  DEFAULT: 0x0001,
  WALL: 0x0002,
  STRIKER: 0x0004, // 球员棋子
  BALL: 0x0008,    // 足球
  GOAL: 0x0010     // 进球感应区
};

// 队伍枚举
export const TeamId = {
  LEFT: 0,  // 红方 (左侧/下方)
  RIGHT: 1  // 蓝方 (右侧/上方)
};

// 事件总线事件名
export const Events = {
  TURN_CHANGE: 'turn_change',
  GOAL_SCORED: 'goal_scored',
  GAME_OVER: 'game_over',
  SYNC_STATE: 'sync_state', // 网络同步
  COLLISION_HIT: 'collision_hit' // 新增：物理碰撞产生火花
};
