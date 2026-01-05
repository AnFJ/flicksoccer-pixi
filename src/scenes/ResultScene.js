
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import LevelSelectScene from './LevelSelectScene.js';
import GameScene from './GameScene.js';
import AccountMgr from '../managers/AccountMgr.js';
import ResourceManager from '../managers/ResourceManager.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

export default class ResultScene extends BaseScene {
    constructor() {
        super();
        this.params = {};
    }

    async onEnter(params) {
        super.onEnter(params);
        this.params = params;
        const { winner, gameMode, score, stats, myTeamId, currentLevel } = params;
        const { designWidth, designHeight } = GameConfig;

        // 1. 处理数据和奖励
        const isWin = winner === myTeamId;
        const opponentId = myTeamId === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
        
        let rewardCoins = 0;
        let isLevelCleared = false;

        // 计算奖励逻辑
        if (isWin) {
            rewardCoins = 100; // 基础胜利金币
            
            if (gameMode === 'pve') {
                // PVE 通关逻辑
                const currentProgress = AccountMgr.userInfo.level;
                if (currentLevel === currentProgress) {
                    isLevelCleared = true;
                    // 通关额外奖励 (首次)
                    rewardCoins += 50;
                }
            }
        }

        // 发放金币
        if (rewardCoins > 0) {
            AccountMgr.addCoins(rewardCoins, false);
        }
        
        // PVE 关卡推进
        if (gameMode === 'pve' && isWin) {
            AccountMgr.completeLevel(currentLevel, false);
        }
        
        // 提交到后端 (生涯统计 + 对战记录)
        const rating = this.calculateRating(isWin, score, stats, myTeamId);
        AccountMgr.recordMatch(gameMode, isWin, rating, {
            scores: score,
            myStats: stats[myTeamId],
            oppStats: stats[opponentId],
            duration: (stats.endTime - stats.startTime) / 1000
        });
        AccountMgr.sync();

        // 2. 渲染 UI
        this.createBackground(designWidth, designHeight);
        this.createHeader(designWidth, isWin, winner);
        this.createRatingStars(designWidth, rating);
        this.createStatsTable(designWidth, designHeight, score, stats, myTeamId, opponentId);
        this.createRewards(designWidth, designHeight, isWin, rewardCoins);
        this.createButtons(designWidth, designHeight, isWin);
    }

    // 计算评分 (0 - 10)
    calculateRating(isWin, score, stats, myId) {
        const oppId = myId === 0 ? 1 : 0;
        let points = 5.0; // 基础分

        // 胜负
        if (isWin) points += 3.0;
        else if (score[myId] === score[oppId]) points += 1.5; // 平局

        // 净胜球
        const diff = score[myId] - score[oppId];
        points += Math.max(-1, Math.min(diff * 0.5, 1.0)); // 封顶 +1.0

        // 进球效率 (进球/射门)
        const myShots = stats[myId].shots || 1; // 避免除0
        const accuracy = score[myId] / myShots;
        if (accuracy > 0.5) points += 1.0;
        else if (accuracy > 0.3) points += 0.5;

        // 压制力 (射门数 > 对手)
        if (stats[myId].shots > stats[oppId].shots) points += 0.5;

        // 零封奖励
        if (score[oppId] === 0) points += 0.5;

        return Math.min(10.0, Math.max(0, points));
    }

    createBackground(w, h) {
        // 深色半透明背景
        const bg = new PIXI.Graphics();
        bg.beginFill(0x1a1a1a, 0.95);
        bg.drawRect(0, 0, w, h);
        bg.endFill();
        this.container.addChild(bg);

        // 装饰性光效
        const glow = new PIXI.Sprite(PIXI.Texture.WHITE);
        glow.width = w; glow.height = 300;
        glow.tint = 0x3498db; glow.alpha = 0.1;
        this.container.addChild(glow);
    }

    createHeader(w, isWin, winner) {
        let titleStr = "";
        let color = 0xffffff;

        if (this.params.gameMode === 'pvp_local') {
            titleStr = winner === TeamId.LEFT ? "红方获胜" : (winner === TeamId.RIGHT ? "蓝方获胜" : "平 局");
            color = 0xF1C40F;
        } else {
            titleStr = isWin ? "挑 战 成 功" : "挑 战 失 败";
            color = isWin ? 0xF1C40F : 0x95a5a6;
        }

        const title = new PIXI.Text(titleStr, {
            fontFamily: 'Arial Black', fontSize: 80, fill: color,
            dropShadow: true, dropShadowBlur: 6, stroke: 0x000000, strokeThickness: 4
        });
        title.anchor.set(0.5);
        title.position.set(w / 2, 100);
        this.container.addChild(title);
    }

