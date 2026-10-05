/**
 * ══════════════════════════════════════════════════════════════════════════
 * activityFeedSource.js — 「我的運動紀錄」的單一真相源
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 為什麼有這支（2026-09 動態／社群稽核）：
 *
 * 同一批訓練紀錄，兩個頁面各自去撈、各自正規化、各自去重：
 *   最新動態 ActivityFeedMobile  → /api/cardio/sessions + getWorkoutHistory
 *   社群動態 SocialPage.FriendsFeedView → /api/history/logs（欄位名完全不同）
 *
 * 結果就是使用者看到的畫面：最新動態有 14 筆、社群卻說「還沒有動態」。
 * 同一件事有兩個答案 = 使用者不會信任其中任何一個（鐵律 4：單一真相源）。
 *
 * 這支負責：抓取 → 正規化 → 去重 → 標獎牌，兩頁共用同一份結果。
 * 顯示要長什麼樣是各頁自己的事，但「有哪些紀錄、破了什麼」只有一個答案。
 */

import apiClient, { getWorkoutHistory } from '../api/client';
import { sessionVolume } from './strengthMath';
import { toLocalDateKey } from './localDate';
import { annotateMedals, parseExercises } from './prMedals';

const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

export const sportKeyOf = (s) =>
    String(s?.sport || s?.sportType || s?.type || s?.metrics?.type || 'running').toLowerCase();

export const isStrengthSession = (s) => {
    const k = sportKeyOf(s);
    return k === 'strength' || k === 'gym';
};

export const parseSessionDate = (s) => {
    const raw = s?.created_at ?? s?.date ?? s?.timestamp;
    if (raw == null) return null;
    const d = new Date(typeof raw === 'number' ? raw : raw);
    return Number.isNaN(d.getTime()) ? null : d;
};

/** 後端重訓紀錄 → 與有氧一致的卡片形狀（sport='strength'）。 */
export function normalizeStrengthRecord(r = {}) {
    // 訓練部位：muscles 陣列優先，退回 focus_group / muscle_groups
    let muscles = r.muscles || r.muscle_groups || r.target_muscles;
    if (typeof muscles === 'string') {
        try { const a = JSON.parse(muscles); muscles = Array.isArray(a) ? a : [muscles]; }
        catch { muscles = [muscles]; }
    }
    if (!Array.isArray(muscles)) muscles = [];

    // exercises 可能是 JSON 字串 —— 在這裡就攤平成陣列，
    // 下游（卡片菜單／結算頁／分享頁）拿到的一律是陣列，不會再炸。
    const exercises = parseExercises(r);

    return {
        sport: 'strength',
        session_id: r.id || r.session_id || r.workout_id || null,
        created_at: r.timestamp || r.date || r.created_at,
        focus_group: r.focus_group,
        muscles,
        location_name: r.location_name || r.locationName || null,
        // 🤝 一起練（存檔時寫進 session，跨裝置可見）
        companions: Array.isArray(r.companions) ? r.companions : [],
        raw: { ...r, exercises },
        metrics: {
            volume: sessionVolume(r),
            duration: num(
                r.duration_seconds
                ?? (r.duration_mins != null ? r.duration_mins * 60 : undefined)
                ?? (r.duration_min != null ? r.duration_min * 60 : undefined)
                ?? r.duration
            ),
            sets: num(r.completed_sets_count ?? r.completed_sets ?? r.sets),
            calories: num(r.metrics?.calories ?? r.calories),
        },
        // medals / pr_count 由 prMedals 統一補上（見下方 annotateMedals）
    };
}

/**
 * 去重 —— 同一次訓練可能因後端重複/合併出現兩筆。
 * 兩把鑰匙：session_id ＋ 內容簽章（運動｜當日｜時長｜容量或距離），任一命中即視為重複。
 * （照抄 pitfalls.md 的既有招式，不要另外發明一套）
 */
