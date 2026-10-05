// hooks/useNetworkStatus.js
// 網絡狀態檢測 Hook

import { useState, useEffect } from 'react';

export const useNetworkStatus = () => {
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [connectionType, setConnectionType] = useState('unknown');
    const [effectiveType, setEffectiveType] = useState('unknown');

    useEffect(() => {
        // 更新連接信息
        const updateConnectionInfo = () => {
            if ('connection' in navigator) {
                const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                if (conn) {
                    setConnectionType(conn.type || 'unknown');
                    setEffectiveType(conn.effectiveType || 'unknown');
                }
            }
        };

        // 在線狀態處理器
        const handleOnline = () => {
            console.log('🌐 Network: Online');
            setIsOnline(true);
            updateConnectionInfo();
        };

        const handleOffline = () => {
            console.log('📴 Network: Offline');
            setIsOnline(false);
        };

        // 連接變化處理器
        const handleConnectionChange = () => {
            console.log('🔄 Network: Connection changed');
            updateConnectionInfo();
        };

        // 添加事件監聽器
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // 監聽連接變化（如果支持）
        if ('connection' in navigator) {
            const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
            if (conn) {
                conn.addEventListener('change', handleConnectionChange);
            }
        }

        // 初始化連接信息
        updateConnectionInfo();

        // 清理
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);

            if ('connection' in navigator) {
                const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
                if (conn) {
                    conn.removeEventListener('change', handleConnectionChange);
                }
            }
        };
    }, []);

    return {
        isOnline,
        connectionType,
        effectiveType,
        isSlowConnection: effectiveType === 'slow-2g' || effectiveType === '2g'
    };
};
