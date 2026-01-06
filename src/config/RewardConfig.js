
import { SkillType } from '../constants.js';

/**
 * 关卡奖励配置
 * key: 关卡号 (Level)
 * value: 奖励内容
 *   type: 'striker' | 'ball' | 'field' | 'skill'
 *   id: 皮肤ID 或 技能Type
 *   count: 数量 (仅技能有效)
 *   name: 用于显示的中文名称
 */
export const LevelRewards = {
    // --- 前10关：新手诱惑 ---
    2: { type: 'striker', id: 2, name: '火焰纹章' },
    3: { type: 'skill', id: SkillType.SUPER_AIM, count: 5, name: '超距瞄准' },
    5: { type: 'ball', id: 2, name: '经典黑白' },
    7: { type: 'skill', id: SkillType.UNSTOPPABLE, count: 5, name: '无敌战车' },
    9: { type: 'ball', id: 3, name: '烈焰足球' },
    10: { type: 'skill', id: SkillType.SUPER_FORCE, count: 5, name: '大力水手' },

    // --- 后续：整十关卡解锁 (9个剩余物品) ---
    // 剩余棋子: 3, 4, 5, 6, 7
    // 剩余球场: 2, 3, 4
    // 剩余足球: 4
    
    20: { type: 'field', id: 2, name: '硬地赛场' },
    30: { type: 'striker', id: 3, name: '蓝宝石' },
    40: { type: 'striker', id: 4, name: '翡翠梦境' },
    50: { type: 'field', id: 3, name: '街头涂鸦' },
    60: { type: 'ball', id: 4, name: '未来科技' },
    70: { type: 'striker', id: 5, name: '黄金时代' },
    80: { type: 'field', id: 4, name: '室内球馆' },
    90: { type: 'striker', id: 6, name: '暗夜骑士' },
    99: { type: 'striker', id: 7, name: '荣耀王者' } // 满级奖励
};

/**
 * 反向查找：获取某个皮肤是在哪一关解锁的
 * @param {string} type 'striker' | 'ball' | 'field'
 * @param {number} id
 * @returns {number|null} 关卡号，如果没有配置则返回 null
 */
export function getUnlockLevelForTheme(type, id) {
    for (const [level, reward] of Object.entries(LevelRewards)) {
        if (reward.type === type && reward.id === id) {
            return parseInt(level);
        }
    }
    return null;
}
