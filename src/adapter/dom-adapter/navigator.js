import minigame from './minigame'

const systemInfo = minigame.getSystemInfoSync()
const isAndroid = systemInfo.system.toLowerCase().includes('android')

export default {
  language: 'zh-cn',
  appVersion: '5.0 (Mobile; Unit)',
  // [关键修改] 伪装成 Mobile 设备，否则 Pixi 可能会忽略 touch 事件
  userAgent: isAndroid 
    ? 'Mozilla/5.0 (Linux; Android 10; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.132 Mobile Safari/537.36'
    : 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.0.3 Mobile/15E148 Safari/604.1',
  onLine: true
}