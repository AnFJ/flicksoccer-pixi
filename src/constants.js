
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

// 技能枚举
export const SkillType = {
  SUPER_AIM: 'super_aim',       // 超距瞄准
  SUPER_FORCE: 'super_force',   // 大力水手
  UNSTOPPABLE: 'unstoppable'    // 无敌战车
};

// 事件总线事件名
export const Events = {
  TURN_CHANGE: 'turn_change',
  GOAL_SCORED: 'goal_scored',
  GAME_OVER: 'game_over',
  SYNC_STATE: 'sync_state', // 网络同步
  COLLISION_HIT: 'collision_hit', // 物理碰撞产生火花
  NET_MESSAGE: 'net_message', // 网络消息
  SKILL_ACTIVATED: 'skill_activated' // 技能激活
};

// 网络消息类型
export const NetMsg = {
  JOIN: 'JOIN',       // 加入房间
  PLAYER_JOINED: 'PLAYER_JOINED', // 广播：有人加入
  READY: 'READY',     // 准备/取消准备
  START: 'START',     // 游戏开始
  MOVE: 'MOVE',       // 击球动作
  
  // [新增] 瞄准同步消息
  AIM_START: 'AIM_START',   // 开始瞄准
  AIM_UPDATE: 'AIM_UPDATE', // 更新瞄准方向 (低频)
  AIM_END: 'AIM_END',       // 结束瞄准 (取消或发射)

  // [新增] 技能同步
  SKILL: 'SKILL',

  // [新增] 公平竞赛移出同步
  FAIR_PLAY_MOVE: 'FAIR_PLAY_MOVE', 

  // [核心新增] 批量轨迹数据包
  TRAJECTORY_BATCH: 'TRAJECTORY_BATCH', 

  TURN_SYNC: 'TURN_SYNC', // 回合同步(回合结束时的最终一致性)
  SNAPSHOT: 'SNAPSHOT',   // 中间状态快照(移动过程中的位置修正)
  GOAL: 'GOAL',       // 进球
  GAME_OVER: 'GAME_OVER', // 游戏结束
  ERROR: 'ERROR',     // 错误
  LEAVE: 'LEAVE',      // 离开 (主动发送)
  PLAYER_LEFT_GAME: 'PLAYER_LEFT_GAME', // 广播：玩家主动离开对局
  PLAYER_OFFLINE: 'PLAYER_OFFLINE', // 玩家掉线/离线通知
  GAME_RESUME: 'GAME_RESUME' // 断线重连恢复游戏
};