export function dedupeSessions(list = []) {
    const seen = new Set();
    const out = [];
    for (const s of list) {
        const d = parseSessionDate(s);
        const dur = Math.round(num(s.metrics?.duration));
        const amt = Math.round((num(s.metrics?.distance) || num(s.metrics?.volume)) * 100);
        const sig = `${sportKeyOf(s)}|${d ? toLocalDateKey(d) : ''}|${dur}|${amt}`;
        const idKey = s.session_id || s.run_id || null;
        if ((idKey && seen.has(idKey)) || seen.has(sig)) continue;
        if (idKey) seen.add(idKey);
        seen.add(sig);
        out.push(s);
    }
    return out;
}

/**
 * 我的運動紀錄（有氧 ＋ 重訓，已去重、已排序、已標獎牌）。
 *
 * @returns {{sessions, cardioOk, strengthOk, failed}}
 *   failed=true 代表「兩個來源都掛了」→ 呼叫端要顯示『載入失敗』
 *   而不是『沒有紀錄』的空狀態（三態不能混用，見 pitfalls.md）。
 */
export async function loadMyActivities(userId, { limit = 200 } = {}) {
    if (!userId) return { sessions: [], cardioOk: false, strengthOk: false, failed: true };

    const [cardioRes, strengthRes] = await Promise.all([
        apiClient.get(`/api/cardio/sessions/${userId}?limit=${limit}`)
            .then((r) => ({ ok: true, data: r.data?.sessions || [] }))
            .catch(() => ({ ok: false, data: [] })),
        getWorkoutHistory(userId, limit)
            .then((d) => ({
                ok: true,
                data: (d?.history && Array.isArray(d.history)) ? d.history : (Array.isArray(d) ? d : []),
            }))
            .catch(() => ({ ok: false, data: [] })),
    ]);

    const strength = (strengthRes.data || [])
        .map(normalizeStrengthRecord)
        .filter((s) => s.created_at);

    const merged = dedupeSessions(
        [...(cardioRes.data || []), ...strength]
            .filter((s) => parseSessionDate(s))
            .sort((a, b) => parseSessionDate(b) - parseSessionDate(a))
    );

    // 🏅 金銀銅：跑步與重訓在這裡一次算完，兩頁共用同一個答案
    annotateMedals(merged, isStrengthSession);

    return {
        sessions: merged,
        cardioOk: cardioRes.ok,
        strengthOk: strengthRes.ok,
        failed: !cardioRes.ok && !strengthRes.ok,
    };
}

/** 近 N 天（預設 30）。 */
export function withinDays(sessions = [], days = 30) {
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return sessions.filter((s) => {
        const d = parseSessionDate(s);
        return d && d.getTime() >= cutoff;
    });
}

/**
 * 給社群動態牆用的形狀（SocialPage.FriendsFeedView 的 item shape）。
 * 同一批資料換一件衣服，不是重新撈一次 —— 這正是兩頁會對不起來的根因。
 */
export function toSocialFeedItem(s, { userId, userName = '我' } = {}) {
    const strength = isStrengthSession(s);
    const m = s.metrics || {};
    const d = parseSessionDate(s);
    return {
        id: s.session_id || s.run_id || `mine_${d ? d.getTime() : Math.random()}`,
        uId: userId,
        userName,
        discriminator: '0000',
        init: String(userName || 'M').charAt(0).toUpperCase(),
        createdAt: d ? d.toISOString() : new Date().toISOString(),
        type: strength ? 'strength' : 'run',
        caption: '',
        isMine: true,
        sportKey: sportKeyOf(s),
        medals: Array.isArray(s.medals) ? s.medals : [],
        medalSummary: s.medal_summary || null,
        companions: Array.isArray(s.companions) ? s.companions : [],
        locationName: s.location_name || s.locationName || null,
        stats: {
            distance: num(m.distance ?? m.distance_km),
            pace: num(m.avgPace ?? m.pace_per_km ?? m.pace),
            duration_min: Math.round(num(m.duration) / 60),
            volume_kg: num(m.volume),
            sets: num(m.sets),
            body_parts: Array.isArray(s.muscles) ? s.muscles : [],
        },
        kudos: 0,
        myKudo: false,
        source: s,
    };
}

export default {
    loadMyActivities, withinDays, dedupeSessions,
    normalizeStrengthRecord, toSocialFeedItem,
    sportKeyOf, isStrengthSession, parseSessionDate,
};
