/**
 * GymSessionSheet — 訓練結束時的健身房問題卡（由 hooks/useGymSession 決定要不要出現）
 * ─────────────────────────────────────────────────────────────
 * 最多三段，只出現需要的那幾段：
 *   ① 在哪練？      第一次來的地方：附近健身房（Apple 地圖）／自己取名／不是健身房
 *   ② 跳過的動作    器材在這間還不知道有沒有的：「這間沒有」→ 挑之後改做什麼
 *   ③ 換掉哪一間    要記住器材、但客製名額（3 間）滿了
 * 一顆「完成」送出。右上角關掉＝這次不記（下次還會問）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X, Check, MapPin } from 'lucide-react';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { toZhExerciseName } from '../utils/exerciseNameZh';
import { substitutesAtGym } from '../utils/gymMemory';

const INK = '#161415';
const PAPER = '#F6F4F1';
const CORAL = '#F95C4B';
const MUTED = 'rgba(22,20,21,0.45)';
const HAIR = 'rgba(22,20,21,0.08)';

const zh = (n) => toZhExerciseName(n) || n;
const MATCH_M = 150;   // 最近的健身房在這個距離內 → 預設選它

function Pill({ on, children, onClick, style }) {
    return (
        <motion.button {...pressProps('pill')} onClick={() => { haptic('light'); onClick(); }}
            style={{
                minHeight: 44, padding: '0 16px', borderRadius: 999, fontSize: 14, fontWeight: 800,
                border: `1.5px solid ${on ? INK : HAIR}`, background: on ? INK : 'rgba(22,20,21,0.03)',
                color: on ? PAPER : INK, cursor: 'pointer', whiteSpace: 'nowrap', ...style,
            }}>
            {children}
        </motion.button>
    );
}

const Kicker = ({ children }) => (
    <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: MUTED, margin: '26px 0 10px' }}>{children}</div>
);

export default function GymSessionSheet({ review, userId, onDone }) {
    const open = !!review;
    const places = useMemo(() => (review?.places || []).slice(0, 5), [review]);
    const [placeIdx, setPlaceIdx] = useState(() => (places[0] && places[0].distance <= MATCH_M ? 0 : -1));
    const [name, setName] = useState('');
    const [answers, setAnswers] = useState({});          // stationId → { missing, from, swapTo }
    const [replaceId, setReplaceId] = useState(null);    // null＝還沒選；'none'＝這次不記

    // 每次打開都從頭來：最近的健身房在 150 公尺內 → 預設選它
    useEffect(() => {
        if (!review) return;
        setPlaceIdx(places[0] && places[0].distance <= MATCH_M ? 0 : -1);
        setName(''); setAnswers({}); setReplaceId(null);
    }, [review, places]);

    const needPlace = open && !review.gymId;
    const asks = review?.asks || [];
    const anyMissing = Object.values(answers).some((a) => a.missing);
    const needSlot = anyMissing && !review?.isCustom && review?.slotsFull;

    const gymLike = useMemo(() => {
        // 還沒建檔的新地方：用「剛說沒有的器材」當條件挑替代
        const miss = {};
        Object.entries(answers).forEach(([id, a]) => { if (a.missing) miss[id] = 1; });
        return { missing: miss, usage: {} };
    }, [answers]);

    const setAnswer = (ask, missing) => {
        setAnswers((prev) => {
            const next = { ...prev };
            if (missing) {
                const subs = substitutesAtGym(ask.name, { ...gymLike, missing: { ...gymLike.missing, [ask.station.id]: 1 } }, userId, 3);
                next[ask.station.id] = { missing: true, from: ask.name, swapTo: subs[0]?.name || null, subs };
            } else {
                next[ask.station.id] = { missing: false, from: ask.name };
            }
            return next;
        });
    };

    const needSlotPick = needSlot && !replaceId;   // 名額滿了、還沒選換掉哪一間 → 先選，不然剛說的「沒有」會記不住
    /* 新地方：器材答了，卻沒選附近的健身房也沒取名 → 以前照樣送出成 skip，剛答的全部默默丟掉。
       先擋下來叫他選或取名（不想記，右上角 X／「不是在健身房」一樣可以走）。 */
    const needPlacePick = needPlace && Object.keys(answers).length > 0 && placeIdx < 0 && !name.trim();
    const blocked = needSlotPick || needPlacePick;
    const submit = () => {
        if (blocked) { haptic('heavy'); return; }
        haptic('success');
        let place;
        if (!needPlace) place = { kind: 'known' };
        else if (name.trim()) place = { kind: 'named', name: name.trim(), poi: places[placeIdx] || null };
        else if (placeIdx >= 0) place = { kind: 'poi', name: places[placeIdx].name, poi: places[placeIdx] };
        else place = { kind: 'skip' };
        const clean = {};
        Object.entries(answers).forEach(([id, a]) => { clean[id] = { missing: a.missing, from: a.from, swapTo: a.swapTo || undefined }; });
        const finalAnswers = needSlot && (!replaceId || replaceId === 'none')
            ? Object.fromEntries(Object.entries(clean).filter(([, a]) => !a.missing))   // 不佔名額 → 只記「有」
            : clean;
        onDone({ place, answers: finalAnswers, replaceId: replaceId && replaceId !== 'none' ? replaceId : null });
    };

    const title = needPlace ? '在哪練？' : `${review?.gymName || '這間'}沒有這些器材嗎？`;

    const sheet = (
        <AnimatePresence>
            {open && (
                <motion.div key="gym-sheet-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                    style={{ position: 'fixed', inset: 0, zIndex: 10002, background: 'rgba(22,20,21,0.42)' }}>
                    <motion.div
                        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                        transition={{ duration: 0.36, ease: RISE_EASE }}
                        style={{
                            position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 440, marginInline: 'auto',
                            background: PAPER, color: INK, borderRadius: '28px 28px 0 0', boxSizing: 'border-box',
                            padding: '22px 20px max(20px, env(safe-area-inset-bottom))',
                            maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)', overflowY: 'auto',
                        }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <div style={{ flex: 1, minWidth: 0, fontSize: 22, fontWeight: 900, letterSpacing: '-0.025em' }}>{title}</div>
                            <motion.button {...pressProps('icon')} aria-label="這次不記"
                                onClick={() => { haptic('light'); onDone({ place: { kind: 'skip' } }); }}
                                style={{ width: 44, height: 44, borderRadius: 22, border: 'none', background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                <X size={18} color={INK} />
                            </motion.button>
                        </div>

                        {/* ① 在哪練 */}
                        {needPlace && (<>
                            {places.length > 0 && <Kicker>附近的健身房</Kicker>}
                            {places.map((p, i) => {
                                const on = placeIdx === i;
                                return (
                                    <motion.button key={`${p.name}-${i}`} {...pressProps('row')}
                                        onClick={() => { haptic('light'); setPlaceIdx(on ? -1 : i); }}
                                        style={{
                                            width: '100%', minHeight: 56, marginBottom: 8, padding: '0 16px', borderRadius: 18,
                                            display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', textAlign: 'left',
                                            background: on ? 'rgba(249,92,75,0.08)' : 'rgba(22,20,21,0.03)',
                                            border: `1.5px solid ${on ? CORAL : HAIR}`, color: INK, boxSizing: 'border-box',
                                        }}>
                                        <MapPin size={16} color={on ? CORAL : MUTED} style={{ flexShrink: 0 }} />
                                        <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                                        <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, flexShrink: 0 }}>{p.distance} 公尺</span>
                                        {on && <Check size={16} color={CORAL} style={{ flexShrink: 0 }} />}
                                    </motion.button>
                                );
                            })}
                            <Kicker>{places.length ? '或自己取名' : '幫這間取個名字'}</Kicker>
                            <input value={name} maxLength={24} onChange={(e) => setName(e.target.value)}
                                placeholder={review?.area ? `例如：${review.area.split(' · ')[0]}的健身房` : '例如：公司樓下'}
                                style={{
                                    width: '100%', minWidth: 0, boxSizing: 'border-box', height: 52, borderRadius: 16, padding: '0 16px',
                                    border: `1.5px solid ${HAIR}`, background: '#fff', fontSize: 17, fontWeight: 700, color: INK, outline: 'none',
                                }} />
                            <motion.button {...pressProps('row')}
                                onClick={() => { haptic('light'); onDone({ place: { kind: 'ignore' } }); }}
                                style={{ marginTop: 10, minHeight: 44, padding: 0, border: 'none', background: 'none', fontSize: 14, fontWeight: 800, color: MUTED, cursor: 'pointer' }}>
                                不是在健身房
                            </motion.button>
                        </>)}

                        {/* ② 跳過的動作 */}
                        {asks.length > 0 && (<>
                            <Kicker>{needPlace ? '這些動作沒做，是沒有器材嗎？' : '這些動作沒做'}</Kicker>
                            {asks.map((a) => {
                                const ans = answers[a.station.id];
                                return (
                                    <div key={a.station.id} style={{ padding: 16, borderRadius: 20, background: '#fff', border: `1px solid ${HAIR}`, marginBottom: 10 }}>
                                        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: '-0.01em' }}>{a.station.zh}</div>
                                        <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>{zh(a.name)}</div>
                                        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                                            <Pill on={ans?.missing === true} onClick={() => setAnswer(a, true)}>這間沒有</Pill>
                                            <Pill on={ans?.missing === false} onClick={() => setAnswer(a, false)}>有，沒練</Pill>
                                        </div>
                                        {ans?.missing && ans.subs?.length > 0 && (
                                            <>
                                                <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, margin: '14px 0 8px' }}>之後在這間改做</div>
                                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                                    {ans.subs.map((s) => (
                                                        <Pill key={s.name} on={ans.swapTo === s.name}
                                                            onClick={() => setAnswers((prev) => ({ ...prev, [a.station.id]: { ...prev[a.station.id], swapTo: s.name } }))}>
                                                            {zh(s.name)}
                                                        </Pill>
                                                    ))}
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </>)}

                        {/* ③ 名額滿了 */}
                        {needSlot && (<>
                            <Kicker>{`器材最多記 ${review.slots} 間，換掉哪一間？`}</Kicker>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                {review.customGyms.map((g) => (
                                    <Pill key={g.id} on={replaceId === g.id} onClick={() => setReplaceId(g.id)}>
                                        <span style={{ display: 'inline-block', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', verticalAlign: 'bottom' }}>{g.name}</span>
                                    </Pill>
                                ))}
                                <Pill on={replaceId === 'none'} onClick={() => setReplaceId('none')}>這次不記</Pill>
                            </div>
                        </>)}

                        <motion.button {...pressProps('cta')} onClick={submit}
                            style={{
                                width: '100%', height: 56, marginTop: 26, borderRadius: 18, border: 'none', cursor: 'pointer',
                                background: blocked ? 'rgba(22,20,21,0.12)' : CORAL, color: blocked ? MUTED : '#fff',
                                fontSize: 17, fontWeight: 900, letterSpacing: '-0.01em',
                            }}>
                            {needPlacePick ? '先選或取名這個地方' : needSlotPick ? '先選換掉哪間' : '完成'}
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return typeof document !== 'undefined' ? ReactDOM.createPortal(sheet, document.body) : sheet;
}
