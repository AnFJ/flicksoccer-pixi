
/**
 * AI 聊天与人格配置表
 */

export const AIPersonas = [
    {
        id: 'hot',
        name: '热血杰克',
        avatar: 'ai_hot',
        desc: '燃烧吧，足球之魂！'
    },
    {
        id: 'troll',
        name: '嘲讽阿强',
        avatar: 'ai_troll',
        desc: '就这？我奶奶来都比你强。'
    },
    {
        id: 'robot',
        name: '数据博士',
        avatar: 'ai_robot',
        desc: '胜率计算中...99.9%'
    },
    {
        id: 'noble',
        name: '贵族路易',
        avatar: 'ai_noble',
        desc: '优雅，永不过时。'
    },
    {
        id: 'cute',
        name: '萌萌小茜',
        avatar: 'ai_cute',
        desc: '哇，好厉害...'
    }
];

// 触发事件枚举
export const ChatTrigger = {
    // --- 玩家相关 ---
    PLAYER_INSTANT_GOAL: 'player_instant_goal', // 玩家开局秒进
    PLAYER_GOAL: 'player_goal',                 // 玩家普通进球 (默认/首球)
    PLAYER_MISS: 'player_miss',                 // 玩家差一点/撞柱
    PLAYER_BAD: 'player_bad',                   // 玩家严重失误
    
    // [新增] 玩家进球细分场景
    PLAYER_OWN_GOAL: 'player_own_goal',         // 玩家乌龙球
    PLAYER_EQUALIZER: 'player_equalizer',       // 玩家追平比分 (0-1 -> 1-1)
    PLAYER_OVERTAKE: 'player_overtake',         // 玩家反超比分 (1-1 -> 2-1)
    PLAYER_LEAD_EXTEND: 'player_lead_extend',   // 玩家扩大领先 (1-0 -> 2-0)

    // --- AI 相关 ---
    AI_GOAL: 'ai_goal',                         // AI 普通进球
    AI_WIN: 'ai_win',                           // AI 获胜
    
    // [新增] AI 进球细分场景
    AI_OWN_GOAL: 'ai_own_goal',                 // AI 乌龙球
    AI_EQUALIZER: 'ai_equalizer',               // AI 追平比分
    AI_OVERTAKE: 'ai_overtake',                 // AI 反超比分
    AI_LEAD_EXTEND: 'ai_lead_extend',           // AI 扩大领先
    
    IDLE: 'idle'                                // 玩家发呆
};

