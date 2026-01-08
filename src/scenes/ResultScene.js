
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import GameScene from './GameScene.js';
import RoomScene from './RoomScene.js'; // [新增]
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import { TeamId, SkillType, NetMsg } from '../constants.js';
import ResourceManager from '../managers/ResourceManager.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import Platform from '../managers/Platform.js';

export default class ResultScene extends BaseScene {
    constructor() {
        super();
        this.params = {};
        this.confetti = []; // 粒子数组
        this.elapsed = 0;
    }

    async onEnter(params) {
        super.onEnter(params);
        console.log("Entering ResultScene with params:", params);
        this.params = params;
        const { winner, gameMode, score, stats, myTeamId, currentLevel } = params;
        const { designWidth, designHeight } = GameConfig;

        // 1. 数据处理
        const isWin = winner === myTeamId;
        const opponentId = myTeamId === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
        
        let rewardCoins = 0;
        let unlockedReward = null; // [新增] 存储解锁的物品

        if (isWin) {
            rewardCoins = 100;
            if (gameMode === 'pve' && currentLevel === AccountMgr.userInfo.level) {
                // 首通金币奖励
                rewardCoins += 50;
            }
        }
        
        if (rewardCoins > 0) AccountMgr.addCoins(rewardCoins, false);
        
        // [修改] 通关逻辑调用，并接收奖励返回值
        if (gameMode === 'pve' && isWin) {
            unlockedReward = AccountMgr.completeLevel(currentLevel, false);
        }
        
        const rating = this.calculateRating(isWin, score, stats, myTeamId);
        AccountMgr.recordMatch(gameMode, isWin, rating, {
            scores: score,
            myStats: stats[myTeamId],
            oppStats: stats[opponentId],
            duration: (stats.endTime - stats.startTime) / 1000
        });
        AccountMgr.sync();

        // 2. 视觉构建
        // A. 动态背景
        this.createAtmosphere(designWidth, designHeight, isWin);

        // B. 主面板容器 (居中)
        const panelY = designHeight * 0.55;
        this.mainPanel = new PIXI.Container();
        this.mainPanel.position.set(designWidth / 2, panelY);
        this.container.addChild(this.mainPanel);

        // C. 绘制面板背景
        this.createPanelBackground(920, 620);

        // D. 标题
        this.createHeader(designWidth, 120, isWin, winner);

        // E. 星级
        this.createRatingStars(0, -360, rating); 

        // F. 数据统计
        this.createScoreBoard(0, -180, score, myTeamId, opponentId);
        this.createStatsList(0, -50, stats, score, myTeamId, opponentId);

        // G. 奖励展示 (如果有物品解锁，优先显示物品，否则显示金币)
        if (unlockedReward) {
            this.createUnlockDisplay(0, 240, unlockedReward, rewardCoins);
        } else if (isWin) {
            this.createRewards(0, 240, rewardCoins);
        }

        // H. 按钮
        this.createButtons(designWidth, designHeight, isWin);

        // I. 胜利特效
        if (isWin) {
            this.initConfetti(designWidth, designHeight);
        }
    }

    // --- 视觉构建方法 ---

    createAtmosphere(w, h, isWin) {
        // 1. 深色底图
        const bg = new PIXI.Graphics();
        bg.beginFill(0x111111);
        bg.drawRect(0, 0, w, h);
        bg.endFill();
        this.container.addChild(bg);

        // 2. 放射光 (聚光灯)
        const glowColor = isWin ? 0xF1C40F : 0x34495e; // 胜:金, 负:深蓝
        
        const glowCircle = new PIXI.Graphics();
        glowCircle.beginFill(glowColor, 0.4);
        glowCircle.drawCircle(0, 0, w * 0.6);
        glowCircle.endFill();
        
        const glow = glowCircle;
        glow.position.set(w/2, h/3);
        this.container.addChild(glow);

        this.glowSprite = glow;
    }

