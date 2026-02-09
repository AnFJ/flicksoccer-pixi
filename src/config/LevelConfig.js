
import { SkillType } from '../constants.js';

/**
 * 获取指定关卡的 AI 配置
 * @param {number} level 关卡号 (1-99)
 */
export function getLevelConfig(level) {
    // 默认配置：Level 1-3 (菜鸟/入门)
    const config = {
        level: level,
        aiError: 0.3,         // 射门误差 (弧度)，0.3 很大，容易踢歪
        powerMultiplier: 0.65, // 力度系数
        strategyDepth: 0,     // 0:仅直线, 1:懂解围, 2:懂反弹, 3:全能
        defenseAwareness: 0,  // 防守意识 (0~1)，触发解围的概率
        skills: [],           
        skillRate: 0.0,       
        description: "菜鸟入门"
    };

    // --- 难度梯度 ---

    // Level 4+: 大师级挑战 (难度骤升，对应原先 Level 40+)
    if (level >= 4) {
        // 精度极高: 0.02 (接近零误差) -> 99关趋近于 0
        config.aiError = Math.max(0.005, 0.02 - (level - 4) * 0.0002);
        config.powerMultiplier = 1.0; // 全力
        config.strategyDepth = 3;     // 全能策略 (反弹、解围、破局)
        config.defenseAwareness = 0.95 + (level - 4) * 0.001; // 极高防守意识
        
        // 技能库全开
        config.skills = [SkillType.SUPER_AIM, SkillType.UNSTOPPABLE, SkillType.SUPER_FORCE];
        // 技能频率: 起步 0.4，随着关卡提升
        config.skillRate = Math.min(0.8, 0.4 + (level - 4) * 0.005);
        
        config.description = "地狱挑战";
    }

    // --- 特殊教学/奖励关卡强制配置 ---
    // 配合 RewardConfig: L1送瞄准, L2送战车, L3送大力

    // 第1关：教学：精准制导 (AI也会用)
    if (level === 1) {
        config.skillRate = 0.8; 
        config.skills = [SkillType.SUPER_AIM];
        config.description = "教学：精准制导";
        // 保持低难度参数，仅展示技能
        config.aiError = 0.3;
        config.defenseAwareness = 0;
    }

    // 第2关：教学：无敌战车
    if (level === 2) {
        config.skillRate = 0.8;
        config.skills = [SkillType.UNSTOPPABLE];
        config.description = "教学：无敌战车";
        // 稍微提升一点
        config.aiError = 0.25;
    }

    // 第3关：教学：大力神脚
    if (level === 3) {
        config.skillRate = 0.8;
        config.skills = [SkillType.SUPER_FORCE];
        config.description = "教学：大力神脚";
        // 稍微提升
        config.aiError = 0.2;
    }

    return config;
}
