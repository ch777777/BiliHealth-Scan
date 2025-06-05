// ==UserScript==
// @name         空间主页Bilibili Space Card Rater
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Displays a calculated rating on Bilibili space page video cards based on interaction stats.
// @author       Your Name
// @match        https://space.bilibili.com/*
// @grant        GM.addStyle
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log("[BiliCardRater] 脚本开始执行...");

    // ====== 常量与样式区 ======
    // 评级颜色配置 (从开发中的1.8版本复制)
    const RATING_COLORS = {
        rainbow: 'rainbow-text',
        red: 'red-text',
        gold: 'gold-text',
        orange: 'orange-text',
        orangered: 'orangered-text',
        limegreen: 'limegreen-text',
        yellowgreen: 'yellowgreen-text',
    };

    // 评级文本配置 (从开发中的1.8版本复制)
    const RATING_TEXTS = [
        { min: 100, text: '满分神作', color: RATING_COLORS.rainbow },
        { min: 95, text: '好评如潮', color: RATING_COLORS.red },
        { min: 80, text: '非常好评', color: RATING_COLORS.gold },
        { min: 70, text: '多半好评', color: RATING_COLORS.orange },
        { min: 40, text: '褒贬不一', color: RATING_COLORS.orangered },
        { min: 20, text: '多半差评', color: RATING_COLORS.limegreen },
        { min: 0, text: '差评如潮', color: RATING_COLORS.yellowgreen },
    ];

    // 添加必要样式 (从开发中的1.8版本复制并调整)
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
            font-size: 13px; /* Keep this as it sets the base stat size */
            display: inline-flex;
            align-items: center;
        }
        .bili-video-card__stats--icon,
        .bili-cover-card__stats svg {
            margin-right: 2px;
        }
        /* 空间主页卡片好评率样式 */
        /* 根据空间主页结构调整样式插入位置 */
         .bili-video-card__info {
             position: relative; /* 确保子元素可以绝对定位 */
         }
        .space-rating-span {
            font-weight: bold;
             /* Remove fixed font-size to inherit from parent stat element */
             /* font-size: 12px; */ 
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
         .space-rating-span span {
             /* Ensure text color is applied, font size should inherit */
             -webkit-text-fill-color: unset; 
             font-size: inherit; /* Ensure the span inside inherits */
         }
    `);


    // ====== 统一数据处理与API请求 (从开发中的1.8版本复制) ======
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
            if (data.view >= 20000000) {
                return "小破站必刷";
            }
            if (ratio < 70) return ratio.toFixed(2);
            const calculatedRatio = (90 + (ratio - 50) * (10 / (200 - 150))).toFixed(2);
            if (parseFloat(calculatedRatio) > 100) {
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
            return parseFloat(calculatedRatio) > 100 ? "100.00" : calculatedRatio;
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
        // 计算各项比率 (保留，尽管本脚本主要用综合评级)
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
                shareRatio
            };
        }
    };

    // ====== API数据请求 (从开发中的1.8版本复制) ======
    const statCache = new Map();
    async function fetchFullStats(bvid) {
        if (statCache.has(bvid)) {
            console.log(`[BiliCardRater] Cache hit for ${bvid}`);
            return statCache.get(bvid);
        }
         console.log(`[BiliCardRater] Fetching stats for ${bvid}...`);
        try {
            // 使用GM_xmlhttpRequest 或 fetch with required headers if needed by GM
            // For simplicity, using fetch here, assuming GM allows it directly.
            // If fetch has issues in Tampermonkey, switch to GM_xmlhttpRequest.
            const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
            const data = await response.json();
            if (data && data.code === 0 && data.data && data.data.stat) {
                 console.log(`[BiliCardRater] Successfully fetched data for ${bvid}`, data.data.stat);
                statCache.set(bvid, data.data.stat);
                return data.data.stat;
            }
        } catch (error) {
            console.error(`[BiliCardRater] 获取BVID ${bvid} 的数据失败:`, error);
        }
         console.warn(`[BiliCardRater] Failed to fetch stat data for ${bvid}`);
        return null;
    }

    // ====== 卡片处理与UI显示 ======
    const processedCards = new Set(); // 用于追踪已处理的卡片

    function processVideoCards() {
         console.log("[BiliCardRater] 开始处理视频卡片...");
        // 查找空间主页的视频卡片
        const cards = Array.from(document.querySelectorAll('.bili-video-card'));
        
        if (cards.length === 0) {
            console.log("[BiliCardRater] 没有找到视频卡片，跳过当前处理循环."); 
            return; 
        }

        console.log(`[BiliCardRater] 找到 ${cards.length} 张视频卡片，开始处理.`); 

        cards.forEach(card => {
            // 检查卡片是否已处理过（包括正在处理的），或是否已经添加了好评率元素
            if (processedCards.has(card) || card.querySelector('.space-rating-span')) {
                 // console.log("[BiliCardRater] Skipping already processed card.", card); // Optional: log skipped cards
                return;
            }

            // 在空间主页卡片内部查找链接提取BV号
            const linkElement = card.querySelector('a.bili-cover-card');
            const link = linkElement?.href;
            const match = link && /bv\w{10}/i.exec(link);

            if (match && match[0]) {
                const bvid = match[0];
                 console.log(`[BiliCardRater] Found potential card with BVID: ${bvid}`);
                 processedCards.add(card); // Mark as processing immediately

                // 异步获取统计数据并显示评级
                 fetchFullStats(bvid).then(stat => {
                    if (stat) {
                         console.log(`[BiliCardRater] Got stats for ${bvid}, calculating rating...`);
                        const ratingInfo = BiliRating.getFullRatingInfo(stat);
                        const { displayRatio, rating } = ratingInfo;

                        // 创建并插入好评率显示元素
                        const ratingSpan = document.createElement('span');
                        ratingSpan.className = 'space-rating-span'; 
                         console.log("[BiliCardRater] Creating rating span...");

                         // Fill the ratingSpan with content
                         ratingSpan.innerHTML = `
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="14"
                                 height="14" fill="currentColor" style="margin-right:2px;">
                                 <path d="M594.176 151.168a34.048 34.048 0 0 0-29.184 10.816c-11.264 13.184-15.872 24.064-21.504 40.064l-1.92 5.632c-5.632 16.128-12.8 36.864-27.648 63.232-25.408 44.928-50.304 74.432-86.208 97.024-23.04 14.528-43.648 26.368-65.024 32.576v419.648a4569.408 4569.408 0 0 0 339.072-4.672c38.72-2.048 72-21.12 88.96-52.032 21.504-39.36 47.168-95.744 63.552-163.008a782.72 782.72 0 0 0 22.528-163.008c0.448-16.832-13.44-32.256-35.328-32.256h-197.312a32 32 0 0 1-28.608-46.336l0.192-0.32 0.64-1.344 2.56-5.504c2.112-4.8 5.12-11.776 8.32-20.16 6.592-17.088 13.568-39.04 16.768-60.416 4.992-33.344 3.776-60.16-9.344-84.992-14.08-26.688-30.016-33.728-40.512-34.944zM691.84 341.12h149.568c52.736 0 100.864 40.192 99.328 98.048a845.888 845.888 0 0 1-24.32 176.384 742.336 742.336 0 0 1-69.632 178.56c-29.184 53.44-84.48 82.304-141.76 85.248-55.68 2.88-138.304 5.952-235.712 5.952-96 0-183.552-3.008-244.672-5.76-66.432-3.136-123.392-51.392-131.008-119.872a1380.672 1380.672 0 0 1-0.768-296.704c7.68-72.768 70.4-121.792 140.032-121.792h97.728c13.76 0 28.16-5.504 62.976-27.456 24.064-15.104 42.432-35.2 64.512-74.24 11.904-21.184 17.408-36.928 22.912-52.8l2.048-5.888c6.656-18.88 14.4-38.4 33.28-60.416a97.984 97.984 0 0 1 85.12-32.768c35.264 4.096 67.776 26.88 89.792 68.608 22.208 42.176 21.888 84.864 16 124.352a342.464 342.464 0 0 1-15.424 60.544z m-393.216 477.248V405.184H232.96c-40.448 0-72.448 27.712-76.352 64.512a1318.912 1318.912 0 0 0 0.64 282.88c3.904 34.752 32.96 61.248 70.4 62.976 20.8 0.96 44.8 1.92 71.04 2.816z" fill="currentColor"></path>
                             </svg>
                             <span class="${rating.className}">${displayRatio}${displayRatio === "小破站必刷" || displayRatio === "刷到必看" ? "" : "%"}</span>
                         `;

                         // 检查是否存在封面区域或信息区域来插入，优先 infoArea
                         const infoArea = card.querySelector('.bili-video-card__info'); 
                         const statsArea = card.querySelector('.bili-cover-card__stats'); 

                         if (infoArea && !infoArea.querySelector('.space-rating-span')) { // Also check if rating already exists here
                             console.log(`[BiliCardRater] Inserting rating into info area for ${bvid}`); 
                             infoArea.appendChild(ratingSpan);
                              console.log(`[BiliCardRater] Successfully added rating to card ${bvid} in info area.`, { displayRatio, ratingText: rating.text });
                             // card is already in processedCards
                         } else if (statsArea) {
                             console.log(`[BiliCardRater] Attempting to insert/replace in stats area for ${bvid}`); 
                             
                             // Find the stat elements within the stats area
                             const statElements = statsArea.querySelectorAll('.bili-cover-card__stat');

                             // If there are at least two stat elements, replace the second one (danmu) with the rating.
                             // This simplifies logic based on user feedback to replace danmu for most cards with stats.
                             if (statElements.length >= 2) {
                                 const danmuStatElement = statElements[1]; // Second element is index 1 (Danmu)
                                  if (danmuStatElement) {
                                     console.log(`[BiliCardRater] Found at least 2 stats for ${bvid}, replacing danmu stat.`);
                                     danmuStatElement.replaceWith(ratingSpan); // Replace the danmu stat element
                                     console.log(`[BiliCardRater] Replaced danmu stat with rating for ${bvid}`);
                                 } else {
                                      console.warn(`[BiliCardRater] Could not find danmu stat element for ${bvid} despite having >= 2 stats. Appending.`);
                                      statsArea.appendChild(ratingSpan); // Fallback: append
                                 }
                              } 
                               else { // Fallback: append to the end of statsArea if structure is unexpected (less than 2 stats)
                                 statsArea.appendChild(ratingSpan);
                                  console.log(`[BiliCardRater] Appended rating to end of stats area for ${bvid} (less than 2 stats found)`);
                               }

                             console.log(`[BiliCardRater] Finished processing stats area for card ${bvid}`, { displayRatio, ratingText: rating.text }); 
                             // card is already in processedCards
                         }
                          else {
                             console.warn(`[BiliCardRater] 无法找到插入点为卡片 ${bvid}`);
                             // card is already in processedCards
                         }
                    } else {
                         console.warn(`[BiliCardRater] No stats returned for ${bvid}`);
                         // card is already in processedCards
                    }
                 }).catch(error => {
                     console.error(`[BiliCardRater] Error processing card ${bvid}:`, error);
                     // card is already in processedCards
                 });
            } else {
                 console.warn("[BiliCardRater] Could not find BVid for card:", card); 
                 processedCards.add(card); // Mark even cards without BVID as processed to avoid re-checking
            }
        });
         console.log(`[BiliCardRater] 视频卡片处理循环完成.`); 
    }

    // ====== 页面加载与动态内容处理 ======

    // Initial observer to wait for the first card to appear
    const initialObserver = new MutationObserver((mutations, observer) => {
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                     // Check if the added node itself is a card or contains a card
                    if (node.nodeType === Node.ELEMENT_NODE && 
                        (node.classList && node.classList.contains('bili-video-card') || 
                         node.querySelector && node.querySelector('.bili-video-card'))) {

                        console.log("[BiliCardRater] 初次检测到视频卡片出现.");
                        // Stop observing with the initial observer
                        observer.disconnect();

                        // Process the cards immediately
                        processVideoCards();

                        // Now set up the long-term observer for future dynamic loading
                        setup长期MutationObserver();
                        
                        return; // Found a card, no need to check further mutations in this batch
                    }
                }
            }
        }
    });

    // Long-term observer for subsequent dynamic content
    let longTermObserver = null;
    let processTimer = null; // Timer for debouncing

    function setup长期MutationObserver() {
         console.log("[BiliCardRater] 已开始监听后续DOM变化...");
        longTermObserver = new MutationObserver((mutations) => {
            // Check if any nodes were added
            let nodesAdded = false;
            for (const mutation of mutations) {
                 if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                     nodesAdded = true;
                     break; // Found added nodes, can trigger processing
                 }
            }

            if (nodesAdded) {
                 console.log("[BiliCardRater] MutationObserver detected changes (nodes added), debouncing processing..."); 
                 // Use a small delay to allow multiple DOM modifications in a batch
                 setTimeout(processVideoCards, 200); // Increased debounce delay again
            }
        });

        // Start observing the body for the long term
        longTermObserver.observe(document.body, {
            childList: true,
            subtree: true,
            // attributes: true // Keep commented unless attribute changes specifically cause card visibility changes not covered by childList
        });
    }

    // Start the initial observer as soon as the DOM is ready or the script runs
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        console.log("[BiliCardRater] Page already interactive or complete, starting initial observer.");
         // Use a small timeout to ensure the observer is fully set up before any potential immediate DOM modifications
         setTimeout(() => initialObserver.observe(document.body, { childList: true, subtree: true }), 0);
    } else {
        console.log("[BiliCardRater] DOM not yet interactive, waiting for DOMContentLoaded to start initial observer.");
        document.addEventListener('DOMContentLoaded', () => {
             console.log("[BiliCardRater] DOMContentLoaded fired, starting initial observer.");
            // Use a small timeout here too
            setTimeout(() => initialObserver.observe(document.body, { childList: true, subtree: true }), 0);
        });
    }

    // Optional: Add scroll listener as a fallback/additional trigger if needed
    // window.addEventListener('scroll', () => {
    //     // Add scroll processing logic here if necessary
    // });

})();