    createPanelBackground(w, h) {
        const bg = new PIXI.Graphics();
        bg.beginFill(0x000000, 0.75);
        bg.lineStyle(2, 0xffffff, 0.15);
        bg.drawRoundedRect(-w/2, -h/2, w, h, 40);
        bg.endFill();
        
        bg.beginFill(0xffffff, 0.08);
        bg.drawRoundedRect(-w/2, -h/2, w, 100, 40);
        bg.endFill();

        this.mainPanel.addChild(bg);
    }

    createHeader(w, y, isWin, winner) {
        let titleStr = "";
        let mainColor = []; 
        let strokeColor = 0x000000;

        if (this.params.gameMode === 'pvp_local') {
            if (winner === TeamId.LEFT) {
                titleStr = "红 方 获 胜";
                mainColor = ['#ff7e5f', '#feb47b']; 
            } else if (winner === TeamId.RIGHT) {
                titleStr = "蓝 方 获 胜";
                mainColor = ['#00c6ff', '#0072ff']; 
            } else {
                titleStr = "势 均 力 敌";
                mainColor = ['#bdc3c7', '#2c3e50'];
            }
        } else {
            if (isWin) {
                titleStr = "挑 战 成 功";
                mainColor = ['#FDC830', '#F37335']; 
            } else {
                titleStr = "挑 战 失 败";
                mainColor = ['#8e9eab', '#eef2f3']; 
            }
        }

        const title = new PIXI.Text(titleStr, {
            fontFamily: 'Arial Black', 
            fontSize: 110, 
            fill: mainColor,
            fillGradientType: PIXI.TEXT_GRADIENT.LINEAR_VERTICAL,
            stroke: strokeColor, 
            strokeThickness: 8,
            dropShadow: true, 
            dropShadowColor: 0x000000,
            dropShadowBlur: 10,
            dropShadowDistance: 6
        });
        title.anchor.set(0.5);
        title.position.set(w / 2, y);
        this.container.addChild(title);
    }

    createRatingStars(x, y, rating) {
        const starContainer = new PIXI.Container();
        const starCount = 5;
        const size = 45; 
        const gap = 15;
        
        const fullStars = Math.floor(rating / 2);
        const hasHalf = (rating % 2) >= 1;

        const totalW = starCount * (size * 2 + gap) - gap;
        let startX = -totalW / 2 + size;

        for (let i = 0; i < starCount; i++) {
            const starX = startX + i * (size * 2 + gap);
            
            const bg = this.drawStar(0x333333, size, true);
            bg.position.set(starX, 0);
            starContainer.addChild(bg);

            let fillType = 'none'; 
            if (i < fullStars) fillType = 'full';
            else if (i === fullStars && hasHalf) fillType = 'half';

            if (fillType !== 'none') {
                const fill = this.drawStar(0xFFD700, size, false);
                fill.position.set(starX, 0);
                
                if (fillType === 'half') {
                    const mask = new PIXI.Graphics();
                    mask.beginFill(0xffffff);
                    mask.drawRect(starX - size, -size, size, size * 2); 
                    mask.endFill();
                    fill.mask = mask;
                    starContainer.addChild(mask);
                }
                starContainer.addChild(fill);
            }
        }

        const scoreBg = new PIXI.Graphics();
        scoreBg.beginFill(0x000000, 0.8);
        scoreBg.lineStyle(2, 0xFFD700);
        scoreBg.drawRoundedRect(0, 0, 90, 44, 22);
        scoreBg.endFill();
        scoreBg.position.set(totalW/2 + 40, -22);
        
        const scoreText = new PIXI.Text(rating.toFixed(1), {
            fontSize: 30, fill: 0xFFD700, fontWeight: 'bold'
        });
        scoreText.anchor.set(0.5);
        scoreText.position.set(45, 22);
        scoreBg.addChild(scoreText);
        
        starContainer.addChild(scoreBg);

        starContainer.position.set(x, y);
        this.mainPanel.addChild(starContainer);
    }

