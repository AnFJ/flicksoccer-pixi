
import Matter from 'matter-js';

export default class FoosballPhysics {
    constructor() {
        this.engine = null;
    }

    init() {
        // 创建物理引擎，关闭重力
        this.engine = Matter.Engine.create({
            gravity: { x: 0, y: 0 },
            positionIterations: 6,
            velocityIterations: 8 // [优化] 提高速度迭代，处理高速球的反射
        });
        
        console.log('[Foosball] Physics initialized');
    }

    update(delta) {
        if (this.engine) {
            Matter.Engine.update(this.engine, delta);
        }
    }

    add(body) {
        if (this.engine) {
            Matter.World.add(this.engine.world, body);
        }
    }

    remove(body) {
        if (this.engine) {
            Matter.World.remove(this.engine.world, body);
        }
    }

    clear() {
        if (this.engine) {
            Matter.World.clear(this.engine.world, false);
            Matter.Engine.clear(this.engine);
            this.engine = null;
        }
    }
}
