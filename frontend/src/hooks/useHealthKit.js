import { useState, useEffect, useCallback, useRef } from 'react';
import { getNextSimulatedStep } from '../utils/simulationUtils';
import { saveRecoverySignals } from '../utils/readiness';
import { getUserId } from '../utils/auth';

/**
 * 🏃 useHealthKit Hook
 * 這個 Hook 提供 真實 HealthKit 數據與假數據降級
 */
/**
 * Options:
 *   forceSimulation: boolean         → 強制走假數據模式（開發/瀏覽器）
 *   mode: 'running' | 'gym' | 'treadmill'  → 決定 Swift 端 HKWorkoutConfiguration.activityType
 *                                          以及是否啟動 GPS / Pedometer / 室外距離
 *   onRecoveryHR: (hr) => void       → 跑步結束後 60 秒收尾期間，每秒回呼當前心率
 *                                       （讓 RecoveryContext 即時算 HRR drop）
 */
export const useHealthKit = (options = {}) => {
    const {
        forceSimulation = false,
        mode = 'running',
        onRecoveryHR = null,
        // 🆕 disableSimulation: 當設為 true（健身房 / 重訓場景），
        //    若沒有 Apple Watch / HealthKit bridge，metrics 全部維持 0，
        //    讓 UI 顯示 "--"（而不是用假心率污染畫面）。
        disableSimulation = false,
    } = options;

    // =========================================
    // 1️⃣ 檢測 HealthKit 是否可用
    // =========================================
    const [isHealthKitAvailable, setIsHealthKitAvailable] = useState(false);
    const [isAuthorized, setIsAuthorized] = useState(false);

    useEffect(() => {
        const checkHealthKit = () => {
            const available = !!(window.webkit?.messageHandlers?.healthKit);
            console.log('🔍 [HealthKit] Availability check:', available);
            setIsHealthKitAvailable(available);

            if (!available) {
                console.warn('⚠️ [HealthKit] Not available - using fallback simulation');
            }
        };
        checkHealthKit();
    }, []);

    // =========================================
    // 2️⃣ 實時數據狀態
    // =========================================
    const [metrics, setMetrics] = useState({
        heartRate: 0,
        distance: 0,
        pace: 0,
        elevation: 0,
        calories: 0,
        duration: 0,
        cadence: 0,          // 🆕 步頻 spm (Apple Watch / iPhone CMPedometer)
        stride: 0,           // 🆕 步幅 m (Apple Watch runningStrideLength)
        hrv: 62,             // 🆕 心率變異性 ms (Apple Watch HRV SDNN)
        sleepHours: 7.6,     // 🆕 睡眠時數 hr
        currentPosition: null
    });

    const [dataAvailability, setDataAvailability] = useState({
        hasHeartRateData: false,
        hasGPSData: false,
        hasElevationData: false,
        hasCadenceData: false,   // 🆕
        hasStrideData: false,    // 🆕
        isTreadmillMode: false   // 🆕 — Swift 端告知目前 GPS 沒訊號、改用 CMPedometer
    });

    const [isWorkoutActive, setIsWorkoutActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    // 🩹 W-1: 原生 HKWorkoutSession 失敗（被系統中斷）→ 上層顯示「量測中斷」提示
    const [workoutError, setWorkoutError] = useState(null);
    // 🆕 跑步結束後的 60 秒 HRR 收尾期
    const [isRecoveryPhase, setIsRecoveryPhase] = useState(false);

    const streamDataRef = useRef({
        timestamps: [],
        heart_rate: [],
        pace: [],
        elevation: [],
        cadence: [],         // 🆕
        stride: [],          // 🆕
        route: []
    });

    // 🆕 HRR 收尾期間單獨記錄的心率曲線（避免污染主訓練 streamData）
    const recoveryStreamRef = useRef({ timestamps: [], heart_rate: [] });
    // 🆕 暫存 Swift 回傳的最終 summary，等 60 秒 recovery 過後才送出
    const pendingSummaryRef = useRef(null);
    const recoveryTimerRef = useRef(null);
    const recoveryStartHRRef = useRef(0);

    // =========================================
    // 3️⃣ 假數據降級
    // =========================================
    const fallbackTimerRef = useRef(null);
    const fallbackDurationRef = useRef(0);

    const startFallbackSimulation = useCallback(() => {
        console.log('🔄 [Fallback] Starting simulation...');
        fallbackDurationRef.current = 0;

        fallbackTimerRef.current = setInterval(() => {
            fallbackDurationRef.current += 1;

            const simData = getNextSimulatedStep(
                fallbackDurationRef.current,
                120 // Using 120 as base HR for simulation
            );

            setMetrics(prev => {
                const newMetrics = {
                    heartRate: simData.hr,
                    distance: prev.distance + 0.002, // meters per second roughly
                    pace: simData.pace / 60,
                    elevation: prev.elevation + (Math.random() - 0.5) * 0.2,
                    calories: prev.calories + 0.15,
                    duration: fallbackDurationRef.current,
                    currentPosition: {
                        lat: 25.033 + (Math.random() - 0.5) * 0.0001,
                        lng: 121.565 + (Math.random() - 0.5) * 0.0001,
                        timestamp: Date.now()
                    }
                };

                streamDataRef.current.timestamps.push(Date.now());
                streamDataRef.current.heart_rate.push(newMetrics.heartRate);
                streamDataRef.current.pace.push(newMetrics.pace);
                streamDataRef.current.elevation.push(newMetrics.elevation);
                streamDataRef.current.cadence.push(newMetrics.cadence || 0);
                streamDataRef.current.stride.push(newMetrics.stride || 0);
                streamDataRef.current.route.push(newMetrics.currentPosition);

                return newMetrics;
            });

            setDataAvailability({
                hasHeartRateData: false,
                hasGPSData: mode !== 'gym' && mode !== 'treadmill',
                hasElevationData: false,
                hasCadenceData: false,
                hasStrideData: false,
                isTreadmillMode: mode === 'treadmill'
            });
        }, 1000);
    }, []);

    const stopFallbackSimulation = useCallback(() => {
        if (fallbackTimerRef.current) {
            clearInterval(fallbackTimerRef.current);
            fallbackTimerRef.current = null;
        }
    }, []);

    // =========================================
    // 4️⃣ 監聽 Swift 消息
    // =========================================
    const handleMetricsUpdate = useCallback((data) => {
        const safeNumber = (value, fallback = 0) => {
            const num = Number(value);
            return isNaN(num) || !isFinite(num) ? fallback : num;
        };

        const safeMetrics = {
            heartRate: safeNumber(data.heartRate, 0),
            distance: safeNumber(data.distance, 0),
            pace: safeNumber(data.pace, 0),
            elevation: safeNumber(data.elevation, 0),
            calories: safeNumber(data.calories, 0),
            duration: safeNumber(data.duration, 0),
            cadence: safeNumber(data.cadence, 0),     // 🆕 spm
            stride: safeNumber(data.stride, 0),       // 🆕 m
            currentPosition: data.currentPosition || null
        };

        setMetrics(safeMetrics);
        setDataAvailability({
            hasHeartRateData: data.hasHeartRateData || false,
            hasGPSData: data.hasGPSData || false,
            hasElevationData: data.hasElevationData || false,
            hasCadenceData: data.hasCadenceData || false,
            hasStrideData: data.hasStrideData || false,
            isTreadmillMode: data.isTreadmillMode || false
        });

        // 🆕 跑步結束後的 60 秒 recovery 階段：心率單獨入 recoveryStreamRef，
        //    並透過 onRecoveryHR callback 即時餵給 RecoveryContext。
        //    主訓練 streamData 在 recovery 階段不再增長，否則 HRR drop 會被稀釋。
        if (isRecoveryPhase) {
            recoveryStreamRef.current.timestamps.push(Date.now());
            recoveryStreamRef.current.heart_rate.push(safeMetrics.heartRate);
            if (onRecoveryHR && safeMetrics.heartRate > 0) {
                try { onRecoveryHR(safeMetrics.heartRate); } catch (_) { /* swallow */ }
            }
            return;
        }

        streamDataRef.current.timestamps.push(Date.now());
        streamDataRef.current.heart_rate.push(safeMetrics.heartRate);
        streamDataRef.current.pace.push(safeMetrics.pace);
        streamDataRef.current.elevation.push(safeMetrics.elevation);
        streamDataRef.current.cadence.push(safeMetrics.cadence);
        streamDataRef.current.stride.push(safeMetrics.stride);
        if (safeMetrics.currentPosition) {
            streamDataRef.current.route.push(safeMetrics.currentPosition);
        }
    }, [isRecoveryPhase, onRecoveryHR]);

    // 🆕 真正把 final summary 推給上層的內部函式（被 60 秒 recovery 結束後呼叫）
    const dispatchFinalSummary = useCallback((data) => {
        const safeNumber = (value, fallback = 0) => {
            const num = Number(value);
            return isNaN(num) || !isFinite(num) ? fallback : num;
        };

        const hrSeries = recoveryStreamRef.current.heart_rate;
        const startHR = recoveryStartHRRef.current || (hrSeries[0] || 0);
        const endHR = hrSeries.length ? hrSeries[hrSeries.length - 1] : startHR;
        const hrrDrop = Math.max(0, Math.round(startHR - endHR));

        const finalData = {
            stats: {
                distance: safeNumber(data.distance, 0),
                duration: safeNumber(data.duration, 0),
                avgPace: safeNumber(data.avgPace, 0),
                avgHeartRate: safeNumber(data.avgHeartRate, 0),
                avgCadence: safeNumber(data.avgCadence, 0),       // 🆕
                avgStride: safeNumber(data.avgStride, 0),         // 🆕
                calories: safeNumber(data.calories, 0),
                elevationGain: safeNumber(data.elevationGain, 0),
                score: data.effortScore || 0
            },
            // 🆕 完整 HRR 區段資料（前端 PhysioInsightsGrid 可直接吃）
            hrr: {
                startHR,
                endHR,
                drop: hrrDrop,
                durationSec: hrSeries.length,
                curve: hrSeries.map((hr, i) => ({ t: i, hr }))
            },
            route: data.route || streamDataRef.current.route,
            streamData: data.streamData || streamDataRef.current,
            recoveryStreamData: recoveryStreamRef.current,        // 🆕
            mode,                                                  // 🆕 'running' | 'gym' | 'treadmill'
            dataAvailability: {
                hasHeartRateData: data.hasHeartRateData || false,
                hasGPSData: data.hasGPSData || false,
                hasElevationData: data.hasElevationData || false,
                hasCadenceData: data.hasCadenceData || false,
                hasStrideData: data.hasStrideData || false,
                isTreadmillMode: data.isTreadmillMode || false
            }
        };

        if (window.onWorkoutComplete) {
            window.onWorkoutComplete(finalData);
        }
    }, [mode]);

    const handleWorkoutEnded = useCallback((data) => {
        setIsWorkoutActive(false);
        setIsPaused(false);
        stopFallbackSimulation();

        // 🆕 健身模式：不走 60 秒 HRR 收尾，直接送出（健身房沒這個需求）
        if (mode === 'gym') {
            dispatchFinalSummary(data);
            return;
        }

        // 🆕 跑步 / 跑步機：把當前心率記下來，啟動 60 秒 recovery 階段
        recoveryStreamRef.current = { timestamps: [], heart_rate: [] };
        recoveryStartHRRef.current = metrics.heartRate || 0;
        pendingSummaryRef.current = data;
        setIsRecoveryPhase(true);
        console.log('🧊 [HealthKit] Entering 60s HRR recovery phase, startHR =', recoveryStartHRRef.current);

        if (recoveryTimerRef.current) clearTimeout(recoveryTimerRef.current);
        recoveryTimerRef.current = setTimeout(() => {
            setIsRecoveryPhase(false);
            console.log('✅ [HealthKit] Recovery phase complete, dispatching final summary');
            dispatchFinalSummary(pendingSummaryRef.current || {});
            pendingSummaryRef.current = null;
        }, 60000);
    }, [mode, metrics.heartRate, stopFallbackSimulation, dispatchFinalSummary]);

    useEffect(() => {
        const handleHealthKitMessage = (event) => {
            const { type, data } = event.detail;
            switch (type) {
                case 'healthKitReady':
                    setIsAuthorized(data.authorized);
                    // Request readiness metrics as soon as authorization is confirmed
                    if (window.webkit?.messageHandlers?.healthKit) {
                        window.webkit.messageHandlers.healthKit.postMessage({ action: 'requestReadiness' });
                    }
                    break;
                case 'workoutStarted':
                    setIsWorkoutActive(true);
                    setIsPaused(false);
                    break;
                case 'workoutPaused':
                    setIsPaused(true);
                    break;
                case 'workoutResumed':
                    setIsPaused(false);
                    break;
                case 'metricsUpdate':
                    handleMetricsUpdate(data);
                    break;
                case 'readinessUpdate':
                    if (data) {
                        setMetrics(prev => ({
                            ...prev,
                            hrv: data.hrv !== undefined ? Number(data.hrv) : prev.hrv,
                            sleepHours: data.sleepHours !== undefined ? Number(data.sleepHours) : prev.sleepHours
                        }));
                        /* 存起來 —— 準備度是在首頁與跑步頁算的，那兩個畫面
                           不在這個 hook 裡面，拿不到 metrics。存了才讀得到。 */
                        try { saveRecoverySignals(getUserId(), data); } catch { /* 存不進去就算了 */ }
                    }
                    break;
                case 'workoutEnded':
                    handleWorkoutEnded(data);
                    break;
                case 'workoutError':
                    // 🩹 W-1: session 死了不能假裝還在量 — 記錄錯誤讓 UI 顯示
                    setWorkoutError(data?.message || 'workout session interrupted');
                    setIsWorkoutActive(false);
                    break;
                default: break;
            }
        };
        window.addEventListener('healthKitMessage', handleHealthKitMessage);

        // Initial auth check
        if (window.webkit?.messageHandlers?.healthKit) {
            window.webkit.messageHandlers.healthKit.postMessage({ action: 'requestAuthorization' });
            window.webkit.messageHandlers.healthKit.postMessage({ action: 'requestReadiness' });
        }

        return () => window.removeEventListener('healthKitMessage', handleHealthKitMessage);
    }, [handleMetricsUpdate, handleWorkoutEnded]);

    // =========================================
    // 5️⃣ 訓練控制函數
    // =========================================
    const startWorkout = useCallback(() => {
        // 🆕 重置 stream + recovery 狀態
        streamDataRef.current = {
            timestamps: [], heart_rate: [], pace: [],
            elevation: [], cadence: [], stride: [], route: []
        };
        recoveryStreamRef.current = { timestamps: [], heart_rate: [] };
        pendingSummaryRef.current = null;
        recoveryStartHRRef.current = 0;
        if (recoveryTimerRef.current) {
            clearTimeout(recoveryTimerRef.current);
            recoveryTimerRef.current = null;
        }
        setIsRecoveryPhase(false);

        if (isHealthKitAvailable && window.webkit?.messageHandlers?.healthKit && !forceSimulation) {
            // 🆕 把 mode 傳給 Swift 端 → 決定 HKWorkoutConfiguration.activityType / 是否啟 GPS / 是否啟 Pedometer
            window.webkit.messageHandlers.healthKit.postMessage({
                action: 'startWorkout',
                mode
            });
        } else if (forceSimulation && !disableSimulation) {
            // 🧪 只有「明確開啟模擬」（開發者選項 force_simulation）才產生假數據
            setIsWorkoutActive(true);
            startFallbackSimulation();
        } else {
            // 🩺 誠實原則：沒有 HealthKit / 沒手錶 / 未開模擬 → metrics 全維持 0，
            //    UI 顯示 "--"，絕不假造心率、卡路里等生理數據誤導使用者。
            setIsWorkoutActive(true);
            console.log('🩺 [HealthKit] no real data source & simulation not forced → metrics stay 0 (UI shows "--")');
        }
    }, [isHealthKitAvailable, startFallbackSimulation, forceSimulation, mode, disableSimulation]);

    const pauseWorkout = useCallback(() => {
        if (isHealthKitAvailable && window.webkit?.messageHandlers?.healthKit && !forceSimulation) {
            window.webkit.messageHandlers.healthKit.postMessage({ action: 'pauseWorkout' });
        } else {
            stopFallbackSimulation();
            setIsPaused(true);
        }
    }, [isHealthKitAvailable, stopFallbackSimulation, forceSimulation]);

    const resumeWorkout = useCallback(() => {
        if (isHealthKitAvailable && window.webkit?.messageHandlers?.healthKit && !forceSimulation) {
            window.webkit.messageHandlers.healthKit.postMessage({ action: 'resumeWorkout' });
        } else {
            if (forceSimulation && !disableSimulation) startFallbackSimulation(); // 只有明確開模擬才重啟假數據
            setIsPaused(false);
        }
    }, [isHealthKitAvailable, startFallbackSimulation, forceSimulation, disableSimulation]);

    const endWorkout = useCallback(() => {
        if (isHealthKitAvailable && window.webkit?.messageHandlers?.healthKit && !forceSimulation) {
            window.webkit.messageHandlers.healthKit.postMessage({ action: 'endWorkout' });
        } else {
            stopFallbackSimulation();
            handleWorkoutEnded(metrics); // Fallback summary
        }
    }, [isHealthKitAvailable, metrics, handleWorkoutEnded, stopFallbackSimulation, forceSimulation]);

    return {
        metrics,
        dataAvailability,
        isHealthKitAvailable,
        isAuthorized,
        isWorkoutActive,
        isPaused,
        workoutError,                                     // 🩹 W-1: 原生量測中斷訊息（null = 正常）
        clearWorkoutError: () => setWorkoutError(null),
        isRecoveryPhase,                                  // 🆕 上層用來顯示「HRR 收集中 60s」
        mode,                                             // 🆕 回傳目前模式
        startWorkout,
        pauseWorkout,
        resumeWorkout,
        endWorkout,
        streamData: streamDataRef.current,
        recoveryStreamData: recoveryStreamRef.current      // 🆕
    };
};

export default useHealthKit;