    createRatingStars(w, rating) {
        const starContainer = new PIXI.Container();
        const starCount = 5;
        const size = 50;
        const gap = 10;
        
        // 10分制映射到5星
        const fillAmount = rating / 2.0; 

        for (let i = 0; i < starCount; i++) {
            const bg = this.drawStar(0x555555, size);
            bg.x = i * (size * 2 + gap);
            starContainer.addChild(bg);

            // 填充部分
            if (fillAmount > i) {
                const fill = this.drawStar(0xFFFF00, size);
                fill.x = i * (size * 2 + gap);
                
                // 处理半星
                if (fillAmount < i + 1) {
                    const mask = new PIXI.Graphics();
                    mask.beginFill(0xffffff);
                    mask.drawRect(fill.x - size, fill.y - size, size, size * 2); // 只显示左半边
                    mask.endFill();
                    fill.mask = mask;
                    starContainer.addChild(mask);
                }
                starContainer.addChild(fill);
            }
        }

        starContainer.pivot.set(starContainer.width / 2, size / 2);
        starContainer.position.set(w / 2, 190);
        this.container.addChild(starContainer);

        const scoreText = new PIXI.Text(rating.toFixed(1), {
            fontSize: 30, fill: 0xFFD700, fontWeight: 'bold'
        });
        scoreText.anchor.set(0.5);
        scoreText.position.set(w/2 + starContainer.width/2 + 40, 190);
        this.container.addChild(scoreText);
    }

    drawStar(color, r) {
        const g = new PIXI.Graphics();
        g.beginFill(color);
        g.drawStar(0, 0, 5, r, r * 0.5);
        g.endFill();
        return g;
    }

    createStatsTable(w, h, score, stats, myId, oppId) {
        const tableY = 280;
        const colWidth = 250;
        const rowHeight = 60;
        
        const container = new PIXI.Container();
        container.position.set(w / 2, tableY);
        this.container.addChild(container);

        // 1. 玩家名字列头
        const p1Name = this.params.gameMode === 'pve' ? '玩家' : (this.params.gameMode === 'pvp_local' ? '红方' : '我方');
        const p2Name = this.params.gameMode === 'pve' ? 'AI' : (this.params.gameMode === 'pvp_local' ? '蓝方' : '对手');

        const leftName = new PIXI.Text(p1Name, { fontSize: 32, fill: 0x3498db, fontWeight: 'bold' });
        leftName.anchor.set(0.5); leftName.x = -colWidth;
        
        const rightName = new PIXI.Text(p2Name, { fontSize: 32, fill: 0xe74c3c, fontWeight: 'bold' });
        rightName.anchor.set(0.5); rightName.x = colWidth;

        container.addChild(leftName, rightName);

        // 2. 数据行
        const rows = [
            { label: '比 分', v1: score[myId], v2: score[oppId] },
            { label: '射 门', v1: stats[myId].shots, v2: stats[oppId].shots },
            { label: '进球率', v1: this.fmtPct(score[myId], stats[myId].shots), v2: this.fmtPct(score[oppId], stats[oppId].shots) },
            { label: '技能消耗', type: 'skill' } // 特殊处理
        ];

        let currentY = 70;

        rows.forEach(row => {
            // 中间标签
            const label = new PIXI.Text(row.label, { fontSize: 26, fill: 0xaaaaaa });
            label.anchor.set(0.5); label.y = currentY;
            container.addChild(label);

            if (row.type === 'skill') {
                this.renderSkillIcons(container, -colWidth, currentY, stats[myId].skills);
                this.renderSkillIcons(container, colWidth, currentY, stats[oppId].skills);
                currentY += 60; // 技能行高一点
            } else {
                // 左侧数据
                const t1 = new PIXI.Text(row.v1, { fontSize: 36, fill: 0xffffff, fontWeight: 'bold' });
                t1.anchor.set(0.5); t1.position.set(-colWidth, currentY);
                
                // 右侧数据
                const t2 = new PIXI.Text(row.v2, { fontSize: 36, fill: 0xffffff, fontWeight: 'bold' });
                t2.anchor.set(0.5); t2.position.set(colWidth, currentY);
                
                container.addChild(t1, t2);
                currentY += rowHeight;
            }
            
            // 分割线
            const line = new PIXI.Graphics();
            line.beginFill(0xffffff, 0.1);
            line.drawRect(-w/2 + 100, currentY - rowHeight/2 + 5, w - 200, 2);
            line.endFill();
            container.addChild(line);
        });

        // 总耗时
        const duration = (stats.endTime - stats.startTime) / 1000;
        const min = Math.floor(duration / 60);
        const sec = Math.floor(duration % 60);
        const timeText = new PIXI.Text(`总耗时: ${min}分${sec}秒`, { fontSize: 24, fill: 0x666666 });
        timeText.anchor.set(0.5);
        timeText.position.set(0, currentY + 20);
        container.addChild(timeText);
    }

