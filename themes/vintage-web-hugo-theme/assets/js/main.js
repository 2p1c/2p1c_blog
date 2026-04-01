// Vintage Web Theme JavaScript
// Retro functionality with modern enhancements

document.addEventListener('DOMContentLoaded', function() {
    // 平滑滚动（等待组件事件，含兜底初始化）
    setupSmoothScroll();

    // Window controls functionality
    initWindowControls();
    
    // Retro effects
    // initRetroEffects();
    
    // Keyboard navigation
    initKeyboardNavigation();
    
    // Image galleries
    initImageGalleries();
    
    // Code copy functionality
    initCodeCopy();
    
    // Search functionality
    initSearch();

    // Clickable post list cards
    initPostListItemClick();
    
    // Theme persistence
    initThemePersistence();

    // AI chat widget
    initAiChatWidget();
});

function setupSmoothScroll() {
    const container = document.querySelector('.smooth-scroll') || document.querySelector('.container');

    // 若页面未提供平滑滚动容器，则跳过
    if (!container) {
        console.warn('⚠️ 未找到平滑滚动容器（.smooth-scroll / .container），跳过初始化');
        return;
    }

    // 仅在手机/平板或减少动画偏好下回退到原生滚动，触屏笔记本仍允许平滑滚动
    const hasTouchSupport = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const prefersReducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isCoarsePointer = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    const userAgent = navigator.userAgent || '';
    const isTouchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    const isMobileOrTabletUserAgent = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet|Silk|Kindle/i.test(userAgent);
    const isMobileOrTablet = isMobileOrTabletUserAgent || isTouchMac || (hasTouchSupport && isCoarsePointer);

    if (isMobileOrTablet || prefersReducedMotion) {
        console.log('ℹ️ 检测到手机/平板或减少动画偏好，启用原生滚动', {
            isMobileOrTablet,
            prefersReducedMotion,
            hasTouchSupport,
            isCoarsePointer,
            maxTouchPoints: navigator.maxTouchPoints || 0
        });
        container.style.transform = '';
        container.style.willChange = '';
        document.body.style.overflow = '';
        document.documentElement.style.overflow = '';
        return;
    }

    // 滚动状态
    let current = 0;
    let target = 0;
    let maxScroll = 0;
    let isInitialized = false;
    let animationFrameId = null;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;

    // 配置参数
    const CONFIG = {
        ease: 0.12,
        threshold: 0.5,
        resizeDebounceDelay: 150,
        initDelay: 100,
        fallbackInitDelay: 300
    };

    function clamp(value, min, max) {
        return Math.max(min, Math.min(value, max));
    }

    function updateMaxScroll() {
        const scrollingElement = document.scrollingElement || document.documentElement;
        const documentHeight = scrollingElement.scrollHeight;
        const viewportHeight = window.innerHeight;
        maxScroll = Math.max(0, documentHeight - viewportHeight);

        console.log('📏 更新滚动范围:', {
            documentHeight,
            viewportHeight,
            maxScroll
        });
    }

    function smooth() {
        current += (target - current) * CONFIG.ease;
        current = clamp(current, 0, maxScroll);

        if (Math.abs(target - current) < CONFIG.threshold) {
            current = target;
        }

        container.style.transform = `translate3d(0, ${-current}px, 0)`;
        animationFrameId = requestAnimationFrame(smooth);
    }

    function handleWheel(event) {
        const isInteractive = event.target.closest('input, textarea, select, [contenteditable="true"]');
        if (isInteractive) {
            return;
        }

        event.preventDefault();
        target += event.deltaY;
        target = clamp(target, 0, maxScroll);
    }

    function debounce(fn, delay) {
        let timer = null;
        return function(...args) {
            clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    const handleResize = debounce(() => {
        updateMaxScroll();
        target = clamp(target, 0, maxScroll);
        current = clamp(current, 0, maxScroll);
    }, CONFIG.resizeDebounceDelay);

    function initSmoothScroll() {
        if (isInitialized) {
            console.warn('⚠️ 平滑滚动已初始化，跳过重复初始化');
            return;
        }

        // 固定容器 + 隐藏原生滚动条，避免双滚动
        container.style.willChange = 'transform';
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';

        // 接管滚动前，吸收浏览器可能存在的原生滚动偏移
        const nativeScrollY = window.scrollY || window.pageYOffset || 0;
        window.scrollTo(0, 0);

        current = nativeScrollY;
        target = nativeScrollY;
        updateMaxScroll();
        target = clamp(target, 0, maxScroll);
        current = clamp(current, 0, maxScroll);
        smooth();

        window.addEventListener('wheel', handleWheel, { passive: false });
        window.addEventListener('resize', handleResize);

        isInitialized = true;
        console.log('✅ 平滑滚动已初始化');
    }

    function cleanup() {
        if (animationFrameId) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }

        window.removeEventListener('wheel', handleWheel);
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('componentsLoaded', onComponentsLoaded);

        container.style.transform = '';
        container.style.willChange = '';
        document.body.style.overflow = originalBodyOverflow;
        document.documentElement.style.overflow = originalHtmlOverflow;
        document.body.style.height = '';

        console.log('🧹 平滑滚动资源已清理');
    }

    function onComponentsLoaded(event) {
        console.log('📦 接收到 componentsLoaded 事件');
        if (event.detail && typeof event.detail.loadTime === 'number') {
            console.log(`   组件加载耗时: ${event.detail.loadTime.toFixed(2)}ms`);
        }

        setTimeout(initSmoothScroll, CONFIG.initDelay);
    }

    window.addEventListener('componentsLoaded', onComponentsLoaded);
    window.addEventListener('beforeunload', cleanup);

    // 若未触发组件事件，仍在 DOM ready 后兜底初始化
    setTimeout(() => {
        if (!isInitialized) {
            initSmoothScroll();
        }
    }, CONFIG.fallbackInitDelay);
}

function initPostListItemClick() {
    document.querySelectorAll('.post-list-item').forEach(item => {
        item.addEventListener('click', function(event) {
            const interactiveElement = event.target.closest('a, button, input, textarea, select, label, summary, [role="button"]');
            if (interactiveElement) {
                return;
            }

            const titleLink = this.querySelector('.post-list-title a');
            if (!titleLink || !titleLink.href) {
                return;
            }

            window.location.href = titleLink.href;
        });

        item.style.cursor = 'pointer';
    });
}

// Window controls (minimize, maximize, close)
function initWindowControls() {
    document.querySelectorAll('.window-button').forEach(button => {
        button.addEventListener('click', function(e) {
            e.preventDefault();
            const buttonText = this.textContent;
            const window = this.closest('.window');
            
            // Visual feedback
            this.style.border = '1px inset var(--button-face)';
            setTimeout(() => {
                this.style.border = '1px outset var(--button-face)';
            }, 100);
            
            switch(buttonText) {
                case '_': // Minimize
                    toggleWindowMinimize(window);
                    break;
                case '□': // Maximize
                    toggleWindowMaximize(window);
                    break;
                case '×': // Close
                    showCloseDialog(window);
                    break;
            }
        });
    });
}

function toggleWindowMinimize(window) {
    const content = window.querySelector('.window-content');
    if (content.style.display === 'none') {
        content.style.display = 'block';
        window.style.height = 'auto';
    } else {
        content.style.display = 'none';
        window.style.height = 'auto';
    }
}

function toggleWindowMaximize(window) {
    if (window.classList.contains('maximized')) {
        window.classList.remove('maximized');
        window.style.position = 'static';
        window.style.top = 'auto';
        window.style.left = 'auto';
        window.style.width = 'auto';
        window.style.height = 'auto';
        window.style.zIndex = 'auto';
    } else {
        window.classList.add('maximized');
        window.style.position = 'fixed';
        window.style.top = '10px';
        window.style.left = '10px';
        window.style.width = 'calc(100vw - 20px)';
        window.style.height = 'calc(100vh - 40px)';
        window.style.zIndex = '1000';
    }
}

function showCloseDialog(window) {
    const confirmed = confirm('Close this window?\n\nThis is just for show - the window will reappear when you refresh the page! 😉');
    if (confirmed) {
        window.style.animation = 'fadeOut 0.3s ease-out';
        setTimeout(() => {
            window.style.display = 'none';
        }, 300);
    }
}

// Retro effects
function initRetroEffects() {
    // Random retro messages
    const retroMessages = [
        "Loading... Please wait...",
        "System is Y2K compliant!",
        "Best viewed in 1024x768",
        "Optimized for Internet Explorer 6.0",
        "This site uses cutting-edge JavaScript!",
        "Now with 256 colors!",
        "Geocities approved!",
        "Web 1.0 Forever!"
    ];
    
    // Add random message to status bar if it exists
    const statusBar = document.querySelector('.status-bar .status-left');
    if (statusBar && Math.random() > 0.7) {
        const message = retroMessages[Math.floor(Math.random() * retroMessages.length)];
        const messageElement = document.createElement('span');
        messageElement.className = 'status-item';
        messageElement.textContent = message;
        statusBar.appendChild(messageElement);
    }
    
    // Add retro cursor trail effect (optional)
    // if (localStorage.getItem('retroCursor') === 'true') {
    //     initCursorTrail();
    // }
    
    // Konami code easter egg
    // initKonamiCode();
}

function initCursorTrail() {
    let trail = [];
    document.addEventListener('mousemove', function(e) {
        trail.push({x: e.clientX, y: e.clientY, time: Date.now()});
        
        // Remove old trail points
        trail = trail.filter(point => Date.now() - point.time < 500);
        
        // Create trail elements
        trail.forEach((point, index) => {
            if (index % 3 === 0) { // Only every 3rd point to reduce clutter
                const dot = document.createElement('div');
                dot.style.position = 'fixed';
                dot.style.left = point.x + 'px';
                dot.style.top = point.y + 'px';
                dot.style.width = '3px';
                dot.style.height = '3px';
                dot.style.backgroundColor = '#00ffff';
                dot.style.borderRadius = '50%';
                dot.style.pointerEvents = 'none';
                dot.style.zIndex = '9999';
                dot.style.opacity = (500 - (Date.now() - point.time)) / 500;
                document.body.appendChild(dot);
                
                setTimeout(() => {
                    if (dot.parentNode) {
                        dot.parentNode.removeChild(dot);
                    }
                }, 500);
            }
        });
    });
}

function initKonamiCode() {
    const konamiCode = [38, 38, 40, 40, 37, 39, 37, 39, 66, 65]; // ↑↑↓↓←→←→BA
    let konamiIndex = 0;
    
    document.addEventListener('keydown', function(e) {
        if (e.keyCode === konamiCode[konamiIndex]) {
            konamiIndex++;
            if (konamiIndex === konamiCode.length) {
                activateRetroMode();
                konamiIndex = 0;
            }
        } else {
            konamiIndex = 0;
        }
    });
}

function activateRetroMode() {
    alert('🎉 RETRO MODE ACTIVATED! 🎉\n\nCursor trail enabled!\nExtra retro effects unlocked!');
    localStorage.setItem('retroCursor', 'true');
    document.body.style.background = 'linear-gradient(45deg, #ff00ff, #00ffff, #ffff00, #ff00ff)';
    document.body.style.backgroundSize = '400% 400%';
    document.body.style.animation = 'retroBackground 3s ease infinite';
    
    // Add CSS animation for background
    const style = document.createElement('style');
    style.textContent = `
        @keyframes retroBackground {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
        }
        @keyframes fadeOut {
            from { opacity: 1; transform: scale(1); }
            to { opacity: 0; transform: scale(0.8); }
        }
    `;
    document.head.appendChild(style);
    
    initCursorTrail();
}

// Keyboard navigation
function initKeyboardNavigation() {
    document.addEventListener('keydown', function(e) {
        // Alt + H for home
        if (e.altKey && e.key === 'h') {
            e.preventDefault();
            window.location.href = '/';
        }
        
        // Alt + P for posts
        if (e.altKey && e.key === 'p') {
            e.preventDefault();
            window.location.href = '/posts/';
        }
        
        // Escape to minimize all windows
        if (e.key === 'Escape') {
            document.querySelectorAll('.window .window-content').forEach(content => {
                if (content.style.display !== 'none') {
                    content.style.display = 'none';
                }
            });
        }
        
        // F11 for fullscreen (show message)
        if (e.key === 'F11') {
            e.preventDefault();
            alert('F11 detected! If this were a real 90s browser, you\'d now be in fullscreen mode! 📺');
        }
    });
}

// Image galleries
function initImageGalleries() {
    document.querySelectorAll('.image-gallery img').forEach(img => {
        img.addEventListener('click', function() {
            openLightbox(this);
        });
        
        // Add retro loading effect
        img.addEventListener('load', function() {
            this.style.opacity = '0';
            this.style.transition = 'opacity 0.5s ease';
            setTimeout(() => {
                this.style.opacity = '1';
            }, 100);
        });
    });
}

function openLightbox(img) {
    const lightbox = document.createElement('div');
    lightbox.style.position = 'fixed';
    lightbox.style.top = '0';
    lightbox.style.left = '0';
    lightbox.style.width = '100%';
    lightbox.style.height = '100%';
    lightbox.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
    lightbox.style.zIndex = '10000';
    lightbox.style.display = 'flex';
    lightbox.style.alignItems = 'center';
    lightbox.style.justifyContent = 'center';
    lightbox.style.cursor = 'pointer';
    
    const lightboxImg = document.createElement('img');
    lightboxImg.src = img.src;
    lightboxImg.alt = img.alt;
    lightboxImg.style.maxWidth = '90%';
    lightboxImg.style.maxHeight = '90%';
    lightboxImg.style.border = '2px outset var(--border-dark)';
    
    lightbox.appendChild(lightboxImg);
    document.body.appendChild(lightbox);
    
    lightbox.addEventListener('click', function() {
        document.body.removeChild(lightbox);
    });
    
    // ESC to close
    const closeHandler = function(e) {
        if (e.key === 'Escape') {
            document.body.removeChild(lightbox);
            document.removeEventListener('keydown', closeHandler);
        }
    };
    document.addEventListener('keydown', closeHandler);
}

// Code copy functionality
function initCodeCopy() {
    document.querySelectorAll('pre code').forEach(codeBlock => {
        const pre = codeBlock.parentElement;
        
        // Add copy button
        const copyButton = document.createElement('button');
        copyButton.textContent = '📋 Copy';
        copyButton.className = 'btn';
        copyButton.style.position = 'absolute';
        copyButton.style.top = '4px';
        copyButton.style.right = '4px';
        copyButton.style.fontSize = '8px';
        copyButton.style.padding = '2px 4px';
        
        pre.style.position = 'relative';
        pre.appendChild(copyButton);
        
        copyButton.addEventListener('click', function() {
            navigator.clipboard.writeText(codeBlock.textContent).then(() => {
                copyButton.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyButton.textContent = '📋 Copy';
                }, 2000);
            }).catch(() => {
                // Fallback for older browsers
                const textArea = document.createElement('textarea');
                textArea.value = codeBlock.textContent;
                document.body.appendChild(textArea);
                textArea.select();
                document.execCommand('copy');
                document.body.removeChild(textArea);
                
                copyButton.textContent = '✅ Copied!';
                setTimeout(() => {
                    copyButton.textContent = '📋 Copy';
                }, 2000);
            });
        });
    });
}

