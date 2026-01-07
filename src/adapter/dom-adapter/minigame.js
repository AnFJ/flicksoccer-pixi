
let minigame = null;

if (typeof tt !== 'undefined') {
  // 抖音/头条小游戏
  minigame = tt;
} else if (typeof wx !== 'undefined') {
  // 微信小游戏
  minigame = wx;
} else {
  // 兜底或者是其他环境
  minigame = {};
}

export default minigame;
