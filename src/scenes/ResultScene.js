
import * as PIXI from 'pixi.js';
import BaseScene from './BaseScene.js';
import SceneManager from '../managers/SceneManager.js';
import MenuScene from './MenuScene.js';
import GameScene from './GameScene.js';
import RoomScene from './RoomScene.js'; 
import AccountMgr from '../managers/AccountMgr.js';
import Button from '../ui/Button.js';
import { GameConfig } from '../config.js';
import { TeamId, SkillType, NetMsg, LIVE_FLICK_LEVELS } from '../constants.js';
import ResourceManager from '../managers/ResourceManager.js';
import NetworkMgr from '../managers/NetworkMgr.js';
import Platform from '../managers/Platform.js';
import LiveFlickScene from '../subpackages/live_flick/scenes/LiveFlickScene.js';

import UserBehaviorMgr from '../managers/UserBehaviorMgr.js';

export default class ResultScene extends BaseScene {
    constructor() {
        super();
        this.sceneName = 'ResultScene';
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
        let unlockedReward = null; 

        if (isWin) {
            rewardCoins = 100;
            // [修改] 增加对 live_flick 关卡模式的判断
            const isLevelMode = gameMode === 'pve' || (gameMode === 'live_flick' && params.isLevelMode);
            const currentLvlNum = parseInt(currentLevel);
            const userLvlNum = parseInt(AccountMgr.userInfo.level);
            
            if (isLevelMode && currentLvlNum === userLvlNum) {
                // 首通金币奖励
                rewardCoins += 50;
            }
        }
        
        if (rewardCoins > 0) AccountMgr.addCoins(rewardCoins, false);
        
        // [修改] 增加对 live_flick 关卡模式的判断
        const isLevelMode = gameMode === 'pve' || (gameMode === 'live_flick' && params.isLevelMode);
        if (isLevelMode && isWin) {
            unlockedReward = AccountMgr.completeLevel(currentLevel, false);
            console.log(`[ResultScene] Level completion processed. Unlocked:`, unlockedReward);
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
        // A. 动态背景 (使用胜/负专属球场图)
        this.createAtmosphere(designWidth, designHeight, isWin);

        // B. 主面板容器 (居中)
        const panelY = designHeight * 0.55;
        this.mainPanel = new PIXI.Container();
        this.mainPanel.position.set(designWidth / 2, panelY);
        this.container.addChild(this.mainPanel);

        // C. 绘制面板背景
        this.createPanelBackground(960, 600);

        // D. 标题 (在面板上方)
        this.createHeader(designWidth, 120, isWin, winner);

        // E. 星级 (在标题下方，面板上方，使用图片素材)
        this.createRatingStars(-60, -370, rating); 

        // F. 数据统计与头部 (都在面板内部)
        // [核心修改] 传入完整的参数以便解析名字头像
        this.createScoreBoard(0, score, params);
        this.createStatsList(0, -15, stats, score, myTeamId, opponentId);

        // G. 奖励展示 
        const rewardY = 250; // 沉底
        if (unlockedReward) {
            this.createUnlockDisplay(0, rewardY, unlockedReward, rewardCoins);
        } else if (isWin) {
            this.createRewards(0, rewardY, rewardCoins);
        }

        // H. 按钮 (使用图片素材)
        this.createButtons(designWidth, designHeight, isWin);

        // I. 胜利特效
        if (isWin) {
            this.initConfetti(designWidth, designHeight);
        }

        // J. [新增] 弹出插屏广告
        // 获取结算插屏广告ID
        const adConfig = GameConfig.adConfig[Platform.env];
        const adUnitId = adConfig && adConfig.interstitial ? adConfig.interstitial.game_over : null;
        
        // [修改] 广告展示逻辑：插屏优先，插屏关闭后或无插屏时再展示 Custom Ad
        Platform.showInterstitialAd(adUnitId).then(() => {
            // 插屏关闭后 (或失败后)，延迟 0.5s 展示 Custom Ad
            setTimeout(() => {
                if (this.container && !this.container.destroyed) {
                    if (adConfig && adConfig.custom && Platform.env !== 'douyin') {
                        Platform.showCustomAd(adConfig.custom.result_left, { width: 300 }, 'left_top');
                        Platform.showCustomAd(adConfig.custom.result_right, { width: 300 }, 'right_top');
                    }
                }
            }, 50);
        });
    }

    onExit() {
        super.onExit();
        Platform.hideGameAds();
    }

    // --- 视觉构建方法 ---

    createAtmosphere(w, h, isWin) {
        // 1. 根据胜负选择全屏背景
        const bgKey = isWin ? 'bg_result_victory' : 'bg_result_failed';
        let bgTex = ResourceManager.get(bgKey);
        
        // 如果特定背景加载失败，尝试回退到之前的通用背景(如果有)
        if (!bgTex) bgTex = ResourceManager.get('bg_result_field');

        if (bgTex) {
            const bg = new PIXI.Sprite(bgTex);
            bg.anchor.set(0.5);
            bg.position.set(w / 2, h / 2);
            
            // Cover 模式适配：优先填满
            // 比例取 max(屏宽/图宽, 屏高/图高)
            const scale = Math.max(w / bg.texture.width, h / bg.texture.height);
            bg.scale.set(scale);
            
            this.container.addChild(bg);
        } else {
            // 兜底纯色
            const bg = new PIXI.Graphics();
            bg.beginFill(0x1a1a1a);
            bg.drawRect(0, 0, w, h);
            bg.endFill();
            this.container.addChild(bg);
        }

        // 2. 黑色遮罩 (压暗背景，让面板突出)
        // 失败时可以让背景稍微暗一点，胜利时亮一点
        const overlayAlpha = isWin ? 0.6 : 0.75;
        const overlay = new PIXI.Graphics();
        overlay.beginFill(0x000000, overlayAlpha); 
        overlay.drawRect(0, 0, w, h);
        overlay.endFill();
        this.container.addChild(overlay);

        // [修改] 移除了橘黄色的放射光 (聚光灯效果)，使用户提到的"橘黄色蒙版"消失
        this.glowSprite = null;
    }

    createPanelBackground(w, h) {
        // 使用 result_bg 素材作为 NineSlicePlane (金属大边框)
        const bgTex = ResourceManager.get('result_bg');
        let bg;
        
        if (bgTex) {
            // 切片边距
            bg = new PIXI.NineSlicePlane(bgTex, 60, 60, 60, 60);
            bg.width = w;
            bg.height = h;
            bg.pivot.set(w/2, h/2);
        } else {
            // 兜底绘制
            bg = new PIXI.Graphics();
            bg.beginFill(0x000000, 0.75);
            bg.lineStyle(4, 0xaaaaaa, 1);
            bg.drawRoundedRect(-w/2, -h/2, w, h, 30);
            bg.endFill();
        }

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
        const size = 90; // 星星显示大小
        const gap = 10;
        
        const fullStars = Math.floor(rating / 2);
        const hasHalf = (rating % 2) >= 1;

        const totalW = starCount * (size + gap) - gap;
        let startX = -totalW / 2 + size / 2;

        const fullTex = ResourceManager.get('icon_star_full');
        const halfTex = ResourceManager.get('icon_star_half');

        for (let i = 0; i < starCount; i++) {
            const starX = startX + i * (size + gap);
            
            // 1. 底图：未激活的星星 (深色)
            if (fullTex) {
                const bgStar = new PIXI.Sprite(fullTex);
                bgStar.anchor.set(0.5);
                bgStar.width = size;
                bgStar.height = size;
                bgStar.tint = 0x333333; // 压黑
                bgStar.position.set(starX, 0);
                starContainer.addChild(bgStar);
            } else {
                // 兜底绘制
                const bg = new PIXI.Graphics().beginFill(0x333333).drawCircle(0,0,size/2).endFill();
                bg.position.set(starX, 0);
                starContainer.addChild(bg);
            }

            // 2. 激活的星星 (金色)
            let starSprite = null;
            if (i < fullStars) {
                if (fullTex) starSprite = new PIXI.Sprite(fullTex);
            } else if (i === fullStars && hasHalf) {
                if (halfTex) starSprite = new PIXI.Sprite(halfTex);
            }

            if (starSprite) {
                starSprite.anchor.set(0.5);
                starSprite.width = size;
                starSprite.height = size;
                starSprite.position.set(starX, 0);
                starContainer.addChild(starSprite);
            }
        }

        // 分数小胶囊
        const scoreBg = new PIXI.Graphics();
        scoreBg.beginFill(0x000000, 0.8);
        scoreBg.lineStyle(2, 0xFFD700);
        scoreBg.drawRoundedRect(0, 0, 90, 44, 22);
        scoreBg.endFill();
        scoreBg.position.set(totalW/2 + 20, -22);
        
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

    // [核心优化] 获取玩家信息（头像、昵称）
    getPlayerInfo(teamId, params) {
        const myInfo = AccountMgr.userInfo;
        const isLeft = teamId === TeamId.LEFT;
        const isDouyin = Platform.env === 'douyin';
        
        // 默认兜底
        let info = {
            name: isLeft ? (isDouyin ? '玩家 1' : 'Player 1') : (isDouyin ? '玩家 2' : 'Player 2'),
            avatar: null, // null 表示用文字头像
            isTexture: false // 是否是 Pixi Texture
        };

        if (params.gameMode === 'pve' || params.gameMode === 'live_flick') {
            if (isLeft) {
                // 左侧：玩家自己
                info.name = myInfo.nickname || (isDouyin ? '玩家' : 'Player');
                info.avatar = myInfo.avatarUrl;
            } else {
                // 右侧：AI
                if (params.aiInfo) {
                    info.name = params.aiInfo.name;
                    // 从资源管理器获取 AI 头像 Texture
                    info.avatar = ResourceManager.get(params.aiInfo.avatar);
                    info.isTexture = true;
                } else {
                    info.name = isDouyin ? "电脑对手" : "AI Opponent";
                    info.avatar = ResourceManager.get('ai_robot');
                    info.isTexture = true;
                }
            }
        } else if (params.gameMode === 'pvp_local') {
            if (isLeft) {
                // 左侧：P1 (账号持有者)
                info.name = myInfo.nickname || (isDouyin ? '玩家 1' : 'Player 1');
                info.avatar = myInfo.avatarUrl;
            } else {
                // 右侧：本地 Guest
                info.name = isDouyin ? '玩家 2' : 'Player 2';
                info.avatar = null;
            }
        } else if (params.gameMode === 'pvp_online') {
            // 网络对战：从 players 数组查找
            const players = params.players || [];
            const player = players.find(p => p.teamId === teamId);
            
            if (player) {
                info.name = player.nickname || (isLeft ? (isDouyin ? '红方' : 'Red') : (isDouyin ? '蓝方' : 'Blue'));
                info.avatar = player.avatar;
            } else {
                // 如果找不到数据 (理论上不应发生)，尝试用本地数据兜底自己
                if (teamId === params.myTeamId) {
                    info.name = myInfo.nickname;
                    info.avatar = myInfo.avatarUrl;
                } else {
                    info.name = isDouyin ? "等待中..." : "Waiting...";
                }
            }
        }

        return info;
    }

    createScoreBoard(x, score, params) {
        const container = new PIXI.Container();
        const headerY = -260;

        // 获取左右双方信息
        const leftInfo = this.getPlayerInfo(TeamId.LEFT, params);
        const rightInfo = this.getPlayerInfo(TeamId.RIGHT, params);

        // 1. 名字文本
        const nameStyle = { fontSize: 32, fontWeight: 'bold', fill: 0xffffff, dropShadow: true, dropShadowDistance: 1 };
        
        // 名字截断 (超过7个字用...)
        const trunc = (str) => str.length > 8 ? str.substring(0, 7) + '..' : str;

        const t1 = new PIXI.Text(trunc(leftInfo.name), nameStyle);
        t1.anchor.set(0.5); t1.position.set(-250, headerY);
        
        const t2 = new PIXI.Text(trunc(rightInfo.name), nameStyle);
        t2.anchor.set(0.5); t2.position.set(250, headerY);
        
        container.addChild(t1, t2);

        // 2. 核心比分与头像
        const scoreY = -140; 

        // 左头像
        const myAvatar = this.createAvatarBox(TeamId.LEFT, leftInfo);
        myAvatar.position.set(-250, scoreY);
        container.addChild(myAvatar);

        // 右头像
        const oppAvatar = this.createAvatarBox(TeamId.RIGHT, rightInfo);
        oppAvatar.position.set(250, scoreY);
        container.addChild(oppAvatar);

        // 比分
        const scoreStyle = { fontFamily: 'Arial Black', fontSize: 100, fill: 0xffffff, dropShadow: true, dropShadowBlur: 4 };
        const s1 = new PIXI.Text(score[TeamId.LEFT], scoreStyle);
        s1.anchor.set(0.5); s1.position.set(-110, scoreY);
        
        const s2 = new PIXI.Text(score[TeamId.RIGHT], scoreStyle);
        s2.anchor.set(0.5); s2.position.set(110, scoreY);

        container.addChild(s1, s2);

        this.mainPanel.addChild(container);
    }

    createAvatarBox(teamId, info) {
        const box = new PIXI.Container();
        const size = 100;
        
        const borderColor = (teamId === TeamId.LEFT) ? 0xe74c3c : 0x3498db;

        // 背景框
        const bg = new PIXI.Graphics();
        bg.beginFill(0xffffff);
        bg.lineStyle(4, borderColor);
        bg.drawRoundedRect(-size/2, -size/2, size, size, 15);
        bg.endFill();
        box.addChild(bg);

        // 遮罩
        const mask = new PIXI.Graphics();
        mask.beginFill(0xffffff);
        mask.drawRoundedRect(-size/2 + 2, -size/2 + 2, size - 4, size - 4, 12);
        mask.endFill();
        box.addChild(mask);

        if (info.isTexture && info.avatar) {
            // 本地 Texture (AI)
            const sp = new PIXI.Sprite(info.avatar);
            sp.anchor.set(0.5);
            // 缩放以适应盒子
            const scale = (size - 4) / Math.max(sp.width, sp.height);
            sp.scale.set(scale);
            sp.mask = mask;
            box.addChild(sp);
        } else if (info.avatar && typeof info.avatar === 'string' && info.avatar.startsWith('http')) {
            // URL (微信头像)
            const sp = new PIXI.Sprite();
            sp.anchor.set(0.5);
            sp.mask = mask;
            box.addChild(sp);
            
            PIXI.Texture.fromURL(info.avatar).then(tex => {
                if (box.destroyed) return;
                sp.texture = tex;
                const scale = (size - 4) / Math.min(tex.width, tex.height);
                sp.scale.set(scale);
            }).catch(() => {
                // 加载失败显示首字母
                this.addFallbackText(box, info.name, borderColor);
            });
        } else {
            // 无头像/Guest -> 文字兜底
            this.addFallbackText(box, info.name, borderColor);
        }

        return box;
    }

    addFallbackText(container, name, color) {
        const char = (name || '?').charAt(0).toUpperCase();
        const txt = new PIXI.Text(char, {
            fontSize: 40, fill: color, fontWeight: 'bold'
        });
        txt.anchor.set(0.5);
        container.addChild(txt);
    }

    createStatsList(x, y, stats, score, myId, oppId) {
        const container = new PIXI.Container();
        container.position.set(x, y);

        // [核心] 添加 red/blue bar 背景图作为数据容器背景
        const bgTex = ResourceManager.get('result_content_bg');
        const boxW = 820;
        const boxH = 290; // 容纳3行 + 底部时间
        // [修改] 增加顶部切片高度 (30 -> 70) 以保护素材中的 Header 区域不被拉伸
        const bg = new PIXI.NineSlicePlane(bgTex, 40, 70, 40, 40);
        bg.width = boxW;
        bg.height = boxH;
        bg.pivot.set(boxW/2, boxH/2);
        bg.y = 80; // 稍微下移以居中于数据行
        container.addChild(bg);

        const myStats = stats[myId];
        const oppStats = stats[oppId];
        const rowH = 70;

        // Row 1: Shots (进度条)
        this.renderStatRow(container, 0, '射门次数', myStats.shots, oppStats.shots, true);
        
        // Row 2: Efficiency (进度条)
        this.renderStatRow(container, rowH, '进球效率', this.fmtPct(score[myId], myStats.shots), this.fmtPct(score[oppId], oppStats.shots), true);

        // Row 3: Skills (Icon x Count)
        this.renderSkillRow(container, rowH * 2, myStats.skills, oppStats.skills);

        // Time
        const duration = (stats.endTime - stats.startTime) / 1000;
        const min = Math.floor(duration / 60);
        const sec = Math.floor(duration % 60);
        const timeText = new PIXI.Text(`比赛耗时: ${min}分${sec}秒`, { fontSize: 24, fill: 0x999999 });
        timeText.anchor.set(0.5);
        timeText.y = rowH * 3 - 10;
        container.addChild(timeText);

        this.mainPanel.addChild(container);
    }

    renderStatRow(container, y, labelStr, v1, v2, showBars) {
        // Label
        const label = new PIXI.Text(labelStr, { fontSize: 28, fill: 0xcccccc });
        label.anchor.set(0.5); label.y = y;
        container.addChild(label);

        // Values
        const style = { fontSize: 30, fill: 0xffffff, fontWeight: 'bold' };
        const t1 = new PIXI.Text(v1, style);
        t1.anchor.set(1, 0.5); t1.position.set(-100, y);
        const t2 = new PIXI.Text(v2, style);
        t2.anchor.set(0, 0.5); t2.position.set(100, y);
        container.addChild(t1, t2);

        // Bars
        if (showBars) {
            this.createStatBar(container, -180, y, v1, v2, true);
            this.createStatBar(container, 180, y, v2, v1, false);
        }
    }

    renderSkillRow(container, y, skills1, skills2) {
        const label = new PIXI.Text('技能消耗', { fontSize: 28, fill: 0xcccccc });
        label.anchor.set(0.5); label.y = y;
        container.addChild(label);

        // P1 图标 (向左增长)
        this.renderSkillIcons(container, -100, y, skills1, true);

        // P2 图标 (向右增长)
        this.renderSkillIcons(container, 100, y, skills2, false);
    }

    renderSkillIcons(container, startX, y, skills, isLeft) {
        const skillTypes = [SkillType.SUPER_AIM, SkillType.UNSTOPPABLE, SkillType.SUPER_FORCE];
        const map = { 
            [SkillType.SUPER_AIM]: 'skill_aim_bg', 
            [SkillType.UNSTOPPABLE]: 'skill_unstoppable_bg', 
            [SkillType.SUPER_FORCE]: 'skill_force_bg' 
        };

        let xPos = startX;
        const iconSize = 40;
        const gap = 10;
        const dir = isLeft ? -1 : 1;

        // 检查是否有技能使用记录
        let hasSkills = false;
        skillTypes.forEach(type => {
            if (skills && skills[type] > 0) hasSkills = true;
        });

        if (!hasSkills) {
            const dash = new PIXI.Text('-', { fontSize: 30, fill: 0x666666 });
            dash.anchor.set(isLeft ? 1 : 0, 0.5);
            dash.position.set(startX, y);
            container.addChild(dash);
            return;
        }

        skillTypes.forEach(type => {
            const count = skills ? (skills[type] || 0) : 0;
            if (count > 0) {
                // Icon
                const tex = ResourceManager.get(map[type]);
                if (tex) {
                    const icon = new PIXI.Sprite(tex);
                    icon.width = iconSize; icon.height = iconSize;
                    icon.anchor.set(isLeft ? 1 : 0, 0.5);
                    icon.position.set(xPos, y);
                    container.addChild(icon);
                }

                // Count text
                const textX = xPos + (isLeft ? -iconSize - 5 : iconSize + 5);
                const txt = new PIXI.Text(`x${count}`, { fontSize: 20, fill: 0xffffff });
                txt.anchor.set(isLeft ? 1 : 0, 0.5);
                txt.position.set(textX, y);
                container.addChild(txt);

                // Advance X
                const itemWidth = iconSize + txt.width + 15;
                xPos += dir * (itemWidth + gap);
            }
        });
    }

    sumSkills(skills) {
        let sum = 0;
        if (skills) Object.values(skills).forEach(v => sum += v);
        return sum;
    }

    createStatBar(parent, x, y, val, otherVal, isLeft) {
        // 简单的归一化逻辑，避免除以0
        let v1 = parseFloat(val); if(isNaN(v1)) v1 = 0;
        let v2 = parseFloat(otherVal); if(isNaN(v2)) v2 = 0;
        
        let max = Math.max(v1, v2);
        if (max === 0) max = 1;
        let ratio = v1 / max;
        
        const maxW = 200; 
        const w = maxW * ratio;
        const h = 12;
        const color = isLeft ? 0x3498db : 0xe74c3c; // 左蓝右红

        const g = new PIXI.Graphics();
        // 灰色底槽
        g.beginFill(0x333333);
        g.drawRoundedRect(0, -h/2, isLeft ? -maxW : maxW, h, h/2);
        g.endFill();

        // 亮色进度
        g.beginFill(color);
        g.drawRoundedRect(0, -h/2, isLeft ? -w : w, h, h/2);
        g.endFill();
        
        g.position.set(x, y);
        parent.addChild(g);
    }

    createRewards(x, y, coins) {
        if (coins <= 0) return;

        const container = new PIXI.Container();
        container.position.set(x, y);

        // [优化] 金币堆效果
        const icon = new PIXI.Text('💰', { fontSize: 50 });
        icon.anchor.set(0.5); icon.x = -60;
        
        const text = new PIXI.Text(`+${coins}`, { 
            fontSize: 50, fill: 0xFFD700, fontWeight: 'bold',
            dropShadow: true, dropShadowBlur: 2
        });
        text.anchor.set(0.5); text.x = 40;

        container.addChild(icon, text);
        this.mainPanel.addChild(container);
    }

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

        // [修改] 针对足球类型进行特殊渲染
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
        let leftAction = () => {
            UserBehaviorMgr.log('CLICK', '结果页_返回主菜单', { level: this.params.currentLevel });
            Platform.hideGameAds();
            SceneManager.changeScene(MenuScene);
        };
        
        let rightText = "再来一局";
        let rightAction = () => {
            UserBehaviorMgr.log('CLICK', '结果页_再来一局', { level: this.params.currentLevel });
            Platform.hideGameAds();
            if (this.params.gameMode === 'live_flick') {
                SceneManager.changeScene(LiveFlickScene, { level: this.params.currentLevel });
            } else if (this.params.gameMode === 'pvp_local') {
                SceneManager.changeScene(GameScene, { mode: 'pvp_local' });
            } else {
                // [修改] 传递 formationId
                const formationId = AccountMgr.userInfo.theme.formationId || 0;
                SceneManager.changeScene(GameScene, { 
                    mode: 'pve', 
                    level: this.params.currentLevel,
                    formationId: formationId
                });
            }
        };
        
        if (this.params.gameMode === 'pvp_online') {
            leftText = '结束游戏';
            leftAction = () => {
                UserBehaviorMgr.log('CLICK', '结果页_结束在线游戏');
                NetworkMgr.send({ type: NetMsg.LEAVE });
                NetworkMgr.close();
                Platform.removeStorage('last_room_id');
                SceneManager.changeScene(MenuScene);
            };

            rightText = '再来一局';
            rightAction = () => {
                UserBehaviorMgr.log('CLICK', '结果页_在线再来一局');
                SceneManager.changeScene(RoomScene, { roomId: this.params.roomId, autoReady: true });
            };
        }
        else if (this.params.gameMode === 'pve' || (this.params.gameMode === 'live_flick' && this.params.isLevelMode)) {
            // [修改] 仅针对关卡模式 (PVE 或 LiveFlick Level)
            if (isWin) {
                rightText = "下一关";
                rightAction = () => {
                    const nextLevel = this.params.currentLevel + 1;
                    UserBehaviorMgr.log('CLICK', '结果页_下一关', { from: this.params.currentLevel, to: nextLevel });
                    Platform.hideGameAds();
                    
                    if (this.params.gameMode === 'live_flick') {
                        if (nextLevel > LIVE_FLICK_LEVELS) {
                            Platform.showToast("已通关所有实况关卡！");
                            SceneManager.changeScene(MenuScene);
                            return;
                        }
                        Platform.showToast('正在加载玩法...');
                        Platform.loadSubpackage('live_flick').then(() => {
                            SceneManager.changeScene(LiveFlickScene, { level: nextLevel });
                        }).catch(e => {
                            console.error(e);
                            Platform.showToast('加载失败，请重试');
                        });
                    } else {
                        // 默认 PVE 模式
                        const formationId = AccountMgr.userInfo.theme.formationId || 0;
                        SceneManager.changeScene(GameScene, { 
                            mode: 'pve', 
                            level: nextLevel,
                            formationId: formationId 
                        });
                    }
                };
            } else {
                rightText = "重新挑战";
                rightAction = () => {
                    UserBehaviorMgr.log('CLICK', '结果页_重新挑战', { level: this.params.currentLevel });
                    Platform.hideGameAds();
                    
                    if (this.params.gameMode === 'live_flick') {
                        SceneManager.changeScene(LiveFlickScene, { level: this.params.currentLevel });
                    } else {
                        // [修改] 传递 formationId
                        const formationId = AccountMgr.userInfo.theme.formationId || 0;
                        SceneManager.changeScene(GameScene, { 
                            mode: 'pve', 
                            level: this.params.currentLevel,
                            formationId: formationId
                        });
                    }
                };
            }
        }
        else if (this.params.gameMode === 'live_flick' && !this.params.isLevelMode) {
            // [新增] 独立的实况弹指模式 (非关卡)
            rightText = "再来一局";
            rightAction = () => {
                UserBehaviorMgr.log('CLICK', '结果页_实况再来一局');
                Platform.hideGameAds();
                SceneManager.changeScene(LiveFlickScene, { level: this.params.currentLevel }); // 这里的 level 可能是难度等级
            };
        }

        // 使用图片背景
        const menuBtn = new Button({
            text: leftText, 
            texture: ResourceManager.get('btn_result_end'),
            width: btnW, height: btnH,
            onClick: leftAction
        });
        menuBtn.position.set(startX, btnY - btnH/2);
        this.container.addChild(menuBtn);

        const nextBtn = new Button({
            text: rightText,
            texture: ResourceManager.get('btn_result_continue'),
            width: btnW, height: btnH,
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