// Simple search functionality
function initSearch() {
    const searchInput = document.getElementById('search-input');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            const query = this.value.toLowerCase();
            const posts = document.querySelectorAll('.post-list-item');
            
            posts.forEach(post => {
                const title = post.querySelector('.post-list-title a').textContent.toLowerCase();
                const summary = post.querySelector('.post-list-summary');
                const summaryText = summary ? summary.textContent.toLowerCase() : '';
                
                if (title.includes(query) || summaryText.includes(query)) {
                    post.style.display = 'block';
                } else {
                    post.style.display = 'none';
                }
            });
        });
    }
}

// Theme persistence
function initThemePersistence() {
    // Save scroll position
    window.addEventListener('beforeunload', function() {
        localStorage.setItem('scrollPosition', window.scrollY);
    });
    
    // Restore scroll position
    const savedPosition = localStorage.getItem('scrollPosition');
    if (savedPosition) {
        window.scrollTo(0, parseInt(savedPosition));
        localStorage.removeItem('scrollPosition');
    }
    
    // Remember window states
    document.querySelectorAll('.window').forEach((window, index) => {
        const savedState = localStorage.getItem(`window-${index}-minimized`);
        if (savedState === 'true') {
            const content = window.querySelector('.window-content');
            if (content) {
                content.style.display = 'none';
            }
        }
        
        // Save state when minimized
        const minimizeBtn = window.querySelector('.window-button');
        if (minimizeBtn && minimizeBtn.textContent === '_') {
            minimizeBtn.addEventListener('click', function() {
                setTimeout(() => {
                    const content = window.querySelector('.window-content');
                    const isMinimized = content.style.display === 'none';
                    localStorage.setItem(`window-${index}-minimized`, isMinimized);
                }, 200);
            });
        }
    });
}

