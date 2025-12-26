
/**
 * 辅助函数：生成标准响应
 */
const response = (data, status = 200) => {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*', // 允许跨域
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
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
      return response(null, 204);
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

        if (!user) {
          // 注册新用户
          // 注意：不再手动传入 created_at 和 last_login，让数据库默认值(北京时间)生效
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
          
          // 重新查询以获取数据库生成的准确时间
          user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(deviceId).first();
        } else {
          // 更新登录时间为当前北京时间
          await env.DB.prepare("UPDATE users SET last_login = datetime('now', '+8 hours') WHERE user_id = ?").bind(deviceId).run();
          
          // 更新返回对象的 last_login (模拟值，或者重新查询)
          // 简单起见我们就不重新查库了，前端通常只需要登录成功状态
        }

        return response(user);
      }

      // --- 2. 小游戏登录 (微信/抖音) ---
      if (path === '/api/login/minigame' && request.method === 'POST') {
        const { platform, code, userInfo } = await request.json(); // userInfo 是前端传来的头像昵称(如果有)
        if (!code || !platform) return response({ error: 'Missing code or platform' }, 400);

        let openId = null;

        // 换取 OpenID
        if (platform === 'wechat') {
           openId = await fetchWechatSession(code, env);
        } else if (platform === 'douyin') {
           openId = await fetchDouyinSession(code, env);
        }

        if (!openId) {
            // 如果没配置 AppID，为了测试方便，我们直接用 code 当 openId (仅限开发环境!)
            openId = `dev_${platform}_${code}`; 
        }

        let user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(openId).first();

        // 确定要存入的昵称和头像 (优先用前端传的，其次用数据库旧的，最后用默认)
        const newNick = userInfo?.nickName || user?.nickname || generateNickname();
        const newAvatar = userInfo?.avatarUrl || user?.avatar_url || '';

        if (!user) {
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
          
          // 重新查询以获取时间
          user = await env.DB.prepare('SELECT * FROM users WHERE user_id = ?').bind(openId).first();

        } else {
          // 更新 (如果前端传了新的资料，同步更新到数据库，并更新登录时间)
          await env.DB.prepare(
              "UPDATE users SET last_login = datetime('now', '+8 hours'), nickname = ?, avatar_url = ? WHERE user_id = ?"
          ).bind(newNick, newAvatar, openId).run();
          
          // 更新返回对象
          user.nickname = newNick;
          user.avatar_url = newAvatar;
        }

        return response(user);
      }

      // --- 3. 更新用户数据 (金币/等级/道具) ---
      if (path === '/api/user/update' && request.method === 'POST') {
          const { userId, coins, level, items } = await request.json();
          
          // 动态构建更新语句
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
    // 抖音返回的是 data.data.openid
    return data.data?.openid;
}