    drawStar(color, r, isOutline) {
        const g = new PIXI.Graphics();
        if (isOutline) {
            g.lineStyle(4, 0x555555);
            g.beginFill(0x222222);
        } else {
            g.beginFill(color);
        }
        
        const spikes = 5;
        const outerRadius = r;
        const innerRadius = r * 0.45;
        const cx = 0, cy = 0;
        let rot = Math.PI / 2 * 3;
        let step = Math.PI / spikes;

        g.moveTo(cx, cy - outerRadius);
        for (let i = 0; i < spikes; i++) {
            let x = cx + Math.cos(rot) * outerRadius;
            let y = cy + Math.sin(rot) * outerRadius;
            g.lineTo(x, y);
            rot += step;

            x = cx + Math.cos(rot) * innerRadius;
            y = cy + Math.sin(rot) * innerRadius;
            g.lineTo(x, y);
            rot += step;
        }
        g.lineTo(cx, cy - outerRadius);
        g.closePath();
        g.endFill();
        return g;
    }

    createScoreBoard(x, y, score, myId, oppId) {
        const container = new PIXI.Container();
        container.position.set(x, y);

        const p1Name = this.params.gameMode === 'pve' ? '玩家' : (this.params.gameMode === 'pvp_local' ? '红方' : '我方');
        const p2Name = this.params.gameMode === 'pve' ? '电脑' : (this.params.gameMode === 'pvp_local' ? '蓝方' : '对手');

        const nameStyle = { fontSize: 32, fontWeight: 'bold' };
        
        const t1 = new PIXI.Text(p1Name, { ...nameStyle, fill: 0xe74c3c });
        t1.anchor.set(0.5); t1.x = -150;
        
        const t2 = new PIXI.Text(p2Name, { ...nameStyle, fill: 0x3498db });
        t2.anchor.set(0.5); t2.x = 150;

        const scoreStyle = { fontFamily: 'Arial Black', fontSize: 100, fill: 0xffffff, dropShadow: true, dropShadowBlur: 4 };
        const s1 = new PIXI.Text(score[myId], scoreStyle);
        s1.anchor.set(0.5); s1.x = -150;
        
        const s2 = new PIXI.Text(score[oppId], scoreStyle);
        s2.anchor.set(0.5); s2.x = 150;

        const vs = new PIXI.Text('-', { fontSize: 100, fill: 0x666666 });
        vs.anchor.set(0.5); vs.y = 30;

        t1.y = -80; t2.y = -80;
        s1.y = 40; s2.y = 40;

        container.addChild(t1, t2, s1, vs, s2);
        this.mainPanel.addChild(container);
    }

    createStatsList(x, y, stats, score, myId, oppId) {
        const container = new PIXI.Container();
        container.position.set(x, y);

        const myStats = stats[myId];
        const oppStats = stats[oppId];

        const items = [
            { label: '射门次数', v1: myStats.shots, v2: oppStats.shots, type: 'number' },
            { label: '进球效率', v1: this.fmtPct(score[myId], myStats.shots), v2: this.fmtPct(score[oppId], oppStats.shots), type: 'number' },
            { label: '技能消耗', v1: myStats.skills, v2: oppStats.skills, type: 'skill' }
        ];

        const rowH = 60;

        items.forEach((item, i) => {
            const rowY = i * rowH;
            
            const label = new PIXI.Text(item.label, { fontSize: 32, fill: 0x999999 });
            label.anchor.set(0.5); label.y = rowY;
            container.addChild(label);

            if (item.type === 'skill') {
                this.createSkillRow(container, rowY, item.v1, item.v2);
            } else {
                const val1 = new PIXI.Text(item.v1, { fontSize: 36, fill: 0xffffff, fontWeight: 'bold' });
                val1.anchor.set(1, 0.5); val1.position.set(-150, rowY);
                
                const val2 = new PIXI.Text(item.v2, { fontSize: 36, fill: 0xffffff, fontWeight: 'bold' });
                val2.anchor.set(0, 0.5); val2.position.set(150, rowY);

                container.addChild(val1, val2);

                this.createStatBar(container, -260, rowY, item.v1, item.v2, true);
                this.createStatBar(container, 260, rowY, item.v2, item.v1, false);
            }
        });

        const duration = (stats.endTime - stats.startTime) / 1000;
        const min = Math.floor(duration / 60);
        const sec = Math.floor(duration % 60);
        const totalTurns = myStats.shots + oppStats.shots;
        
        const timeText = new PIXI.Text(`比赛耗时: ${min}分${sec}秒  (共 ${totalTurns} 回合)`, { fontSize: 26, fill: 0x666666 });
        timeText.anchor.set(0.5);
        timeText.y = items.length * rowH + 15;
        container.addChild(timeText);

        this.mainPanel.addChild(container);
    }

