
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

/**
 * 辅助函数：生成随机昵称
 */
const generateNickname = () => `Player_${Math.floor(Math.random() * 10000)}`;

export default {
  async fetch(request, env, ctx) {
    // 处理预检请求 (CORS)
    if (request.method === 'OPTIONS') {
      // 预检请求直接返回 204 No Content，且不带 body
      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // --- 1. H5 游客登录 ---
      if (path === '/api/login/h5' && request.method === 'POST') {
        const { deviceId } = await request.json();
        if (!deviceId) return response({ error: 'Missing deviceId' }, 400);

        // 查询用户
        let user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(deviceId).first();
        let isNewUser = false;

        if (!user) {
          isNewUser = true;
          // 注册新用户
          user = {
            user_id: deviceId,
            platform: 'web',
            nickname: generateNickname(),
            avatar_url: '',
            level: 1,
            coins: 200,
            items: '[]'
          };

          await env.DB.prepare(
            'INSERT INTO users (user_id, platform, nickname, avatar_url, level, coins, items) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(user.user_id, user.platform, user.nickname, user.avatar_url, user.level, user.coins, user.items).run();
          
          // 重新查询
          user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(deviceId).first();
        } else {
          // 更新登录时间
          await env.DB.prepare("UPDATE users SET last_login = datetime('now', '+8 hours') WHERE user_id = ?").bind(deviceId).run();
        }

        return response({ ...user, is_new_user: isNewUser });
      }

      // --- 2. 小游戏登录 (微信/抖音) ---
      if (path === '/api/login/minigame' && request.method === 'POST') {
        const { platform, code, userInfo } = await request.json(); 
        if (!code || !platform) return response({ error: 'Missing code or platform' }, 400);

        let openId = null;

        // 换取 OpenID
        if (platform === 'wechat') {
           openId = await fetchWechatSession(code, env);
        } else if (platform === 'douyin') {
           openId = await fetchDouyinSession(code, env);
        }

        if (!openId) {
            // 开发环境 Fallback
            openId = `dev_${platform}_${code}`; 
        }

        let user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(openId).first();
        let isNewUser = false;

        // 确定要存入的昵称和头像 (优先用前端传的，其次用数据库旧的，最后用默认)
        // 注意：如果是静默登录(silent login)，userInfo 是空的，这里会保留数据库原值或生成随机名
        const newNick = userInfo?.nickName || user?.nickname || generateNickname();
        const newAvatar = userInfo?.avatarUrl || user?.avatar_url || '';

        if (!user) {
          isNewUser = true;
          // 注册
          user = {
            user_id: openId,
            platform: platform,
            nickname: newNick,
            avatar_url: newAvatar,
            level: 1,
            coins: 200,
            items: '[]'
          };
          
          await env.DB.prepare(
            'INSERT INTO users (user_id, platform, nickname, avatar_url, level, coins, items) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).bind(user.user_id, user.platform, user.nickname, user.avatar_url, user.level, user.coins, user.items).run();
          
          user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(openId).first();

        } else {
          // 更新
          // 只有当 userInfo 传了新的有效值时，才更新资料；否则只更新登录时间
          // 这样静默登录时不会覆盖掉用户之前已授权的头像
          let sql = "UPDATE users SET last_login = datetime('now', '+8 hours')";
          const args = [];
          
          if (userInfo && userInfo.nickName) {
              sql += ", nickname = ?, avatar_url = ?";
              args.push(userInfo.nickName, userInfo.avatarUrl);
          }
          
          sql += " WHERE user_id = ?";
          args.push(openId);
          
          await env.DB.prepare(sql).bind(...args).run();
          
          // 如果更新了资料，返回对象也要更新
          if (userInfo && userInfo.nickName) {
            user.nickname = userInfo.nickName;
            user.avatar_url = userInfo.avatarUrl;
          }
        }

        return response({ ...user, is_new_user: isNewUser });
      }

      // --- 3. 更新用户数据 ---
      if (path === '/api/user/update' && request.method === 'POST') {
          const { userId, coins, level, items } = await request.json();
          await env.DB.prepare(
              'UPDATE users SET coins = ?, level = ?, items = ? WHERE user_id = ?'
          ).bind(coins, level, JSON.stringify(items || []), userId).run();
          return response({ success: true });
      }

      return response({ error: 'Not Found' }, 404);

    } catch (e) {
      return response({ error: e.message }, 500);
    }
  }
};

// --- Utils ---

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
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
            appid: env.DY_APP_ID,
            secret: env.DY_APP_SECRET,
            code: code
        })
    });
    const data = await res.json();
    return data.data?.openid;
}
