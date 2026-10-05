/**
 * 🧱 brickThemeMapping — Brick.type → CardioTrackerMobile activePlan 對映
 *
 * 設計哲學：
 *   - 不重寫既有 5 套 TRAINING_THEMES，而是用 mapping 表把 brick 映射到既有主題
 *   - speed brick 隨機選 progressive 或 hill（避免訓練單調）
 *   - long brick 用 base 主題但延長 cruise step 的 duration
 *   - strength brick 不轉換 — 由呼叫端跳轉到重訓系統
 *
 * 注意：themeId 是 brick 上 server 端已存的值（plan generator 寫入）；
 *      此 helper 主要負責「沒指定 themeId 時的兜底」與「duration 動態調整」。
 */

/**
 * 從 brick 推論要用哪個 TRAINING_THEMES.id
 */
const VALID_STATIC_THEME_IDS = ['recovery', 'base', 'progressive', 'hill', 'custom'];

export function resolveThemeId(brick) {
    if (!brick) return null;
    // 只有 theme_id 確實存在於 TRAINING_THEMES 中才直接採用
    if (brick.theme_id && VALID_STATIC_THEME_IDS.includes(brick.theme_id)) {
        return brick.theme_id;
    }
    
    // 改用 subtype 進行更精準的運科對應
    const typeKey = brick.subtype || brick.type; 
    
    switch (typeKey) {
        case 'interval':
            return 'hill';        // 假設 hill 具備高低起伏的間歇特性
        case 'tempo':
            return 'progressive'; // 漸速跑很適合拿來當作 Tempo 的範本
        case 'recovery':
        case 'easy':
            return 'recovery';
        case 'long':
            return 'base';
        case 'strength':
            return 'base';        // strength 也給一張卡（用 base 海報）
        case 'speed':
            return 'hill';        // backend type 'speed' → 間歇
        default:
            return 'base';
    }
}

/**
 * 從 brick 找出對應的 difficulty 配置（在某個 theme 內挑最接近 brick.duration_min 的那一個）
 *
 * @param {object} brick
 * @param {Array}  trainingThemes — TRAINING_THEMES 陣列
 * @returns {{ theme, difficulty } | null}
 */
export function resolveDifficultyForBrick(brick, trainingThemes) {
    const themeId = resolveThemeId(brick);
    if (!themeId || !Array.isArray(trainingThemes)) return null;
    const theme = trainingThemes.find(t => t.id === themeId);
    if (!theme || !theme.difficulties || !theme.difficulties.length) return null;

    const targetSec = (brick.duration_min || 30) * 60;
    // 用 difficulty 的總 step duration 找最接近 brick.duration_min 的那個
    let best = null;
    let bestDiff = Infinity;
    for (const diff of theme.difficulties) {
        const totalSec = (diff.steps || []).reduce((acc, s) => acc + (s.duration || 0), 0);
        const d = Math.abs(totalSec - targetSec);
        if (d < bestDiff) { bestDiff = d; best = diff; }
    }
    return best ? { theme, difficulty: best } : null;
}

export function adjustStepsToTargetDuration(steps, targetDurationMin) {
    if (!Array.isArray(steps) || !targetDurationMin) return steps;
    
    const targetSec = targetDurationMin * 60;
    const totalSec = steps.reduce((acc, s) => acc + (s.duration || 0), 0);
    const diffSec = targetSec - totalSec;
    
    if (diffSec === 0) return steps.map(s => ({ ...s }));

    // 找出最長的中段 Step（避開首尾的暖身與緩和）
    let bestIdx = 0;
    let bestDur = 0;
    for (let i = 1; i < steps.length - 1; i++) {
        const d = steps[i]?.duration || 0;
        if (d > bestDur) { bestDur = d; bestIdx = i; }
    }
    // 如果沒有中段，才找全部最長的
    if (bestDur === 0) {
        bestIdx = steps.reduce((mi, s, i, arr) => (s.duration > arr[mi].duration ? i : mi), 0);
    }

    // 確保壓縮時，該段落不會變成負數（最少保留 5 分鐘 / 300秒）
    return steps.map((s, i) => {
        if (i !== bestIdx) return { ...s };
        const newDuration = Math.max(300, (s.duration || 0) + diffSec);
        return { ...s, duration: newDuration };
    });
}

/**
 * 統一入口：把 brick + TRAINING_THEMES 轉換為可直接餵給 setActivePlan 的物件
 *
 * @returns {{ id, title, type, steps, brickId } | null}
 */