    createSkillRow(parent, y, mySkills, oppSkills) {
        this.renderSkillGroup(parent, -150, y, mySkills, true);
        this.renderSkillGroup(parent, 150, y, oppSkills, false);
    }

    renderSkillGroup(parent, startX, y, skills, isAlignRight) {
        const list = [];
        if (skills) {
            for (let k in skills) {
                if (skills[k] > 0) list.push({ type: k, count: skills[k] });
            }
        }

        if (list.length === 0) {
            const t = new PIXI.Text('-', { fontSize: 36, fill: 0x555555, fontWeight: 'bold' });
            t.anchor.set(isAlignRight ? 1 : 0, 0.5);
            t.position.set(startX, y);
            parent.addChild(t);
            return;
        }

        const iconSize = 36;
        const gap = 15;
        let currentX = startX;

        list.forEach(item => {
            const grp = new PIXI.Container();
            const texName = this.getSkillTextureName(item.type);
            const tex = ResourceManager.get(texName);
            const icon = new PIXI.Sprite(tex || PIXI.Texture.WHITE);
            icon.width = iconSize; 
            icon.height = iconSize;
            icon.anchor.set(0, 0.5);
            if (!tex) icon.tint = 0x888888; 

            const txt = new PIXI.Text(`x${item.count}`, { 
                fontSize: 24, fill: 0xffffff, fontWeight: 'bold' 
            });
            txt.anchor.set(0, 0.5);
            txt.x = iconSize + 4; 

            grp.addChild(icon, txt);
            const groupW = iconSize + 4 + txt.width;

            if (isAlignRight) {
                currentX -= groupW;
                grp.position.set(currentX, y);
                currentX -= gap; 
            } else {
                grp.position.set(currentX, y);
                currentX += groupW + gap;
            }
            
            parent.addChild(grp);
        });
    }

    getSkillTextureName(type) {
        const map = {
            'super_aim': 'skill_aim_bg',
            'super_force': 'skill_force_bg',
            'unstoppable': 'skill_unstoppable_bg'
        };
        return map[type];
    }

    createStatBar(parent, x, y, val, otherVal, isLeft) {
        let max = Math.max(parseFloat(val), parseFloat(otherVal));
        if (isNaN(max) || max === 0) max = 1;
        let ratio = parseFloat(val) / max;
        if (isNaN(ratio)) ratio = 0;
        
        const w = 120 * ratio; 
        const h = 10;
        const color = isLeft ? 0x3498db : 0xe74c3c;

        const g = new PIXI.Graphics();
        g.beginFill(color);
        g.drawRoundedRect(0, -h/2, w, h, h/2);
        g.endFill();
        
        if (isLeft) {
            g.scale.x = -1;
            g.x = x;
        } else {
            g.x = x;
        }
        g.y = y;
        parent.addChild(g);
    }

    createRewards(x, y, coins) {
        if (coins <= 0) return;

        const container = new PIXI.Container();
        container.position.set(x, y);

        const glow = new PIXI.Graphics();
        glow.beginFill(0xFFD700, 0.2);
        glow.drawCircle(0, 0, 70); 
        glow.endFill();
        container.addChild(glow);

        const icon = new PIXI.Text('💰', { fontSize: 50 });
        icon.anchor.set(0.5); icon.x = -50;
        
        const text = new PIXI.Text(`+${coins}`, { 
            fontSize: 50, fill: 0xFFD700, fontWeight: 'bold',
            dropShadow: true, dropShadowBlur: 2
        });
        text.anchor.set(0.5); text.x = 40;

        container.addChild(icon, text);
        this.mainPanel.addChild(container);
    }

