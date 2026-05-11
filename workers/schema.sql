DROP TABLE IF EXISTS users;
-- 用户
CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,   -- 唯一标识：H5是UUID，小程序是OpenID
    platform TEXT,              -- 来源：'web', 'wechat', 'douyin'
    nickname TEXT,              -- 昵称
    avatar_url TEXT,            -- 头像链接
    theme TEXT DEFAULT '{"striker":1,"field":1,"ball":1,"formationId":0}', -- 主题 (JSON 字符串)
    unlocked_themes TEXT DEFAULT '[]',  -- 解锁的主题列表 (JSON 字符串)
    level INTEGER DEFAULT 1,    -- 等级
    coins INTEGER DEFAULT 200,  -- 金币
    items TEXT DEFAULT '[]',    -- 道具列表 (JSON 字符串)
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),         -- 注册时间戳
    last_login TEXT DEFAULT (datetime('now', '+8 hours')),          -- 最后登录时间戳
    checkin_history TEXT DEFAULT '[]',  -- 签到历史 (JSON 字符串)
    match_stats TEXT DEFAULT '{"total_pve":0,"total_local":0,"total_online":0,"wins":0,"losses":0}', -- 比赛统计 (JSON 字符串)
    daily_unlocks TEXT DEFAULT '{}',  -- 每日解锁记录 (JSON 字符串)
    scene TEXT                  -- 场景值 (注册时)
);

-- 对战记录
CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    match_type TEXT,
    match_data TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- 房间记录
CREATE TABLE IF NOT EXISTS room_records (
    room_id TEXT PRIMARY KEY,
    status INTEGER DEFAULT 0, -- 0: WAITING, 1: PLAYING
    host_info TEXT, -- JSON string {nickname, avatar, level, id}
    guest_info TEXT, -- JSON string
    match_count INTEGER DEFAULT 0,
    created_at INTEGER,
    updated_at INTEGER
);

-- 广告观看记录
CREATE TABLE IF NOT EXISTS ad_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,               -- 用户ID
    nickname TEXT,              -- 玩家名称
    ad_unit_id TEXT,            -- 广告位ID
    ad_unit_name TEXT,          -- 广告位名称
    ad_type TEXT,               -- 广告类型：interstitial, rewardedVideo, banner
    is_completed INTEGER DEFAULT 0, -- 激励视频是否完成观看 (0:否, 1:是)
    is_clicked INTEGER DEFAULT 0,   -- 是否点击广告 (0:否, 1:是)
    watch_time INTEGER,         -- 观看时长 (秒)
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')) -- 观看时间
);

-- 用户行为记录
CREATE TABLE IF NOT EXISTS user_behavior (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,               -- 用户ID
    nickname TEXT,              -- 用户昵称
    enter_time INTEGER,         -- 进入游戏时间戳
    leave_time INTEGER,         -- 离开游戏时间戳
    actions TEXT,               -- 行为列表 (JSON 字符串)
    created_at DATETIME DEFAULT (datetime('now', '+8 hours')) -- 记录创建时间
);

-- 5. 统计与缓存优化表

-- 全局概况统计 (多列并行，减少写入行数)
-- key 格式: 'reg:{date}', 'active:{date}', 'cumulative', 'scene:{scene_id}'
CREATE TABLE IF NOT EXISTS global_stats (
    stat_key TEXT PRIMARY KEY,
    wechat_val INTEGER DEFAULT 0,
    douyin_val INTEGER DEFAULT 0,
    web_val INTEGER DEFAULT 0,
    total_val INTEGER DEFAULT 0,
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours'))
);

-- 排行榜缓存 (手动刷新)
-- ranking_type: 'pve', 'local', 'online'
CREATE TABLE IF NOT EXISTS leaderboard_cache (
    ranking_type TEXT,
    rank_index INTEGER,
    data TEXT,
    updated_at DATETIME DEFAULT (datetime('now', '+8 hours')),
    PRIMARY KEY (ranking_type, rank_index)
);

