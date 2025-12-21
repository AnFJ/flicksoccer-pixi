/**
 * 这是一个占位文件。
 * 请下载官方提供的 weapp-adapter.js 并覆盖此文件内容。
 * 作用：在小游戏环境中模拟 window, document, XMLHttpRequest 等浏览器对象，
 * 让 Pixi.js 和 Matter.js 能够正常运行。
 * 
 * 通常你可以从这类地址找到: https://github.com/finscn/weapp-adapter
 */
 
// 简单模拟，防止直接报错 (实际开发请务必替换)
if (typeof window === 'undefined') {
    // @ts-ignore
    global.window = global;
    // @ts-ignore
    global.document = {
        createElement: () => ({ style: {} }),
        body: { appendChild: () => {} }
    };
}
export default {};