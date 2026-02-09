
import { SkillType } from '../constants.js';

/**
 * 获取指定关卡的 AI 配置
 * @param {number} level 关卡号 (1-99)
 */
export function getLevelConfig(level) {
    // 默认配置：Level 1-3 (菜鸟/入门)
    const config = {
        level: level,
        aiError: 0.15,        // [修改] 原 0.3 -> 0.15，大幅降低基础误差，保证基本准度
        powerMultiplier: 0.65, 
        strategyDepth: 0,     
        defenseAwareness: 0,  
        skills: [],           
        skillRate: 0.0,       
        description: "菜鸟入门"
    };

    // --- 难度梯度 ---

    // Level 4+: 大师级挑战 (难度骤升)
    if (level >= 4) {
        // 精度极高: 0.02 (接近零误差)
        config.aiError = Math.max(0.005, 0.02 - (level - 4) * 0.0002);
        config.powerMultiplier = 1.0; 
        config.strategyDepth = 3;     
        config.defenseAwareness = 0.95 + (level - 4) * 0.001; 
        
        config.skills = [SkillType.SUPER_AIM, SkillType.UNSTOPPABLE, SkillType.SUPER_FORCE];
        config.skillRate = Math.min(0.8, 0.4 + (level - 4) * 0.005);
        
        config.description = "地狱挑战";
    }

    // [新增] Level 10+: 机械神 (完全无误差)
    if (level >= 10) {
        config.aiError = 0;
        config.description = "神级操作";
    }

    // --- 特殊教学/奖励关卡强制配置 ---

    // 第1关：教学：精准制导
    if (level === 1) {
        config.skillRate = 0.8; 
        config.skills = [SkillType.SUPER_AIM];
        config.description = "教学：精准制导";
        config.aiError = 0.15; // [修改] 保持一致
        config.defenseAwareness = 0;
    }

    // 第2关：教学：无敌战车
    if (level === 2) {
        config.skillRate = 0.8;
        config.skills = [SkillType.UNSTOPPABLE];
        config.description = "教学：无敌战车";
        config.aiError = 0.12;
    }

    // 第3关：教学：大力神脚
    if (level === 3) {
        config.skillRate = 0.8;
        config.skills = [SkillType.SUPER_FORCE];
        config.description = "教学：大力神脚";
        config.aiError = 0.1;
    }

    return config;
}
