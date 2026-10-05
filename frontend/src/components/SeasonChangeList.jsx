/**
 * SeasonChangeList / SeasonAppliedSheet — 換季「改了什麼」
 * ─────────────────────────────────────────────────────────────
 * 每一列：動作名稱 → 從幾到幾（舊的淡、新的深）→ 為什麼（依紀錄的才有）。
 * 資料來自 diffSeasonPlans（新舊課表直接比對），預告跟套用後看到的是同一份。
 */
import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ChevronRight, Search, RotateCcw } from 'lucide-react';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import haptic from '../utils/haptics';
import { clipNames, redesignChangeCount } from '../utils/planRedesignDiff';

const INK = '#161415';
const PAPER = '#F6F4F1';
const MUTED = 'rgba(22,20,21,0.45)';
const HAIR = 'rgba(22,20,21,0.08)';
const CORAL = '#F95C4B';   // 換成的新動作：珊瑚色標出來

export function SeasonChangeList({ rows = [], limit = 5, onSwap = null }) {
    const [all, setAll] = useState(false);
    const shown = all ? rows : rows.slice(0, limit);
    return (
        <div>
            {shown.map((r, i) => (
                <div key={r.name + i} style={{ padding: '10px 0', borderTop: i ? `1px solid ${HAIR}` : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</span>
                        {r.why && <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: MUTED }}>{r.why}</span>}
                    </div>
                    {r.parts.map((p) => (
                        <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, fontVariantNumeric: 'tabular-nums', minHeight: p.label === '換成' && onSwap ? 44 : undefined }}>
                            <span style={{ width: 32, flexShrink: 0, fontSize: 12, fontWeight: 700, color: MUTED }}>{p.label}</span>
                            <span style={{ fontSize: 14, color: MUTED, textDecoration: p.label === '換成' ? 'none' : 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.from}</span>
                            <span style={{ fontSize: 13, color: MUTED }}>→</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: p.label === '換成' ? CORAL : INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{p.to}</span>
                            {/* 換成什麼可以自己挑：推薦清單 ＋ 動作庫 */}
                            {p.label === '換成' && onSwap && (
                                <motion.button {...pressProps('pill')} onClick={() => { haptic('light'); onSwap(r); }}
                                    style={{ marginLeft: 'auto', flexShrink: 0, minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1.5px solid ${INK}`, background: 'transparent', color: INK, fontSize: 13, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}>
                                    換別的 <ChevronRight size={14} />
                                </motion.button>
                            )}
                        </div>
                    ))}
                </div>
            ))}
            {rows.length > limit && (
                <motion.button {...pressProps('row')} onClick={() => { haptic('light'); setAll((v) => !v); }}
                    style={{ width: '100%', minHeight: 44, border: 'none', background: 'none', color: INK, fontSize: 14, fontWeight: 800, cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                    {all ? '收起' : `看全部 ${rows.length} 項`}
                </motion.button>
            )}
        </div>
    );
}

/* 換部位重排的摘要列：標籤 ＋ 從什麼（淡、刪除線）→ 到什麼（深） */
function DiffLine({ label, from, to, toColor = INK }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 36, fontVariantNumeric: 'tabular-nums' }}>
            <span style={{ width: 40, flexShrink: 0, fontSize: 13, fontWeight: 700, color: MUTED }}>{label}</span>
            {from != null && <span style={{ fontSize: 14, color: MUTED, textDecoration: 'line-through', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{from}</span>}
            {from != null && <span style={{ fontSize: 13, color: MUTED }}>→</span>}
            <span style={{ fontSize: 15, fontWeight: 800, color: toColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{to}</span>
        </div>
    );
}

/** 名單：前 3 個 ＋「還有 N 個」，點一下展開全部 */
function NameLine({ label, names, color }) {
    const [all, setAll] = useState(false);
    if (!names?.length) return null;
    const { text } = clipNames(names, 3);
    const more = names.length > 3;
    return (
        <motion.button {...pressProps('row')} disabled={!more} onClick={() => { haptic('light'); setAll((v) => !v); }}
            style={{ width: '100%', minHeight: 44, display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px 0', border: 'none', background: 'transparent', cursor: more ? 'pointer' : 'default', textAlign: 'left' }}>
            <span style={{ width: 40, flexShrink: 0, fontSize: 13, fontWeight: 700, color: MUTED, lineHeight: '22px' }}>{label}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, color, lineHeight: 1.45 }}>
                {all ? names.join('、') : text}
            </span>
        </motion.button>
    );
}

/** 換部位重排：新舊整份比對（planRedesignDiff.summarizeRedesign 的結果） */
function RedesignSummary({ s }) {
    if (!s) return <div style={{ fontSize: 15, fontWeight: 700, color: INK, minHeight: 44, display: 'flex', alignItems: 'center' }}>新計劃已啟用，從第 1 週開始</div>;
    if (!redesignChangeCount(s)) return <div style={{ fontSize: 15, fontWeight: 700, color: INK, minHeight: 44, display: 'flex', alignItems: 'center' }}>跟上一季的課表一樣，從第 1 週重新開始</div>;
    return (
        <div>
            {s.overview.map((o) => <DiffLine key={o.label} label={o.label} from={o.from} to={o.to} />)}
            {s.muscles.map((m) => (
                <DiffLine key={m.tag} label={m.label} from={`每週 ${m.from} 組`} to={`${m.to} 組`} toColor={m.to > m.from ? CORAL : INK} />
            ))}
            {(s.overview.length > 0 || s.muscles.length > 0) && (s.added.length > 0 || s.removed.length > 0) && (
                <div style={{ height: 1, background: HAIR, margin: '6px 0' }} />
            )}
            <NameLine label="新加" names={s.added} color={CORAL} />
            <NameLine label="拿掉" names={s.removed} color={MUTED} />
        </div>
    );
}

/** 套用完成：新一季開始了、課表改了這些 —— 按下去之後一定要看到結果。
 *  原地換季（rows：逐項比對）跟換部位重排（kind:'redesign'：整份比對）共用這一張。 */
export function SeasonAppliedSheet({ open, applied, onClose }) {
    const rows = applied?.rows || [];
    const isRedesign = applied?.kind === 'redesign';
    const s = isRedesign ? applied?.redesign || null : null;
    const sub = isRedesign
        ? '換部位重排 · 新計劃已啟用'
        : rows.length ? `${applied?.label} · 課表改了 ${rows.length} 項` : `${applied?.label} · 課表照舊`;
    const ui = (
        <AnimatePresence>
            {open && applied && (
                <motion.div key="season-applied" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                    style={{ position: 'fixed', inset: 0, zIndex: 100002, background: 'rgba(22,20,21,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <motion.div onClick={(e) => e.stopPropagation()}
                        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                        transition={{ duration: 0.36, ease: RISE_EASE }}
                        style={{ width: '100%', maxWidth: 480, background: PAPER, color: INK, borderRadius: '28px 28px 0 0', boxSizing: 'border-box',
                            padding: '24px 18px max(22px, env(safe-area-inset-bottom))', maxHeight: '86dvh', overflowY: 'auto' }}>
                        {/* 主角：新一季開始了（深色鈦金屬圓章 ＋ 大標） */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '0 4px' }}>
                            <span className="ti-surface-dark" style={{ width: 48, height: 48, borderRadius: 999, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <Check size={22} color={PAPER} strokeWidth={3} />
                            </span>
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.01em' }}>第 {applied.season} 季開始了</div>
                                <div style={{ fontSize: 14, fontWeight: 600, color: MUTED, marginTop: 2 }}>{sub}</div>
                            </div>
                        </div>
                        {/* 改了什麼：內容層液態玻璃 */}
                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.12, ease: RISE_EASE }}
                            style={{ marginTop: 16, padding: '12px 16px', borderRadius: 22,
                                background: 'linear-gradient(160deg, rgba(255,255,255,0.86) 0%, rgba(240,243,247,0.62) 100%)',
                                backdropFilter: 'blur(20px) saturate(160%)', WebkitBackdropFilter: 'blur(20px) saturate(160%)',
                                border: '1px solid rgba(255,255,255,0.9)', boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.9), 0 8px 22px rgba(40,42,50,0.06)' }}>
                            <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>{isRedesign ? '跟上一季比' : '改了什麼'}</div>
                            {isRedesign
                                ? <RedesignSummary s={s} />
                                : rows.length
                                    ? <SeasonChangeList rows={rows} limit={6} />
                                    : <div style={{ fontSize: 15, fontWeight: 700, minHeight: 44, display: 'flex', alignItems: 'center' }}>從第 1 週重新開始，動作跟組數都不變</div>}
                        </motion.div>
                        {/* 一份計劃、不是每間健身房各一份：照主場排，到別間開始前才臨時換 */}
                        {!isRedesign && (
                            <div style={{ marginTop: 12, padding: '0 4px', fontSize: 13, fontWeight: 600, color: MUTED, lineHeight: 1.5 }}>
                                {applied.homeGymName
                                    ? `這份課表照「${applied.homeGymName}」的器材排。到別間練時，開始前會照那間有的器材自動換，課表本身不變。`
                                    : '這份課表只有一份。到記過器材的健身房練時，開始前會照那間有的器材自動換。'}
                            </div>
                        )}
                        <motion.button {...pressProps('cta')} onClick={() => { haptic('light'); onClose(); }}
                            className="ti-surface-dark"
                            style={{ width: '100%', minHeight: 56, marginTop: 18, borderRadius: 18, color: PAPER, fontSize: 16, fontWeight: 800, cursor: 'pointer' }}>
                            看今天的課
                        </motion.button>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return typeof document !== 'undefined' ? ReactDOM.createPortal(ui, document.body) : ui;
}

/**
 * 換成什麼：推薦清單（跟換季同一支推薦，同部位、同器材範圍、健身房沒有的器材不推）
 * ＋「不換，保留原本的」＋「從動作庫挑」。
 */
export function SwapChooserSheet({ open, fromName, currentName, options = [], onPick, onLibrary, onClose }) {
    const ui = (
        <AnimatePresence>
            {open && (
                <motion.div key="swap-chooser" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                    style={{ position: 'fixed', inset: 0, zIndex: 2147483640, background: 'rgba(22,20,21,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                    <motion.div onClick={(e) => e.stopPropagation()}
                        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                        transition={{ duration: 0.32, ease: RISE_EASE }}
                        style={{ width: '100%', maxWidth: 480, background: PAPER, color: INK, borderRadius: '28px 28px 0 0', boxSizing: 'border-box',
                            padding: '22px 22px max(22px, env(safe-area-inset-bottom))', maxHeight: '86dvh', overflowY: 'auto' }}>
                        <div style={{ fontSize: 22, fontWeight: 800 }}>「{fromName}」換成</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: MUTED, marginTop: 2 }}>依你這份計劃的器材範圍推薦</div>
                        <div style={{ marginTop: 14 }}>
                            {options.map((o) => {
                                const on = o.name === currentName;
                                return (
                                    <motion.button key={o.nameEn || o.name} {...pressProps('row')} onClick={() => { haptic('light'); onPick(o); }}
                                        style={{ width: '100%', minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', marginBottom: 8, borderRadius: 18, cursor: 'pointer', textAlign: 'left',
                                            background: on ? INK : '#fff', color: on ? PAPER : INK, border: on ? 'none' : `1px solid ${HAIR}` }}>
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{ display: 'block', fontSize: 16, fontWeight: 800 }}>{o.name}</span>
                                            {o.why && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, opacity: 0.6, marginTop: 2 }}>{o.why}</span>}
                                        </span>
                                        {on && <Check size={18} strokeWidth={3} />}
                                    </motion.button>
                                );
                            })}
                            {!options.length && <div style={{ fontSize: 14, fontWeight: 700, color: MUTED, padding: '8px 0' }}>這個器材範圍沒有其他同部位的動作，可以從動作庫挑</div>}
                        </div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                            <motion.button {...pressProps('row')} onClick={() => { haptic('light'); onPick(null); }}
                                style={{ flex: 1, minHeight: 48, borderRadius: 16, border: `1px solid ${HAIR}`, background: 'transparent', color: INK, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <RotateCcw size={15} /> 不換
                            </motion.button>
                            <motion.button {...pressProps('row')} onClick={() => { haptic('light'); onLibrary(); }}
                                style={{ flex: 2, minHeight: 48, borderRadius: 16, border: `1.5px solid ${INK}`, background: 'transparent', color: INK, fontSize: 14, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                                <Search size={15} /> 從動作庫挑
                            </motion.button>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
    return typeof document !== 'undefined' ? ReactDOM.createPortal(ui, document.body) : ui;
}

export default SeasonChangeList;
