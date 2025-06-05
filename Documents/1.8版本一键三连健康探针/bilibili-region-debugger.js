// ==UserScript==
// @name         分区主页Bilibili Region Card Rater Debugger
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Displays a calculated rating on Bilibili region page video cards based on interaction stats for debugging.
// @author       Your Name
// @match        https://www.bilibili.com/c/*
// @grant        GM.addStyle
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    console.log("[RegionCardRaterDebug] 脚本开始执行...");

    // ====== Constants and Styles ====== (Copied from 1.8 version)
    const RATING_COLORS = {
        rainbow: 'rainbow-text',
        red: 'red-text',
        gold: 'gold-text',
        orange: 'orange-text',
        orangered: 'orangered-text',
        limegreen: 'limegreen-text',
        yellowgreen: 'yellowgreen-text',
    };

    GM.addStyle(`
        /* Rating text colors */
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

        /* Card stats adaptive styles (adjust for different UI versions if needed) */
        /* Target both bili-video-card (if any) and bili-cover-card */
        .bili-video-card__stats--left,
        .bili-cover-card__stats {
             display: flex; /* Ensure flex layout */
             align-items: center; /* Vertically center items */
             flex-wrap: wrap; /* Allow wrapping if needed */
        }

        .bili-video-card__stats--left > span,
        .bili-cover-card__stats > span,
        .region-rating-span {
             margin-right: 8px;
             /* font-size: 13px; Keep this as it sets the base stat size */
             display: inline-flex;
             align-items: center;
             /* Remove fixed font-size to inherit from parent stat element */
             /* font-size: 12px; */
        }

        .bili-video-card__stats--icon,
        .bili-cover-card__stats svg {
            margin-right: 2px;
        }

        /* Style for the injected rating span */
        .region-rating-span {
             font-weight: bold;
             /* Inherit size from parent .bili-cover-card__stats */
             /* font-size: inherit;  This might not work directly, better grab computed style */
             white-space: nowrap; /* Prevent wrapping for the rating */
        }

         /* Style for rating text within the span */
         .region-rating-span span {
             /* Ensure text color is applied, font size should inherit */
             -webkit-text-fill-color: unset;
             font-size: inherit; /* Ensure the span inside inherits */
         }
    `);


    // ====== Unified Data Processing and API Requests ====== (Copied from 1.8 version)
    // Weight configuration
    const INTERACTION_WEIGHTS = {
        like: 1,
        coin: 8,
        favorite: 4,
        share: 6,
    };

    // Rating algorithm and data processing
    const BiliRating = {
        WEIGHTS: INTERACTION_WEIGHTS,
        RATING_COLORS,
        // Normalize video data
        normalizeData(rawData) {
            return {
                view: parseInt(rawData.view) || 0,
                like: parseInt(rawData.like) || 0,
                coin: parseInt(rawData.coin) || 0,
                favorite: parseInt(rawData.favorite) || 0,
                share: parseInt(rawData.share) || 0
            };
        },
        // Calculate weighted interaction ratio
        calculateWeightedRatio(data) {
            if (data.view < 1000) return 0;
            const weightedInteractions =
                (data.like * this.WEIGHTS.like) +
                (data.coin * this.WEIGHTS.coin) +
                (data.favorite * this.WEIGHTS.favorite) +
                (data.share * this.WEIGHTS.share);
            return ((weightedInteractions / data.view) * 100 * 3).toFixed(2);
        },
        // Get display rating
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
        // Get rating classification
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
        // Calculate individual ratios (kept for completeness)
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
        // Get full rating info
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

    // ====== API Data Request ====== (Copied from 1.8 version)
    const statCache = new Map();
    async function fetchFullStats(bvid) {
        if (statCache.has(bvid)) {
            console.log(`[RegionCardRaterDebug] Cache hit for ${bvid}`);
            return statCache.get(bvid);
        }
         console.log(`[RegionCardRaterDebug] Fetching stats for ${bvid}...`);
        try {
            const response = await fetch(`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`);
            const data = await response.json();
            if (data && data.code === 0 && data.data && data.data.stat) {
                 console.log(`[RegionCardRaterDebug] Successfully fetched data for ${bvid}`, data.data.stat);
                statCache.set(bvid, data.data.stat);
                return data.data.stat;
            }
        } catch (error) {
            console.error(`[RegionCardRaterDebug] 获取BVID ${bvid} 的数据失败:`, error);
        }
         console.warn(`[RegionCardRaterDebug] Failed to fetch stat data for ${bvid}`);
        return null;
    }

    // ====== Card Processing and UI Display ====== Debugger version
    const processedCards = new Set(); // To track processed cards

    function processVideoCards() {
         console.log("[RegionCardRaterDebug] Starting to process video cards...");
        // Select cards using the class found on the region page
        const cards = Array.from(document.querySelectorAll('.bili-cover-card'));

        if (cards.length === 0) {
            console.log("[RegionCardRaterDebug] No video cards found, skipping current processing loop.");
            return;
        }

        console.log(`[RegionCardRaterDebug] Found ${cards.length} video cards, starting processing.`);

        cards.forEach(card => {
            // Check if card has been processed or has the rating element already
            if (processedCards.has(card) || card.querySelector('.region-rating-span')) {
                 // console.log("[RegionCardRaterDebug] Skipping already processed card.", card); // Optional: log skipped cards
                return;
            }

            // 从卡片中查找链接以提取BVID
            const link = card.href; // 卡片本身就是链接元素
            const match = link && /bv\w{10}/i.exec(link);

            if (match && match[0]) {
                const bvid = match[0];
                 console.log(`[RegionCardRaterDebug] Found potential card with BVID: ${bvid}`);
                 processedCards.add(card); // Mark as processing immediately

                // Asynchronously fetch stats and display rating
                 fetchFullStats(bvid).then(stat => {
                    if (stat) {
                         console.log(`[RegionCardRaterDebug] Got stats for ${bvid}, calculating rating...`);
                        const ratingInfo = BiliRating.getFullRatingInfo(stat);
                        const { displayRatio, rating } = ratingInfo;

                        // Create and insert the rating element
                        const ratingSpan = document.createElement('span');
                        ratingSpan.className = 'region-rating-span';
                         console.log("[RegionCardRaterDebug] Creating rating span...");

                         // Fill the ratingSpan with content
                         ratingSpan.innerHTML = `
                             <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="14"
                                 height="14" fill="currentColor" style="margin-right:2px;">
                                 <path d="M594.176 151.168a34.048 34.048 0 0 0-29.184 10.816c-11.264 13.184-15.872 24.064-21.504 40.064l-1.92 5.632c-5.632 16.128-12.8 36.864-27.648 63.232-25.408 44.928-50.304 74.432-86.208 97.024-23.04 14.528-43.648 26.368-65.024 32.576v419.648a4569.408 4569.408 0 0 0 339.072-4.672c38.72-2.048 72-21.12 88.96-52.032 21.504-39.36 47.168-95.744 63.552-163.008a782.72 782.72 0 0 0 22.528-163.008c0.448-16.832-13.44-32.256-35.328-32.256h-197.312a32 32 0 0 1-28.608-46.336l0.192-0.32 0.64-1.344 2.56-5.504c2.112-4.8 5.12-11.776 8.32-20.16 6.592-17.088 13.568-39.04 16.768-60.416 4.992-33.344 3.776-60.16-9.344-84.992-14.08-26.688-30.016-33.728-40.512-34.944zM691.84 341.12h149.568c52.736 0 100.864 40.192 99.328 98.048a845.888 845.888 0 0 1-24.32 176.384 742.336 742.336 0 0 1-69.632 178.56c-29.184 53.44-84.48 82.304-141.76 85.248-55.68 2.88-138.304 5.952-235.712 5.952-96 0-183.552-3.008-244.672-5.76-66.432-3.136-123.392-51.392-131.008-119.872a1380.672 1380.672 0 0 1-0.768-296.704c7.68-72.768 70.4-121.792 140.032-121.792h97.728c13.76 0 28.16-5.504 62.976-27.456 24.064-15.104 42.432-35.2 64.512-74.24 11.904-21.184 17.408-36.928 22.912-52.8l2.048-5.888c6.656-18.88 14.4-38.4 33.28-60.416a97.984 97.984 0 0 1 85.12-32.768c35.264 4.096 67.776 26.88 89.792 68.608 22.208 42.176 21.888 84.864 16 124.352a342.464 342.464 0 0 1-15.424 60.544z m-393.216 477.248V405.184H232.96c-40.448 0-72.448 27.712-76.352 64.512a1318.912 1318.912 0 0 0 0.64 282.88c3.904 34.752 32.96 61.248 70.4 62.976 20.8 0.96 44.8 1.92 71.04 2.816z" fill="currentColor"></path>
                             </svg>
                             <span class="${rating.className}">${displayRatio}${displayRatio === "小破站必刷" || displayRatio === "刷到必看" ? "" : "%"}</span>
                         `;

                         // Find the stats container
                         const statsArea = card.querySelector('.bili-cover-card__stats');

                         if (statsArea) {
                             console.log(`[RegionCardRaterDebug] Inserting rating into stats area for ${bvid} (between 2nd and 3rd stats)`);

                             // Get the size reference from an existing stat element
                             const existingStatSpan = statsArea.querySelector('.bili-cover-card__stats > span');
                             if (existingStatSpan) {
                                 const computedStyle = window.getComputedStyle(existingStatSpan);
                                 const fontSize = computedStyle.fontSize;
                                 const iconSvg = ratingSpan.querySelector('svg');
                                 const textSpan = ratingSpan.querySelector('span');

                                 if (fontSize) {
                                     console.log(`[RegionCardRaterDebug] Applying font size ${fontSize} to rating span and icon for ${bvid}`);
                                     ratingSpan.style.fontSize = fontSize; // Apply to the parent span
                                     if (iconSvg) iconSvg.style.width = fontSize; // Attempt to match icon size
                                     if (iconSvg) iconSvg.style.height = fontSize; // Attempt to match icon size
                                     if (textSpan) textSpan.style.fontSize = 'inherit'; // Ensure inner span inherits
                                 }
                             } else {
                                  console.warn(`[RegionCardRaterDebug] Could not find existing stat span to get size reference for ${bvid}. Using default size.`);
                             }

                             // Find the second stat element (danmu count)
                             const statElements = statsArea.querySelectorAll('.bili-cover-card__stat');
                             if (statElements.length >= 2) {
                                 // Insert after the second stat (danmu count)
                                 statElements[1].insertAdjacentElement('afterend', ratingSpan);
                                 console.log(`[RegionCardRaterDebug] Successfully inserted rating after danmu stat for ${bvid}`);
                             } else {
                                 // Fallback: append to the end if structure is unexpected
                                 statsArea.appendChild(ratingSpan);
                                 console.log(`[RegionCardRaterDebug] Appended rating to end of stats area for ${bvid} (fallback)`);
                             }

                             console.log(`[RegionCardRaterDebug] Successfully added rating to card ${bvid}`, { displayRatio, ratingText: rating.text });
                             // card is already in processedCards
                         } else {
                             console.warn(`[RegionCardRaterDebug] Could not find stats area for card ${bvid}`);
                             // card is already in processedCards
                         }
                    } else {
                         console.warn(`[RegionCardRaterDebug] No stats returned for ${bvid}`);
                         // card is already in processedCards
                    }
                 }).catch(error => {
                     console.error(`[RegionCardRaterDebug] Error processing card ${bvid}:`, error);
                     // card is already in processedCards
                 });
            } else {
                 console.warn("[RegionCardRaterDebug] Could not find BVid for card:", card);
                 processedCards.add(card); // Mark even cards without BVID as processed
            }
        });
         console.log(`[RegionCardRaterDebug] Video card processing loop finished.`);
    }

    // ====== Page Load and Dynamic Content Handling ====== Debugger version

    // Observer for dynamically loaded content
    const observer = new MutationObserver((mutations) => {
        let cardsAdded = false;
        for (const mutation of mutations) {
            if (mutation.type === 'childList') {
                for (const node of mutation.addedNodes) {
                    // Check if the added node is a card or contains a card
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        (node.classList && node.classList.contains('bili-cover-card') ||
                         node.querySelector && node.querySelector('.bili-cover-card'))) {
                        cardsAdded = true;
                        break;
                    }
                }
            }
            if (cardsAdded) break;
        }

        if (cardsAdded) {
            console.log("[RegionCardRaterDebug] MutationObserver detected new cards, processing...");
            // Debounce processing to handle multiple additions at once
            setTimeout(processVideoCards, 100); // Small delay
        }
    });

    // Start observing the body for changes
    // Use a small timeout to ensure observer is set up after initial DOM ready
    setTimeout(() => {
         console.log("[RegionCardRaterDebug] Starting MutationObserver...");
        observer.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }, 0);

    // Also process cards on initial page load after a short delay to ensure DOM is ready
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
         console.log("[RegionCardRaterDebug] Page already interactive or complete, processing initial cards...");
        setTimeout(processVideoCards, 100);
    } else {
         console.log("[RegionCardRaterDebug] DOM not yet interactive, waiting for DOMContentLoaded for initial processing.");
        document.addEventListener('DOMContentLoaded', () => {
             console.log("[RegionCardRaterDebug] DOMContentLoaded fired, processing initial cards.");
            setTimeout(processVideoCards, 100);
        });
    }

    // Optional: Add scroll listener as an additional trigger if needed
    // let scrollTimer = null;
    // window.addEventListener('scroll', () => {
    //     if (scrollTimer) clearTimeout(scrollTimer);
    //     scrollTimer = setTimeout(() => {
    //         console.log("[RegionCardRaterDebug] Scroll event triggered processing.");
    //         processVideoCards();
    //     }, 200); // Debounce scroll processing
    // });


})(); 