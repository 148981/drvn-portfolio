import './JourneyMaterials.css';
import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { aggregateUserData } from '../utils/growthAchievements';
import { haptic } from '../utils/haptics';
import { reconcileJoinDate, joinDaysFrom } from '../utils/journeyJoinDate';
import { gainedMuscle, lostFat } from '../utils/bodyProgress';

/**
 * JourneySinceCard — 「自從加入 DRVN」旅程總結
 * ─────────────────────────────────────────────────────────────
 * 回答一個問題：「我下載這個 app 之後，到底變了多少？」
 * 資料全部來自真實紀錄（重訓/跑步/InBody/PR），沒有的欄位誠實隱藏；
 * 一筆資料都沒有時整張卡不渲染、不佔版面。
 *
 * 加入日解析優先序：
 *   1. 已落檔的 drvn_join_date_<uid>（首次計算後固定，不漂移）
 *   2. 首次設定精靈 onboarding_<uid>.completed_at
 *   3. 最早一筆 InBody 日期
 *   4. 都沒有 → 以今天落檔
 *
 * 掛載位置：MasterJourneyDashboard 融合計劃區塊下方（訓練旅程的家）。
 */

const JOIN_KEY = (uid) => `drvn_join_date_${uid || 'guest'}`;

function resolveJoinDate(userId) {
    try {
        const cached = localStorage.getItem(JOIN_KEY(userId));
        if (cached) return new Date(cached);

        const candidates = [];
        try {
            const ob = JSON.parse(localStorage.getItem(`onboarding_${userId}`) || 'null');
            if (ob?.completed_at) candidates.push(new Date(ob.completed_at));
        } catch { /* */ }
        try {
            const ib = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
            (Array.isArray(ib) ? ib : []).forEach((r) => {
                const d = new Date(r.measurement_date || r.date || r.created_at || NaN);
                if (!isNaN(d)) candidates.push(d);
            });
        } catch { /* */ }

        const valid = candidates.filter((d) => !isNaN(d) && d.getTime() > 0);
        const join = valid.length
            ? new Date(Math.min(...valid.map((d) => d.getTime())))
            : new Date();
        localStorage.setItem(JOIN_KEY(userId), join.toISOString());
        return join;
    } catch {
        return new Date();
    }
}

function inbodyDelta(userId) {
    try {
        const arr = JSON.parse(localStorage.getItem(`inbody_local_${userId}`) || '[]');
        if (!Array.isArray(arr) || arr.length < 2) return null;
        const sorted = [...arr].sort((a, b) =>
            new Date(a.measurement_date || a.date || a.created_at || 0) -
            new Date(b.measurement_date || b.date || b.created_at || 0));
        // 欄位別名歸一（與營養/健身預測同一套規則）
        const norm = (r) => ({
            smm: Number(r.smm ?? r.skeletal_muscle_mass ?? r.muscle_mass) || null,
            bf: Number(r.body_fat_percent ?? r.body_fat_percentage) || null,
            w: Number(r.weight_kg ?? r.weight) || null,
        });
        const first = norm(sorted[0]);
        const last = norm(sorted[sorted.length - 1]);
        const d = (a, b, digits = 1) =>
            a != null && b != null ? +((b - a).toFixed(digits)) : null;
        return {
            smmDelta: d(first.smm, last.smm),
            bfDelta: d(first.bf, last.bf),
            weightDelta: d(first.w, last.w),
        };
    } catch {
        return null;
    }
}

