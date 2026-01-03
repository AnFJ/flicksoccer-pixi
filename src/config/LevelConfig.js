
import { SkillType } from '../constants.js';

/**
 * 获取指定关卡的 AI 配置
 * @param {number} level 关卡号 (1-99)
 */
export function getLevelConfig(level) {
    // 基础配置 (Level 1-3)
    const config = {
        level: level,
        aiError: 0.25,        // 射门误差 (弧度)，0.25 很大，容易踢歪
        powerMultiplier: 0.6, // 力度系数 (0~1)，新手关AI踢得轻
        strategyDepth: 0,     // 0:仅直线, 1:尝试切球, 2:尝试反弹
        skills: [],           // 允许使用的技能
        skillRate: 0.0,       // 每回合使用技能的概率
        description: "新手入门"
    };

    // --- 难度曲线 ---

    // Level 4-6: 引入超距瞄准，精度提升
    if (level >= 4) {
        config.aiError = 0.15;
        config.powerMultiplier = 0.75;
        config.strategyDepth = 1; 
        config.skills.push(SkillType.SUPER_AIM);
        config.skillRate = 0.1; 
        config.description = "初窥门径";
    }

    // Level 7-9: 引入无敌战车，懂得反弹
    if (level >= 7) {
        config.aiError = 0.10;
        config.strategyDepth = 2; // 懂得撞墙
        config.skills.push(SkillType.UNSTOPPABLE);
        config.skillRate = 0.15;
        config.description = "物理进阶";
    }

    // Level 10-20: 引入大力水手，全技能解锁
    if (level >= 10) {
        config.aiError = 0.08;
        config.powerMultiplier = 0.9;
        config.skills.push(SkillType.SUPER_FORCE);
        config.skillRate = 0.2;
        config.description = "暴力美学";
    }

    // Level 21-50: 高手进阶
    if (level >= 21) {
        config.aiError = 0.05; // 误差很小
        config.powerMultiplier = 1.0;
        config.skillRate = 0.3 + (level - 20) * 0.005; // 技能频率随关卡增加
        config.description = "大师之路";
    }

    // Level 51-99: 噩梦难度
    if (level >= 51) {
        config.aiError = 0.01; // 几乎零误差
        config.skillRate = 0.5 + (level - 50) * 0.01; 
        config.description = "传奇挑战";
    }

    // --- 特殊教学关卡强制配置 ---

    // 第4关：强制展示瞄准
    if (level === 4) {
        config.skillRate = 1.0; 
        config.skills = [SkillType.SUPER_AIM];
        config.description = "教学：超距瞄准";
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
        config.description = "教学：大力水手";
    }

    return config;
}
