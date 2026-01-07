
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
    PLAYER_INSTANT_GOAL: 'player_instant_goal', // 玩家开局秒进
    PLAYER_GOAL: 'player_goal',                 // 玩家普通进球
    PLAYER_MISS: 'player_miss',                 // 玩家差一点/撞柱
    PLAYER_BAD: 'player_bad',                   // 玩家严重失误
    PLAYER_COMEBACK: 'player_comeback',         // 玩家翻盘/追平 [新增]
    
    AI_GOAL: 'ai_goal',                         // AI 进球
    AI_WIN: 'ai_win',                           // AI 获胜
    AI_COMEBACK: 'ai_comeback',                 // AI 翻盘/追平 [新增]
    
    IDLE: 'idle'                                // 玩家发呆
};

export const AIChatTexts = {
    // --- 1. 热血杰克 ---
    'hot': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["这就是闪电战吗？！", "好快！我还没热身！", "你的斗志燃烧起来了！"],
        [ChatTrigger.PLAYER_GOAL]: ["好球！再战三百回合！", "漂亮的射门！", "就是这样！热血沸腾！"],
        [ChatTrigger.PLAYER_MISS]: ["好险！心跳加速了！", "差一点！下次一定行！", "这就是竞技的魅力！"],
        [ChatTrigger.PLAYER_BAD]: ["怎么了？振作起来！", "迷茫了吗？看着球门！", "不要放弃！调整呼吸！"],
        [ChatTrigger.PLAYER_COMEBACK]: ["竟然反超了？太燃了！", "绝境反击！这才是足球！", "我的斗志被你点燃了！"],
        [ChatTrigger.AI_GOAL]: ["必杀！火焰射门！", "我做到了！教练！", "这就是青春的汗水！"],
        [ChatTrigger.AI_WIN]: ["真是酣畅淋漓的比赛！", "多谢指教！", "友谊第一，比赛第二！"],
        [ChatTrigger.AI_COMEBACK]: ["我不会轻易认输的！", "逆风局才最热血！", "比赛现在才开始！"],
        [ChatTrigger.IDLE]: ["快出招吧！我等不及了！", "来吧！正面对决！", "别犹豫，射门！"]
    },

    // --- 2. 嘲讽阿强 ---
    'troll': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["运气不错，买彩票了吗？", "我还没睡醒呢，不算。", "手滑进球了？"],
        [ChatTrigger.PLAYER_GOAL]: ["居然进了？门柱没上班？", "行行行，你厉害。", "牛顿棺材板压不住了。"],
        [ChatTrigger.PLAYER_MISS]: ["吓死宝宝了，还好你菜。", "人体描边大师？", "门柱：我是MVP。"],
        [ChatTrigger.PLAYER_BAD]: ["这是什么新战术？", "你在给空气传球？", "就这？就这？"],
        [ChatTrigger.PLAYER_COMEBACK]: ["运气用光了吧？", "别高兴太早。", "让你两个球而已。"],
        [ChatTrigger.AI_GOAL]: ["哎呀，手滑进了。", "基操，勿6。", "不会吧，这都防不住？"],
        [ChatTrigger.AI_WIN]: ["抬走，下一个。", "回家再练练吧。", "无敌是多么寂寞。"],
        [ChatTrigger.AI_COMEBACK]: ["想赢我？下辈子吧。", "局势尽在掌握。", "刚才是逗你玩的。"],
        [ChatTrigger.IDLE]: ["睡着了？帮你打120？", "掉线了？", "快点啊，我饭都凉了。"]
    },

    // --- 3. 数据博士 ---
    'robot': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["检测到小概率事件。", "开局进球率仅3.4%。", "不符合常规逻辑。"],
        [ChatTrigger.PLAYER_GOAL]: ["轨迹计算无法拦截。", "物理模拟显示：有效。", "力度角度完美契合。"],
        [ChatTrigger.PLAYER_MISS]: ["偏离值 0.5 度。", "根据计算，进不了。", "运气守恒定律生效。"],
        [ChatTrigger.PLAYER_BAD]: ["操作效率评估：低。", "无效操作。", "无法理解此行为逻辑。"],
        [ChatTrigger.PLAYER_COMEBACK]: ["胜率曲线发生波动。", "检测到局势逆转。", "需要重新建模。"],
        [ChatTrigger.AI_GOAL]: ["结果符合预期模型。", "计算精准，执行完美。", "数学的胜利。"],
        [ChatTrigger.AI_WIN]: ["胜率 100%，推演结束。", "人类的操作有极限。", "感谢提供数据样本。"],
        [ChatTrigger.AI_COMEBACK]: ["修正误差，重回正轨。", "胜率回升至 80%。", "战术调整生效。"],
        [ChatTrigger.IDLE]: ["检测到长时间无响应。", "连接断开了？", "建议检查网络。"]
    },

    // --- 4. 贵族路易 ---
    'noble': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["有点意思，终于不无聊了。", "让你一球又何妨？", "这种球我三岁经常踢。"],
        [ChatTrigger.PLAYER_GOAL]: ["不错的尝试。", "稍微大意了一下。", "给你点掌声，继续努力。"],
        [ChatTrigger.PLAYER_MISS]: ["一切尽在掌握。", "这种球进不了我的门。", "上帝站在我这边。"],
        [ChatTrigger.PLAYER_BAD]: ["你在表演喜剧吗？", "这动作太不优雅了。", "看来不需要我认真。"],
        [ChatTrigger.PLAYER_COMEBACK]: ["竟敢挑战我的威严？", "稍微让你得意一下。", "这不科学...不，这不优雅。"],
        [ChatTrigger.AI_GOAL]: ["优雅，永不过时。", "我只用了三成力。", "进球像呼吸一样简单。"],
        [ChatTrigger.AI_WIN]: ["无敌是多么寂寞。", "你还没资格挑战我。", "意料之中的结局。"],
        [ChatTrigger.AI_COMEBACK]: ["庶民，看清差距了吗？", "王者的反击。", "闹剧该结束了。"],
        [ChatTrigger.IDLE]: ["是在思考认输的姿势吗？", "我的时间很宝贵。", "别浪费我的下午茶时间。"]
    },

    // --- 5. 萌萌小茜 ---
    'cute': {
        [ChatTrigger.PLAYER_INSTANT_GOAL]: ["哇！大神求带！", "都没看清就进了？", "这就是高手的世界吗..."],
        [ChatTrigger.PLAYER_GOAL]: ["呜呜呜，不要欺负我...", "大神轻点虐~", "我也想踢这么帅。"],
        [ChatTrigger.PLAYER_MISS]: ["吓死我了...", "呼... 运气真好。", "那个... 你手抖了吗？"],
        [ChatTrigger.PLAYER_BAD]: ["哎呀，好可惜...", "没关系，再来一次！", "加油加油！"],
        [ChatTrigger.PLAYER_COMEBACK]: ["哇，你要赢了吗？", "好厉害的反击！", "我要输掉了吗..."],
        [ChatTrigger.AI_GOAL]: ["诶？我进球了？", "运气太好了吧！", "对不起，不是故意的..."],
        [ChatTrigger.AI_WIN]: ["我是不是赢了？", "谢谢你陪我玩~", "其实你打得也很好啦。"],
        [ChatTrigger.AI_COMEBACK]: ["我也能进球耶！", "嘿嘿，追平啦！", "我会加油的！"],
        [ChatTrigger.IDLE]: ["那个... 还在吗？", "是不是卡住了？", "我可以等你哦。"]
    }
};
