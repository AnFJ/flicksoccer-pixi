
import { SkillType } from '../constants.js';

/**
 * 每日抽奖奖品配置
 * id: 唯一标识
 * type: 'coin' | 'skill' | 'unlock_mode'
 * value: 金币数量 | 技能Type | 模式Key
 * count: 技能数量 (仅 type='skill' 有效)
 * weight: 权重 (概率 = weight / totalWeight)
 * name: 显示名称
 * iconType: 用于在 LotteryDialog 中决定绘制什么图标
 */
export const LotteryPrizes = [
    // 1. 金币 +50 (权重 30)
    { id: 1, type: 'coin', value: 50, weight: 30, name: '50 金币', iconType: 'coin_small' },
    
    // 2. 技能: 瞄准 (权重 15)
    { id: 2, type: 'skill', value: SkillType.SUPER_AIM, count: 1, weight: 15, name: '瞄准 x1', iconType: 'skill_aim' },
    
    // 3. 模式: 本地双人 (权重 10)
    { id: 3, type: 'unlock_mode', value: 'local_pvp', weight: 10, name: '今日解锁\n本地双人', iconType: 'unlock_local' },
    
    // 4. 金币 +100 (权重 20)
    { id: 4, type: 'coin', value: 100, weight: 20, name: '100 金币', iconType: 'coin_large' },
    
    // 5. 技能: 战车 (权重 10)
    { id: 5, type: 'skill', value: SkillType.UNSTOPPABLE, count: 1, weight: 10, name: '战车 x1', iconType: 'skill_car' },
    
    // 6. 模式: 网络对战 (权重 5)
    { id: 6, type: 'unlock_mode', value: 'online_pvp', weight: 5, name: '今日解锁\n网络对战', iconType: 'unlock_online' },
    
    // 7. 技能: 大力 (权重 10)
    { id: 7, type: 'skill', value: SkillType.SUPER_FORCE, count: 1, weight: 10, name: '大力 x1', iconType: 'skill_force' },
    
    // 8. 幸运大奖: 金币 +200 (权重 5 - 实际上是位置8)
    { id: 8, type: 'coin', value: 200, weight: 5, name: '200 金币', iconType: 'coin_huge' }
];

/**
 * 根据权重随机抽取一个奖品
 */
export function drawLottery() {
    const totalWeight = LotteryPrizes.reduce((sum, item) => sum + item.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const prize of LotteryPrizes) {
        if (random < prize.weight) {
            return prize;
        }
        random -= prize.weight;
    }
    return LotteryPrizes[0]; // 兜底
}
