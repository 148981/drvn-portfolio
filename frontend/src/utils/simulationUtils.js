
// utils/simulationUtils.js

const noise = (amount) => (Math.random() - 0.5) * amount;

/**
 * 根據當前跑步時間，計算下一秒的 "合理" 心率與配速
 * 修復：拉高心率區間，確保 Zone 分布豐富
 */
export const getNextSimulatedStep = (durationSec, currentHR) => {
    let targetHR;
    let targetPace;

    // 1. 暖身期 (前 60秒 - 快速拉高心率)
    if (durationSec < 60) {
        const progress = durationSec / 60;
        targetHR = 90 + (60 * progress); // 90 -> 150 bpm (快速進入工作狀態)
        targetPace = 500 - (170 * progress); // 8:20 -> 5:30 /km
    }
    // 2. 穩定期 (模擬有氧/無氧區間)
    else {
        // 加入 "心率漂移" 與 "間歇波動"
        // 讓心率在 150 ~ 175 之間波動，這樣 Effort Zones 就會有 Fat Burn, Aerobic, Anaerobic
        const drift = (durationSec - 60) / 60 * 0.5; // 隨時間微幅上升
        const intervalWave = Math.sin(durationSec / 45) * 10; // 每 45秒 一個波峰

        targetHR = 155 + drift + intervalWave;
        targetPace = 330; // 5:30/km
    }

    const finalHR = Math.floor(targetHR + noise(3));
    const finalPace = Math.floor(targetPace + noise(10));

    return {
        hr: Math.max(60, finalHR),
        pace: Math.max(200, finalPace),
        elevationGain: Math.random() > 0.8 ? 1 : 0
    };
};

/**
 * 計算冷卻期的心率 (指數下降)
 */
export const getRecoveryStep = (startRecoveryHR, secondsSinceStop) => {
    // 強制下降曲線：模擬停止運動後的心率驟降
    // 假設 60秒內要從 startRecoveryHR (e.g. 165) 降到 100 左右
    const dropAmount = (startRecoveryHR - 100) * (1 - Math.exp(-secondsSinceStop / 15));

    let hr = startRecoveryHR - dropAmount + noise(1);
    return Math.floor(Math.max(60, hr));
};

/**
 * 🔥 新增：根據整串模擬的心率數據，計算 Zone 分佈
 * 這樣結果頁的圓餅圖才會有正確數據
 */
/**
 * 🔥 修復：嚴格定義 Zone 區間
 * 確保 150 bpm 以上會進入 Aerobic/Anaerobic，絕不會是 Recovery
 */
export const calculateZoneStats = (heartRateArray) => {
    // 必須與 UI 預期的 Key 完全一致
    const stats = {
        'Recovery': 0,   // 注意：有些 UI 組件可能用 'Recovery' 而不是 'Warm-up'
        'Warm-up': 0,    // 保留兩種 Key 以防萬一
        'Fat Burn': 0,
        'Aerobic': 0,
        'Anaerobic': 0,
        'Extreme': 0,    // 注意大小寫 'Extreme' vs 'EXTREME'
        'EXTREME': 0
    };

    let total = 0;

    heartRateArray.forEach(hr => {
        if (hr < 40) return; // 過濾掉無效數據

        total++;
        // 閾值對齊 CardioTrackerMobile ZONES 常數 (max HR ~220)
        if (hr <= 130) {
            stats['Recovery']++; // Z1 WARM_UP: 0-130
        } else if (hr <= 150) {
            stats['Fat Burn']++; // Z2 FAT_BURN: 131-150
        } else if (hr <= 170) {
            stats['Aerobic']++;  // Z3 AEROBIC: 151-170
        } else if (hr <= 190) {
            stats['Anaerobic']++; // Z4 ANAEROBIC: 171-190
        } else {
            stats['Extreme']++;   // Z5 EXTREME: 191+
        }
    });

    // 如果沒有數據，避免除以零
    if (total === 0) {
        stats['Recovery'] = 1; // 預設
        return stats;
    }

    return stats;
};

/**
 * 🔥 新增：生成歷史 EF 趨勢數據
 * 讓 EF 圖表看起來像是有在進步或波動，而不是一條死線
 */
export const generateMockEFHistory = (currentEF) => {
    const history = [];
    let val = parseFloat(currentEF);
    // 往回推 6 次紀錄
    for (let i = 0; i < 6; i++) {
        val = val - noise(0.1) - 0.02; // 模擬過去數值略低 (代表進步)
        history.unshift({ idx: i, val: parseFloat(val.toFixed(2)) });
    }
    // 加入本次
    history.push({ idx: 6, val: parseFloat(currentEF) });
    return history;
};