    // [新增] 专门用于展示解锁奖励的UI
    createUnlockDisplay(x, y, reward, coins) {
        const container = new PIXI.Container();
        container.position.set(x, y);

        // 标题
        const title = new PIXI.Text("新物品解锁!", {
            fontSize: 28, fill: 0x2ecc71, fontWeight: 'bold'
        });
        title.anchor.set(0.5);
        title.y = -50;
        container.addChild(title);

        // 物品图标
        const bg = new PIXI.Graphics();
        bg.beginFill(0x333333);
        bg.lineStyle(2, 0xFFD700);
        bg.drawRoundedRect(-40, -40, 80, 80, 10);
        bg.endFill();
        container.addChild(bg);

        // [修改] 针对足球类型进行特殊渲染，使其显示为圆形球体
        if (reward.type === 'ball') {
            const texKey = reward.id === 1 ? 'ball_texture' : `ball_texture_${reward.id}`;
            const tex = ResourceManager.get(texKey);
            if (tex) {
                const radius = 30; // 对应直径 60
                const b = new PIXI.TilingSprite(tex, radius*4, radius*4);
                b.anchor.set(0.5); 
                b.tileScale.set(0.25); 
                b.width = b.height = radius*2;
                
                const m = new PIXI.Graphics().beginFill(0xffffff).drawCircle(0, 0, radius).endFill();
                b.mask = m; 
                container.addChild(m, b);
            }
        } else {
            let iconTex = null;
            if (reward.type === 'striker') iconTex = ResourceManager.get(`striker_red_${reward.id}`);
            else if (reward.type === 'field') iconTex = ResourceManager.get(`field_${reward.id}`);
            else if (reward.type === 'skill') {
                const map = { [SkillType.SUPER_AIM]: 'skill_aim_bg', [SkillType.UNSTOPPABLE]: 'skill_unstoppable_bg', [SkillType.SUPER_FORCE]: 'skill_force_bg' };
                iconTex = ResourceManager.get(map[reward.id]);
            }

            if (iconTex) {
                const sp = new PIXI.Sprite(iconTex);
                sp.anchor.set(0.5);
                sp.width = sp.height = 60;
                container.addChild(sp);
            }
        }

        // 物品名称
        let nameStr = reward.name;
        if (reward.type === 'skill') nameStr += ` x${reward.count}`;

        const nameText = new PIXI.Text(nameStr, {
            fontSize: 32, fill: 0xFFFFFF, fontWeight: 'bold'
        });
        nameText.anchor.set(0.5);
        nameText.y = 55;
        container.addChild(nameText);

        // 如果还有金币奖励，显示在更下方
        if (coins > 0) {
            const coinText = new PIXI.Text(`+${coins} 💰`, { fontSize: 24, fill: 0xFFD700 });
            coinText.anchor.set(0.5);
            coinText.y = 90;
            container.addChild(coinText);
        }

        this.mainPanel.addChild(container);
    }

