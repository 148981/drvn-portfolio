/**
 * GymChoiceRow — 預覽面板裡的「訓練地點」
 * 收合時一列：現在算哪一間＋菜單換了幾個；點開選別間／不在健身房／新增一間。
 * 資料與規則都在 hooks/useGymChoice（這裡只畫畫面）。
 */
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MapPin, ChevronRight, Check, Plus, Lock } from 'lucide-react';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import { openPaywall } from '../utils/membership';
import { toZhExerciseName } from '../utils/exerciseNameZh';
import { GYM_CUSTOM_SLOTS, proficiencyOf } from '../utils/gymMemory';

const INK = '#161415';
const SOFT = 'rgba(43,39,34,0.62)';
const FAINT = 'rgba(43,39,34,0.45)';
const HAIR = 'rgba(43,39,34,0.10)';
const CORAL = '#F95C4B';
const EMBER = '#D94030';

const zh = (n) => toZhExerciseName(n) || n;

function autoLine(g) {
    const s = g.detect.status;
    if (s === 'pending') return '定位中…';
    if (s === 'found') return `認出：${g.detectedGym?.name || ''}`;
    if (s === 'unknown') return '附近沒有記過的健身房，練完再問你';
    if (s === 'off') return '菜單照原課表';
    return '拿不到定位，菜單照原課表';
}

function OptionRow({ active, title, sub, tag, onClick }) {
    return (
        <motion.button {...pressProps('row')} onClick={onClick}
            style={{
                width: '100%', minHeight: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 2px',
                background: 'none', border: 'none', borderBottom: `1px solid ${HAIR}`, cursor: 'pointer', textAlign: 'left',
                WebkitTapHighlightColor: 'transparent',
            }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: active ? INK : 'transparent', border: active ? 'none' : `1.5px solid rgba(43,39,34,0.25)` }}>
                {active && <Check size={13} color="#fff" strokeWidth={3} />}
            </span>
            <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                    {tag && <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 800, color: EMBER, border: `1px solid rgba(217,64,48,0.35)`, borderRadius: 99, padding: '1px 7px' }}>{tag}</span>}
                </span>
                {sub && <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: FAINT, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
            </span>
        </motion.button>
    );
}

