
// 场景枚举
export const SceneNames = {
  LOGIN: 'LoginScene',
  MENU: 'MenuScene',
  LOBBY: 'LobbyScene',
  ROOM: 'RoomScene', // 新增
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
  COLLISION_HIT: 'collision_hit', // 物理碰撞产生火花
  NET_MESSAGE: 'net_message' // 网络消息
};

// 网络消息类型
export const NetMsg = {
  JOIN: 'JOIN',       // 加入房间
  PLAYER_JOINED: 'PLAYER_JOINED', // 广播：有人加入
  READY: 'READY',     // 准备/取消准备
  START: 'START',     // 游戏开始
  MOVE: 'MOVE',       // 击球动作
  TURN_SYNC: 'TURN_SYNC', // 回合同步(回合结束时的最终一致性)
  SNAPSHOT: 'SNAPSHOT',   // [新增] 中间状态快照(移动过程中的位置修正)
  GOAL: 'GOAL',       // 进球 (新增)
  GAME_OVER: 'GAME_OVER', // 游戏结束
  ERROR: 'ERROR',     // 错误
  LEAVE: 'LEAVE',      // 离开 (主动发送)
  PLAYER_LEFT_GAME: 'PLAYER_LEFT_GAME', // [新增] 广播：玩家主动离开对局
  PLAYER_OFFLINE: 'PLAYER_OFFLINE', // 玩家掉线/离线通知
  GAME_RESUME: 'GAME_RESUME' // 新增：断线重连恢复游戏
};
