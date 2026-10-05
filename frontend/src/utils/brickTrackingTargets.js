/**
 * 🎯 brickTrackingTargets — 六種 brick 的「追蹤目標」定義
 *
 * 計劃演算法（cardioPlanFusionEngine）把每週課表拆成六種 brick：
 *   recovery / easy / tempo / interval / long / strength
 *
 * 每種 brick 訓練目的不同，「該追蹤什麼」也不同。本檔把這件事正規化：
 * 給每種 brick 一個「主目標」(primary，跑者該盯的數據) + 一個「守門條件」
 * (guard，防止主目標被鑽空子)。panel / DashboardMode 讀這份定義決定如何輔助。
 *
 * 設計原則（依使用者確認）：
 *   - 不硬核：每種卡最多兩個目標（主 + 守門），其餘不顯示
 *   - 只用 配速 / 里程 / zone 三個維度
 *   - 對應演算法的 BRICK_TO_RPE：訓練目的決定主軸
 *       recovery → zone（重點是「夠不夠輕鬆」，心率最準）
 *       easy     → pace 上限（重點是「別偷跑快」）
 *       tempo    → pace 區間（重點是「卡在某配速」）
 *       interval → 趟數（重點是「每趟有沒有衝到」）
 *       long     → 里程（重點是「跑夠遠」）
 *       strength → 時長（非跑步，純計時）
 *
 * primary.metric: 'zone' | 'pace_ceiling' | 'pace_window' | 'reps' | 'distance' | 'duration'
 * guard.metric:   'zone' | 'distance' | 'pace_ceiling' | 'pace_stability' | 'hr_recovery' | null
 *
 * panelMode: 提示 panel 主視覺該凸顯什麼
 *   'zone'      → 氛圍燈走 zone 模式 + Zone 區間燈號
 *   'pace'      → 氛圍燈走 pace 模式 + 配速差條（既有行為）
 *   'distance'  → 距離進度環（DashboardMode 已實作）
 *   'reps'      → 趟數計數器 + MacroFocusOverlay
 *   'duration'  → 純計時，隱藏配速/里程
 */

import { RPE_BANDS } from './rpeMapping';

