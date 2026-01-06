
import { SkillType } from '../constants.js';

/**
 * 获取指定关卡的 AI 配置
 * @param {number} level 关卡号 (1-99)
 */
export function getLevelConfig(level) {
    // 默认配置：Level 1-3 (菜鸟)
    // 只会直线大力抽射，误差大，无防守意识
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

    // Level 4-7: 业余 (懂得基础解围)
    if (level >= 4) {
        config.aiError = 0.15;        // 误差减小
        config.powerMultiplier = 0.75;
        config.strategyDepth = 1;     // 开启解围逻辑
        config.defenseAwareness = 0.4; // 40%概率优先解围危险球
        config.description = "业余选手";
    }

    // Level 8-20: 职业 (懂得反弹球，防守加强)
    if (level >= 8) {
        config.aiError = 0.08;        // 误差很小
        config.powerMultiplier = 0.85;
        config.strategyDepth = 2;     // 开启反弹射门
        config.defenseAwareness = 0.7;
        config.skills.push(SkillType.SUPER_AIM);
        config.skillRate = 0.1;       // 偶尔用技能
        config.description = "职业球员";
    }

    // Level 20+: 大师 (精准制导，高频技能，力度控制)
    if (level > 20) {
        // 精度随关卡线性提升: 20关0.05 -> 50关0.01 (几乎零误差)
        config.aiError = Math.max(0.01, 0.05 - (level - 20) * 0.0015);
        config.powerMultiplier = 1.0;
        config.strategyDepth = 3;     // 开启力度控制和高级策略
        config.defenseAwareness = 1.0;// 绝对理性的防守
        
        // 技能库全开
        config.skills = [SkillType.SUPER_AIM, SkillType.UNSTOPPABLE, SkillType.SUPER_FORCE];
        // 技能频率: 20关0.2 -> 60关0.6
        config.skillRate = Math.min(0.6, 0.2 + (level - 20) * 0.01);
        
        config.description = "足球大师";
    }

    // --- 特殊教学关卡强制配置 ---

    // 第3关：强制展示瞄准
    if (level === 3) {
        config.skillRate = 1.0; 
        config.skills = [SkillType.SUPER_AIM];
        config.description = "教学：精准制导";
    }

    // 第7关：强制展示战车
    if (level === 7) {
        config.skillRate = 1.0;
        config.skills = [SkillType.UNSTOPPABLE];
        config.description = "教学：无敌战车";
    }

    // 第10关：强制展示大力
    if (level === 10) {
        config.skillRate = 1.0;
        config.skills = [SkillType.SUPER_FORCE];
        config.description = "教学：大力神脚";
    }

    return config;
}
