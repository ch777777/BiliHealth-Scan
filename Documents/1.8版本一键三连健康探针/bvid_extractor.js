// ==UserScript==
// @name Bilibili Space BV Extractor
// @namespace http://tampermonkey.net/
// @version 0.2
// @description Extract and display BV IDs on Bilibili space page video cards.
// @author Your name
// @match https://space.bilibili.com/*
// @grant none
// ==/UserScript==

(function() {
    'use strict';

    /**
     * 从Bilibili视频链接中提取BV号。
     *
     * @param {string} url - Bilibili视频页面的完整URL。
     * @returns {string | null} 提取到的BV号，如果未找到则返回 null。
     */
    function extractBvidFromUrl(url) {
        if (!url || typeof url !== 'string') {
            return null;
        }

        // 匹配包含 /video/BVxxxxxxxxx 格式的URL
        const bvMatch = url.match(/\/video\/(BV[a-zA-Z0-9]+)/);

        if (bvMatch && bvMatch[1]) {
            return bvMatch[1];
        }

        // 还可以添加对av号的匹配，如果您也需要提取av号的话
        // const avMatch = url.match(/\/video\/(av[0-9]+)/);
        // if (avMatch && avMatch[1]) {
        //     // 可以选择将av号转换为bvid，或者直接返回av号
        //     // 注意：av号转bvid需要调用B站API，这里只做简单提取
        //     return avMatch[1];
        // }

        return null;
    }

    // 在卡片上显示BV号的函数
    function displayBvidOnCard(card, bvid) {
         // 查找可以放置BV号的元素，例如缩略图容器或卡片本身
         const targetElement = card.querySelector('.bili-cover-card') || card;
         if (targetElement && !targetElement.querySelector('.bv-extractor-display')) { // 避免重复添加
              const bvDisplay = document.createElement('div');
              bvDisplay.className = 'bv-extractor-display'; // 使用不同的类名以区分
              bvDisplay.textContent = `BV: ${bvid}`;
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
                  pointer-events: none; /* 防止遮挡下方链接点击 */
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

    // 查找并处理页面上的视频卡片
    function processVideoCards() {
        // 空间主页视频卡片可能也使用 .bili-video-card
        const cards = document.querySelectorAll('div.bili-video-card');

        cards.forEach(card => {
            // 检查卡片是否已经被处理过（通过是否有BV显示元素）
            if (card.querySelector('.bv-extractor-display')) {
                return; // 如果已经处理过，跳过
            }

            // 在空间主页卡片内部查找链接
            const linkElement = card.querySelector('a.bili-cover-card'); // 根据截图和调试日志使用这个选择器
            const link = linkElement?.href;

            if (link) {
                const bvid = extractBvidFromUrl(link);
                if (bvid) {
                    displayBvidOnCard(card, bvid);
                }
            }
        });
    }

    // 使用 MutationObserver 监听DOM变化，处理动态加载的内容
    const observer = new MutationObserver((mutations) => {
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    // 检查新增节点本身或其子节点是否包含视频卡片
                    if (node.nodeType === Node.ELEMENT_NODE &&
                        (node.classList.contains('bili-video-card') ||
                         node.querySelector('.bili-video-card'))) {
                        // 使用 setTimeout 微任务延迟处理，避免重复执行和DOM操作冲突
                        setTimeout(processVideoCards, 0);
                    }
                });
            } else if (mutation.type === 'attributes' && mutation.target.classList.contains('bili-video-card')) {
                 // 监听卡片属性变化，有时懒加载完成后属性会变动
                 setTimeout(processVideoCards, 0);
            }
        });
    });

    // 页面加载完成后执行
    document.addEventListener('DOMContentLoaded', function() {
        // 初始处理页面上已有的视频卡片
        processVideoCards();

        // 开始观察整个body，包括懒加载内容
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true, // 也观察属性变化
        });

        // 监听滚动事件 - 主要用于处理懒加载出现的卡片
        // MutationObserver通常能处理，但这作为补充
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(processVideoCards, 100);
        });

    });

    // 监听窗口的load事件，确保所有资源加载完成后也进行一次处理
    window.addEventListener('load', function() {
        processVideoCards();
    });

})(); 