export function buildActivePlanFromBrick(brick, trainingThemes) {
    if (!brick) return null;
    const resolved = resolveDifficultyForBrick(brick, trainingThemes);
    if (!resolved) return null;
    const { theme, difficulty } = resolved;
    let steps = difficulty.steps || [];
    
    // 只要不是 speed (間歇/節奏有特定的課表結構不宜亂拆)，就統一調整時間
    if (brick.type !== 'speed' && brick.type !== 'strength') {
        steps = adjustStepsToTargetDuration(steps, brick.duration_min);
    } else {
        steps = steps.map(s => ({ ...s }));
    }
    // 🎯 統一目標配速（唯一真相來源）— 全 App 配速一致：
    //   優先用 brick 自帶 target_pace_sec；沒有就用「目標時間 ÷ 目標距離」現算。
    //   若計劃沒有明確配速，不用 duration/距離反推生理處方；那可能只是
    //   舊資料或顯示用估算。上層應改用 baseline + 課型偏移，否則回傳 null。
    const canonicalTargetPaceSec =
        (brick.target_pace_sec != null && brick.target_pace_sec > 0)
            ? brick.target_pace_sec
            : null;

    // 🎯 分段配速權重 — 同一個 brick 內不同跑法給不同目標配速：
    //   暖身/恢復段比平均慢、節奏/衝刺段比平均快、巡航段＝平均。
    //   權重以「時間加權平均 ≈ canonical」為原則重新分配，整體仍滿足 距離÷時間。
    const isStrengthBrick = brick.subtype === 'strength' || brick.type === 'strength';
    const stepPaceMul = (name) => {
        const n = String(name || '').toLowerCase();
        if (/衝刺|sprint|全力|極限|interval|rep|間歇/.test(n)) return 0.82; // 最快
        if (/節奏|tempo|strong|finish|push|加速|threshold/.test(n)) return 0.92;
        if (/暖身|warm|緩和|cool|恢復|recover|float/.test(n)) return 1.18; // 最慢
        return 1.0; // steady / 巡航
    };

    let stepsWithPace = steps.map((s) => ({ ...s }));
    if (canonicalTargetPaceSec && !isStrengthBrick) {
        // 先算各 step 的原始權重配速，再用時間加權正規化回 canonical
        const totalSec = stepsWithPace.reduce((sum, s) => sum + (s.duration || 0), 0) || 1;
        const rawWeightedAvg = stepsWithPace.reduce(
            (sum, s) => sum + stepPaceMul(s.name) * (s.duration || 0), 0
        ) / totalSec;
        const norm = rawWeightedAvg > 0 ? 1 / rawWeightedAvg : 1;
        stepsWithPace = stepsWithPace.map((s) => {
            if (s.targetPace > 0) return { ...s }; // 既有自訂配速（如特殊間歇）尊重原值
            const mul = stepPaceMul(s.name) * norm;
            return { ...s, targetPace: Math.round(canonicalTargetPaceSec * mul) };
        });
    }

    return {
        id: theme.id,
        title: brick.title || theme.title,
        type: theme.type,
        steps: stepsWithPace,
        brickId: brick.brick_id,  // 標記來源 brick，跑完後可回寫
        brickType: brick.type,
        brickSubtype: brick.subtype || brick.type,  // 🎯 給 getTrackingTarget 解析 panelMode（recovery/easy/tempo/interval/long/strength）
        distance_km: brick.distance_km ?? null,     // 🎯 distance/long 型計劃的目標里程
        duration_min: brick.duration_min ?? null,   // 🎯 duration/strength 型計劃的目標時長
        targetPaceSec: canonicalTargetPaceSec,      // 🎯 唯一目標配速（秒/km）— 全 App 共用
        rpe_band: brick.rpe_band || null,           // 🎯 跑完 RPE 表單的目標區間（以前沒帶，表單永遠沒有目標可比）
    };
}

/**
 * 🎬 把一個 brick 「化妝」成 Cover Flow 卡片需要的 theme 結構
 *
 * 用基礎 theme（poster 圖、icon、color）做底，把 brick 的客製資訊（title、
 * duration、rpe band、完成狀態）覆蓋上去 — 這樣 Cover Flow render 程式
 * 完全不用改，照 theme.image / theme.color / theme.title 用。
 *
 * @param {object} brick           — backend brick 物件
 * @param {Array}  trainingThemes  — TRAINING_THEMES 陣列
 * @param {object} [opts]
 * @param {number} [opts.weekIndex] — 用來顯示「W3 · D2」這種微標
 * @returns {object|null}  — 帶 brickId / isCompleted / isSkipped 的「theme-like」卡片物件
 */
// 🎨 與 CardioMicrocycleInbox 的 TYPE_VISUAL 完全同一套配色，
//    讓 Cover Flow（圖二）與週清單（圖三）的「框色 + 種類標籤底色」一致。
//    key 對應 brick.type / subtype（easy→recovery、interval/tempo→speed）。
const COVER_TYPE_VISUAL = {
    speed:    { accent: '#F95C4B', tagBg: '#FFEAB0', tagText: '#161415' },
    recovery: { accent: '#7BD3A5', tagBg: '#D6F1E1', tagText: '#1E5C3F' },
    long:     { accent: '#A5C4FF', tagBg: '#E2D9F8', tagText: '#3B2E6B' },
    strength: { accent: '#161415', tagBg: '#161415', tagText: '#FFFFFF' },
};
function resolveCoverVisual(brick) {
    const k = brick.subtype || brick.type;
    const map = { easy: 'recovery', recovery: 'recovery', long: 'long', tempo: 'speed', interval: 'speed', speed: 'speed', strength: 'strength' };
    return COVER_TYPE_VISUAL[map[k] || brick.type] || COVER_TYPE_VISUAL.recovery;
}

