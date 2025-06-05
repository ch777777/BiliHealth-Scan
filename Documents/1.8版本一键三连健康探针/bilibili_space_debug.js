// ==UserScript==
// @name         B站空间页面调试工具
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  用于调试B站空间页面的工具
// @author       Your name
// @match        https://space.bilibili.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // 创建调试面板
    function createDebugPanel() {
        const panel = document.createElement('div');
        panel.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: rgba(0, 0, 0, 0.8);
            color: #fff;
            padding: 15px;
            border-radius: 8px;
            z-index: 9999;
            font-family: Arial, sans-serif;
            min-width: 300px;
        `;

        // 添加标题
        const title = document.createElement('h3');
        title.textContent = 'B站空间调试工具';
        title.style.cssText = `
            margin: 0 0 10px 0;
            color: #00a1d6;
            font-size: 16px;
        `;
        panel.appendChild(title);

        // 添加功能按钮
        const buttons = [
            { text: '检查视频卡片', action: checkVideoCards },
            { text: '检查用户信息', action: checkUserInfo },
            { text: '检查页面性能', action: checkPerformance },
            { text: '清除缓存', action: clearCache }
        ];

        buttons.forEach(btn => {
            const button = document.createElement('button');
            button.textContent = btn.text;
            button.style.cssText = `
                margin: 5px;
                padding: 8px 12px;
                background: #00a1d6;
                border: none;
                border-radius: 4px;
                color: white;
                cursor: pointer;
                font-size: 14px;
            `;
            button.onclick = btn.action;
            panel.appendChild(button);
        });

        // 添加日志区域
        const logArea = document.createElement('div');
        logArea.id = 'debug-log';
        logArea.style.cssText = `
            margin-top: 10px;
            max-height: 200px;
            overflow-y: auto;
            font-size: 12px;
            background: rgba(255, 255, 255, 0.1);
            padding: 10px;
            border-radius: 4px;
        `;
        panel.appendChild(logArea);

        document.body.appendChild(panel);
    }

    // 检查视频卡片
    function checkVideoCards() {
        const cards = document.querySelectorAll('.bili-video-card');
        log(`找到 ${cards.length} 个视频卡片`);
        
        cards.forEach((card, index) => {
            const title = card.querySelector('.bili-video-card__info--tit')?.textContent;
            const views = card.querySelector('.bili-video-card__stats--view')?.textContent;
            const duration = card.querySelector('.bili-video-card__stats--duration')?.textContent;

            // 查找并记录关键嵌套元素
            const wrap = card.querySelector('.bili-video-card_wrap');
            const cover = card.querySelector('.bili-video-card_cover');
            const coverLink = card.querySelector('.bili-cover-card'); // 通常是链接
            const inlinePlayer = card.querySelector('.bili-card-inline-player');
            const watchLater = card.querySelector('.bili-card-watch-later');
            const watchLaterBtn = card.querySelector('.bili-card-watch-later_btn');

            // 提取BV号
            let bvId = '未找到';
            let displayBvId = '未找到'; // 用于显示的BV号
            if (coverLink && coverLink.href) {
                const href = coverLink.href;
                const bvMatch = href.match(/\/video\/(BV[a-zA-Z0-9]+)/);
                if (bvMatch && bvMatch[1]) {
                    bvId = bvMatch[1];
                    displayBvId = bvId; // 如果提取成功，用于显示
                }
            }

            // 在卡片上显示BV号
            if (bvId !== '未找到') {
                // 查找可以放置BV号的元素，例如缩略图容器或卡片本身
                const targetElement = card.querySelector('.bili-cover-card') || card;
                if (targetElement && !targetElement.querySelector('.bv-debug-display')) { // 避免重复添加
                     const bvDisplay = document.createElement('div');
                     bvDisplay.className = 'bv-debug-display';
                     bvDisplay.textContent = `BV: ${displayBvId}`;
                     bvDisplay.style.cssText = `
                         position: absolute; /* 或 relative, 取决于targetElement的定位 */
                         bottom: 5px;
                         left: 5px;
                         background: rgba(0, 0, 0, 0.6);
                         color: white;
                         padding: 2px 5px;
                         border-radius: 3px;
                         font-size: 12px;
                         z-index: 10;
                     `;
                     // 如果targetElement是a标签，可能需要特殊处理或添加到其父级
                     if(targetElement.tagName === 'A'){
                         targetElement.style.position = 'relative'; // 确保定位正常工作
                         targetElement.appendChild(bvDisplay);
                     } else if (targetElement.style.position === '' || targetElement.style.position === 'static') {
                          targetElement.style.position = 'relative';
                          targetElement.appendChild(bvDisplay);
                     } else {
                         targetElement.appendChild(bvDisplay);
                     }
                }
            }

            log(`\n卡片 ${index + 1}:`);
            log(`- 标题: ${title || '未找到'}`);
            log(`- 播放量: ${views || '未找到'}`);
            log(`- 时长: ${duration || '未找到'}`);
            log(`- BV号: ${bvId}`); // 日志中也保留BV号信息
            log(`  - .bili-video-card_wrap 存在: ${!!wrap}`);
            log(`  - .bili-video-card_cover 存在: ${!!cover}`);
            log(`  - .bili-cover-card 链接存在: ${!!coverLink}, href: ${coverLink?.href || '无'}`);
            log(`  - .bili-card-inline-player 存在: ${!!inlinePlayer}`);
            log(`  - .bili-card-watch-later 存在: ${!!watchLater}`);
            log(`  - .bili-card-watch-later_btn 存在: ${!!watchLaterBtn}`);

        });
    }

    // 检查用户信息
    function checkUserInfo() {
        const username = document.querySelector('.h-name')?.textContent;
        const uid = document.querySelector('.h-uid')?.textContent;
        const following = document.querySelector('.n-fans')?.textContent;
        const followers = document.querySelector('.n-follows')?.textContent;

        log('用户信息:');
        log(`- 用户名: ${username}`);
        log(`- UID: ${uid}`);
        log(`- 关注数: ${following}`);
        log(`- 粉丝数: ${followers}`);
    }

    // 检查页面性能
    function checkPerformance() {
        const performance = window.performance;
        const timing = performance.timing;
        
        const loadTime = timing.loadEventEnd - timing.navigationStart;
        const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
        
        log('页面性能:');
        log(`- 总加载时间: ${loadTime}ms`);
        log(`- DOM加载时间: ${domReady}ms`);
        log(`- 资源数量: ${performance.getEntriesByType('resource').length}`);
    }

    // 清除缓存
    function clearCache() {
        localStorage.clear();
        sessionStorage.clear();
        log('已清除本地存储和会话存储');
    }

    // 日志函数
    function log(message) {
        const logArea = document.getElementById('debug-log');
        if (logArea) {
            const logEntry = document.createElement('div');
            logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
            logArea.appendChild(logEntry);
            logArea.scrollTop = logArea.scrollHeight;
        }
    }

    // 初始化
    function init() {
        // 等待页面加载完成
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                createDebugPanel();
                checkVideoCards(); // 页面加载后自动检查视频卡片
            });
        } else {
            createDebugPanel();
            checkVideoCards(); // 页面加载后自动检查视频卡片
        }
    }

    init();
})(); 