function initAiChatWidget() {
    const widget = document.getElementById('ai-chat-widget');
    if (!widget) {
        return;
    }

    const toggle = document.getElementById('ai-chat-toggle');
    const toggleImage = document.getElementById('ai-chat-toggle-image');
    const panel = document.getElementById('ai-chat-panel');
    const form = document.getElementById('ai-chat-form');
    const input = document.getElementById('ai-chat-input');
    const messages = document.getElementById('ai-chat-messages');
    const headerAvatar = document.getElementById('ai-chat-header-avatar');
    const closeBtn = document.getElementById('ai-chat-close');
    const clearBtn = document.getElementById('ai-chat-clear');
    const apiBase = resolveAiChatApiBase(widget.dataset.apiBase);

    if (!toggle || !panel || !form || !input || !messages || !toggleImage || !headerAvatar || !closeBtn || !clearBtn) {
        return;
    }

    const launcherImage = (widget.dataset.launcherImage || '').trim() || getDefaultLauncherImage();
    const aiAvatar = (widget.dataset.aiAvatar || '').trim() || getDefaultAiAvatar();
    const userAvatar = getDefaultUserAvatar();
    const supportsHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

    toggleImage.src = launcherImage;
    headerAvatar.src = aiAvatar;

    let isStreaming = false;
    let isOpen = false;
    let currentAssistantRow = null;
    let hoverReady = false;
    let suppressHoverUntil = 0;

    window.addEventListener('pointermove', () => {
        hoverReady = true;
    }, { once: true });

    function canOpenByHover() {
        return supportsHover && hoverReady && Date.now() >= suppressHoverUntil;
    }

    function adjustPanelHeight() {
        if (!isOpen) {
            return;
        }
        const maxHeight = Math.floor(window.innerHeight * 0.5);
        const minHeight = 190;
        const desired = messages.scrollHeight + 132;
        const finalHeight = Math.max(minHeight, Math.min(desired, maxHeight));
        panel.style.height = String(finalHeight) + 'px';
    }

    function openPanel() {
        if (isOpen) {
            return;
        }
        isOpen = true;
        panel.hidden = false;
        toggle.setAttribute('aria-expanded', 'true');
        adjustPanelHeight();
        setTimeout(() => {
            input.focus();
            messages.scrollTop = messages.scrollHeight;
        }, 80);
    }

    function closePanel() {
        if (!isOpen) {
            return;
        }
        isOpen = false;
        panel.hidden = true;
        toggle.setAttribute('aria-expanded', 'false');
        suppressHoverUntil = Date.now() + 260;
    }

    function togglePanel() {
        if (isOpen) {
            closePanel();
        } else {
            openPanel();
        }
    }

    toggle.addEventListener('mouseenter', () => {
        if (canOpenByHover()) {
            openPanel();
        }
    });

    toggle.addEventListener('click', (event) => {
        event.preventDefault();
        if (supportsHover) {
            openPanel();
            return;
        }
        togglePanel();
    });

    closeBtn.addEventListener('click', () => {
        closePanel();
    });

    panel.addEventListener('mouseleave', () => {
        if (!supportsHover || !isOpen) {
            return;
        }
        closePanel();
    });

    clearBtn.addEventListener('click', async () => {
        try {
            await clearSession(apiBase, messages, aiAvatar, userAvatar);
            adjustPanelHeight();
        } catch (error) {
            appendMessage(messages, 'assistant', '清空失败：' + error.message, aiAvatar, userAvatar);
        }
    });

    form.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (isStreaming) {
            return;
        }

        const text = input.value.trim();
        if (!text) {
            return;
        }

        if (text === '/clear') {
            await clearSession(apiBase, messages, aiAvatar, userAvatar);
            input.value = '';
            adjustPanelHeight();
            return;
        }

        const sessionId = getOrCreateSessionId();
        appendMessage(messages, 'user', text, aiAvatar, userAvatar);
        input.value = '';

        const assistantState = appendMessage(messages, 'assistant', '', aiAvatar, userAvatar, true);
        const assistantNode = assistantState.body;
        currentAssistantRow = assistantState.row;

        isStreaming = true;
        input.disabled = true;
        clearBtn.disabled = true;
        const sendBtn = document.getElementById('ai-chat-send');
        if (sendBtn) {
            sendBtn.disabled = true;
        }
        adjustPanelHeight();

        try {
            await streamReply(apiBase, sessionId, text, assistantNode);
        } catch (error) {
            assistantNode.textContent = '请求失败：' + error.message;
        } finally {
            isStreaming = false;
            input.disabled = false;
            clearBtn.disabled = false;
            if (sendBtn) {
                sendBtn.disabled = false;
            }
            if (currentAssistantRow) {
                currentAssistantRow.classList.remove('is-thinking');
            }
            currentAssistantRow = null;
            adjustPanelHeight();
            input.focus();
        }
    });

    window.addEventListener('resize', adjustPanelHeight);
}

