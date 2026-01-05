
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
        this.activeSkills = {
            [SkillType.SUPER_AIM]: false,
            [SkillType.SUPER_FORCE]: false,
            [SkillType.UNSTOPPABLE]: false
        };
    }

    toggleSkill(type) {
        if (this.scene.isMoving || this.scene.isGameOver) {
            Platform.showToast("当前无法使用技能");
            return;
        }

        const isMyTurn = this.scene.turnMgr.currentTurn === this.scene.myTeamId;
        if (this.scene.gameMode === 'pvp_online' && !isMyTurn) {
            Platform.showToast("非自己回合");
            return;
        }
        if (this.scene.gameMode === 'pve' && !isMyTurn) {
             Platform.showToast("非自己回合");
            return;
        }

        if (!this.activeSkills[type]) { 
            const count = AccountMgr.getItemCount(type);
            if (count <= 0) {
                Platform.showToast("道具数量不足");
                return;
            }
        }

        this.activeSkills[type] = !this.activeSkills[type];
        const isActive = this.activeSkills[type];

        EventBus.emit(Events.SKILL_ACTIVATED, { type, active: isActive, teamId: this.scene.myTeamId });

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

    handleRemoteSkill(payload) {
        if (payload.teamId === this.scene.myTeamId) return; 
        const { type, active } = payload;
        EventBus.emit(Events.SKILL_ACTIVATED, { type, active, teamId: payload.teamId });
    }

    resetRemoteSkills(teamId) {
        Object.values(SkillType).forEach(type => {
            EventBus.emit(Events.SKILL_ACTIVATED, { type, active: false, teamId: teamId });
        });
    }

    isActive(type) {
        return !!this.activeSkills[type];
    }

    consumeSkills() {
        for (const key in this.activeSkills) {
            if (this.activeSkills[key]) {
                const consumed = AccountMgr.consumeItem(key, 1);
                
                if (consumed) {
                    this.activeSkills[key] = false;
                    
                    // [新增] 统计消耗
                    if (this.scene.recordSkillUsage) {
                        this.scene.recordSkillUsage(this.scene.myTeamId, key);
                    }

                    EventBus.emit(Events.SKILL_ACTIVATED, { type: key, active: false, teamId: this.scene.myTeamId });
                    
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
