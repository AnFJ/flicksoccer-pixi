
import { SkillType, Events, NetMsg } from '../constants.js';
import { GameConfig } from '../config.js';
import EventBus from '../managers/EventBus.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import Platform from '../managers/Platform.js';
import AccountMgr from '../managers/AccountMgr.js';

export default class SkillManager {
    constructor(scene) {
        this.scene = scene;
        
        // 记录当前激活的技能 (key: SkillType, value: boolean)
        // 注意：这只存储"我"（本地操作者）的技能状态
        this.activeSkills = {
            [SkillType.SUPER_AIM]: false,
            [SkillType.SUPER_FORCE]: false,
            [SkillType.UNSTOPPABLE]: false
        };
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
            Platform.showToast("非自己回合");
            return;
        }

        // PVE 模式下，AI 回合不能操作
        if (this.scene.gameMode === 'pve' && !isMyTurn) {
             Platform.showToast("非自己回合");
            return;
        }

        // 检查物品数量 (如果是激活操作)
        if (!this.activeSkills[type]) { 
            const count = AccountMgr.getItemCount(type);
            if (count <= 0) {
                Platform.showToast("道具数量不足");
                return;
            }
        }

        // 1. 切换本地状态
        this.activeSkills[type] = !this.activeSkills[type];
        const isActive = this.activeSkills[type];

        console.log(`[Skill] Toggled ${type}: ${isActive}`);

        // 2. 发送事件通知 UI 更新 (显示高亮)
        EventBus.emit(Events.SKILL_ACTIVATED, { type, active: isActive, teamId: this.scene.myTeamId });

        // 3. 联网同步：发送状态给对手
        // 这样对手的 HUD 上对应的图标也会点亮/熄灭
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
     * 处理远程玩家的技能消息 (接收端)
     * 当对手点击技能按钮时触发
     */
    handleRemoteSkill(payload) {
        // 忽略自己的回包 (虽然服务器通常不会发给自己，但兜底)
        if (payload.teamId === this.scene.myTeamId) return; 

        const { type, active } = payload;
        
        // 触发事件供 UI 显示（例如对方开启了技能，对方头像旁的图标点亮）
        // GameScene -> GameHUD 会响应该事件
        EventBus.emit(Events.SKILL_ACTIVATED, { type, active, teamId: payload.teamId });
    }

    /**
     * 重置指定队伍的远程技能显示状态 (通常在对手出球后调用)
     * 强制熄灭该队伍的所有技能图标
     */
    resetRemoteSkills(teamId) {
        // 遍历所有技能类型，发送 active: false 的事件
        Object.values(SkillType).forEach(type => {
            EventBus.emit(Events.SKILL_ACTIVATED, { type, active: false, teamId: teamId });
        });
    }

    /**
     * 检查本地是否激活某技能
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
        for (const key in this.activeSkills) {
            if (this.activeSkills[key]) {
                // 实际扣除物品数量并同步数据库
                const consumed = AccountMgr.consumeItem(key, 1);
                
                if (consumed) {
                    this.activeSkills[key] = false;
                    
                    // 通知本地 UI 关闭高亮
                    EventBus.emit(Events.SKILL_ACTIVATED, { type: key, active: false, teamId: this.scene.myTeamId });
                    
                    // 联网同步关闭状态 (兜底，防止MOVE包丢包导致对方状态卡死)
                    if (this.scene.gameMode === 'pvp_online') {
                        NetworkMgr.send({
                            type: NetMsg.SKILL,
                            payload: { type: key, active: false, teamId: this.scene.myTeamId }
                        });
                    }
                } else {
                    this.activeSkills[key] = false; 
                }
            }
        }
    }
}
