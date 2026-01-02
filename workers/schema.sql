DROP TABLE IF EXISTS users;

CREATE TABLE IF NOT EXISTS users (
    user_id TEXT PRIMARY KEY,   -- 唯一标识：H5是UUID，小程序是OpenID
    platform TEXT,              -- 来源：'web', 'wechat', 'douyin'
    nickname TEXT,              -- 昵称
    avatar_url TEXT,            -- 头像链接
    level INTEGER DEFAULT 1,    -- 等级
    coins INTEGER DEFAULT 200,  -- 金币
    items TEXT DEFAULT '[]',    -- 道具列表 (JSON 字符串)
    created_at TEXT DEFAULT (datetime('now', '+8 hours')),         -- 注册时间戳
    last_login TEXT DEFAULT (datetime('now', '+8 hours'))          -- 最后登录时间戳
);

-- 创建索引优化查询
CREATE INDEX IF NOT EXISTS idx_platform ON users(platform);

-- 删除用户
DELETE FROM users WHERE user_id = "oCQN01z3Mhnbmfjt46QnkVz1jw5g";
-- 更新用户信息
UPDATE users SET nickname = "edge笔记本用户" WHERE user_id = "acc7564a-0a69-4137-88b5-754a56d8dbe9";
DELETE FROM users WHERE nickname = "edge笔记本用户";
- [{"id":"super_aim","count":500},{"id":"super_force","count":500},{"id":"unstoppable","count":500}]