export function buildCoverCardFromBrick(brick, trainingThemes, opts = {}) {
    if (!brick) return null;
    const themeId = resolveThemeId(brick);
    if (!themeId || !Array.isArray(trainingThemes)) return null;
    const baseTheme = trainingThemes.find(t => t.id === themeId);
    if (!baseTheme) return null;

    const resolved = resolveDifficultyForBrick(brick, trainingThemes);
    const matchedDifficulty = resolved?.difficulty || null;

    const isCompleted = brick.status === 'completed';
    const isSkipped = brick.status === 'skipped';

    // brick 的副 type label（顯示在卡片左上角的色塊）
    const subtypeLabel = ({
        recovery: 'RECOVERY',
        easy:     'EASY',
        long:     'LONG RUN',
        tempo:    'TEMPO',
        interval: 'INTERVAL',
        strength: 'STRENGTH',
    })[brick.subtype || brick.type] || (baseTheme.type || '').toUpperCase();

    const distLabel = brick.distance_km != null ? `${brick.distance_km}KM` : null;
    const durLabel = brick.duration_min != null ? `${brick.duration_min}M` : null;

    // 依類型取得與圖三一致的配色（框色 accent + 標籤底色 tagBg）
    const typeVis = resolveCoverVisual(brick);

    const titleLower = (brick.title || '').toLowerCase();
    let bgImg = baseTheme.image;
    if (titleLower.includes('easy')) bgImg = '/desktop/run1.png';
    else if (titleLower.includes('long')) bgImg = '/desktop/run2.png';
    else if (titleLower.includes('interval')) bgImg = '/desktop/run3.png';
    else if (titleLower.includes('recovery')) bgImg = '/desktop/run4.png';
    else if (titleLower.includes('tempo')) bgImg = '/desktop/run5.png';
    else {
        if (brick.type === 'speed') bgImg = '/desktop/run3.png';
        else if (brick.type === 'recovery') bgImg = '/desktop/run1.png';
        else if (brick.type === 'long') bgImg = '/desktop/run2.png';
    }

    return {
        // ── 與 TRAINING_THEMES 完全相容的欄位 ──
        id: `brick:${brick.brick_id}`,    // 用 brick 唯一 id 取代主題 id，避免重複 key
        title: brick.title || baseTheme.title,
        type: subtypeLabel,
        desc: baseTheme.desc,
        image: bgImg,
        icon: baseTheme.icon,
        // 框色改用「類型色」（與圖三一致），不再用 RPE band 的統一 lime
        color: typeVis.accent,
        typeAccent: typeVis.accent,
        typeTagBg: typeVis.tagBg,
        typeTagText: typeVis.tagText,
        difficulties: matchedDifficulty ? [matchedDifficulty] : (baseTheme.difficulties || []),
        duration: distLabel || durLabel || baseTheme.duration,

        // ── 從 brick 帶來的額外欄位 ──
        brickId: brick.brick_id,
        brickType: brick.type,
        brickSubtype: brick.subtype || brick.type,
        rpeBand: brick.rpe_band || null,
        targetPaceLabel: brick.target_pace_label || null,
        distanceKm: brick.distance_km,
        durationMin: brick.duration_min,
        isCompleted,
        isSkipped,
        weekIndex: opts.weekIndex || null,
        // ★ v2.4 完成率：實跑 ÷ 計劃。打勾不夠 —— 跑了 1.8/2.5 就是 72%。
        actualDistanceKm: Number(brick.actual_distance_km) || null,
        completionPct: (() => {
            if (!isCompleted) return null;
            const plan = Number(brick.distance_km) || 0;
            if (plan <= 0) return 100;
            const ran = Number(brick.actual_distance_km);
            return Math.round(((Number.isFinite(ran) && ran > 0 ? ran : plan) / plan) * 100);
        })(),
        // ★ v2.4「今天該做的那一張」—— 由呼叫端標記（要有日曆才知道今天是哪天）
        isToday: !!opts.todayBrickId && opts.todayBrickId === brick.brick_id,
        // 內部 flag — 給 render 端判斷「這是動態 brick 卡，要顯示完成 / 跳過狀態」
        _isBrickCard: true,
    };
}

/**
 * 🎬 把一週 bricks 全部轉成 Cover Flow 卡片 + 附上「Build a Plan」/「設定週計劃」入口卡
 *
 * 排序規則：
 *   1. pending 排最前面（鼓勵跑者繼續）
 *   2. completed 排中段（成就感展示）
 *   3. skipped 排最後
 *
 * @returns {Array}  — Cover Flow 用的 themes 陣列
 */
export function buildWeeklyCoverFlowThemes(bricks, trainingThemes, opts = {}) {
    if (!Array.isArray(bricks) || bricks.length === 0) return [];
    // 保持引擎精心計算的避震順序，不根據狀態排序
    return bricks
        .map(b => buildCoverCardFromBrick(b, trainingThemes, opts))
        .filter(Boolean);
}