export default function JourneySinceCard({ userId, appearance = 'default' }) {
    const navigate = useNavigate();
    const { days: initialDays, stats, delta } = useMemo(() => {
        const join = resolveJoinDate(userId);
        const d = Math.max(1, Math.floor((Date.now() - join.getTime()) / 86400000) + 1);
        let agg = {};
        try { agg = aggregateUserData(userId) || {}; } catch { /* */ }
        return { days: d, stats: agg, delta: inbodyDelta(userId) };
    }, [userId]);

    // 📅 天數校正：本機沒有早期落檔（換裝置/清快取）會誤顯「第 1 天」。
    //    背景用「最早一筆真實紀錄」（重訓/有氧/InBody）校正一次並回寫落檔。
    const [days, setDays] = useState(initialDays);
    useEffect(() => { setDays(initialDays); }, [initialDays]);
    useEffect(() => {
        let alive = true;
        reconcileJoinDate(userId)
            .then((join) => { if (alive && join) setDays(joinDaysFrom(join)); })
            .catch(() => { /* 校正失敗 → 沿用本機值 */ });
        return () => { alive = false; };
    }, [userId]);

    // 🔧 2026-07：改為永遠顯示入口 —
    //    之前「本機彙總為 0 就整卡隱藏」導致資料存在後端的使用者永遠看不到這張卡。
    //    沒有可顯示的指標時，改用引導文案佔位，天數照樣累積。
    // 🎨 2026-07-13：拿掉「總負重」格（資訊留給完整進化頁），卡片留 3 格內最乾淨。
    const items = [
        (stats.totalWorkouts || 0) > 0 && { label: '重訓', value: stats.totalWorkouts, unit: '次' },
        (stats.totalKm || 0) > 0 && { label: '累積跑量', value: Math.round(stats.totalKm), unit: 'km' },
        (stats.broke1RM || 0) > 0 && { label: 'PR 突破', value: stats.broke1RM, unit: '次' },
        gainedMuscle(delta?.smmDelta) && {
            label: '骨骼肌', value: `+${delta.smmDelta}`, unit: 'kg', accent: true,
        },
        lostFat(delta?.bfDelta) && {
            label: '體脂率', value: `${delta.bfDelta}`, unit: '%', accent: true,
        },
    ].filter(Boolean).slice(0, 3);

    return (
        <motion.div
            /* ⚠️ 這張卡曾經「點得到但看不見」——整片就是頁面底色，只有最下面那條
               珊瑚細線露出來。原因是它的「可見」綁在入場動畫上：
               initial opacity 0 → animate opacity 1，動畫沒跑完（或根本沒跑）
               就永遠是透明的，而透明的元素照樣吃得到點擊。
               現在一開始就是不透明的，動畫只負責那 14px 的上浮；
               動畫不跑，卡片照樣在。 */
            initial={{ opacity: 1, y: 14 }}
            animate={{ y: 0 }}
            transition={{ duration: 0.55, ease: [0.16, 1, 0.3, 1], delay: 0.2 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => { haptic('light'); navigate('/journey-evolution-mobile'); }}
            className={`mx-4 mt-2 mb-5 cursor-pointer journey-liquid-metal ${appearance === 'paper' ? 'journey-history-card' : ''}`}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); haptic('light'); navigate('/journey-evolution-mobile'); }
            }}
            style={{
                /* Silver-black liquid metal; reflected light stays behind the content. */
                position: 'relative',
            }}
        >
            {/* 📐 2026-08：卡片縮小一階 —— 上方新增「完整計劃」入口卡後，
                這張若維持超大字會與它搶主角。進化日誌降為「回頭看一眼」的尺度：
                字級砍到約一半、內距收緊，資訊照舊、版面不再被吃掉半屏。 */}
            <img className="journey-metal-watermark" src="/desktop/drvn_logo.png" alt="" aria-hidden="true" draggable="false" />
            <span className="journey-metal-rim" aria-hidden="true" />
            <div className="journey-material-content px-5 pt-4 pb-4" style={{ position: 'relative', zIndex: 2 }}>
                {/* kicker 列：部門標 + 完整進化入口 */}
                <div className="flex items-center justify-between mb-3.5">
                    <p className="m-0 text-[12px] font-black"
                        style={{ letterSpacing: '0.12em', color: '#F6F4F1' }}>
                        進化日誌
                    </p>
                    <div className="journey-metal-link flex items-center gap-1" style={{ color: 'rgba(246,244,241,0.78)' }}>
                        <span className="text-[11px] font-bold" style={{ letterSpacing: '0.08em' }}>完整進化</span>
                        <ChevronRight size={13} strokeWidth={2.5} />
                    </div>
                </div>

                {/* 🏆 大膽主角：變強的第 N 天（瑞士極簡，大數字光是主體） */}
                <p className="m-0 mb-0.5 text-[11px] font-bold" style={{ letterSpacing: '0.02em', color: 'rgba(246,244,241,0.78)' }}>
                    變強的第
                </p>
                <div className="flex items-end gap-2">
                    <span style={{
                        fontSize: 'clamp(2.4rem, 12vw, 3.2rem)', fontWeight: 300, lineHeight: 0.88,
                        color: '#FFFFFF', fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                        letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums',
                    }}>{days}</span>
                    <span className="text-[15px] font-bold" style={{ color: 'rgba(246,244,241,0.85)', marginBottom: 3 }}>天</span>
                </div>

                {/* 瑞士 hairline 收筆 */}
                <div className="mt-3" style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                    <div style={{ width: 32, height: 1.5, background: '#F95C4B', opacity: 0.9 }} />
                    <div style={{ flex: 1, height: 1, background: 'rgba(246,244,241,0.22)' }} />
                </div>

                {/* 走過的路：三個真實數字。
                    ⚠️ items 本來算好了卻沒有畫出來 —— 一張叫「進化日誌」的卡，
                    只有天數和一條線，等於什麼都沒說。
                    沒有任何一項有資料就整塊不畫（介面標準 §5：沒資料不留空殼）。 */}
                {items.length > 0 && (
                    <div className="mt-3.5" style={{ display: 'flex', gap: 18 }}>
                        {items.map((it) => (
                            <div key={it.label} style={{ minWidth: 0 }}>
                                <p className="m-0 text-[11px] font-bold"
                                    style={{ letterSpacing: '0.04em', color: 'rgba(246,244,241,0.78)' }}>
                                    {it.label}
                                </p>
                                <p className="m-0 mt-0.5" style={{
                                    fontSize: 17, fontWeight: 400, lineHeight: 1.1,
                                    fontFamily: '"Tenor Sans", "Noto Sans TC", sans-serif',
                                    fontVariantNumeric: 'tabular-nums',
                                    color: it.accent ? '#FFD0BA' : '#FFFFFF',
                                }}>
                                    {it.value}
                                    <span className="text-[11px] font-bold"
                                        style={{ marginLeft: 2, color: 'rgba(246,244,241,0.72)' }}>{it.unit}</span>
                                </p>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </motion.div>
    );
}
