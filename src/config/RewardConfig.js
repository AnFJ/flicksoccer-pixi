
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
    // --- 前3关：技能大放送 ---
    1: { type: 'skill', id: SkillType.SUPER_AIM, count: 5, name: '超距瞄准' },
    2: { type: 'skill', id: SkillType.UNSTOPPABLE, count: 5, name: '无敌战车' },
    3: { type: 'skill', id: SkillType.SUPER_FORCE, count: 5, name: '大力水手' },

    // --- 后续奖励 ---
    // 原 Level 2 的皮肤推迟到 Level 5
    6: { type: 'striker', id: 2, name: '火焰纹章' }, 
    20: { type: 'ball', id: 2, name: '经典黑白' }, // 足球奖励 #1

    50: { type: 'striker', id: 3, name: '蓝宝石' }, // 棋子奖励 #2
    99: { type: 'field', id: 2, name: '冬日主题' },
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
