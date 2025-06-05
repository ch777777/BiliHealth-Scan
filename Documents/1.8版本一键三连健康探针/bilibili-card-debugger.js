// ==UserScript==
// @name         Bilibili Card Debugger
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Debug tool for Bilibili homepage card rendering
// @author       Your Name
// @match        https://www.bilibili.com/
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 调试配置
    const DEBUG_CONFIG = {
        logCardInit: true,      // 记录卡片初始化
        logScrollEvents: true,  // 记录滚动事件
        logCardRefresh: true,   // 记录卡片刷新
        logMutationEvents: true, // 记录DOM变化
        trackCardIds: true,     // 跟踪卡片ID
        maxLogEntries: 100      // 最大日志条目数
    };

    // 调试日志管理
    const DebugLogger = {
        logs: [],
        addLog(type, message, data = null) {
            const logEntry = {
                timestamp: new Date().toISOString(),
                type,
                message,
                data
            };
            this.logs.unshift(logEntry);
            if (this.logs.length > DEBUG_CONFIG.maxLogEntries) {
                this.logs.pop();
            }
            // 恢复console输出
            console.log(`[${type}] ${message}`, data || '');
        },
        getLogs() {
            return this.logs;
        },
        clearLogs() {
            this.logs = [];
        }
    };

    // 卡片状态追踪
    const CardTracker = {
        initializedCards: new Set(),
        renderedCards: new Set(),
        pendingCards: new Set(),
        cardDetails: new Map(),
        trackedCards: new Map(),
        lastCardTimestamp: Date.now(),
        autoLoadThreshold: 2000, // 2秒内的卡片加载视为自动加载
        
        trackCard(card, isFirstScreen) {
            const cardId = this.getCardId(card);
            if (!cardId) return;
            
            const currentTime = Date.now();
            const timeSinceLastCard = currentTime - this.lastCardTimestamp;
            this.lastCardTimestamp = currentTime;

            // 判断卡片加载类型
            let loadType = 'scroll';
            if (isFirstScreen) {
                loadType = 'initial';
            } else if (timeSinceLastCard < this.autoLoadThreshold) {
                loadType = 'auto';
            }

            if (!this.initializedCards.has(cardId)) {
                this.initializedCards.add(cardId);
                this.updateCardDetails(card);
                
                const cardInfo = {
                    bvid: cardId,
                    element: card,
                    timestamp: new Date().toISOString(),
                    loadType: loadType,
                    timeSinceLastCard: timeSinceLastCard
                };

                this.trackedCards.set(cardId, cardInfo);
                
                DebugLogger.addLog('CARD_INIT', `Card initialized: ${cardId} (${loadType})`, {
                    element: card,
                    details: this.cardDetails.get(cardId),
                    loadType: loadType,
                    timeSinceLastCard: timeSinceLastCard,
                    timestamp: currentTime
                });
            }
        },
        
        trackRenderedCard(card) {
            const cardId = this.getCardId(card);
            if (!cardId) return;
            
            if (!this.renderedCards.has(cardId)) {
                this.renderedCards.add(cardId);
                this.updateCardDetails(card);
                DebugLogger.addLog('CARD_RENDER', `Card rendered: ${cardId}`, {
                    element: card,
                    details: this.cardDetails.get(cardId),
                    timestamp: Date.now()
                });
            }
        },
        
        updateCardDetails(card) {
            const cardId = this.getCardId(card);
            if (!cardId) return;

            const details = {
                title: this.getCardTitle(card),
                stats: this.getCardStats(card),
                rating: this.getCardRating(card),
                timestamp: Date.now()
            };
            
            this.cardDetails.set(cardId, details);
        },
        
        getCardTitle(card) {
            const titleElement = card.querySelector('.bili-video-card__info--tit');
            return titleElement ? titleElement.textContent.trim() : 'Unknown Title';
        },
        
        getCardStats(card) {
            const stats = {};
            const statsContainer = card.querySelector('.bili-video-card__stats--left');
            if (statsContainer) {
                const statElements = statsContainer.querySelectorAll('span');
                statElements.forEach(stat => {
                    const text = stat.textContent.trim();
                    if (text.includes('播放')) stats.views = text;
                    if (text.includes('点赞')) stats.likes = text;
                    if (text.includes('投币')) stats.coins = text;
                    if (text.includes('收藏')) stats.favorites = text;
                });
            }
            return stats;
        },
        
        getCardRating(card) {
            const ratingSpan = card.querySelector('.bili-health-rating-span');
            if (ratingSpan) {
                const ratingValue = ratingSpan.querySelector('#rating-value');
                return {
                    value: ratingValue ? ratingValue.textContent : 'N/A',
                    className: ratingValue ? ratingValue.className : ''
                };
            }
            return null;
        },
        
        getCardId(card) {
            const link = card.querySelector('a.bili-video-card__image--link');
            if (!link) return null;
            const match = link.href.match(/\/video\/(BV\w+)/);
            return match ? match[1] : null;
        },
        
        extractBvid(cardElement) {
            const link = cardElement.querySelector('a.bili-video-card__image--link');
            if (!link) return null;
            const match = link.href.match(/\/video\/(BV\w+)/);
            return match ? match[1] : null;
        }
    };

    // 滚动事件分析
    const ScrollAnalyzer = {
        lastScrollTop: 0,
        scrollThreshold: 100,
        scrollTimeout: null,
        
        init() {
            window.addEventListener('scroll', this.handleScroll.bind(this));
        },
        
        handleScroll() {
            const currentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
            const scrollDelta = currentScrollTop - this.lastScrollTop;
            
            if (Math.abs(scrollDelta) > this.scrollThreshold) {
                DebugLogger.addLog('SCROLL', `Scroll detected: ${scrollDelta}px`, {
                    currentScrollTop,
                    lastScrollTop: this.lastScrollTop,
                    timestamp: Date.now()
                });
                
                this.lastScrollTop = currentScrollTop;
                this.analyzeCardVisibility();
            }
        },
        
        analyzeCardVisibility() {
            const cards = document.querySelectorAll('.bili-video-card');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                const isVisible = (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= window.innerHeight &&
                    rect.right <= window.innerWidth
                );
                
                if (isVisible) {
                    CardTracker.trackCard(card, false);
                }
            });
        }
    };

    // DOM变化监听
    const MutationWatcher = {
        watch() {
            const observer = new MutationObserver((mutations) => {
                mutations.forEach(mutation => {
                    if (mutation.type === 'childList') {
                        mutation.addedNodes.forEach(node => {
                            if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('bili-video-card')) {
                                // 判断是否为首次加载的卡片（首屏卡片）
                                const isFirstScreen = CardTracker.trackedCards.size === 0;
                                CardTracker.trackCard(node, isFirstScreen);
                            }
                        });
                    }
                });
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });
        }
    };

    // 调试UI
    const DebugUI = {
        panel: null,
        
        createPanel() {
            this.panel = document.createElement('div');
            this.panel.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                width: 400px;
                max-height: 600px;
                background: rgba(0, 0, 0, 0.9);
                color: #fff;
                padding: 15px;
                border-radius: 8px;
                font-family: monospace;
                font-size: 12px;
                z-index: 9999;
                overflow-y: auto;
            `;
            
            const header = document.createElement('div');
            header.style.cssText = `
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 15px;
                padding-bottom: 10px;
                border-bottom: 1px solid #666;
            `;
            
            const title = document.createElement('div');
            title.textContent = 'Bilibili Card Debugger';
            title.style.fontWeight = 'bold';
            
            const clearButton = document.createElement('button');
            clearButton.textContent = 'Clear';
            clearButton.style.cssText = `
                padding: 5px 10px;
                background: #666;
                border: none;
                border-radius: 4px;
                color: white;
                cursor: pointer;
            `;
            clearButton.onclick = () => {
                DebugLogger.clearLogs();
                this.updatePanel();
            };
            
            header.appendChild(title);
            header.appendChild(clearButton);
            this.panel.appendChild(header);
            
            document.body.appendChild(this.panel);
            this.updatePanel();
        },
        
        updatePanel() {
            if (!this.panel) return;
            
            const logs = DebugLogger.getLogs();
            const content = document.createElement('div');
            
            logs.forEach(log => {
                const logEntry = document.createElement('div');
                logEntry.style.cssText = `
                    margin: 8px 0;
                    padding: 10px;
                    border-left: 3px solid #666;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 4px;
                `;

                // 创建日志头部
                const header = document.createElement('div');
                header.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    margin-bottom: 5px;
                    color: #aaa;
                `;
                header.innerHTML = `
                    <span>[${log.type}]</span>
                    <span>${new Date(log.timestamp).toLocaleTimeString()}</span>
                `;
                logEntry.appendChild(header);

                // 创建消息内容
                const message = document.createElement('div');
                message.textContent = log.message;
                message.style.marginBottom = '5px';
                logEntry.appendChild(message);

                // 如果有详细信息，显示卡片内容
                if (log.data && log.data.details) {
                    const details = log.data.details;
                    const detailsDiv = document.createElement('div');
                    detailsDiv.style.cssText = `
                        margin-top: 8px;
                        padding: 8px;
                        background: rgba(0, 0, 0, 0.3);
                        border-radius: 4px;
                    `;

                    // 标题
                    const titleDiv = document.createElement('div');
                    titleDiv.style.cssText = `
                        font-weight: bold;
                        margin-bottom: 5px;
                        color: #fff;
                    `;
                    titleDiv.textContent = details.title;
                    detailsDiv.appendChild(titleDiv);

                    // 统计数据
                    const statsDiv = document.createElement('div');
                    statsDiv.style.cssText = `
                        display: flex;
                        flex-wrap: wrap;
                        gap: 8px;
                        margin-bottom: 5px;
                    `;
                    Object.entries(details.stats).forEach(([key, value]) => {
                        const statSpan = document.createElement('span');
                        statSpan.textContent = value;
                        statSpan.style.color = '#aaa';
                        statsDiv.appendChild(statSpan);
                    });
                    detailsDiv.appendChild(statsDiv);

                    // 评分
                    if (details.rating) {
                        const ratingDiv = document.createElement('div');
                        ratingDiv.style.cssText = `
                            display: flex;
                            align-items: center;
                            gap: 5px;
                        `;
                        const ratingValue = document.createElement('span');
                        ratingValue.textContent = `评分: ${details.rating.value}`;
                        ratingValue.className = details.rating.className;
                        ratingDiv.appendChild(ratingValue);
                        detailsDiv.appendChild(ratingDiv);
                    }

                    logEntry.appendChild(detailsDiv);
                }

                content.appendChild(logEntry);
            });
            
            const existingContent = this.panel.querySelector('div:not(:first-child)');
            if (existingContent) {
                this.panel.removeChild(existingContent);
            }
            this.panel.appendChild(content);
        }
    };

    // 初始化调试工具
    function initDebugger() {
        // 初始化各个模块
        ScrollAnalyzer.init();
        MutationWatcher.watch();
        DebugUI.createPanel();
        
        // 定期更新调试面板
        setInterval(() => {
            DebugUI.updatePanel();
        }, 1000);
        
        // 添加全局错误处理
        window.addEventListener('error', (event) => {
            DebugLogger.addLog('ERROR', event.message, {
                error: event.error,
                timestamp: Date.now()
            });
        });
    }

    // 启动调试工具
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initDebugger);
    } else {
        initDebugger();
    }
})(); 