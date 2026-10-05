import { useEffect, useState, useRef } from 'react';

/**
 * ⌚ useWatchConnection
 * 監聽 iOS 原生橋接送來的 Apple Watch 連線狀態與即時心率事件，
 * 提供 UI 一個可靠的「已連接 / 記錄中」依據。
 *
 * 原生端（WatchConnectivityManager + WebView.swift）會派發兩種事件：
 *   - 'watch-connection-status' { connected, isPaired, isWatchAppInstalled, isReachable }
 *       App 啟動載完 + 每次狀態變化時派發。
 *   - 'watch-heart-rate' { heartRate }
 *       手錶在 workout 中即時送來的心率。最近有收到 = 手錶正在記錄。
 *
 * 回傳：
 *   connected           已配對且手錶已安裝本 App（穩定的「已連接」狀態）
 *   reachable           手錶目前可即時通訊（前景）
 *   isPaired / isWatchAppInstalled
 *   liveHeartRate       最近一次手錶心率（0 表示尚無）
 *   isRecording         最近 8 秒內有收到手錶心率（= 正在記錄）
 */
export function useWatchConnection() {
    const [status, setStatus] = useState({
        connected: false,
        reachable: false,
        isPaired: false,
        isWatchAppInstalled: false,
    });
    const [liveHeartRate, setLiveHeartRate] = useState(0);
    const [liveCalories, setLiveCalories] = useState(0);  // 手錶送來的即時卡路里
    const [isRecording, setIsRecording] = useState(false);
    const [isTracking, setIsTracking] = useState(false); // 手錶 workout 是否進行中(原生回報)
    const recordingTimerRef = useRef(null);

    useEffect(() => {
        const onStatus = (e) => {
            const d = e.detail || {};
            setStatus({
                connected: !!d.connected,
                reachable: !!d.isReachable,
                isPaired: !!d.isPaired,
                isWatchAppInstalled: !!d.isWatchAppInstalled,
            });
        };

        const onHeartRate = (e) => {
            const hr = Number(e.detail?.heartRate) || 0;
            if (hr > 0) {
                setLiveHeartRate(hr);
                setIsRecording(true);
                // 8 秒內沒再收到心率 → 視為停止記錄
                if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
                recordingTimerRef.current = setTimeout(() => setIsRecording(false), 8000);
            }
        };

        // 收到手錶即時 metrics（gym + cardio 模式）也視為「正在記錄」
        const onLiveMetrics = (e) => {
            const hr = Number(e.detail?.heartRate) || 0;
            const cal = Number(e.detail?.calories) || 0;
            if (cal > 0) setLiveCalories(cal);
            if (hr > 0) {
                setLiveHeartRate(hr);
                setIsRecording(true);
                if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
                recordingTimerRef.current = setTimeout(() => setIsRecording(false), 8000);
            }
        };

        const onTracking = (e) => setIsTracking(!!e.detail?.tracking);

        window.addEventListener('watch-connection-status', onStatus);
        window.addEventListener('watch-heart-rate', onHeartRate);
        window.addEventListener('watch-live-metrics', onLiveMetrics);
        window.addEventListener('watch-tracking', onTracking);

        return () => {
            window.removeEventListener('watch-connection-status', onStatus);
            window.removeEventListener('watch-heart-rate', onHeartRate);
            window.removeEventListener('watch-live-metrics', onLiveMetrics);
            window.removeEventListener('watch-tracking', onTracking);
            if (recordingTimerRef.current) clearTimeout(recordingTimerRef.current);
        };
    }, []);

    return { ...status, liveHeartRate, liveCalories, isRecording, isTracking };
}

export default useWatchConnection;
