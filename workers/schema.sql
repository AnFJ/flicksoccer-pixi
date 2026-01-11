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
    match_stats TEXT DEFAULT '{"totalMatches":0,"wins":0,"losses":0}', -- 比赛统计 (JSON 字符串)
    daily_unlocks TEXT DEFAULT '{}'  -- 每日解锁记录 (JSON 字符串)
);
-- 对战记录
CREATE TABLE IF NOT EXISTS match_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    match_type TEXT,
    match_data TEXT,
    created_at DATETIME DEFAULT (datetime('now', '+8 hours'))
)
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
CREATE INDEX IF NOT EXISTS idx_status_created ON room_records(status, created_at DESC);

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_platform ON users(platform);
ALTER TABLE users ADD COLUMN match_stats TEXT;
-- 删除用户
DELETE FROM users WHERE user_id = "oCQN01z3Mhnbmfjt46QnkVz1jw5g";
-- 更新用户信息
UPDATE users SET nickname = "edge笔记本用户" WHERE user_id = "acc7564a-0a69-4137-88b5-754a56d8dbe9";
DELETE FROM users WHERE nickname = "edge笔记本用户";
- [{"id":"super_aim","count":500},{"id":"super_force","count":500},{"id":"unstoppable","count":500}]