    renderSkillIcons(parent, x, y, skillMap) {
        if (!skillMap || Object.keys(skillMap).length === 0) {
            const t = new PIXI.Text('-', { fontSize: 24, fill: 0x666666 });
            t.anchor.set(0.5); t.position.set(x, y);
            parent.addChild(t);
            return;
        }

        const keys = Object.keys(skillMap);
        const iconSize = 40;
        const gap = 10;
        const totalW = keys.length * iconSize + (keys.length - 1) * gap;
        let curX = x - totalW / 2 + iconSize/2;

        keys.forEach(k => {
            // 简单画个圈代表技能，或者用 ResourceManager 获取图标
            // 这里简化：用首字母
            const g = new PIXI.Graphics();
            g.beginFill(0x444444); g.drawCircle(0, 0, iconSize/2); g.endFill();
            g.position.set(curX, y);
            
            const txt = new PIXI.Text(skillMap[k], { fontSize: 18, fill: 0xffffff });
            txt.anchor.set(0.5); txt.position.set(curX, y);
            
            parent.addChild(g, txt);
            curX += iconSize + gap;
        });
    }

    fmtPct(goals, shots) {
        if (!shots) return '0%';
        return Math.floor((goals / shots) * 100) + '%';
    }

    createRewards(w, h, isWin, coins) {
        if (!isWin) return;

        const y = h - 280;
        const container = new PIXI.Container();
        container.position.set(w/2, y);
        this.container.addChild(container);

        const label = new PIXI.Text('获得奖励', { fontSize: 28, fill: 0xF1C40F });
        label.anchor.set(0.5); label.y = -40;
        container.addChild(label);

        const coinIcon = new PIXI.Text('💰', { fontSize: 40 });
        coinIcon.anchor.set(0.5); coinIcon.x = -30;
        
        const coinText = new PIXI.Text(`+${coins}`, { fontSize: 40, fill: 0xffffff, fontWeight: 'bold' });
        coinText.anchor.set(0.5); coinText.x = 30;

        container.addChild(coinIcon, coinText);
    }

    createButtons(w, h, isWin) {
        const btnY = h - 120;
        
        // 结束/菜单按钮
        const menuBtn = new Button({
            text: '返回主页', width: 220, height: 80, color: 0x95a5a6,
            onClick: () => SceneManager.changeScene(MenuScene)
        });
        menuBtn.position.set(w/2 - 150, btnY);
        this.container.addChild(menuBtn);

        // 继续/重试按钮
        let nextText = "再来一局";
        let nextAction = () => SceneManager.changeScene(GameScene, { mode: this.params.gameMode });

        if (this.params.gameMode === 'pve') {
            if (isWin) {
                nextText = "下一关";
                nextAction = () => SceneManager.changeScene(GameScene, { mode: 'pve', level: this.params.currentLevel + 1 });
            } else {
                nextText = "重新挑战";
                nextAction = () => SceneManager.changeScene(GameScene, { mode: 'pve', level: this.params.currentLevel });
            }
        } else if (this.params.gameMode === 'pvp_local') {
            nextText = "重新开始";
            nextAction = () => SceneManager.changeScene(GameScene, { mode: 'pvp_local' });
        }

        const nextBtn = new Button({
            text: nextText, width: 220, height: 80, color: 0x27ae60,
            onClick: nextAction
        });
        nextBtn.position.set(w/2 + 150, btnY);
        this.container.addChild(nextBtn);
    }
}