-- === 性能优化：核心索引 (精简版，以节省写入额度) ===

-- 1. match_history (仅保留用户ID索引，用于客户端查询自己的战绩)
CREATE INDEX IF NOT EXISTS idx_match_history_user_id ON match_history(user_id);

-- 2. users (仅保留昵称索引，用于后台搜索用户)
CREATE INDEX IF NOT EXISTS idx_users_nickname ON users(nickname);

-- 3. 其他辅助索引 (保留状态索引，用于匹配房间查询)
CREATE INDEX IF NOT EXISTS idx_status_created ON room_records(status, created_at DESC);


DROP INDEX IF EXISTS idx_users_level;
DROP INDEX IF EXISTS idx_users_last_login;
DROP INDEX IF EXISTS idx_users_created_at;
DROP INDEX IF EXISTS idx_users_platform;
DROP INDEX IF EXISTS idx_users_ranking_pve;
DROP INDEX IF EXISTS idx_users_ranking_local;
DROP INDEX IF EXISTS idx_users_ranking_online;
DROP INDEX IF EXISTS idx_match_history_created_at;
DROP INDEX IF EXISTS idx_match_history_type;
DROP INDEX IF EXISTS idx_ad_user_created;
DROP INDEX IF EXISTS idx_behavior_user_created;


DELETE FROM users WHERE user_id = "oCQN01z3Mhnbmfjt46QnkVz1jw5g";
-- 更新用户信息
UPDATE users SET nickname = "edge笔记本用户" WHERE user_id = "acc7564a-0a69-4137-88b5-754a56d8dbe9";
DELETE FROM users WHERE nickname = "edge笔记本用户";
- [{"id":"super_aim","count":500},{"id":"super_force","count":500},{"id":"unstoppable","count":500}]

-- 1. 累计注册用户总数 (cumulative)
INSERT INTO global_stats (stat_key, wechat_val, douyin_val, web_val, total_val) 
VALUES ('cumulative', 1428, 1895, 8, 3329)
ON CONFLICT(stat_key) DO UPDATE SET 
    wechat_val=excluded.wechat_val, 
    douyin_val=excluded.douyin_val, 
    web_val=excluded.web_val, 
    total_val=excluded.total_val;

INSERT INTO global_stats (stat_key, wechat_val, douyin_val, web_val, total_val) 
VALUES ('reg:2026-05-11', 5, 269, 0, 272)
ON CONFLICT(stat_key) DO UPDATE SET 
    wechat_val=excluded.wechat_val, 
    douyin_val=excluded.douyin_val, 
    web_val=excluded.web_val, 
    total_val=excluded.total_val;

INSERT INTO global_stats (stat_key, wechat_val, douyin_val, web_val, total_val) 
VALUES ('active:2026-05-11', 10, 280, 0, 288)
ON CONFLICT(stat_key) DO UPDATE SET 
    wechat_val=excluded.wechat_val, 
    douyin_val=excluded.douyin_val, 
    web_val=excluded.web_val, 
    total_val=excluded.total_val;

INSERT INTO global_stats (stat_key, wechat_val, douyin_val, web_val, total_val) 
VALUES ('reg:2026-05-10', 12, 146, 0, 158)
ON CONFLICT(stat_key) DO UPDATE SET 
    wechat_val=excluded.wechat_val, 
    douyin_val=excluded.douyin_val, 
    web_val=excluded.web_val, 
    total_val=excluded.total_val;

INSERT INTO global_stats (stat_key, wechat_val, douyin_val, web_val, total_val) 
VALUES ('active:2026-05-10', 16, 164, 1, 181)
ON CONFLICT(stat_key) DO UPDATE SET 
    wechat_val=excluded.wechat_val, 
    douyin_val=excluded.douyin_val, 
    web_val=excluded.web_val, 
    total_val=excluded.total_val;