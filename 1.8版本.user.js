// ==UserScript==
// @name         b站 | bilibili | 哔哩哔哩 | 一键三连健康探针（BiliHealth Scan）
// @namespace    http://tampermonkey.net/
// @version      1.8.2
// @description  一键三连健康探针（BiliHealth Scan）显示b站 | bilibili | 哔哩哔哩 点赞率、投币率、收藏率、转发率及Steam综合评级
// @license      MIT
// @author       向也
// @match        http*://www.bilibili.com/
// @match        http*://www.bilibili.com/?*
// @match        http*://www.bilibili.com/video/*
// @match        http*://www.bilibili.com/list/watchlater*
// @match        http*://www.bilibili.com/c/*
// @match        http*://search.bilibili.com/all?*
// @match        http*://space.bilibili.com/*
// @match        http*://www.bilibili.com/history*
// @grant        GM.addStyle
// @grant        unsafeWindow
// @run-at       document-start
// @grant        GM_registerMenuCommand
// ==/UserScript==

(function () {
    // ====== 常量与样式区（融合1.7卡片UI样式）======
    // 评级颜色配置
    const RATING_COLORS = {
        rainbow: 'rainbow-text',
        red: 'red-text',
        gold: 'gold-text',
        orange: 'orange-text',
        orangered: 'orangered-text',
        limegreen: 'limegreen-text',
        yellowgreen: 'yellowgreen-text',
    };

    // 评级文本配置
    const RATING_TEXTS = [
        { min: 100, text: '满分神作', color: RATING_COLORS.rainbow },
        { min: 95, text: '好评如潮', color: RATING_COLORS.red },
        { min: 80, text: '非常好评', color: RATING_COLORS.gold },
        { min: 70, text: '多半好评', color: RATING_COLORS.orange },
        { min: 40, text: '褒贬不一', color: RATING_COLORS.orangered },
        { min: 20, text: '多半差评', color: RATING_COLORS.limegreen },
        { min: 0, text: '差评如潮', color: RATING_COLORS.yellowgreen },
    ];

    // ====== 卡片样式（融合1.7视觉细节）======
    GM.addStyle(`
        /* 评级文本颜色 */
        .rainbow-text {
            background: linear-gradient(45deg, #ff0000, #ff9900, #ffff00, #00ff00, #00ffff, #0000ff, #9900ff);
            background-size: 600% 600%;
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            animation: rainbow 3s ease infinite;
        }
        .gold-text { color: #FFD700 !important; }
        .limegreen-text { color: #32CD32 !important; }
        .yellowgreen-text { color: #9ACD32 !important; }
        .orange-text { color: #FFA500 !important; }
        .orangered-text { color: #FF4500 !important; }
        .red-text { color: #FF0000 !important; }
        @keyframes rainbow {
            0%{background-position:0% 50%}
            50%{background-position:100% 50%}
            100%{background-position:0% 50%}
        }
        /* 卡片统计信息自适应样式（1.7版UI） */
        .bili-video-card__stats--left > span,
        .bili-cover-card__stats > span {
            margin-right: 8px;
            font-size: 13px;
            display: inline-flex;
            align-items: center;
        }
        .bili-video-card__stats--icon,
        .bili-cover-card__stats svg {
            margin-right: 2px;
        }
        /* 主页卡片好评率样式 */
        .bili-health-rating-span {
            font-weight: bold;
            margin-left: 6px;
        }
        /* 空间主页卡片好评率样式 */
        .bili-video-card__info {
            position: relative; /* 确保子元素可以绝对定位 */
        }
        .bili-health-rating-span {
            font-weight: bold;
            z-index: 10;
            display: inline-flex;
            align-items: center;
            margin-left: 6px;
        }
        /* 调整统计数据的布局，避免重叠 */
        .bili-cover-card__stats {
            position: relative;
            z-index: 5;
            margin-bottom: 0 !important;
            display: flex;
            flex-wrap: wrap;
        }
        /* Style for rating text within the span */
        .bili-health-rating-span span {
            -webkit-text-fill-color: unset;
            font-size: inherit;
        }
    `);

    // ====== 页面类型判断 ======
    function getCurrentPageType() {
        if (location.pathname === '/') {
            return 'mainPage';
        } else if (location.pathname.match(/\/video\/.*\//)) {
            return 'videoPage';
        } else if (location.pathname.match(/list\/watchlater.*/)) {
            return 'videoPageWatchList';
        } else if (location.pathname === '/all') {
            return 'searchPage';
        } else if (location.pathname.startsWith('/c/')) {
            return 'region';
        } else if (location.hostname === 'space.bilibili.com') {
            if (location.pathname.match(/\/\d+\/favlist/)) {
                return 'spaceFavlistPage';
            } else {
                return 'spacePage';
            }
        } else if (location.pathname.startsWith('/history')) {
            return 'historyPage';
        }
        return 'unknown';
    }

    // ====== 统一数据处理与API请求（1.8核心） ======
    // 权重配置
    const INTERACTION_WEIGHTS = {
        like: 1,
        coin: 8,
        favorite: 4,
        share: 6,
    };

    // 评级算法与数据处理
    const BiliRating = {
        WEIGHTS: INTERACTION_WEIGHTS,
        RATING_COLORS,
        // 标准化视频数据
        normalizeData(rawData) {
            return {
                view: parseInt(rawData.view) || 0,
                like: parseInt(rawData.like) || 0,
                coin: parseInt(rawData.coin) || 0,
                favorite: parseInt(rawData.favorite) || 0,
                share: parseInt(rawData.share) || 0
            };
        },
        // 计算加权互动比
        calculateWeightedRatio(data) {
            if (data.view < 1000) return 0;
            const weightedInteractions =
                (data.like * this.WEIGHTS.like) +
                (data.coin * this.WEIGHTS.coin) +
                (data.favorite * this.WEIGHTS.favorite) +
                (data.share * this.WEIGHTS.share);
            return ((weightedInteractions / data.view) * 100 * 3).toFixed(2);
        },
        // 获取显示用好评率
        getDisplayRatio(data) {
            const ratio = parseFloat(this.calculateWeightedRatio(data));

            // 定义播放量阈值和对应的最大好评率上限
            const VIEW_THRESHOLDS = [
                { view: 1000, maxRatio: 51.99 },    // <= 1千播放量，好评率不能成功52%
                { view: 50000, maxRatio: 68.99 },   // <= 5万播放量，好评率不能成功69%
                { view: 350000, maxRatio: 84.99 },  // <= 35万播放量，好评率不能成功85%
                { view: 500000, maxRatio: 96.99 }   // <= 50万播放量，好评率不能成功97%
            ];

            let currentRatio = ratio;

            // 对于播放量小于1000的视频，直接返回0
            if (data.view < 1000) return "0.00";

            // 根据播放量应用好评率上限
            for (const threshold of VIEW_THRESHOLDS) {
                if (data.view <= threshold.view) {
                    currentRatio = Math.min(currentRatio, threshold.maxRatio);
                    //console.log(`[BiliHealth Scan] View ${data.view} <= ${threshold.view}, capped ratio to ${threshold.maxRatio}. Original ratio: ${ratio.toFixed(2)}`); // Debugging log
                    break; // 找到匹配的最低阈值后停止
                }
            }

            let displayRatioValue = currentRatio; // 使用应用上限后的比率进行后续计算

            // 应用原有的70%以上压缩逻辑（在应用播放量上限后）
            if (displayRatioValue >= 70) {
                displayRatioValue = (90 + (displayRatioValue - 50) * (10 / (200 - 150)));
                //console.log(`[BiliHealth Scan] Ratio >= 70, applied compression. New ratio: ${displayRatioValue.toFixed(2)}`); // Debugging log
            }

            // 将数值结果转换为字符串，保留两位小数
            let displayRatioString = displayRatioValue.toFixed(2);

            // 应用原有的特殊判定逻辑（满分神作、刷到必看等）
            if (data.view >= 20000000) {
                return "小破站必刷";
            } else if (displayRatioValue >= 100) { // 注意这里使用数值进行判断
                // 检查是否满足原有的100%以上特殊条件判断
                let conditionsMet = 0;
                if (data.view > 3000000) conditionsMet++;
                if ((data.like / data.view) * 100 > 4) conditionsMet++;
                if ((data.favorite / data.view) * 100 > 14) conditionsMet++;
                if ((data.coin / data.view) * 100 > 15) conditionsMet++;
                const isSpecialCondition = (
                    (data.view >= 5000000 && data.view <= 10000000 &&
                    ((data.favorite / data.view) * 100 >= 20 ||
                    (data.coin / data.view) * 100 >= 20 ||
                    (data.share / data.view) * 100 >= 20))
                );
                if (conditionsMet >= 3 || isSpecialCondition) {
                    return "小破站必刷";
                } else if (conditionsMet >= 2) {
                    return "刷到必看";
                } else {
                    return "100.00";
                }
            }

            return displayRatioString;
        },
        // 获取评级
        getRating(displayRatio) {
            if (displayRatio === "小破站必刷" || displayRatio === "刷到必看") {
                return { text: '满分神作', className: this.RATING_COLORS.rainbow };
            }
            const ratioNum = parseFloat(displayRatio);
            if (ratioNum >= 100) return { text: '满分神作', className: this.RATING_COLORS.rainbow };
            if (ratioNum >= 95) return { text: '好评如潮', className: this.RATING_COLORS.red };
            if (ratioNum >= 80) return { text: '非常好评', className: this.RATING_COLORS.gold };
            if (ratioNum >= 70) return { text: '多半好评', className: this.RATING_COLORS.orange };
            if (ratioNum >= 40) return { text: '褒贬不一', className: this.RATING_COLORS.orangered };
            if (ratioNum >= 20) return { text: '多半差评', className: this.RATING_COLORS.limegreen };
            return { text: '差评如潮', className: this.RATING_COLORS.yellowgreen };
        },
        // 计算各项比率
        calculateRatio(data, type, weight = 1) {
            if (!data.view || data.view <= 0 || !data[type] || data[type] <= 0) {
                return { rate: "0.00", color: "inherit" };
            }
            const rate = ((data[type] * weight) * 100 / data.view).toFixed(2);
            let color = 'inherit';
            const num = data.view / (data[type] * weight);
            if (num <= 25) {
                color = 'Red';
            } else if (num <= 35) {
                color = 'Orange';
            } else if (num <= 45) {
                color = 'Green';
            } else {
                color = 'Silver';
            }
            return { rate, color };
        },
        // 获取完整评级信息
        getFullRatingInfo(data) {
            const normalizedData = this.normalizeData(data);
            const displayRatio = this.getDisplayRatio(normalizedData);
            const rating = this.getRating(displayRatio);
            const likeRatio = this.calculateRatio(normalizedData, 'like', this.WEIGHTS.like);
            const coinRatio = this.calculateRatio(normalizedData, 'coin', this.WEIGHTS.coin);
            const favoriteRatio = this.calculateRatio(normalizedData, 'favorite', this.WEIGHTS.favorite);
            const shareRatio = this.calculateRatio(normalizedData, 'share', this.WEIGHTS.share);
            return {
                data: normalizedData,
                displayRatio,
                rating,
                likeRatio,
                coinRatio,
                favoriteRatio,
                shareRatio,
                plainText: this.getPlainText(displayRatio, rating.text)
            };
        },
        // 获取纯文本评级
        getPlainText(displayRatio, ratingText) {
            if (displayRatio === "小破站必刷" || displayRatio === "刷到必看") {
                return `该作品好评率: ${displayRatio} | 评级: ${ratingText}`;
            } else {
                return `该作品好评率: ${displayRatio}% | 评级: ${ratingText}`;
            }
        }
    };

    // ====== API数据请求（1.8核心）======
    const statCache = new Map();
    async function fetchFullStats(bvid) {
        if (statCache.has(bvid)) {
            return statCache.get(bvid);
        }
        try {
            const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
            const data = await response.json();
            if (data && data.code === 0 && data.data && data.data.stat) {
                statCache.set(bvid, data.data.stat);
                return data.data.stat;
            }
        } catch (error) {
            console.error(`获取BVID ${bvid} 的数据失败:`, error);
        }
        return null;
    }

    // ====== 卡片UI渲染（融合1.7样式，1.8数据）======
    const BiliRatingUI = {
        // 主页卡片渲染 (恢复简单附加到末尾，保留样式自适应)
        addLikeRateToCard(node, urlToDataMap, key) {
            const stat = urlToDataMap.get(key);
            urlToDataMap.delete(key);
            // Target stats container for main page cards
            const statsContainer = node.querySelector('div.bili-video-card__stats--left');
            if (!statsContainer) return;
            if (statsContainer.querySelector('.bili-health-rating-span')) {
                return;
            }
            if (stat != null) {
                const span = document.createElement('span');
                span.className = 'bili-health-rating-span';
                const ratingInfo = BiliRating.getFullRatingInfo(stat);
                const { displayRatio, rating } = ratingInfo;
                
                // Get size reference from existing stat elements within THIS container
                const existingStat = statsContainer.querySelector('span:not(.bili-health-rating-span)'); 
                const fontSize = existingStat ? window.getComputedStyle(existingStat).fontSize : '13px';
                const iconHeight = existingStat ? existingStat.offsetHeight + 'px' : '14px'; 

                span.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${iconHeight}"
                        height="${iconHeight}" fill="currentColor" style="margin-right:2px;">
                        <path d="M594.176 151.168a34.048 34.048 0 0 0-29.184 10.816c-11.264 13.184-15.872 24.064-21.504 40.064l-1.92 5.632c-5.632 16.128-12.8 36.864-27.648 63.232-25.408 44.928-50.304 74.432-86.208 97.024-23.04 14.528-43.648 26.368-65.024 32.576v419.648a4569.408 4569.408 0 0 0 339.072-4.672c38.72-2.048 72-21.12 88.96-52.032 21.504-39.36 47.168-95.744 63.552-163.008a782.72 782.72 0 0 0 22.528-163.008c0.448-16.832-13.44-32.256-35.328-32.256h-197.312a32 32 0 0 1-28.608-46.336l0.192-0.32 0.64-1.344 2.56-5.504c2.112-4.8 5.12-11.776 8.32-20.16 6.592-17.088 13.568-39.04 16.768-60.416 4.992-33.344 3.776-60.16-9.344-84.992-14.08-26.688-30.016-33.728-40.512-34.944zM691.84 341.12h149.568c52.736 0 100.864 40.192 99.328 98.048a845.888 845.888 0 0 1-24.32 176.384 742.336 742.336 0 0 1-69.632 178.56c-29.184 53.44-84.48 82.304-141.76 85.248-55.68 2.88-138.304 5.952-235.712 5.952-96 0-183.552-3.008-244.672-5.76-66.432-3.136-123.392-51.392-131.008-119.872a1380.672 1380.672 0 0 1-0.768-296.704c7.68-72.768 70.4-121.792 140.032-121.792h97.728c13.76 0 28.16-5.504 62.976-27.456 24.064-15.104 42.432-35.2 64.512-74.24 11.904-21.184 17.408-36.928 22.912-52.8l2.048-5.888c6.656-18.88 14.4-38.4 33.28-60.416a97.984 97.984 0 0 1 85.12-32.768c35.264 4.096 67.776 26.88 89.792 68.608 22.208 42.176 21.888 84.864 16 124.352a342.464 342.464 0 0 1-15.424 60.544z m-393.216 477.248V405.184H232.96c-40.448 0-72.448 27.712-76.352 64.512a1318.912 1318.912 0 0 0 0.64 282.88c3.904 34.752 32.96 61.248 70.4 62.976 20.8 0.96 44.8 1.92 71.04 2.816z" fill="currentColor"></path>
                    </svg>
                    <span class="${rating.className}" style="font-size: ${fontSize};">${displayRatio}${displayRatio === "小破站必刷" || displayRatio === "刷到必看" ? "" : "%"}</span>`;
                
                // Simply append to the end
                statsContainer.appendChild(span);
            }
        },
        // 分区页卡片渲染 (恢复简单附加到末尾，保留样式自适应)
        addLikeRateToCardForRegion(node, urlToDataMap, key) {
            const stat = urlToDataMap.get(key);
            urlToDataMap.delete(key);
            // Target stats container for region pages
            const statsContainer = node.querySelector('div.bili-cover-card__stats');
            if (!statsContainer) return;
            if (statsContainer.querySelector('.bili-health-rating-span')) {
                return;
            }
            if (stat != null) {
                const span = document.createElement('span');
                span.className = 'bili-health-rating-span';
                const ratingInfo = BiliRating.getFullRatingInfo(stat);
                const { displayRatio, rating } = ratingInfo;

                // Get size reference from existing stat elements within THIS container
                const existingStat = statsContainer.querySelector('span:not(.bili-health-rating-span)'); 
                const fontSize = existingStat ? window.getComputedStyle(existingStat).fontSize : '13px';
                const iconHeight = existingStat ? existingStat.offsetHeight + 'px' : '14px'; 

                span.innerHTML = `
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${iconHeight}"
                        height="${iconHeight}" fill="currentColor" style="margin-right:2px;">
                        <path d="M594.176 151.168a34.048 34.048 0 0 0-29.184 10.816c-11.264 13.184-15.872 24.064-21.504 40.064l-1.92 5.632c-5.632 16.128-12.8 36.864-27.648 63.232-25.408 44.928-50.304 74.432-86.208 97.024-23.04 14.528-43.648 26.368-65.024 32.576v419.648a4569.408 4569.408 0 0 0 339.072-4.672c38.72-2.048 72-21.12 88.96-52.032 21.504-39.36 47.168-95.744 63.552-163.008a782.72 782.72 0 0 0 22.528-163.008c0.448-16.832-13.44-32.256-35.328-32.256h-197.312a32 32 0 0 1-28.608-46.336l0.192-0.32 0.64-1.344 2.56-5.504c2.112-4.8 5.12-11.776 8.32-20.16 6.592-17.088 13.568-39.04 16.768-60.416 4.992-33.344 3.776-60.16-9.344-84.992-14.08-26.688-30.016-33.728-40.512-34.944zM691.84 341.12h149.568c52.736 0 100.864 40.192 99.328 98.048a845.888 845.888 0 0 1-24.32 176.384 742.336 742.336 0 0 1-69.632 178.56c-29.184 53.44-84.48 82.304-141.76 85.248-55.68 2.88-138.304 5.952-235.712 5.952-96 0-183.552-3.008-244.672-5.76-66.432-3.136-123.392-51.392-131.008-119.872a1380.672 1380.672 0 0 1-0.768-296.704c7.68-72.768 70.4-121.792 140.032-121.792h97.728c13.76 0 28.16-5.504 62.976-27.456 24.064-15.104 42.432-35.2 64.512-74.24 11.904-21.184 17.408-36.928 22.912-52.8l2.048-5.888c6.656-18.88 14.4-38.4 33.28-60.416a97.984 97.984 0 0 1 85.12-32.768c35.264 4.096 67.776 26.88 89.792 68.608 22.208 42.176 21.888 84.864 16 124.352a342.464 342.464 0 0 1-15.424 60.544z m-393.216 477.248V405.184H232.96c-40.448 0-72.448 27.712-76.352 64.512a1318.912 1318.912 0 0 0 0.64 282.88c3.904 34.752 32.96 61.248 70.4 62.976 20.8 0.96 44.8 1.92 71.04 2.816z" fill="currentColor"></path>
                    </svg>
                    <span class="${rating.className}" style="font-size: ${fontSize};">${displayRatio}${displayRatio === "小破站必刷" || displayRatio === "刷到必看" ? "" : "%"}</span>`;
                
                // Simply append to the end
                statsContainer.appendChild(span);
            }
        },
        // 视频页渲染（补全自1.8原版）
        initVideoPageLogic() {
            // 检查视频数据是否存在
            if (!(unsafeWindow?.__INITIAL_STATE__?.videoData?.stat?.view)) {
                return;
            }
            // 添加视频详情页专用样式
            GM.addStyle(`
                .video-toolbar-left-item{ width:auto !important; }
                .toolbar-left-item-wrap{ display:flex !important; margin-right: 12px !important; }
                .video-share-info{ width:auto !important; max-width:90px; }
                .video-share-info-text{ position: relative !important; }
                .comprehensive-rating { display: flex; align-items: center; font-weight: bold; margin-left: 12px; }
                .good-rate { display: flex; align-items: center; font-weight: bold; margin-left: 12px; color: #000000; }
                .copy-rating { display: flex; align-items: center; margin-left: 12px; cursor: pointer; color: #00aeec; font-weight: bold; }
                .copy-rating:hover { color: #ff6699; }
                .video-toolbar-item-icon { margin-right:6px !important; }
                .toolbar-right-note{ margin-right:5px !important; }
                .toolbar-right-ai{ margin-right:12px !important; }
            `);
            // 获取视频统计数据
            const videoStatData = unsafeWindow.__INITIAL_STATE__.videoData.stat;
            const ratingInfo = BiliRating.getFullRatingInfo(videoStatData);
            // 创建各项比率展示区
            const div = { like: {}, coin: {}, favorite: {}, share: {} };
            for (let e in div) {
                div[e] = document.createElement('div');
                div[e].style.setProperty('display', 'flex');
                div[e].style.setProperty('align-items', 'center');
                const ratio = ratingInfo[e + 'Ratio'];
                div[e].innerHTML = `
                    <span style="margin-left: 5px;margin-right: 3px;font-size:medium;">≈</span>
                    <span id="data" style="font-family: math;font-size: initial;color:${ratio.color};">${ratio.rate}</span>
                    <span style="font-family: math;margin-left: 2px;"> %</span>
                `;
            }
            // 综合评级展示
            const comprehensiveRating = document.createElement('div');
            comprehensiveRating.className = 'comprehensive-rating';
            comprehensiveRating.innerHTML = `<span id="comprehensive-rating-text" class="${ratingInfo.rating.className}">${ratingInfo.rating.text}</span>`;
            // 好评率展示
            const goodRate = document.createElement('div');
            goodRate.className = 'good-rate';
            if (ratingInfo.displayRatio === "小破站必刷" || ratingInfo.displayRatio === "刷到必看") {
                goodRate.innerHTML = `好评率：<span id="good-rate-text" class="${ratingInfo.rating.className}">${ratingInfo.displayRatio}</span>`;
            } else {
                goodRate.innerHTML = `好评率：<span id="good-rate-text" class="${ratingInfo.rating.className}">${ratingInfo.displayRatio}</span>%`;
            }
            // 复制评级按钮
            const copyButton = document.createElement('div');
            copyButton.className = 'copy-rating';
            copyButton.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
                    <path d="M4 1.5H3a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V3.5a2 2 0 0 0-2-2h-1v1h1a1 1 0 0 1 1 1V14a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3.5a1 1 0 0 1 1-1h1v-1z"/>
                    <path d="M9.5 1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-3a.5.5 0 0 1-.5-.5v-1a.5.5 0 0 1 .5-.5h3zm-3-1A1.5 1.5 0 0 0 5 1.5v1A1.5 1.5 0 0 0 6.5 4h3A1.5 1.5 0 0 0 11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3z"/>
                </svg>
                <span>复制评级</span>
            `;
            // 更新评级显示的函数
            function updateRatingDisplay() {
                const newStatData = unsafeWindow.__INITIAL_STATE__.videoData.stat;
                const newRatingInfo = BiliRating.getFullRatingInfo(newStatData);
                for (let e in div) {
                    let data = div[e].querySelector('#data');
                    const ratio = newRatingInfo[e + 'Ratio'];
                    data.style.color = ratio.color;
                    data.textContent = ratio.rate;
                }
                const goodRateText = goodRate.querySelector('#good-rate-text');
                goodRateText.className = newRatingInfo.rating.className;
                if (newRatingInfo.displayRatio === "小破站必刷" || newRatingInfo.displayRatio === "刷到必看") {
                    goodRate.innerHTML = `好评率：<span id="good-rate-text" class="${newRatingInfo.rating.className}">${newRatingInfo.displayRatio}</span>`;
                } else {
                    goodRate.innerHTML = `好评率：<span id="good-rate-text" class="${newRatingInfo.rating.className}">${newRatingInfo.displayRatio}</span>%`;
                }
                const ratingText = comprehensiveRating.querySelector('#comprehensive-rating-text');
                ratingText.textContent = newRatingInfo.rating.text;
                ratingText.className = newRatingInfo.rating.className;
            }
            // 监听工具栏元素出现后插入自定义元素
            let addElementObserver = new MutationObserver(function (mutationsList) {
                for (let mutation of mutationsList) {
                    if (mutation.target.classList != null && mutation.target.classList.contains('video-toolbar-right')) {
                        addElementObserver.disconnect();
                        document.querySelector('.video-like').parentNode.appendChild(div.like);
                        document.querySelector('.video-coin').parentNode.appendChild(div.coin);
                        document.querySelector('.video-fav').parentNode.appendChild(div.favorite);
                        document.querySelector('.video-share-wrap').parentNode.appendChild(div.share);
                        const toolbarLeft = document.querySelector('.video-toolbar-left');
                        toolbarLeft.appendChild(comprehensiveRating);
                        toolbarLeft.appendChild(goodRate);
                        toolbarLeft.appendChild(copyButton);
                        copyButton.addEventListener('click', () => {
                            const currentStatData = unsafeWindow.__INITIAL_STATE__.videoData.stat;
                            const currentRatingInfo = BiliRating.getFullRatingInfo(currentStatData);
                            navigator.clipboard.writeText(currentRatingInfo.plainText).then(() => {
                                const originalText = copyButton.querySelector('span').textContent;
                                copyButton.querySelector('span').textContent = '已复制!';
                                setTimeout(() => {
                                    copyButton.querySelector('span').textContent = originalText;
                                }, 2000);
                            });
                        });
                        break;
                    }
                }
            });
            addElementObserver.observe(document.querySelector('div.video-toolbar-right'), {
                childList: true,
                subtree: true,
                attributes: true
            });
            // 监听bvid变化，自动更新显示
            let currentBvid = unsafeWindow.__INITIAL_STATE__.videoData.bvid;
            new MutationObserver(function () {
                const newBvid = unsafeWindow.__INITIAL_STATE__.videoData.bvid;
                if (newBvid !== currentBvid) {
                    updateRatingDisplay();
                    currentBvid = newBvid;
                }
            }).observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    // ====== 主逻辑入口（1.8为主，UI融合1.7）======
    const pageType = getCurrentPageType();
    const pageLogicMap = {
        mainPage: mainPageLogic,
        videoPage: videoPageLogic,
        videoPageWatchList: videoPageLogic,
        searchPage: searchPageLogic,
        region: regionPageLogic,
        spacePage: spacePageLogic,
        spaceFavlistPage: spacePageLogic,
        historyPage: () => {},
        unknown: () => {}
    };
    if (pageLogicMap[pageType]) {
        pageLogicMap[pageType]();
    }

    // 主页卡片处理
    function mainPageLogic() {
        document.addEventListener('DOMContentLoaded', function() {
            const processedCards = new Set(); // 用于追踪已处理的卡片

            function handleCards() {
                const cards = Array.from(document.querySelectorAll('div.bili-video-card'));
                const bvidMap = new Map();
                
                // 收集所有需要处理的BVID
                cards.forEach(card => {
                    // 检查卡片是否已处理
                    if (processedCards.has(card)) return;
                    
                    // 注意：主页卡片的链接选择器是 .bili-video-card__image--link
                    const linkElement = card.querySelector('.bili-video-card__image--link');
                    const link = linkElement?.href;
                    const match = link && /bv\w{10}/i.exec(link);
                    if (!match) return;
                    
                    const bvid = match[0];
                    bvidMap.set(bvid, card);
                    processedCards.add(card);
                });

                // 一次性处理所有BVID
                if (bvidMap.size > 0) {
                    Promise.all(Array.from(bvidMap.keys()).map(bvid => 
                        fetchFullStats(bvid).then(stat => ({ bvid, stat }))
                    )).then(results => {
                        results.forEach(({ bvid, stat }) => {
                            if (!stat) return;
                            const card = bvidMap.get(bvid);
                            if (card) {
                                // 使用addLikeRateToCard 处理主页卡片
                                BiliRatingUI.addLikeRateToCard(card, new Map([[bvid, stat]]), bvid);
                            }
                        });
                    });
                }
            }

            // 初始处理
            handleCards();

            // 监听DOM变化
            const observer = new MutationObserver((mutations) => {
                let shouldHandle = false;
                
                mutations.forEach(mutation => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE && 
                                (node.classList.contains('bili-video-card') || 
                                 node.querySelector('.bili-video-card'))) { // 检查新增节点本身或其子节点是否包含视频卡片
                                shouldHandle = true;
                            }
                        });
                    } else if (mutation.type === 'attributes' && mutation.target.classList.contains('bili-video-card')) { // 监听卡片属性变化
                         shouldHandle = true;
                    }
                });

                if (shouldHandle) {
                    // 使用 setTimeout 微任务延迟处理，避免重复执行
                    setTimeout(handleCards, 0);
                }
            });

            // 监听滚动事件 - 主要用于处理懒加载
             window.addEventListener('scroll', handleCards);

            // 初始观察整个body，包括懒加载内容
            observer.observe(document.body, {
                childList: true,
                subtree: true,
                attributes: true, // 也观察属性变化
            });
        });
    }

    // 视频页处理
    function videoPageLogic() {
        document.addEventListener('DOMContentLoaded', function () {
            BiliRatingUI.initVideoPageLogic();
        });
    }

    // 搜索页卡片处理
    function searchPageLogic() {
        document.addEventListener('DOMContentLoaded', function() {
            const processedCards = new Set();
            function handleCards() {
                const cards = Array.from(document.querySelectorAll('div.bili-video-card'));
                 const bvidMap = new Map();

                cards.forEach(card => {
                    if (processedCards.has(card)) return;

                    // 注意：搜索页卡片的链接选择器可能是 a 或 .bili-video-card__image--link
                    const linkElement = card.querySelector('a, .bili-video-card__image--link');
                    const link = linkElement?.href;
                    const match = link && /bv\w{10}/i.exec(link);
                    if (!match) return;
                    const bvid = match[0];
                     bvidMap.set(bvid, card);
                    processedCards.add(card);
                });
                 if (bvidMap.size > 0) {
                    Promise.all(Array.from(bvidMap.keys()).map(bvid => 
                        fetchFullStats(bvid).then(stat => ({ bvid, stat }))
                    )).then(results => {
                        results.forEach(({ bvid, stat }) => {
                            if (!stat) return;
                            const card = bvidMap.get(bvid);
                            if (card) {
                                // 使用addLikeRateToCard 处理搜索页卡片
                                BiliRatingUI.addLikeRateToCard(card, new Map([[bvid, stat]]), bvid);
                            }
                        });
                    });
                }
            } 
            // 初始处理
            handleCards();
            // 监听DOM变化
            new MutationObserver(() => setTimeout(handleCards, 0)).observe(document.body, { // 使用 setTimeout 微任务延迟处理
                childList: true,
                subtree: true,
                 attributes: true,
            });
             // 监听滚动事件 - 主要用于处理懒加载
             window.addEventListener('scroll', handleCards);
        });
    }

    // 分区页卡片处理
    function regionPageLogic() {
        document.addEventListener('DOMContentLoaded', function() {
            console.log("[BiliHealth Scan] regionPageLogic initialized.");
            const processedCards = new Set(); // 用于追踪已处理的卡片

            function handleCards() {
                console.log("[BiliHealth Scan] Running handleCards on region page.");
                // 使用分区页卡片的类名
                const cards = Array.from(document.querySelectorAll('.bili-cover-card'));
                console.log(`[BiliHealth Scan] Found ${cards.length} video cards.`);

                cards.forEach(card => {
                    // 检查卡片是否已处理
                    if (processedCards.has(card)) {
                        return;
                    }

                    // 从卡片中查找链接以提取BVID
                    const link = card.href; // 卡片本身就是链接元素
                    const match = link && /bv\w{10}/i.exec(link);

                    if (match && match[0]) {
                    const bvid = match[0];
                        console.log(`[BiliHealth Scan] Found card with BVID: ${bvid}`);
                        processedCards.add(card); // 立即标记为处理中

                        // 异步获取统计数据并显示评分
                        fetchFullStats(bvid).then(stat => {
                            if (stat) {
                                console.log(`[BiliHealth Scan] Got stats for ${bvid}, calculating rating...`);
                                const ratingInfo = BiliRating.getFullRatingInfo(stat);
                                const { displayRatio, rating } = ratingInfo;

                                // 创建评分元素
                                const ratingSpan = document.createElement('span');
                                ratingSpan.className = 'bili-health-rating-span';
                                console.log("[BiliHealth Scan] Creating rating span...");

                                // 获取现有统计元素的大小参考
                                const statsArea = card.querySelector('.bili-cover-card__stats');
                                if (statsArea) {
                                    const existingStat = statsArea.querySelector('span:not(.bili-health-rating-span)');
                                    const fontSize = existingStat ? window.getComputedStyle(existingStat).fontSize : '13px';
                                    const iconHeight = existingStat ? existingStat.offsetHeight + 'px' : '14px';

                                    // 填充评分内容
                                    ratingSpan.innerHTML = `
                                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${iconHeight}"
                                            height="${iconHeight}" fill="currentColor" style="margin-right:2px;">
                                            <path d="M594.176 151.168a34.048 34.048 0 0 0-29.184 10.816c-11.264 13.184-15.872 24.064-21.504 40.064l-1.92 5.632c-5.632 16.128-12.8 36.864-27.648 63.232-25.408 44.928-50.304 74.432-86.208 97.024-23.04 14.528-43.648 26.368-65.024 32.576v419.648a4569.408 4569.408 0 0 0 339.072-4.672c38.72-2.048 72-21.12 88.96-52.032 21.504-39.36 47.168-95.744 63.552-163.008a782.72 782.72 0 0 0 22.528-163.008c0.448-16.832-13.44-32.256-35.328-32.256h-197.312a32 32 0 0 1-28.608-46.336l0.192-0.32 0.64-1.344 2.56-5.504c2.112-4.8 5.12-11.776 8.32-20.16 6.592-17.088 13.568-39.04 16.768-60.416 4.992-33.344 3.776-60.16-9.344-84.992-14.08-26.688-30.016-33.728-40.512-34.944zM691.84 341.12h149.568c52.736 0 100.864 40.192 99.328 98.048a845.888 845.888 0 0 1-24.32 176.384 742.336 742.336 0 0 1-69.632 178.56c-29.184 53.44-84.48 82.304-141.76 85.248-55.68 2.88-138.304 5.952-235.712 5.952-96 0-183.552-3.008-244.672-5.76-66.432-3.136-123.392-51.392-131.008-119.872a1380.672 1380.672 0 0 1-0.768-296.704c7.68-72.768 70.4-121.792 140.032-121.792h97.728c13.76 0 28.16-5.504 62.976-27.456 24.064-15.104 42.432-35.2 64.512-74.24 11.904-21.184 17.408-36.928 22.912-52.8l2.048-5.888c6.656-18.88 14.4-38.4 33.28-60.416a97.984 97.984 0 0 1 85.12-32.768c35.264 4.096 67.776 26.88 89.792 68.608 22.208 42.176 21.888 84.864 16 124.352a342.464 342.464 0 0 1-15.424 60.544z m-393.216 477.248V405.184H232.96c-40.448 0-72.448 27.712-76.352 64.512a1318.912 1318.912 0 0 0 0.64 282.88c3.904 34.752 32.96 61.248 70.4 62.976 20.8 0.96 44.8 1.92 71.04 2.816z" fill="currentColor"></path>
                                            </svg>
                                            <span class="${rating.className}" style="font-size: ${fontSize};">${displayRatio}${displayRatio === "小破站必刷" || displayRatio === "刷到必看" ? "" : "%"}</span>
                                        `;

                                    // 获取所有统计元素
                                    const statElements = Array.from(statsArea.querySelectorAll('.bili-cover-card__stat'));
                                    console.log(`[BiliHealth Scan] Found ${statElements.length} stats within container for ${bvid}.`);

                                    // 根据统计元素数量决定插入位置
                                    if (statElements.length >= 2) {
                                        console.log(`[BiliHealth Scan] Inserting rating after second stat for ${bvid}.`);
                                        // 在第二个统计值(弹幕数)之后插入
                                        statElements[1].insertAdjacentElement('afterend', ratingSpan);
                                    } else {
                                        console.log(`[BiliHealth Scan] Appending rating to stats for ${bvid} (less than 2 stats).`);
                                        // 如果统计值少于2个,追加到末尾
                                        statsArea.appendChild(ratingSpan);
                                    }

                                    console.log(`[BiliHealth Scan] Successfully added rating to card ${bvid}`, { displayRatio, ratingText: rating.text });
                                } else {
                                    console.warn(`[BiliHealth Scan] Could not find stats area for card ${bvid}`);
                                }
                            } else {
                                console.warn(`[BiliHealth Scan] No stats returned for ${bvid}`);
                            }
                        }).catch(error => {
                            console.error(`[BiliHealth Scan] Error processing card ${bvid}:`, error);
                        });
                    } else {
                        console.warn("[BiliHealth Scan] Could not find BVid for card:", card);
                        processedCards.add(card); // 即使没有BVID也标记为已处理
                            }
                        });
                console.log(`[BiliHealth Scan] Video card processing loop finished.`);
                }

            // 初始处理
            handleCards();

            // 监听DOM变化
            const observer = new MutationObserver((mutations) => {
                let shouldHandle = false;
                for (const mutation of mutations) {
                    if (mutation.type === 'childList') {
                        for (const node of mutation.addedNodes) {
                            if (node.nodeType === Node.ELEMENT_NODE &&
                                (node.matches('.bili-video-card__stats--left, .bili-cover-card__stats, .info .watch-info, .stat, .card-item .count, .info, .meta, .metrics, .count-info, .number, .info-count') ||
                                  node.querySelector('.bili-video-card__stats--left, .bili-cover-card__stats, .info .watch-info, .stat, .card-item .count, .info, .meta, .metrics, .count-info, .number, .info-count') ||
                                  node.matches('div.bili-video-card, div.bili-cover-card, .list-box .content, .ugc-list .list-item, .slide-list .card-item, .video-item, .media-card, .cube-list .cube-card, .feed-card, .video-card') ||
                                  node.querySelector('div.bili-video-card, div.bili-cover-card, .list-box .content, .ugc-list .list-item, .slide-list .card-item, .video-item, .media-card, .cube-list .cube-card, .feed-card, .video-card'))) {
                                 console.log("[BiliHealth Scan] MutationObserver detected relevant DOM change.", node);
                                shouldHandle = true;
                                  break; // Found a relevant node, trigger handling
                            }
                         }
                     }
                     // We are primarily concerned with new nodes containing stats or cards, less so attribute changes for this issue
                     // if (mutation.type === 'attributes' && ...) { ... }
                     if(shouldHandle) break; // If shouldHandle is already true, no need to check further mutations
                    }

                if (shouldHandle) {
                     console.log("[BiliHealth Scan] Triggering handleCards due to DOM change.");
                    setTimeout(handleCards, 50); // Use a small debounce
                }
            });

            // Listen for scroll events - primarily for lazy loading
            let scrollTimer = null; // Use a local timer variable
            window.addEventListener('scroll', () => {
                 // Debounce scroll handling slightly
                 if (scrollTimer) clearTimeout(scrollTimer);
                 scrollTimer = setTimeout(() => {
                     console.log("[BiliHealth Scan] Triggering handleCards due to scroll.");
                     handleCards();
                 }, 100); // Adjust debounce delay as needed
            });

            // Start observing the body for changes
            observer.observe(document.body, {
                childList: true, // Observe when children are added or removed
                subtree: true,   // Observe all descendants
                // attributes: true // Can be re-enabled if needed, but childList+subtree is usually sufficient for new elements
            });

        });
    }

     // 空间主页卡片处理
    function spacePageLogic() {
        document.addEventListener('DOMContentLoaded', function() {
            console.log("[BiliHealth Scan] spacePageLogic initialized.");
            const processedStatsContainers = new Set(); // 用于追踪已处理的统计容器

            function handleCards() {
                console.log("[BiliHealth Scan] Running handleCards on space page.");
                // Find all potential stats containers first, as they are a consistent marker
                // Expanded selectors based on previous attempts and common patterns
                const statsContainers = Array.from(document.querySelectorAll('.bili-video-card__stats--left, .bili-cover-card__stats, .info .watch-info, .stat, .card-item .count, .info, .meta, .metrics, .count-info, .number, .info-count')); 
                console.log(`[BiliHealth Scan] Found ${statsContainers.length} potential stats containers.`);

                statsContainers.forEach(statsContainer => {
                    // Check if this stats container has already been processed
                    if (processedStatsContainers.has(statsContainer)) {
                        return;
                    }

                    // Look for a parent link element containing the BVID
                    // Traverse up the DOM tree from the stats container to find a relevant link
                    let currentElement = statsContainer;
                    let linkElement = null;
                    let bvid = null;

                    while (currentElement && currentElement !== document.body) {
                        // Check if the current element is a link with a BVID
                        if (currentElement.tagName === 'A') {
                             const link = currentElement.href;
                    const match = link && /bv\w{10}/i.exec(link);
                            if (match) {
                                linkElement = currentElement;
                                bvid = match[0];
                                break; // Found the link and BVID, stop searching up
                            }
                        }

                        // Also check for a link within the current element (sibling or nested in a nearby parent)
                        const nestedLink = currentElement.querySelector('a[href*="/video/BV"], a[data-aid], a[data-bvid]'); // Added more link patterns
                         if(nestedLink) { // If a nested link is found, check its href/data attributes
                              const link = nestedLink.href || nestedLink.dataset.bvid || (nestedLink.dataset.aid ? `/video/av${nestedLink.dataset.aid}` : null);
                              const match = link && /bv\w{10}|av\d+/i.exec(link);
                              if(match) {
                                   bvid = match[0].startsWith('av') ? match[0] : match[0]; // Keep av/bv for now, fetchFullStats should handle
                                   linkElement = nestedLink;
                                   break; // Found the link and BVID, stop searching up
                              }
                         }

                        currentElement = currentElement.parentElement;
                    }

                    if (!bvid) {
                        // Could not find a related link with BVID for this stats container
                         // console.log("[BiliHealth Scan] Could not find BVID for stats container:", statsContainer); // Too verbose
                        processedStatsContainers.add(statsContainer); // Mark as processed to avoid re-checking
                        return;
                    }

                    // Check if rating element already exists in this stats container
                    if (statsContainer.querySelector('.bili-health-rating-span')) {
                         // console.log(`[BiliHealth Scan] Rating already exists in stats container for ${bvid}, skipping.`); // Too verbose
                         processedStatsContainers.add(statsContainer); // Mark as processed
                        return;
                    }
                    
                    console.log(`[BiliHealth Scan] Found stats container and BVID ${bvid}. Fetching stats...`);
                    processedStatsContainers.add(statsContainer); // Mark as processing immediately

                    // Async fetch stats and inject
                    fetchFullStats(bvid).then(stat => {
                        if (!stat) {
                            console.warn(`[BiliHealth Scan] No stats returned for ${bvid}`);
                            return;
                        }

                        console.log(`[BiliHealth Scan] Got stats for ${bvid}, injecting rating.`);
                        const span = document.createElement('span');
                        span.className = 'bili-health-rating-span';
                        const ratingInfo = BiliRating.getFullRatingInfo(stat);
                        const { displayRatio, rating } = ratingInfo;
                        
                        // Get size reference from existing stat elements within THIS container
                        const existingStat = statsContainer.querySelector('span:not(.bili-health-rating-span)'); 
                        const fontSize = existingStat ? window.getComputedStyle(existingStat).fontSize : '13px';
                        const iconHeight = existingStat ? existingStat.offsetHeight + 'px' : '14px'; 
                        
                        span.innerHTML = `
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="${iconHeight}"
                                height="${iconHeight}" fill="currentColor" style="margin-right:2px;">
                                <path d="M594.176 151.168a34.048 34.048 0 0 0-29.184 10.816c-11.264 13.184-15.872 24.064-21.504 40.064l-1.92 5.632c-5.632 16.128-12.8 36.864-27.648 63.232-25.408 44.928-50.304 74.432-86.208 97.024-23.04 14.528-43.648 26.368-65.024 32.576v419.648a4569.408 4569.408 0 0 0 339.072-4.672c38.72-2.048 72-21.12 88.96-52.032 21.504-39.36 47.168-95.744 63.552-163.008a782.72 782.72 0 0 0 22.528-163.008c0.448-16.832-13.44-32.256-35.328-32.256h-197.312a32 32 0 0 1-28.608-46.336l0.192-0.32 0.64-1.344 2.56-5.504c2.112-4.8 5.12-11.776 8.32-20.16 6.592-17.088 13.568-39.04 16.768-60.416 4.992-33.344 3.776-60.16-9.344-84.992-14.08-26.688-30.016-33.728-40.512-34.944zM691.84 341.12h149.568c52.736 0 100.864 40.192 99.328 98.048a845.888 845.888 0 0 1-24.32 176.384 742.336 742.336 0 0 1-69.632 178.56c-29.184 53.44-84.48 82.304-141.76 85.248-55.68 2.88-138.304 5.952-235.712 5.952-96 0-183.552-3.008-244.672-5.76-66.432-3.136-123.392-51.392-131.008-119.872a1380.672 1380.672 0 0 1-0.768-296.704c7.68-72.768 70.4-121.792 140.032-121.792h97.728c13.76 0 28.16-5.504 62.976-27.456 24.064-15.104 42.432-35.2 64.512-74.24 11.904-21.184 17.408-36.928 22.912-52.8l2.048-5.888c6.656-18.88 14.4-38.4 33.28-60.416a97.984 97.984 0 0 1 85.12-32.768c35.264 4.096 67.776 26.88 89.792 68.608 22.208 42.176 21.888 84.864 16 124.352a342.464 342.464 0 0 1-15.424 60.544z m-393.216 477.248V405.184H232.96c-40.448 0-72.448 27.712-76.352 64.512a1318.912 1318.912 0 0 0 0.64 282.88c3.904 34.752 32.96 61.248 70.4 62.976 20.8 0.96 44.8 1.92 71.04 2.816z" fill="currentColor"></path>
                            </svg>
                            <span class="${rating.className}" style="font-size: ${fontSize};">${displayRatio}${displayRatio === "小破站必刷" || displayRatio === "刷到必看" ? "" : "%"}</span>`;
                        
                        // Get all stat elements within THIS container
                        const statElements = Array.from(statsContainer.children);
                        console.log(`[BiliHealth Scan] Found ${statElements.length} stats within container for ${bvid}.`);
                        
                        // Determine insertion position based on the number of stats
                        if (statElements.length === 2) {
                            console.log(`[BiliHealth Scan] Inserting rating between 2 stats for ${bvid}.`);
                            // Insert between the two existing stats
                            if(statElements[1]) statsContainer.insertBefore(span, statElements[1]);
                            else statsContainer.appendChild(span); // Fallback if somehow statElements[1] is null
                        } else if (statElements.length >= 3) {
                             console.log(`[BiliHealth Scan] Inserting rating between 2nd and 3rd stats for ${bvid}.`);
                            // Insert between the second and third stats
                             if(statElements[2]) statsContainer.insertBefore(span, statElements[2]);
                             else statsContainer.appendChild(span); // Fallback
                        } else {
                             console.log(`[BiliHealth Scan] Appending rating to stats for ${bvid} (less than 2 stats).`);
                            // If 0 or 1 stat, append to the end
                            statsContainer.appendChild(span);
                        }
                        console.log(`[BiliHealth Scan] Successfully injected rating for ${bvid}.`);

                    }).catch(error => {
                         console.error(`[BiliHealth Scan] Error fetching stats or injecting rating for ${bvid}:`, error);
                    });
                });
            }

            // Initial processing
            handleCards();

            // Use a single MutationObserver on the body
            const observer = new MutationObserver((mutations) => {
                let shouldHandle = false;
                // Look for added nodes that are likely to contain stats containers or cards
                for (const mutation of mutations) {
                     if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                         for (const node of mutation.addedNodes) {
                              // Check if the added node itself or its descendants contain potential stats containers or cards
                            if (node.nodeType === Node.ELEMENT_NODE && 
                                 (node.matches('.bili-video-card__stats--left, .bili-cover-card__stats, .info .watch-info, .stat, .card-item .count, .info, .meta, .metrics, .count-info, .number, .info-count') ||
                                  node.querySelector('.bili-video-card__stats--left, .bili-cover-card__stats, .info .watch-info, .stat, .card-item .count, .info, .meta, .metrics, .count-info, .number, .info-count') ||
                                  node.matches('div.bili-video-card, div.bili-cover-card, .list-box .content, .ugc-list .list-item, .slide-list .card-item, .video-item, .media-card, .cube-list .cube-card, .feed-card, .video-card') ||
                                  node.querySelector('div.bili-video-card, div.bili-cover-card, .list-box .content, .ugc-list .list-item, .slide-list .card-item, .video-item, .media-card, .cube-list .cube-card, .feed-card, .video-card'))) {
                                 console.log("[BiliHealth Scan] MutationObserver detected relevant DOM change.", node);
                                shouldHandle = true;
                                  break; // Found a relevant node, trigger handling
                            }
                         }
                     }
                     // We are primarily concerned with new nodes containing stats or cards, less so attribute changes for this issue
                     // if (mutation.type === 'attributes' && ...) { ... }
                     if(shouldHandle) break; // If shouldHandle is already true, no need to check further mutations
                    }

                if (shouldHandle) {
                     console.log("[BiliHealth Scan] Triggering handleCards due to DOM change.");
                    setTimeout(handleCards, 50); // Use a small debounce
                }
            });

            // Listen for scroll events - primarily for lazy loading
            let scrollTimer = null; // Use a local timer variable
            window.addEventListener('scroll', () => {
                 // Debounce scroll handling slightly
                 if (scrollTimer) clearTimeout(scrollTimer);
                 scrollTimer = setTimeout(() => {
                     console.log("[BiliHealth Scan] Triggering handleCards due to scroll.");
                     handleCards();
                 }, 100); // Adjust debounce delay as needed
            });

            // Start observing the body for changes
            observer.observe(document.body, {
                childList: true, // Observe when children are added or removed
                subtree: true,   // Observe all descendants
                // attributes: true // Can be re-enabled if needed, but childList+subtree is usually sufficient for new elements
            });

        });
    }

})(); 
