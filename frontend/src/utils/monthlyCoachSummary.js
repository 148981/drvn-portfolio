/**
 * monthlyCoachSummary.js — 月報開頭的「教練總評」＋「下個月三個重點」
 * ══════════════════════════════════════════════════════════════════════
 * 月報本來是一整頁數字：天數、時數、訓練量、跑量、營養達成率。
 * 付費的人要的是教練看完之後講的那兩句話：這個月怎麼樣、下個月先改什麼。
 *
 * 規則（每一條都只看真的有的資料，沒有的那一塊不評）：
 *   總評   看規律度（consistency_pct；沒有就用每週平均次數換算）
 *   重點   依嚴重程度挑最多 3 條，每條一個動作＋一句「為什麼」（帶這個月的真實數字）
 *          · 每週次數 < 3            → 固定每週 3 次
 *          · 腿 < 15%／背 < 胸 × 0.7 → 補腿／補背
 *          · 飲食記錄 < 50%          → 每天記錄
 *          · 蛋白質達成 < 80%        → 蛋白質吃到目標
 *          · 跑了 1–3 次             → 每週跑 2 次
 *          · 最長一趟 < 平均 × 1.5    → 每週一次長跑
 * 一個月一次都沒練 → 回 null（畫面只留「去練一次」，不編總評）。
 * ══════════════════════════════════════════════════════════════════════
 */

const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

export function monthlyCoachSummary(d) {
    if (!d) return null;
    const ov = d.overview || {}, f = d.fitness || {}, c = d.cardio || {}, nu = d.nutrition || {};
    const activeDays = n(ov.active_days) ?? n(ov.total_training_days) ?? 0;
    if (!activeDays) return null;

    const weekly = n(ov.avg_weekly_sessions);
    const consistency = n(ov.consistency_pct) ?? (weekly != null ? Math.min(100, Math.round((weekly / 4) * 100)) : null);
    const verdict = consistency == null ? `這個月練了 ${activeDays} 天`
        : consistency >= 80 ? '這個月很穩，照這個節奏走'
        : consistency >= 50 ? '大致有練，中間有幾週斷掉'
        : '這個月練得比較零散';

    const picks = [];   // { score, title, why }
    if (weekly != null && weekly < 3) {
        picks.push({ score: 100 - weekly * 10, title: '每週固定練 3 次', why: `這個月平均每週 ${Math.round(weekly * 10) / 10} 次` });
    }
    const md = f.muscle_distribution || {};
    const pct = (k) => n(md[k]?.percentage) ?? 0;
    if (Object.keys(md).length >= 2) {
        if (pct('legs') < 15) picks.push({ score: 70, title: '每週至少練一次腿', why: `腿只佔這個月的 ${pct('legs')}%` });
        else if (pct('chest') > 0 && pct('back') < pct('chest') * 0.7) {
            picks.push({ score: 60, title: '背和胸練一樣多', why: `背 ${pct('back')}%、胸 ${pct('chest')}%` });
        }
    }
    const logRate = n(nu.log_rate_pct);
    const logged = n(nu.logged_days) ?? 0;
    if (logRate != null && logRate < 50 && logged > 0) {
        picks.push({ score: 55, title: '每天記錄飲食', why: `這個月只記了 ${logged} 天` });
    } else if (logged >= 7) {
        const protein = n(nu.protein_adherence_pct);
        if (protein != null && protein < 80) picks.push({ score: 65, title: '蛋白質吃到目標', why: `平均只達到 ${protein}%` });
    }
    const runs = n(c.run_count) ?? 0;
    if (runs >= 1 && runs <= 3) {
        picks.push({ score: 50, title: '每週跑 2 次', why: `這個月跑了 ${runs} 次` });
    } else if (runs >= 4) {
        const avgKm = (n(c.total_distance_km) ?? 0) / runs;
        const longest = n(c.longest_run_km) ?? 0;
        if (avgKm > 0 && longest < avgKm * 1.5) {
            picks.push({ score: 45, title: '每週排一次長跑', why: `最長一趟 ${longest.toFixed(1)} 公里` });
        }
    }
    const priorities = picks.sort((a, b) => b.score - a.score).slice(0, 3).map(({ title, why }) => ({ title, why }));
    if (!priorities.length) priorities.push({ title: '維持現在的節奏', why: '頻率、部位、飲食都在軌道上' });
    return { verdict, priorities };
}

export default monthlyCoachSummary;
