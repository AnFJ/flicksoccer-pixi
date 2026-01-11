
// 极简 XML 解析适配，主要为了骗过 Pixi 的类型检查
// 如果游戏深度依赖 XML 解析，需要引入 fast-xml-parser 等库
export default class XMLDocument {
    constructor() {
        this.documentElement = {
            nodeName: 'xml',
            childNodes: [],
            getAttribute: () => null,
            getElementsByTagName: () => []
        };
    }
    
    // 基础的节点查找模拟
    getElementsByTagName(name) {
        return [];
    }
}