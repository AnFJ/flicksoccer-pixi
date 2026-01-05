
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import GameScene from './GameScene.js';
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import { TeamId } from '../constants.js';

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

        // 1. 数据处理 (保持原有逻辑)
        const isWin = winner === myTeamId;
        const opponentId = myTeamId === TeamId.LEFT ? TeamId.RIGHT : TeamId.LEFT;
        
        let rewardCoins = 0;
        if (isWin) {
            rewardCoins = 100;
            if (gameMode === 'pve' && currentLevel === AccountMgr.userInfo.level) {
                rewardCoins += 50;
            }
        }
        if (rewardCoins > 0) AccountMgr.addCoins(rewardCoins, false);
        if (gameMode === 'pve' && isWin) AccountMgr.completeLevel(currentLevel, false);
        
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
        // 面板高度 660, 屏幕高 1080. 中心大概在 58% 位置
        const panelY = designHeight * 0.55;
        this.mainPanel = new PIXI.Container();
        this.mainPanel.position.set(designWidth / 2, panelY);
        this.container.addChild(this.mainPanel);

        // C. 绘制面板背景 (增大尺寸以容纳更多信息)
        this.createPanelBackground(920, 620);

        // D. 标题 (在面板上方，独立于面板)
        this.createHeader(designWidth, 120, isWin, winner);

        // E. 星级 (挂载在面板上，位于面板顶部边缘)
        this.createRatingStars(0, -360, rating); 

        // F. 数据统计 (在面板内部)
        // 比分板上移
        this.createScoreBoard(0, -180, score, myTeamId, opponentId);
        // 数据列表居中
        this.createStatsList(0, -50, stats, score, myTeamId, opponentId);

        // G. 奖励展示 (下移，避免遮挡)
        if (isWin) {
            this.createRewards(0, 240, rewardCoins);
        }

        // H. 按钮 (屏幕底部)
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
        // 半透明深色背景
        bg.beginFill(0x000000, 0.75); // 加深一点背景，提高对比度
        // 边框
        bg.lineStyle(2, 0xffffff, 0.15);
        bg.drawRoundedRect(-w/2, -h/2, w, h, 40);
        bg.endFill();
        
        // 顶部高光条
        bg.beginFill(0xffffff, 0.08);
        bg.drawRoundedRect(-w/2, -h/2, w, 100, 40);
        bg.endFill();

        this.mainPanel.addChild(bg);
    }

    createHeader(w, y, isWin, winner) {
        let titleStr = "";
        let mainColor = []; // 渐变色数组
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
        const size = 45; // 略大一点
        const gap = 15;
        
        const fullStars = Math.floor(rating / 2);
        const hasHalf = (rating % 2) >= 1;

        const totalW = starCount * (size * 2 + gap) - gap;
        let startX = -totalW / 2 + size;

        for (let i = 0; i < starCount; i++) {
            const starX = startX + i * (size * 2 + gap);
            
            // 底色
            const bg = this.drawStar(0x333333, size, true);
            bg.position.set(starX, 0);
            starContainer.addChild(bg);

            // 亮色
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

        // 分数胶囊
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
        
        // 名字放更开一点
        const t1 = new PIXI.Text(p1Name, { ...nameStyle, fill: 0x3498db });
        t1.anchor.set(0.5); t1.x = -150;
        
        const t2 = new PIXI.Text(p2Name, { ...nameStyle, fill: 0xe74c3c });
        t2.anchor.set(0.5); t2.x = 150;

        // 大比分
        const scoreStyle = { fontFamily: 'Arial Black', fontSize: 100, fill: 0xffffff, dropShadow: true, dropShadowBlur: 4 };
        const s1 = new PIXI.Text(score[myId], scoreStyle);
        s1.anchor.set(0.5); s1.x = -150;
        
        const s2 = new PIXI.Text(score[oppId], scoreStyle);
        s2.anchor.set(0.5); s2.x = 150;

        const vs = new PIXI.Text('-', { fontSize: 100, fill: 0x666666 });
        vs.anchor.set(0.5); vs.y = 30;

        // 布局调整
        t1.y = -80; t2.y = -80;
        s1.y = 40; s2.y = 40;

        container.addChild(t1, t2, s1, vs, s2);
        this.mainPanel.addChild(container);
    }

    createStatsList(x, y, stats, score, myId, oppId) {
        const container = new PIXI.Container();
        container.position.set(x, y); // y=20 (相对中心)

        const myStats = stats[myId];
        const oppStats = stats[oppId];

        const items = [
            { label: '射门次数', v1: myStats.shots, v2: oppStats.shots },
            { label: '进球效率', v1: this.fmtPct(score[myId], myStats.shots), v2: this.fmtPct(score[oppId], oppStats.shots) },
            { label: '技能消耗', v1: this.countSkills(myStats.skills), v2: this.countSkills(oppStats.skills) }
        ];

        const rowH = 60; // 增加行高

        items.forEach((item, i) => {
            const rowY = i * rowH;
            
            const label = new PIXI.Text(item.label, { fontSize: 32, fill: 0x999999 });
            label.anchor.set(0.5); label.y = rowY;
            container.addChild(label);

            const val1 = new PIXI.Text(item.v1, { fontSize: 36, fill: 0xffffff, fontWeight: 'bold' });
            val1.anchor.set(1, 0.5); val1.position.set(-150, rowY); // 离中心远一点
            
            const val2 = new PIXI.Text(item.v2, { fontSize: 36, fill: 0xffffff, fontWeight: 'bold' });
            val2.anchor.set(0, 0.5); val2.position.set(150, rowY);

            container.addChild(val1, val2);

            // 进度条
            this.createStatBar(container, -260, rowY, item.v1, item.v2, true);
            this.createStatBar(container, 260, rowY, item.v2, item.v1, false);
        });

        // 耗时 (下移，避免和最后一行太近)
        const duration = (stats.endTime - stats.startTime) / 1000;
        const min = Math.floor(duration / 60);
        const sec = Math.floor(duration % 60);
        const timeText = new PIXI.Text(`比赛耗时: ${min}分${sec}秒`, { fontSize: 30, fill: 0x666666 });
        timeText.anchor.set(0.5);
        timeText.y = items.length * rowH + 10;
        container.addChild(timeText);

        this.mainPanel.addChild(container);
    }

    createStatBar(parent, x, y, val, otherVal, isLeft) {
        let max = Math.max(parseFloat(val), parseFloat(otherVal));
        if (isNaN(max) || max === 0) max = 1;
        
        let ratio = parseFloat(val) / max;
        if (isNaN(ratio)) ratio = 0;
        
        const w = 120 * ratio; // 稍长一点
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

        // 发光底图
        const glow = new PIXI.Graphics();
        glow.beginFill(0xFFD700, 0.2);
        glow.drawCircle(0, 0, 70); // 更大光圈
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

    createButtons(w, h, isWin) {
        // 按钮位于屏幕底部
        const btnY = h - 100;
        
        const btnW = 240;
        const btnH = 80;
        const gap = 40;

        // 计算居中起始点
        // 总宽 = 240*2 + 40 = 520
        // 左按钮左边缘 = w/2 - 260
        // 右按钮左边缘 = w/2 + 20
        const startX = w / 2 - btnW - gap / 2;

        // 返回按钮
        const menuBtn = new Button({
            text: '返回主页', width: btnW, height: btnH, color: 0x7f8c8d,
            onClick: () => SceneManager.changeScene(MenuScene)
        });
        // Button 默认 anchor 是左上角，所以要修正位置
        menuBtn.position.set(startX, btnY - btnH/2);
        this.container.addChild(menuBtn);

        // 继续按钮
        let nextText = "再来一局";
        let nextAction = () => SceneManager.changeScene(GameScene, { mode: this.params.gameMode });
        let btnColor = 0x27ae60;

        if (this.params.gameMode === 'pve') {
            if (isWin) {
                nextText = "下一关";
                nextAction = () => SceneManager.changeScene(GameScene, { mode: 'pve', level: this.params.currentLevel + 1 });
                btnColor = 0xF39C12;
            } else {
                nextText = "重新挑战";
                nextAction = () => SceneManager.changeScene(GameScene, { mode: 'pve', level: this.params.currentLevel });
                btnColor = 0x3498db;
            }
        }

        const nextBtn = new Button({
            text: nextText, width: btnW, height: btnH, color: btnColor,
            onClick: nextAction
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

    countSkills(skillMap) {
        if (!skillMap) return 0;
        return Object.values(skillMap).reduce((a, b) => a + b, 0);
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