export default function GymChoiceRow({ g }) {
    const [open, setOpen] = useState(false);
    const [adding, setAdding] = useState(false);
    const [name, setName] = useState('');

    const pick = (v) => { haptic('light'); g.setSel(v); setOpen(false); setAdding(false); };
    const customCount = g.list.filter((x) => x.custom).length;

    const title = g.sel === 'none' ? '不在健身房' : g.gym ? g.gym.name : '自動偵測';
    const sub = g.sel === 'none'
        ? '居家／戶外：不記地點，菜單不換'
        : g.gym
            ? [g.sel === 'auto' ? '定位認出' : '你選的', g.proficiency?.label, g.isCustom ? '器材已記' : null].filter(Boolean).join(' · ')
            : autoLine(g);

    const submitAdd = () => {
        const gym = g.addGym(name);
        if (gym) { haptic('success'); setName(''); setAdding(false); setOpen(false); }
    };

    return (
        <div>
            <motion.button {...pressProps('row')} onClick={() => { haptic('light'); setOpen((o) => !o); }}
                aria-expanded={open}
                style={{
                    width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                    borderRadius: 16, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.6)',
                    cursor: 'pointer', textAlign: 'left', WebkitTapHighlightColor: 'transparent',
                }}>
                <MapPin size={18} color={INK} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 15, fontWeight: 800, color: INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
                    <span style={{ display: 'block', fontSize: 12, fontWeight: 600, color: SOFT, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: SOFT, flexShrink: 0 }}>換</span>
                <ChevronRight size={15} color={FAINT} strokeWidth={2.4}
                    style={{ flexShrink: 0, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .25s cubic-bezier(0.16,1,0.3,1)' }} />
            </motion.button>

            <AnimatePresence initial={false}>
                {open && (
                    <motion.div key="gym-list"
                        initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                        style={{ overflow: 'hidden', marginTop: 8, padding: '2px 12px 0', borderRadius: 16, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.6)' }}>
                        <OptionRow active={g.sel === 'auto'} title="自動偵測" sub={autoLine(g)} onClick={() => pick('auto')} />
                        {g.list.map(({ gym, custom, missingCount }) => {
                            const pf = proficiencyOf(gym);
                            const subLine = custom
                                ? (missingCount ? `記了 ${missingCount} 台沒有的器材` : '器材已記，目前沒有缺的')
                                : [pf ? `${pf.label} · ${pf.sessions} 次` : '還沒在這裡練過', gym.area].filter(Boolean).join(' · ');
                            return (
                                <OptionRow key={gym.id} active={g.sel === gym.id} title={gym.name} sub={subLine}
                                    tag={custom ? '器材已記' : null} onClick={() => pick(gym.id)} />
                            );
                        })}
                        <OptionRow active={g.sel === 'none'} title="不在健身房" sub="居家、戶外：不記地點，菜單不換" onClick={() => pick('none')} />

                        {adding ? (
                            <div style={{ display: 'flex', gap: 8, padding: '10px 0' }}>
                                <input autoFocus value={name} maxLength={24} placeholder="健身房名稱"
                                    onChange={(e) => setName(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') submitAdd(); }}
                                    style={{ flex: 1, minWidth: 0, height: 44, borderRadius: 12, border: `1.5px solid ${INK}`, padding: '0 12px', fontSize: 16, fontWeight: 700, color: INK, background: '#fff', outline: 'none', boxSizing: 'border-box' }} />
                                <motion.button {...pressProps('pill')} onClick={submitAdd} disabled={!name.trim()}
                                    style={{ height: 44, padding: '0 16px', borderRadius: 12, border: 'none', background: name.trim() ? INK : 'rgba(43,39,34,0.15)', color: '#fff', fontSize: 14, fontWeight: 800, cursor: name.trim() ? 'pointer' : 'default' }}>
                                    新增
                                </motion.button>
                            </div>
                        ) : (
                            <motion.button {...pressProps('row')} onClick={() => { haptic('light'); setAdding(true); }}
                                style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 2px', background: 'none', border: 'none', cursor: 'pointer', color: INK, fontSize: 14, fontWeight: 800 }}>
                                <Plus size={16} /> 新增一間
                            </motion.button>
                        )}
                        <div style={{ fontSize: 11, fontWeight: 600, color: FAINT, padding: '2px 2px 4px' }}>
                            {`記器材的健身房 ${customCount}/${GYM_CUSTOM_SLOTS} 間 · 跳過的動作練完會問你這間有沒有`}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* 菜單換了什麼（相對原課表） */}
            {g.swaps.length > 0 && (
                <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 14, background: 'rgba(249,92,75,0.08)', border: '1px solid rgba(249,92,75,0.22)' }}>
                    <div style={{ fontSize: 12, fontWeight: 800, color: EMBER, marginBottom: 4 }}>
                        {g.gym ? `照「${g.gym.name}」的器材換了 ${g.swaps.length} 個動作` : `課表裡有 ${g.swaps.length} 個動作照健身房換過`}
                    </div>
                    {g.swaps.map((s, i) => (
                        <div key={`${s.from}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 6, fontSize: 13, fontWeight: 600, color: INK, padding: '3px 0' }}>
                            <span style={{ color: SOFT, textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '42%' }}>{zh(s.from)}</span>
                            <span style={{ color: CORAL, fontWeight: 900 }}>→</span>
                            <span style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>{zh(s.to)}</span>
                        </div>
                    ))}
                </div>
            )}
            {g.gym && g.member && !g.isCustom && g.swaps.length === 0 && (
                <div style={{ marginTop: 8, fontSize: 12, fontWeight: 600, color: FAINT }}>這間還沒記缺哪些器材，菜單照原課表</div>
            )}
            {g.lockedChanges > 0 && (
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: SOFT, lineHeight: 1.5 }}>{`這間缺的器材會影響 ${g.lockedChanges} 個動作`}</span>
                    <motion.button {...pressProps('pill')} onClick={() => { haptic('light'); openPaywall('placePlans'); }}
                        style={{ flexShrink: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px', borderRadius: 999, border: `1px solid ${HAIR}`, background: 'rgba(255,255,255,0.6)', cursor: 'pointer', fontSize: 13, fontWeight: 800, color: INK }}>
                        <Lock size={13} color={INK} /> 自動換菜單
                    </motion.button>
                </div>
            )}
        </div>
    );
}