export const BRICK_TRACKING_TARGETS = {
    recovery: {
        key: 'recovery',
        label: 'Recovery Jog',
        labelZh: '恢復跑',
        rpeBand: RPE_BANDS.RECOVERY,   // RPE 3-4
        zoneRange: [1, 2],
        color: RPE_BANDS.RECOVERY.color, // #7BD3A5
        panelMode: 'zone',
        primary: {
            metric: 'zone',
            zoneMax: 2,
            label: '待在 Zone 1–2',
            hint: '越輕鬆越好，能聊天的程度',
        },
        guard: {
            metric: 'zone',
            zoneCeiling: 2,
            label: '別超 Zone 2',
            hint: '超出就降速或改用走的',
        },
        // 沒有心率裝置時的退路：用比 easy 更慢的配速上限當門檻
        fallback: { metric: 'pace_ceiling', paceFromRpe: RPE_BANDS.RECOVERY },
    },

    easy: {
        key: 'easy',
        label: 'Easy Run',
        labelZh: '輕鬆跑',
        rpeBand: RPE_BANDS.EASY,        // RPE 5-6
        zoneRange: [2, 2],
        color: RPE_BANDS.EASY.color,    // #D8F382
        panelMode: 'pace',
        primary: {
            metric: 'pace_ceiling',
            paceFromRpe: RPE_BANDS.EASY,
            label: '配速別快過 Easy 上限',
            hint: '這是 80/20 裡的 80%，太快就破壞訓練',
        },
        guard: {
            metric: 'distance',
            label: '跑滿目標里程',
            hint: '別為了壓速度而偷里程',
        },
    },

    tempo: {
        key: 'tempo',
        label: 'Tempo',
        labelZh: '節奏跑',
        rpeBand: RPE_BANDS.TEMPO,       // RPE 7-8
        zoneRange: [4, 4],
        color: RPE_BANDS.TEMPO.color,   // #FF99DC
        panelMode: 'pace',
        primary: {
            metric: 'pace_window',
            paceFromRpe: RPE_BANDS.TEMPO,
            toleranceSec: 10,           // 主段穩在目標 ±10 秒
            label: '主段穩在目標配速 ±10 秒',
            hint: '舒適的辛苦，別跑成比賽',
            appliesToStep: (step) => /tempo|節奏/i.test(step?.name || ''),
        },
        guard: {
            metric: 'pace_stability',
            label: '配速穩定，別忽快忽慢',
            hint: '節奏跑的價值在「維持」，不在爆發',
        },
    },

    interval: {
        key: 'interval',
        label: 'Interval',
        labelZh: '間歇跑',
        rpeBand: RPE_BANDS.MILE,        // RPE 9
        zoneRange: [5, 5],
        color: RPE_BANDS.MILE.color,    // #F95C4B
        panelMode: 'reps',
        primary: {
            metric: 'reps',
            paceFromRpe: RPE_BANDS.MILE,
            label: '每趟衝刺達到目標配速',
            hint: '達標的趟數才算數',
            isSprintStep: (step) => /衝刺|sprint|全力|加速|極限|interval|間歇/i.test(step?.name || ''),
        },
        guard: {
            metric: 'hr_recovery',
            label: '恢復段心率要降下來',
            hint: '降不下來代表上一趟太猛或休太短',
        },
    },

    long: {
        key: 'long',
        label: 'Long Run',
        labelZh: '長距離跑',
        rpeBand: RPE_BANDS.EASY,        // long 也是 easy 配速
        zoneRange: [2, 2],
        color: RPE_BANDS.EASY.color,
        panelMode: 'distance',
        primary: {
            metric: 'distance',
            label: '完成總里程',
            hint: '距離才是重點，進度環看到底',
        },
        guard: {
            metric: 'pace_ceiling',
            paceFromRpe: RPE_BANDS.EASY,
            label: '配速別飄太快，撐到底',
            hint: '前段衝太快，後段一定崩',
        },
    },

    strength: {
        key: 'strength',
        label: 'Strength',
        labelZh: '肌力訓練',
        rpeBand: RPE_BANDS.EASY,        // 純參考，非跑步
        zoneRange: null,
        color: '#B4B2A9',
        panelMode: 'duration',
        primary: {
            metric: 'duration',
            label: '完成目標時長',
            hint: '交叉訓練，不追配速與里程',
        },
        guard: null,
    },
};

/**
 * 從 brick / activePlan 取出對應的追蹤目標定義
 * @param {object} brick — 含 subtype 或 type 欄位
 * @returns {object|null}
 */
export function getTrackingTarget(brick) {
    if (!brick) return null;
    const key = (brick.subtype || brick.brickSubtype || brick.type || brick.brickType || '').toLowerCase();
    return BRICK_TRACKING_TARGETS[key] || null;
}

/**
 * 給定 brick + baseline 5K pace，算出本次該顯示的「目標配速秒數」
 * 用於 panel 把抽象的 RPE band 落地成具體配速門檻。
 * @param {object} brick
 * @param {number} baselinePace5K — 秒/km
 * @returns {{ targetSec:number|null, ceilingSec:number|null, band:object }|null}
 */
export function resolveBrickPaceTarget(brick, baselinePace5K) {
    const t = getTrackingTarget(brick);
    if (!t || !baselinePace5K) return null;
    // rpeToTargetPaceBand 在 rpeMapping，避免循環引用這裡做輕量內聯換算
    const band = t.rpeBand;
    if (!band) return null;
    // 經驗倍率（鏡像 paceToRPE 的反向錨點）
    //   節奏＝5K 配速慢一點（閾值），間歇＝略快於 5K 配速（與 cardioPrescription 的課型偏移一致）
    const MUL = { RECOVERY: 1.5, EASY: 1.3, TEMPO: 1.04, MILE: 0.97, ALL_OUT: 0.9 };
    const mul = MUL[band.label] ?? 1.2;
    const targetSec = Math.round(baselinePace5K * mul);
    return { targetSec, ceilingSec: targetSec, band };
}

export default BRICK_TRACKING_TARGETS;