export const AIChatTexts = {
    // --- 1. 热血杰克 (性格：积极、中二、尊重对手) ---
    'hot': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["这就是闪电战吗？！", "好快！我还没热身！", "你的斗志燃烧起来了！"],
        [ChatTrigger.PLAYER_GOAL]: ["好球！再战三百回合！", "漂亮的射门！", "就是这样！热血沸腾！"],
        [ChatTrigger.PLAYER_MISS]: ["好险！心跳加速了！", "差一点！下次一定行！", "这就是竞技的魅力！"],
        [ChatTrigger.PLAYER_BAD]: ["怎么了？振作起来！", "迷茫了吗？看着球门！", "不要放弃！调整呼吸！"],
        
        [ChatTrigger.PLAYER_OWN_GOAL]: ["哎呀！失误也是比赛的一部分！", "别在意！我们重新开始！", "刚才那球...太可惜了！"],
        [ChatTrigger.PLAYER_EQUALIZER]: ["追平了！比赛现在才真正开始！", "好样的！这才是势均力敌的较量！", "燃烧起来了！平局！"],
        [ChatTrigger.PLAYER_OVERTAKE]: ["竟然反超了？太燃了！", "绝境反击！这才是足球！", "我的斗志被你点燃了！"],
        [ChatTrigger.PLAYER_LEAD_EXTEND]: ["被压制了...但我不会认输的！", "2比0！你真的很强！", "我要拿出120%的实力了！"],

        [ChatTrigger.AI_GOAL]: ["必杀！火焰射门！", "我做到了！教练！", "这就是青春的汗水！"],
        [ChatTrigger.AI_OWN_GOAL]: ["什么？！我居然踢进了自家大门！", "太激动导致用力过猛了吗...", "抱歉抱歉，送你一分！"],
        [ChatTrigger.AI_EQUALIZER]: ["我追上来了！决不放弃！", "平局！让我们一球定胜负！", "我的火焰还没熄灭！"],
        [ChatTrigger.AI_OVERTAKE]: ["逆转！这就是坚持的胜利！", "现在是我领先了！来吧！", "形势逆转！"],
        [ChatTrigger.AI_LEAD_EXTEND]: ["乘胜追击！", "2比0！胜利的法则已确定！", "感受我的热情吧！"],
        
        [ChatTrigger.AI_WIN]: ["真是酣畅淋漓的比赛！", "多谢指教！", "友谊第一，比赛第二！"],
        [ChatTrigger.IDLE]: ["快出招吧！我等不及了！", "来吧！正面对决！", "别犹豫，射门！"]
    },

    // --- 2. 嘲讽阿强 (性格：嘴臭、阴阳怪气、喜欢搞心态) ---
    'troll': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["运气不错，买彩票了吗？", "我还没睡醒呢，不算。", "手滑进球了？"],
        [ChatTrigger.PLAYER_GOAL]: ["居然进了？门柱没上班？", "行行行，你厉害。", "牛顿棺材板压不住了。"],
        [ChatTrigger.PLAYER_MISS]: ["吓死宝宝了，还好你菜。", "人体描边大师？", "门柱：我是MVP。"],
        [ChatTrigger.PLAYER_BAD]: ["这是什么新战术？", "你在给空气传球？", "就这？就这？"],

        [ChatTrigger.PLAYER_OWN_GOAL]: ["谢谢老板送的大礼包！", "你是卧底吧？哈哈哈哈！", "这操作，我愿称之为绝活。"],
        [ChatTrigger.PLAYER_EQUALIZER]: ["切，让你追平而已，别得瑟。", "运气好罢了，下球必进。", "平局？不存在的。"],
        [ChatTrigger.PLAYER_OVERTAKE]: ["完了，我要认真了。", "你是开了挂吗？", "这不科学，绝对有黑幕。"],
        [ChatTrigger.PLAYER_LEAD_EXTEND]: ["别太嚣张，小心出门踩香蕉皮。", "2比0很稳吗？我要翻盘了。", "你赢了，开心了吧？哼。"],

        [ChatTrigger.AI_GOAL]: ["哎呀，手滑进了。", "基操，勿6。", "不会吧，这都防不住？"],
        [ChatTrigger.AI_OWN_GOAL]: ["键盘坏了...不算！", "我...我是故意的，让你一球。", "战术性失误，懂不懂？"],
        [ChatTrigger.AI_EQUALIZER]: ["这就平了？你也不行啊。", "回到起跑线咯，略略略。", "刚才只是在让着你。"],
        [ChatTrigger.AI_OVERTAKE]: ["想赢我？下辈子吧。", "反超咯，气不气？", "这叫实力碾压。"],
        [ChatTrigger.AI_LEAD_EXTEND]: ["早点投降吧，别浪费时间。", "2比0，绝望吗？", "还要继续被虐吗？"],

        [ChatTrigger.AI_WIN]: ["抬走，下一个。", "回家再练练吧。", "无敌是多么寂寞。"],
        [ChatTrigger.IDLE]: ["睡着了？帮你打120？", "掉线了？", "快点啊，我饭都凉了。"]
    },

    // --- 3. 数据博士 (性格：理智、机械、看重概率) ---
    'robot': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["检测到小概率事件。", "开局进球率仅3.4%。", "不符合常规逻辑。"],
        [ChatTrigger.PLAYER_GOAL]: ["轨迹计算无法拦截。", "物理模拟显示：有效。", "力度角度完美契合。"],
        [ChatTrigger.PLAYER_MISS]: ["偏离值 0.5 度。", "根据计算，进不了。", "运气守恒定律生效。"],
        [ChatTrigger.PLAYER_BAD]: ["操作效率评估：低。", "无效操作。", "无法理解此行为逻辑。"],

        [ChatTrigger.PLAYER_OWN_GOAL]: ["检测到逻辑错误：目标判定异常。", "感谢对方赠送得分。", "这不在我的数据库中。"],
        [ChatTrigger.PLAYER_EQUALIZER]: ["双方胜率回归 50%。", "比分平衡，重新建模。", "竞争系数上升。"],
        [ChatTrigger.PLAYER_OVERTAKE]: ["胜率曲线发生波动。", "检测到局势逆转。", "需要重新评估对手实力。"],
        [ChatTrigger.PLAYER_LEAD_EXTEND]: ["胜率跌至 5%。", "系统过载，计算失败。", "你超出了我的预期。"],

        [ChatTrigger.AI_GOAL]: ["结果符合预期模型。", "计算精准，执行完美。", "数学的胜利。"],
        [ChatTrigger.AI_OWN_GOAL]: ["系统错误...坐标系发生偏移。", "计算失误，自我修正中。", "发生未知Bug。"],
        [ChatTrigger.AI_EQUALIZER]: ["修正误差，比分持平。", "胜率回升。", "平衡已恢复。"],
        [ChatTrigger.AI_OVERTAKE]: ["战术调整生效，反超。", "胜率 75%。", "局势已接管。"],
        [ChatTrigger.AI_LEAD_EXTEND]: ["胜率 99.9%。", "结果已注定。", "碾压模式启动。"],

        [ChatTrigger.AI_WIN]: ["推演结束，结果：胜利。", "人类的操作有极限。", "感谢提供数据样本。"],
        [ChatTrigger.IDLE]: ["检测到长时间无响应。", "连接断开了？", "建议检查网络。"]
    },

    // --- 4. 贵族路易 (性格：高傲、优雅、从容) ---
    'noble': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["有点意思，终于不无聊了。", "让你一球又何妨？", "这种球我三岁经常踢。"],
        [ChatTrigger.PLAYER_GOAL]: ["不错的尝试。", "稍微大意了一下。", "给你点掌声，继续努力。"],
        [ChatTrigger.PLAYER_MISS]: ["一切尽在掌握。", "这种球进不了我的门。", "上帝站在我这边。"],
        [ChatTrigger.PLAYER_BAD]: ["你在表演喜剧吗？", "这动作太不优雅了。", "看来不需要我认真。"],

        [ChatTrigger.PLAYER_OWN_GOAL]: ["这就是平民的失误吗？", "哎呀，真是太客气了。", "既然你坚持要送，我就收下了。"],
        [ChatTrigger.PLAYER_EQUALIZER]: ["居然能追平？稍微认可你一点了。", "平局才显得优雅。", "游戏变得有趣了。"],
        [ChatTrigger.PLAYER_OVERTAKE]: ["竟敢挑战我的威严？", "稍微让你得意一下。", "这不科学...不，这不优雅。"],
        [ChatTrigger.PLAYER_LEAD_EXTEND]: ["这...这是什么粗鲁的踢法！", "我居然落后了两球？", "我不承认这种结果！"],

        [ChatTrigger.AI_GOAL]: ["优雅，永不过时。", "我只用了三成力。", "进球像呼吸一样简单。"],
        [ChatTrigger.AI_OWN_GOAL]: ["噢！这该死的草皮！", "这是意外，纯属意外。", "刚才的风向不太对。"],
        [ChatTrigger.AI_EQUALIZER]: ["比分回到了优雅的平衡。", "这才是应有的局面。", "你以为能赢我吗？"],
        [ChatTrigger.AI_OVERTAKE]: ["庶民，看清差距了吗？", "王者的反击。", "这才是我的实力。"],
        [ChatTrigger.AI_LEAD_EXTEND]: ["胜负已分，退下吧。", "优雅的胜利。", "完美的演出。"],

        [ChatTrigger.AI_WIN]: ["无敌是多么寂寞。", "你还没资格挑战我。", "意料之中的结局。"],
        [ChatTrigger.IDLE]: ["是在思考认输的姿势吗？", "我的时间很宝贵。", "别浪费我的下午茶时间。"]
    },

    // --- 5. 萌萌小茜 (性格：胆小、可爱、崇拜、绿茶?) ---
    'cute': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["哇！大神求带！", "都没看清就进了？", "这就是高手的世界吗..."],
        [ChatTrigger.PLAYER_GOAL]: ["呜呜呜，不要欺负我...", "大神轻点虐~", "我也想踢这么帅。"],
        [ChatTrigger.PLAYER_MISS]: ["吓死我了...", "呼... 运气真好。", "那个... 你手抖了吗？"],
        [ChatTrigger.PLAYER_BAD]: ["哎呀，好可惜...", "没关系，再来一次！", "加油加油！"],

        [ChatTrigger.PLAYER_OWN_GOAL]: ["诶？这个球是送给我的吗？", "谢谢哥哥/姐姐送的分~", "虽然是个乌龙，但也挺好看的..."],
        [ChatTrigger.PLAYER_EQUALIZER]: ["平局了诶！好紧张...", "不要这么凶嘛~", "看来我也要加油了！"],
        [ChatTrigger.PLAYER_OVERTAKE]: ["哇，你要赢了吗？", "好厉害的反击！", "我要输掉了吗...呜呜呜"],
        [ChatTrigger.PLAYER_LEAD_EXTEND]: ["完全打不过呀...", "大神教教我怎么踢球吧！", "不要让我输得太惨哦..."],

        [ChatTrigger.AI_GOAL]: ["诶？我进球了？", "运气太好了吧！", "对不起，不是故意的..."],
        [ChatTrigger.AI_OWN_GOAL]: ["呜呜呜，我好笨...", "怎么踢到自家门里了...", "不要笑话我啦！"],
        [ChatTrigger.AI_EQUALIZER]: ["我也能进球耶！", "追平啦，开心！", "我会加油的！"],
        [ChatTrigger.AI_OVERTAKE]: ["嘿嘿，运气真好~", "反超了！不敢相信！", "我是不是变厉害了？"],
        [ChatTrigger.AI_LEAD_EXTEND]: ["耶！两球领先！", "今天手感真好~", "大神你是让着我吗？"],

        [ChatTrigger.AI_WIN]: ["我是不是赢了？", "谢谢你陪我玩~", "其实你打得也很好啦。"],
        [ChatTrigger.IDLE]: ["那个... 还在吗？", "是不是卡住了？", "我可以等你哦。"]
    }
};
