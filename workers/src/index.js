
import { GameRoom } from './gameRoom.js';
// 导出 Durable Object 类
export { GameRoom };
/**
 * 跨域配置头
 */
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400', // 缓存预检结果24小时
};

/**
 * 辅助函数：生成标准响应
 */
const response = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders
    }
  });
};

const generateNickname = () => `Player_${Math.floor(Math.random() * 10000)}`;

// 默认道具配置
const INITIAL_ITEMS = [
  { id: 'super_aim', count: 5 },
  { id: 'super_force', count: 5 },
  { id: 'unstoppable', count: 5 }
];
// 默认主题包含 formationId
const INITIAL_THEME = { striker: 1, field: 1, ball: 1, formationId: 0 };
// 默认解锁内容 (Type: [IDs])
const INITIAL_UNLOCKED = { striker: [1], field: [1], ball: [1], formation: [0] };

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // --- 1. 多人房间相关 ---
      if (path === '/api/room/check' && request.method === 'POST') {
        const { roomId } = await request.json();
        if (!roomId) return response({ error: 'Missing roomId' }, 400);

        const id = env.GAME_ROOM.idFromName(roomId);
        const stub = env.GAME_ROOM.get(id);

        const checkReq = new Request("https://internal/check", { method: 'GET' });
        const doRes = await stub.fetch(checkReq);
        const data = await doRes.json();
        return response(data, doRes.status);
      }

      if (path.startsWith("/api/room/")) {
        const parts = path.split('/');
        const roomId = parts[3];
        const action = parts[4];

        if (!roomId || action !== 'websocket') {
          return new Response("Invalid path", { status: 404 });
        }

        const id = env.GAME_ROOM.idFromName(roomId);
        const stub = env.GAME_ROOM.get(id);

        return stub.fetch(request);
      }

      // --- 2. H5 游客登录 ---
      if (path === '/api/login/h5' && request.method === 'POST') {
        const { deviceId } = await request.json();
        if (!deviceId) return response({ error: 'Missing deviceId' }, 400);

        let user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(deviceId).first();
        let isNewUser = false;

        if (!user) {
          isNewUser = true;
          user = {
            user_id: deviceId,
            platform: 'web',
            nickname: generateNickname(),
            avatar_url: '',
            level: 1,
            coins: 200,
            items: JSON.stringify(INITIAL_ITEMS),
            checkin_history: '[]',
            theme: JSON.stringify(INITIAL_THEME),
            unlocked_themes: JSON.stringify(INITIAL_UNLOCKED)
          };
          
          // [修复] 移除 formation_id, 确保 unlocked_themes 写入
          await env.DB.prepare(
            'INSERT INTO users (user_id, platform, nickname, avatar_url, level, coins, items, checkin_history, theme, unlocked_themes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(user.user_id, user.platform, user.nickname, user.avatar_url, user.level, user.coins, user.items, user.checkin_history, user.theme, user.unlocked_themes).run();

          user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(deviceId).first();
        } else {
          // [老用户] 检查补充字段
          let updateFields = [];
          let updateArgs = [];

          if (!user.items || user.items === '[]') {
            user.items = JSON.stringify(INITIAL_ITEMS);
            updateFields.push("items = ?");
            updateArgs.push(user.items);
          }
          if (!user.checkin_history) {
            user.checkin_history = '[]';
            updateFields.push("checkin_history = ?");
            updateArgs.push(user.checkin_history);
          }
          // [新增] 检查 theme
          if (!user.theme) {
            user.theme = JSON.stringify(INITIAL_THEME);
            updateFields.push("theme = ?");
            updateArgs.push(user.theme);
          }

          // 兼容旧数据补全 unlocked_themes
          if (!user.unlocked_themes) {
            user.unlocked_themes = JSON.stringify(INITIAL_UNLOCKED);
            await env.DB.prepare("UPDATE users SET unlocked_themes = ? WHERE user_id = ?").bind(user.unlocked_themes, deviceId).run();
          }
          if (updateFields.length > 0) {
            updateFields.push("last_login = datetime('now', '+8 hours')");
            updateArgs.push(deviceId); // WHERE user_id = ?
            await env.DB.prepare(`UPDATE users SET ${updateFields.join(', ')} WHERE user_id = ?`)
              .bind(...updateArgs).run();
          } else {
            await env.DB.prepare("UPDATE users SET last_login = datetime('now', '+8 hours') WHERE user_id = ?")
              .bind(deviceId).run();
          }
        }

        return response({ ...user, is_new_user: isNewUser });
      }

      // --- 3. 小游戏登录 (微信/抖音) ---
      if (path === '/api/login/minigame' && request.method === 'POST') {
        const { platform, code, userInfo } = await request.json();
        if (!code || !platform) return response({ error: 'Missing code or platform' }, 400);

        let openId = null;
        if (platform === 'wechat') {
          openId = await fetchWechatSession(code, env);
        } else if (platform === 'douyin') {
          openId = await fetchDouyinSession(code, env);
        }

        if (!openId) openId = `dev_${platform}_${code}`;

        let user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(openId).first();
        let isNewUser = false;
        const newNick = userInfo?.nickName || user?.nickname || generateNickname();
        const newAvatar = userInfo?.avatarUrl || user?.avatar_url || '';

        if (!user) {
          isNewUser = true;
          user = {
            user_id: openId,
            platform: platform,
            nickname: newNick,
            avatar_url: newAvatar,
            level: 1,
            coins: 200,
            items: JSON.stringify(INITIAL_ITEMS),
            checkin_history: '[]',
            theme: JSON.stringify(INITIAL_THEME),
            unlocked_themes: JSON.stringify(INITIAL_UNLOCKED)
            // formation_id 移除，使用 theme.formationId
          };

          // [修复] 移除 formation_id, 确保 unlocked_themes 写入
          await env.DB.prepare(
            'INSERT INTO users (user_id, platform, nickname, avatar_url, level, coins, items, checkin_history, theme, unlocked_themes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(user.user_id, user.platform, user.nickname, user.avatar_url, user.level, user.coins, user.items, user.checkin_history, user.theme, user.unlocked_themes).run();

          user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(openId).first();

        } else {
          // [老用户] 检查补充字段
          let needsUpdate = false;
          let updateSqlParts = ["last_login = datetime('now', '+8 hours')"];
          let updateArgs = [];

          if (!user.items || user.items === '[]') {
            user.items = JSON.stringify(INITIAL_ITEMS);
            updateSqlParts.push("items = ?");
            updateArgs.push(user.items);
            needsUpdate = true;
          }
          if (!user.checkin_history) {
            user.checkin_history = '[]';
            updateSqlParts.push("checkin_history = ?");
            updateArgs.push(user.checkin_history);
            needsUpdate = true;
          }
          // [新增]
          if (!user.theme) {
            user.theme = JSON.stringify(INITIAL_THEME);
            updateSqlParts.push("theme = ?");
            updateArgs.push(user.theme);
            needsUpdate = true;
          }

          if (userInfo && userInfo.nickName) {
            updateSqlParts.push("nickname = ?", "avatar_url = ?");
            updateArgs.push(userInfo.nickName, userInfo.avatarUrl);
            needsUpdate = true;
          }

          if (needsUpdate) {
            updateArgs.push(openId);
            await env.DB.prepare(`UPDATE users SET ${updateSqlParts.join(', ')} WHERE user_id = ?`)
              .bind(...updateArgs).run();

            if (userInfo && userInfo.nickName) {
              user.nickname = userInfo.nickName;
              user.avatar_url = userInfo.avatarUrl;
            }
          } else {
            await env.DB.prepare("UPDATE users SET last_login = datetime('now', '+8 hours') WHERE user_id = ?")
              .bind(openId).run();
          }
        }

        return response({ ...user, is_new_user: isNewUser });
      }

      // --- 4. 更新用户数据 ---
      if (path === '/api/user/update' && request.method === 'POST') {
        const { userId, coins, level, items, checkinHistory, theme, unlockedThemes } = await request.json();

        let sql = 'UPDATE users SET coins = ?, level = ?, items = ?';
        let args = [coins, level, JSON.stringify(items || [])];

        if (checkinHistory !== undefined) {
          sql += ', checkin_history = ?';
          args.push(JSON.stringify(checkinHistory));
        }

        // [修改] 更新 theme (其中包含 formationId)
        if (theme !== undefined) {
          sql += ', theme = ?';
          args.push(JSON.stringify(theme));
          // [移除] 不再单独更新 formation_id 列，因为表结构中没有该列
        }

        // [新增] 更新 unlocked_themes (确保数据库有此列)
        if (unlockedThemes !== undefined) {
            sql += ', unlocked_themes = ?';
            args.push(JSON.stringify(unlockedThemes));
        }

        sql += ' WHERE user_id = ?';
        args.push(userId);

        await env.DB.prepare(sql).bind(...args).run();
        return response({ success: true });
      }

      return response({ error: 'Not Found' }, 404);

    } catch (e) {
      return response({ error: e.message }, 500);
    }
  }
};

async function fetchWechatSession(code, env) {
  if (!env.WX_APP_ID || !env.WX_APP_SECRET) return null;
  const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${env.WX_APP_ID}&secret=${env.WX_APP_SECRET}&js_code=${code}&grant_type=authorization_code`;
  const res = await fetch(url);
  const data = await res.json();
  return data.openid;
}

async function fetchDouyinSession(code, env) {
  if (!env.DY_APP_ID || !env.DY_APP_SECRET) return null;
  const url = `https://developer.toutiao.com/api/apps/v2/jscode2session`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appid: env.DY_APP_ID,
      secret: env.DY_APP_SECRET,
      code: code
    })
  });
  const data = await res.json();
  return data.data?.openid;
}
