
/**
 * 德式桌球 (8杆标准) 1:1 物理与视觉参数配置
 */
export const FoosballConfig = {
    // [新增] 调试模式开关
    debug: true, // 设置为 true 开启刚体线框显示，false 关闭

    // 球场物理尺寸 (逻辑坐标)
    pitch: {
        width: 1710,    // 长度 (X方向)
        height: 920,    // 宽度 (Y方向)
        aspectRatio: 1.86
    },

    // [新增] 足球物理参数
    ball: {
        restitution: 0.2,   // 弹性 (0.0~1.0) - [降低] 稍微降低整体弹性，使球感更沉稳
        frictionAir: 0.01, // 空气阻力 (惯性) - [微调] 保持适中
        friction: 0.01,    // 表面摩擦 - [增加] 增加一点摩擦，便于被杆子带动
        density: 0.8      // [新增] 密度 (重量) - 标准 MatterJS 默认是 0.001，0.004 表示较重的实心球
    },
    
    // 棋子尺寸 (匹配提供的素材比例)
    puppet: {
        width: 101,      // 视觉高度 (头到脚) - 旋转后变为横向长度
        height: 77,     // 视觉宽度 (肩宽) - 旋转后变为纵向宽度
        hitWidth: 70,   // 物理碰撞宽 (侧面厚度)
        hitHeight: 100,  // 物理碰撞高 (脚部受力面积)
        rodYOffset: 0,  // 杆子中心对齐

        // [物理核心优化]
        restitution: 0.1, // 弹性 (0.0~1.0) - [极低] 只有0.1，模拟硬物，静止时球撞上来不反弹
        friction: 0.6,    // 摩擦力 - [高] 侧面摩擦大，上下滑杆时能"带"动球
        density: 0.2,     // 密度 (重量) - [极高] 质量很大，撞击时动量十足，不会被球反推

        // [新增] 动力学传导系数
        verticalForceScale: 0.1, // 垂直移动时的动量放大系数 (上下滑杆的力度)

        // [新增] 击球表现系数
        kickPhysicsRatio: 0.8, // 物理位移系数 (targetX = rodX + kickOffset * ratio)
        kickVisualRatio: 0.4,  // 视觉位移系数 (用于防止图片过度拉伸)
        kickStretchRatio: 0.6  // 最大拉伸比例 (1 + progress * ratio)
    },
    
    // 杆件配置
    rod: {
        thickness: 18,  // 杆子直径，稍微加粗显得有质感
        
        // [新增] 击球动力学配置
        kick: {
            maxOffset: 150,   // 最大击球延伸距离 (px)
            speed: 15,        // [调整] 踢出速度。原25 -> 15，让动作更清晰，不至于快得看不清
            returnSpeed: 10   // [调整] 收回速度。原15 -> 10
        },

        count: 8,       
        layout: [
            { teamId: 0, puppets: 1 }, // 杆1: 红方守门员
            { teamId: 0, puppets: 2 }, // 杆2: 红方后卫
            { teamId: 1, puppets: 3 }, // 杆3: 蓝方前锋
            { teamId: 0, puppets: 5 }, // 杆4: 红方中场
            { teamId: 1, puppets: 5 }, // 杆5: 蓝方中场
            { teamId: 0, puppets: 3 }, // 杆6: 红方前锋
            { teamId: 1, puppets: 2 }, // 杆7: 蓝方后卫
            { teamId: 1, puppets: 1 }  // 杆8: 蓝方守门员
        ]
    }
};