    createButtons(w, h, isWin) {
        const btnY = h - 100;
        const btnW = 240;
        const btnH = 80;
        const gap = 40;
        const startX = w / 2 - btnW - gap / 2;

        let leftText = '返回主页';
        let leftAction = () => SceneManager.changeScene(MenuScene);
        let leftColor = 0x7f8c8d;

        let rightText = "再来一局";
        let rightAction = () => SceneManager.changeScene(GameScene, { mode: this.params.gameMode });
        let rightColor = 0x27ae60;

        // [核心修改] 针对 PVP Online 的按钮逻辑
        if (this.params.gameMode === 'pvp_online') {
            leftText = '结束游戏';
            leftColor = 0xc0392b; // 红色
            leftAction = () => {
                // 彻底退出：发送 LEAVE 并断开连接
                NetworkMgr.send({ type: NetMsg.LEAVE });
                NetworkMgr.close();
                Platform.removeStorage('last_room_id');
                SceneManager.changeScene(MenuScene);
            };

            rightText = '再来一局';
            rightColor = 0x27ae60;
            rightAction = () => {
                // 复玩：保持连接，回到房间等待界面 (状态已重置)
                SceneManager.changeScene(RoomScene, { roomId: this.params.roomId });
            };
        }
        else if (this.params.gameMode === 'pve') {
            if (isWin) {
                rightText = "下一关";
                rightAction = () => SceneManager.changeScene(GameScene, { mode: 'pve', level: this.params.currentLevel + 1 });
                rightColor = 0xF39C12;
            } else {
                rightText = "重新挑战";
                rightAction = () => SceneManager.changeScene(GameScene, { mode: 'pve', level: this.params.currentLevel });
                rightColor = 0x3498db;
            }
        }

        const menuBtn = new Button({
            text: leftText, width: btnW, height: btnH, color: leftColor,
            onClick: leftAction
        });
        menuBtn.position.set(startX, btnY - btnH/2);
        this.container.addChild(menuBtn);

        const nextBtn = new Button({
            text: rightText, width: btnW, height: btnH, color: rightColor,
            onClick: rightAction
        });
        nextBtn.position.set(startX + btnW + gap, btnY - btnH/2);
        this.container.addChild(nextBtn);
    }

    // --- 粒子特效 ---

    initConfetti(w, h) {
        const colors = [0xFFD700, 0xE74C3C, 0x3498DB, 0x2ECC71, 0xFFFFFF];
        for (let i = 0; i < 60; i++) {
            const conf = new PIXI.Graphics();
            conf.beginFill(colors[Math.floor(Math.random() * colors.length)]);
            conf.drawRect(0, 0, 10, 20); 
            conf.endFill();
            
            conf.x = Math.random() * w;
            conf.y = Math.random() * h - h; 
            
            conf.vy = Math.random() * 5 + 2; 
            conf.vx = Math.random() * 4 - 2; 
            conf.rotationSpeed = Math.random() * 0.1 - 0.05;
            
            this.container.addChild(conf);
            this.confetti.push(conf);
        }
    }

    update(delta) {
        if (this.glowSprite) {
            this.elapsed += delta * 0.001;
            const scale = 1 + Math.sin(this.elapsed * 2) * 0.05;
            this.glowSprite.scale.set(scale);
            this.glowSprite.rotation += 0.001 * delta;
        }

        if (this.confetti.length > 0) {
            const h = GameConfig.designHeight;
            this.confetti.forEach(c => {
                c.y += c.vy;
                c.x += Math.sin(c.y * 0.01) + c.vx;
                c.rotation += c.rotationSpeed;

                if (c.y > h) {
                    c.y = -20;
                    c.x = Math.random() * GameConfig.designWidth;
                }
            });
        }
    }

    fmtPct(val, total) {
        if (!total) return '0%';
        return Math.floor((val / total) * 100) + '%';
    }

    calculateRating(isWin, score, stats, myId) {
        const oppId = myId === 0 ? 1 : 0;
        let points = 5.0; 
        if (isWin) points += 3.0;
        else if (score[myId] === score[oppId]) points += 1.5; 
        const diff = score[myId] - score[oppId];
        points += Math.max(-1, Math.min(diff * 0.5, 1.0)); 
        const myShots = stats[myId].shots || 1; 
        const accuracy = score[myId] / myShots;
        if (accuracy > 0.5) points += 1.0;
        else if (accuracy > 0.3) points += 0.5;
        if (stats[myId].shots > stats[oppId].shots) points += 0.5;
        if (score[oppId] === 0) points += 0.5;
        return Math.min(10.0, Math.max(0, points));
    }
}
