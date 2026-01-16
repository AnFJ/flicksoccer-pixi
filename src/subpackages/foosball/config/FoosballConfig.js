
/**
 * 德式桌球 (8杆标准) 1:1 物理与视觉参数配置
 */
export const FoosballConfig = {
    // 球场物理尺寸 (逻辑坐标)
    pitch: {
        width: 1710,    // 长度 (X方向)
        height: 920,    // 宽度 (Y方向)
        aspectRatio: 1.86
    },
    
    // 棋子尺寸 (匹配提供的素材比例)
    puppet: {
        width: 84,      // 视觉高度 (头到脚) - 旋转后变为横向长度
        height: 64,     // 视觉宽度 (肩宽) - 旋转后变为纵向宽度
        hitWidth: 40,   // 物理碰撞宽 (侧面厚度)
        hitHeight: 50,  // 物理碰撞高 (脚部受力面积)
        rodYOffset: 0   // 杆子中心对齐
    },
    
    // 杆件配置
    rod: {
        thickness: 18,  // 杆子直径，稍微加粗显得有质感
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