function resolveAiChatApiBase(rawApiBase) {
    const configuredApiBase = (rawApiBase || '/api/chat').trim().replace(/\/+$/, '');
    const isLocalHost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isLocalHost && configuredApiBase === '/api/chat') {
        return 'http://127.0.0.1:4310/chat';
    }

    return configuredApiBase || '/api/chat';
}

function getOrCreateSessionId() {
    const storageKey = 'ai_chat_session_id';
    let sessionId = localStorage.getItem(storageKey);

    if (!sessionId) {
        sessionId = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        localStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
}

function toSvgDataUri(svgText) {
    return 'data:image/svg+xml,' + encodeURIComponent(svgText);
}

function getDefaultLauncherImage() {
    return toSvgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0f766e"/><stop offset="1" stop-color="#1d4ed8"/></linearGradient></defs><rect width="96" height="96" rx="48" fill="url(#g)"/><circle cx="35" cy="40" r="8" fill="#fff"/><circle cx="61" cy="40" r="8" fill="#fff"/><path d="M30 61c5 8 12 11 18 11s13-3 18-11" stroke="#fff" stroke-width="6" stroke-linecap="round" fill="none"/></svg>');
}

function getDefaultAiAvatar() {
    return toSvgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#10b981"/><stop offset="1" stop-color="#3b82f6"/></linearGradient></defs><rect width="64" height="64" rx="32" fill="url(#a)"/><circle cx="23" cy="26" r="6" fill="#fff"/><circle cx="41" cy="26" r="6" fill="#fff"/><rect x="18" y="39" width="28" height="7" rx="3.5" fill="#fff"/></svg>');
}

function getDefaultUserAvatar() {
    return toSvgDataUri('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="32" fill="#334155"/><circle cx="32" cy="24" r="10" fill="#fff"/><path d="M15 50c3-9 11-14 17-14s14 5 17 14" fill="#fff"/></svg>');
}

function appendMessage(container, role, content, aiAvatar, userAvatar, isThinking) {
    const row = document.createElement('div');
    row.className = `ai-chat-msg ai-chat-msg-${role}`;
    if (role === 'assistant' && isThinking) {
        row.classList.add('is-thinking');
    }

    const avatar = document.createElement('div');
    avatar.className = 'ai-chat-msg-avatar';
    const avatarImage = document.createElement('img');
    avatarImage.alt = role === 'user' ? 'User avatar' : 'AI avatar';
    avatarImage.src = role === 'user' ? userAvatar : aiAvatar;
    avatar.appendChild(avatarImage);

    const label = document.createElement('strong');
    label.className = 'ai-chat-msg-label';
    label.textContent = role === 'user' ? 'You' : 'AI';

    const body = document.createElement('div');
    body.className = 'ai-chat-msg-body';
    body.textContent = content;

    row.appendChild(avatar);
    row.appendChild(label);
    row.appendChild(body);
    container.appendChild(row);

    container.scrollTop = container.scrollHeight;
    return { row, body };
}

async function clearSession(apiBase, messagesContainer, aiAvatar, userAvatar) {
    const sessionId = getOrCreateSessionId();

    const response = await fetch(`${apiBase}/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId })
    });

    if (!response.ok) {
        throw new Error('clear 请求失败');
    }

    messagesContainer.innerHTML = '';
    appendMessage(messagesContainer, 'assistant', '上下文已清空，你可以开始新对话。', aiAvatar, userAvatar, false);
}

async function streamReply(apiBase, sessionId, userMessage, assistantNode) {
    const response = await fetch(`${apiBase}/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            session_id: sessionId,
            message: userMessage
        })
    });

    if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
        const { value, done } = await reader.read();
        if (done) {
            break;
        }

        buffer += decoder.decode(value, { stream: true });

        while (true) {
            const boundary = buffer.indexOf('\n\n');
            if (boundary === -1) {
                break;
            }

            const rawEvent = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);

            const parsed = parseSseEvent(rawEvent);
            if (!parsed) {
                continue;
            }

            if (parsed.event === 'token' && parsed.data?.delta) {
                assistantNode.textContent += parsed.data.delta;
            }

            if (parsed.event === 'error') {
                throw new Error(parsed.data?.message || 'stream error');
            }
        }
    }
}

function parseSseEvent(rawEvent) {
    const lines = rawEvent.split('\n');
    let eventName = 'message';
    let dataText = '';

    for (const line of lines) {
        if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
        }

        if (line.startsWith('data:')) {
            dataText += line.slice(5).trim();
        }
    }

    if (!dataText) {
        return null;
    }

    try {
        return {
            event: eventName,
            data: JSON.parse(dataText)
        };
    } catch (error) {
        return null;
    }
}

// Utility functions
function playRetroSound(type) {
    // Create retro-style notification sounds using Web Audio API
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    switch(type) {
        case 'click':
            oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
            break;
        case 'error':
            oscillator.frequency.setValueAtTime(200, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(100, audioContext.currentTime + 0.3);
            break;
        case 'success':
            oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(800, audioContext.currentTime + 0.2);
            break;
    }
    
    gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.3);
}

// Export functions for global use
window.VintageTheme = {
    playRetroSound,
    activateRetroMode,
    openLightbox
};

console.log('🖥️ Vintage Web Theme loaded! Press ↑↑↓↓←→←→BA for a surprise! 🎮');
