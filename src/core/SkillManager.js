
import { SkillType, Events, NetMsg } from '../constants.js';
import { GameConfig } from '../config.js';
import EventBus from '../managers/EventBus.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import Platform from '../managers/Platform.js';

export default class SkillManager {
    constructor(scene) {
        this.scene = scene;
        
        // 记录当前激活的技能 (key: SkillType, value: boolean)
        this.activeSkills = {
            [SkillType.SUPER_AIM]: false,
            [SkillType.SUPER_FORCE]: false,
            [SkillType.UNSTOPPABLE]: false
        };

        // 技能冷却或状态标记 (用于UI反馈)
        this.skillStates = {};
    }

    /**
     * 尝试切换技能激活状态
     * @param {string} type 技能类型
     */
    toggleSkill(type) {
        // 只有在自己的回合且未击球时才能切换技能
        if (this.scene.isMoving || this.scene.isGameOver) {
            Platform.showToast("当前无法使用技能");
            return;
        }

        const isMyTurn = this.scene.turnMgr.currentTurn === this.scene.myTeamId;
        
        // 联网模式下，非自己回合不能操作
        if (this.scene.gameMode === 'pvp_online' && !isMyTurn) {
            return;
        }

        // PVE 模式下，AI 回合不能操作
        if (this.scene.gameMode === 'pve' && !isMyTurn) {
            return;
        }

        // 切换状态
        this.activeSkills[type] = !this.activeSkills[type];
        const isActive = this.activeSkills[type];

        console.log(`[Skill] Toggled ${type}: ${isActive}`);

        // 发送事件通知 UI 更新
        EventBus.emit(Events.SKILL_ACTIVATED, { type, active: isActive, teamId: this.scene.myTeamId });

        // 如果是联网对战，需要同步技能状态给对方
        // 注意：SUPER_AIM 通常是本地辅助，但这里为了让对方知道你在用挂，也可以同步
        if (this.scene.gameMode === 'pvp_online') {
            NetworkMgr.send({
                type: NetMsg.SKILL,
                payload: {
                    type: type,
                    active: isActive,
                    teamId: this.scene.myTeamId
                }
            });
        }
    }

    /**
     * 处理远程玩家的技能消息
     */
    handleRemoteSkill(payload) {
        if (payload.teamId === this.scene.myTeamId) return; // 忽略自己的回包

        const { type, active } = payload;
        
        // 更新远程玩家的状态记录（虽然主要逻辑由发起方控制，但接收方需要播放特效）
        // 例如无敌战车的火焰特效需要在接收端也显示
        
        if (type === SkillType.SUPER_FORCE) {
             // 远程开启大力水手，可能需要显示对方身上的特效（如果有）
        } else if (type === SkillType.UNSTOPPABLE) {
             // 远程开启无敌战车
        }

        // 触发事件供 UI 显示（例如对方开启了技能，显示个图标）
        EventBus.emit(Events.SKILL_ACTIVATED, { type, active, teamId: payload.teamId });
    }

    /**
     * 检查技能是否激活
     */
    isActive(type) {
        return !!this.activeSkills[type];
    }

    /**
     * 消耗技能 (在击球瞬间调用)
     * 大部分技能是一次性的，击球后重置
     */
    consumeSkills() {
        // 重置所有一次性技能
        // 实际上有些技能可能有持续时间，这里简化为射门后复位 UI 状态
        // 具体的物理持续效果 (如无敌战车3秒) 由 Ball 实体内部计时器管理
        
        // 只有当技能确实被使用时才重置
        // 这里简单处理：射门后全部归位
        for (const key in this.activeSkills) {
            if (this.activeSkills[key]) {
                this.activeSkills[key] = false;
                // 通知 UI 关闭高亮
                EventBus.emit(Events.SKILL_ACTIVATED, { type: key, active: false, teamId: this.scene.turnMgr.currentTurn });
                
                // 联网同步关闭状态
                if (this.scene.gameMode === 'pvp_online') {
                    NetworkMgr.send({
                        type: NetMsg.SKILL,
                        payload: { type: key, active: false, teamId: this.scene.turnMgr.currentTurn }
                    });
                }
            }
        }
    }
}
