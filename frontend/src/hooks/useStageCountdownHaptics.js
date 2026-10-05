import { useEffect, useRef } from 'react';

/**
 * 🥁 useStageCountdownHaptics — 換階倒數體感引擎 (Haptic Morse Code)
 *
 * 目的：
 *   在 plan step 即將切換到下一階段的最後 3 秒，給予 3 聲 light 預告震動，
 *   讓跑者「不用看螢幕就知道下一段要切換」。第 0 秒（GO）打一聲 heavy，
 *   並可選擇觸發畫面白光 callback（與 MacroFocusOverlay 串接）。
 *
 * 體感節奏（摩斯密碼）：
 *   stepRemaining = 3 → light   ← 噠
 *   stepRemaining = 2 → light   ← 噠
 *   stepRemaining = 1 → light   ← 噠
 *   stepRemaining = 0 → heavy + onStageBoundary()  ← 咚！+ 白光閃爍
 *
 * 設計原則：
 *   - 用 useRef 記錄已觸發過的 (stepIndex, remaining) 組合，避免同一秒觸發兩次
 *   - 只在 isTracking && !isPaused 時運作，暫停時自動靜音
 *   - 取代 CardioTrackerMobile 既有的 stage-change 雙 heavy 震動，
 *     避免「自然換階震動」與「stepRemaining=0 震動」重疊造成神經系統超載
 *   - 切換 plan 或 stop 時自動重置 ref，下次跑步從頭來過
 *
 * @param {object}   activePlan         — 當前 plan，含 steps[]
 * @param {number}   duration           — cardioData.duration（已跑秒數）
 * @param {boolean}  isTracking         — 是否正在追蹤
 * @param {boolean}  isPaused           — 是否暫停
 * @param {Function} triggerNativeHaptic — (style) => void
 * @param {Function} getCurrentPlanStep — (plan, duration) => { index, stepRemaining, ... }
 * @param {Function} [onStageBoundary]  — GO 那一刻的 callback（拿來觸發白光）
 */
export default function useStageCountdownHaptics({
    activePlan,
    duration,
    isTracking,
    isPaused,
    triggerNativeHaptic,
    getCurrentPlanStep,
    onStageBoundary,
}) {
    // 紀錄已經為「哪個 step 的哪一個倒數秒」震過 — 格式："3:2" 代表第 3 個 step 的 stepRemaining=2
    const firedKeysRef = useRef(new Set());
    // 紀錄上一秒的 stepIndex，用來偵測「跨 step 邊界」的瞬間
    const prevStepIndexRef = useRef(-1);

    useEffect(() => {
        // 條件守門：沒在跑就重置並退出，下次跑步從頭來過
        if (!activePlan || !isTracking || isPaused) {
            return;
        }

        const currentStep = getCurrentPlanStep(activePlan, duration);
        if (!currentStep) return;

        const { index, stepRemaining, isFinished } = currentStep;

        // 偵測「跨 step」瞬間：上一秒還在 step N，這一秒已經到 step N+1 → GO!
        const crossedBoundary =
            prevStepIndexRef.current !== -1 &&
            prevStepIndexRef.current !== index;

        if (crossedBoundary && !isFinished) {
            const goKey = `${index}:GO`;
            if (!firedKeysRef.current.has(goKey)) {
                firedKeysRef.current.add(goKey);
                triggerNativeHaptic('heavy');
                if (typeof onStageBoundary === 'function') {
                    try { onStageBoundary(index); } catch (err) { /* swallow */ }
                }
            }
        }

        // 3-2-1 預告：當 stepRemaining 落在 1/2/3 時各打一聲 light
        if (!isFinished && stepRemaining >= 1 && stepRemaining <= 3) {
            const key = `${index}:${stepRemaining}`;
            if (!firedKeysRef.current.has(key)) {
                firedKeysRef.current.add(key);
                triggerNativeHaptic('light');
            }
        }

        prevStepIndexRef.current = index;
    }, [activePlan, duration, isTracking, isPaused, triggerNativeHaptic, getCurrentPlanStep, onStageBoundary]);

    // 切換 plan 或停止追蹤時重置 — 避免下次跑步殘留舊資料
    useEffect(() => {
        if (!isTracking || !activePlan) {
            firedKeysRef.current.clear();
            prevStepIndexRef.current = -1;
        }
    }, [activePlan, isTracking]);
}
