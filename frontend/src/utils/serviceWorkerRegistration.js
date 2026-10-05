// Service Worker 註冊和管理

export const registerServiceWorker = () => {
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker
                .register('/sw.js')
                .then((registration) => {
                    console.log('✅ Service Worker registered:', registration.scope);

                    // 檢查更新
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        console.log('🔄 Service Worker updating...');

                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // 新版本可用，提示用戶刷新
                                console.log('✨ New version available!');

                                // 發送消息給主應用
                                window.dispatchEvent(new CustomEvent('swUpdate', {
                                    detail: { registration }
                                }));
                            }
                        });
                    });

                    // 定期檢查更新（每小時）
                    setInterval(() => {
                        registration.update();
                    }, 60 * 60 * 1000);
                })
                .catch((error) => {
                    console.error('❌ Service Worker registration failed:', error);
                });

            // 監聽來自 Service Worker 的消息
            navigator.serviceWorker.addEventListener('message', (event) => {
                console.log('📨 Message from SW:', event.data);

                if (event.data && event.data.type === 'SYNC_COMPLETE') {
                    window.dispatchEvent(new CustomEvent('syncComplete', {
                        detail: event.data
                    }));
                }
            });
        });
    } else {
        console.warn('⚠️ Service Worker not supported');
    }
};

export const unregisterServiceWorker = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
            .then((registration) => {
                registration.unregister();
                console.log('✅ Service Worker unregistered');
            })
            .catch((error) => {
                console.error('❌ Service Worker unregister failed:', error);
            });
    }
};

// 請求後台同步
export const requestBackgroundSync = (tag = 'sync-plans') => {
    if ('serviceWorker' in navigator && 'sync' in ServiceWorkerRegistration.prototype) {
        navigator.serviceWorker.ready
            .then((registration) => {
                return registration.sync.register(tag);
            })
            .then(() => {
                console.log('✅ Background sync registered:', tag);
            })
            .catch((error) => {
                console.error('❌ Background sync failed:', error);
            });
    } else {
        console.warn('⚠️ Background sync not supported');
    }
};

// 檢查 Service Worker 狀態
export const checkServiceWorkerStatus = async () => {
    if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.getRegistration();

        if (registration) {
            return {
                active: !!registration.active,
                scope: registration.scope,
                updateAvailable: !!registration.waiting
            };
        }
    }

    return {
        active: false,
        scope: null,
        updateAvailable: false
    };
};

// 強制更新 Service Worker
export const updateServiceWorker = () => {
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration()
            .then((registration) => {
                if (registration && registration.waiting) {
                    // 通知 Service Worker 跳過等待
                    registration.waiting.postMessage({ type: 'SKIP_WAITING' });

                    // 等待激活後刷新頁面
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                        window.location.reload();
                    });
                }
            });
    }
};
