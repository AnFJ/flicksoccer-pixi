
import { GameRoom } from './gameRoom.js';
export { GameRoom };

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const response = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
};

const generateNickname = () => `Player_${Math.floor(Math.random() * 10000)}`;

// 默认配置
const INITIAL_ITEMS = [
    { id: 'super_aim', count: 5 },
    { id: 'super_force', count: 5 },
    { id: 'unstoppable', count: 5 }
];
// [修改] 默认主题包含 formationId
const INITIAL_THEME = { striker: 1, field: 1, ball: 1, formationId: 0 };

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (path === '/api/room/check' && request.method === 'POST') {
          const { roomId } = await request.json();
          const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomId));
          const doRes = await stub.fetch(new Request("https://internal/check"));
          return response(await doRes.json(), doRes.status);
      }

      if (path.startsWith("/api/room/")) {
          const roomId = path.split('/')[3]; 
          const stub = env.GAME_ROOM.get(env.GAME_ROOM.idFromName(roomId));
          return stub.fetch(request);
      }

      // --- H5 登录 ---
      if (path === '/api/login/h5' && request.method === 'POST') {
        const { deviceId } = await request.json();
        let user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(deviceId).first();
        
        if (!user) {
          user = {
            user_id: deviceId, platform: 'web', nickname: generateNickname(),
            avatar_url: '', level: 1, coins: 200,
            items: JSON.stringify(INITIAL_ITEMS),
            checkin_history: '[]',
            theme: JSON.stringify(INITIAL_THEME)
          };
          await env.DB.prepare(
            'INSERT INTO users (user_id, platform, nickname, avatar_url, level, coins, items, checkin_history, theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(user.user_id, user.platform, user.nickname, user.avatar_url, user.level, user.coins, user.items, user.checkin_history, user.theme).run();
        } else {
            // 兼容旧数据补全 theme.formationId
            let theme = JSON.parse(user.theme || '{}');
            if (theme.formationId === undefined) {
                theme.formationId = user.formation_id || 0;
                await env.DB.prepare("UPDATE users SET theme = ? WHERE user_id = ?").bind(JSON.stringify(theme), deviceId).run();
            }
        }
        return response({ ...user, is_new_user: false });
      }

      // --- 小游戏登录 ---
      if (path === '/api/login/minigame' && request.method === 'POST') {
        const { platform, code, userInfo } = await request.json();
        let openId = `dev_${platform}_${code}`; // 简化

        let user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(openId).first();
        if (!user) {
          user = {
            user_id: openId, platform, nickname: userInfo?.nickName || generateNickname(),
            avatar_url: userInfo?.avatarUrl || '', level: 1, coins: 200,
            items: JSON.stringify(INITIAL_ITEMS), checkin_history: '[]',
            theme: JSON.stringify(INITIAL_THEME)
          };
          await env.DB.prepare(
            'INSERT INTO users (user_id, platform, nickname, avatar_url, level, coins, items, checkin_history, theme) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
          ).bind(user.user_id, user.platform, user.nickname, user.avatar_url, user.level, user.coins, user.items, user.checkin_history, user.theme).run();
        }
        return response(user);
      }

      // --- 更新数据 ---
      if (path === '/api/user/update' && request.method === 'POST') {
          // [修改] 不再接收独立的 formationId
          const { userId, coins, level, items, checkinHistory, theme } = await request.json();
          let sql = 'UPDATE users SET coins = ?, level = ?, items = ?, last_login = datetime("now", "+8 hours")';
          let args = [coins, level, JSON.stringify(items || [])];

          if (checkinHistory) { sql += ', checkin_history = ?'; args.push(JSON.stringify(checkinHistory)); }
          if (theme) { sql += ', theme = ?'; args.push(JSON.stringify(theme)); }

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
