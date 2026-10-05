/**
 * GymMemoryPage — 健身房記憶地圖
 * ─────────────────────────────────────────────────────────────
 * 一頁三樣東西：地圖（你練過的健身房）→ 記住器材的三間 → 其他去過的。
 * 點任何一間開詳細：熟練度、每個部位常用的器材、這間沒有的器材、改名。
 *
 * 紀錄免費；「課表換成這間做得到的」是會員（placePlans），整頁最多一張會員卡。
 * 沒有任何紀錄 → 只有一張動作卡（介面標準 §7），不畫空地圖。
 */
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, X, Pencil, Plus } from 'lucide-react';
import { MapContainer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { mapThemeClass } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import MapAutoResize from './MapAutoResize';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import { FitToPoints, dotIcon, DarkWall, WallHero, WallLabel, GlassCard, MapFrame, HairlineList, PageHead, PAGE_STYLE, quietDangerStyle } from './memory/MemoryKit';
import haptic from '../utils/haptics';
import { confirmDialog } from '../utils/toast';
import { getUserId } from '../utils/auth';
import { uRawKey } from '../utils/userStorage';
import { canUse } from '../utils/membership';
import MemberLockCard from './MemberLockCard';
import {
    loadGymMemory, saveGymMemory, renameGym, forgetGym, proficiencyOf, stationsByMacro,
    customGyms, gymsByRecent, isCustomGym, makeCustomGym, removeCustomGym, markMissing, markAvailable,
    GYM_CUSTOM_SLOTS, GYM_PROFICIENCY, gymLog,
} from '../utils/gymMemory';
import { STATION_ZH, stationZh } from '../utils/gymStations';

const INK = '#161415';
const PAPER = '#F6F4F1';
const CORAL = '#F95C4B';
const MUTED = 'rgba(22,20,21,0.45)';
const HAIR = 'rgba(22,20,21,0.08)';

const ago = (t) => {
    if (!t) return null;
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? '今天' : d === 1 ? '昨天' : d < 30 ? `${d} 天前` : `${Math.floor(d / 30)} 個月前`;
};

function useGymMemory(userId) {
    const [mem, setMem] = useState(() => loadGymMemory(userId));
    useEffect(() => {
        const sync = () => setMem(loadGymMemory(userId));
        window.addEventListener('drvn:gym-memory-changed', sync);
        // 換機還原：本機沒有、雲端有 → 寫回
        import('../utils/cloudSync').then(({ hydrateIfLocalEmpty }) =>
            hydrateIfLocalEmpty(uRawKey(userId, 'gymMemory'), 'gym_memory', (v) => !v || !Object.keys(v.gyms || {}).length))
            .then((applied) => { if (applied) sync(); }).catch(() => {});
        return () => window.removeEventListener('drvn:gym-memory-changed', sync);
    }, [userId]);
    const commit = (next) => { setMem(next); saveGymMemory(userId, next); };
    return [mem, commit];
}

/** 熟練度：現在在哪、下一級在哪，畫在同一條軌道上（介面標準 §6） */
function ProficiencyTrack({ gym }) {
    const pf = proficiencyOf(gym);
    if (!pf) return null;
    const max = GYM_PROFICIENCY[GYM_PROFICIENCY.length - 1].min;
    const pct = Math.min(100, (pf.sessions / max) * 100);
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 26, fontWeight: 300, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{pf.sessions}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>次 · {pf.label}</span>
                {pf.nextLabel && <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: MUTED }}>{`再 ${pf.toNext} 次到${pf.nextLabel}`}</span>}
            </div>
            <div style={{ position: 'relative', height: 8, borderRadius: 99, background: 'rgba(22,20,21,0.07)', marginTop: 10 }}>
                <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, borderRadius: 99, background: CORAL }} />
                {GYM_PROFICIENCY.slice(1).map((p) => (
                    <div key={p.level} style={{ position: 'absolute', top: -3, left: `calc(${(p.min / max) * 100}% - 1px)`, width: 2, height: 14, background: pf.sessions >= p.min ? PAPER : 'rgba(22,20,21,0.25)' }} />
                ))}
            </div>
        </div>
    );
}

function GymDetailSheet({ gym, mem, onChange, onClose }) {
    const [editing, setEditing] = useState(false);
    const [name, setName] = useState(gym?.name || '');
    const [adding, setAdding] = useState(false);
    const [replacing, setReplacing] = useState(false);   // 名額滿：選要換掉哪一間
    useEffect(() => { setName(gym?.name || ''); setEditing(false); setAdding(false); setReplacing(false); }, [gym?.id]);
    if (!gym) return null;
    const custom = isCustomGym(mem, gym.id);
    const slotsFull = customGyms(mem).length >= GYM_CUSTOM_SLOTS;
    const byMacro = stationsByMacro(gym);
    const missing = Object.keys(gym.missing || {});
    const log = gymLog(gym).slice(0, 6);
    const others = customGyms(mem).filter((g) => g.id !== gym.id);
    const addable = Object.keys(STATION_ZH).filter((id) => !missing.includes(id) && !(gym.stations?.[id]?.sets > 0));

    const saveName = () => { if (name.trim()) onChange(renameGym(mem, gym.id, name)); setEditing(false); haptic('success'); };
    const toggleCustom = async () => {
        haptic('medium');
        if (custom) {
            if (missing.length && !(await confirmDialog('不再記住這間的器材？', { confirmText: '不記了' }))) return;
            onChange(removeCustomGym(mem, gym.id));
        } else {
            const r = makeCustomGym(mem, gym.id);
            if (r.ok) onChange(r.mem);
            else if (r.needsReplace) setReplacing(true);   // 三間滿了 → 選一間換掉
        }
    };
    const replaceWith = async (victim) => {
        const n = Object.keys(victim.missing || {}).length;
        if (n && !(await confirmDialog(`不再記「${victim.name}」的器材？`, { confirmText: '換掉' }))) return;
        const r = makeCustomGym(mem, gym.id, victim.id);
        if (r.ok) { haptic('success'); onChange(r.mem); setReplacing(false); }
    };

    return ReactDOM.createPortal(
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(22,20,21,0.4)' }}>
            <motion.div onClick={(e) => e.stopPropagation()}
                initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
                transition={{ duration: 0.36, ease: RISE_EASE }}
                style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0, maxWidth: 440, marginInline: 'auto',
                    background: PAPER, color: INK, borderRadius: '28px 28px 0 0', boxSizing: 'border-box',
                    padding: '22px 20px max(24px, env(safe-area-inset-bottom))',
                    maxHeight: 'calc(100dvh - env(safe-area-inset-top) - 12px)', overflowY: 'auto',
                }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {editing ? (
                        <input autoFocus value={name} maxLength={24} onChange={(e) => setName(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') saveName(); }} onBlur={saveName}
                            style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 12, border: `1.5px solid ${INK}`, padding: '0 14px', fontSize: 19, fontWeight: 900, color: INK, background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
                    ) : (
                        <motion.button {...pressProps('row')} onClick={() => { haptic('light'); setEditing(true); }} aria-label="改名"
                            style={{ flex: 1, minWidth: 0, minHeight: 48, display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 'none', background: 'none', color: INK, cursor: 'pointer', textAlign: 'left' }}>
                            <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.025em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{gym.name}</span>
                            <Pencil size={15} color={MUTED} style={{ flexShrink: 0 }} />
                        </motion.button>
                    )}
                    <motion.button {...pressProps('icon')} onClick={() => { haptic('light'); onClose(); }} aria-label="關閉"
                        style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                        <X size={18} color={INK} />
                    </motion.button>
                </div>
                {gym.area && <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>{gym.area}</div>}

                <div style={{ marginTop: 22 }}><ProficiencyTrack gym={gym} /></div>

                {byMacro.length > 0 && (<>
                    <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, margin: '26px 0 8px' }}>各部位常用器材</div>
                    {byMacro.map((b) => (
                        <div key={b.macro} style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '11px 0', borderBottom: `1px solid ${HAIR}` }}>
                            <span style={{ width: 36, flexShrink: 0, fontSize: 14, fontWeight: 900 }}>{b.zh}</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700 }}>{b.stations.map((s) => s.zh).join(' · ')}</span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, flexShrink: 0 }}>{`${b.stations[0].sets} 組`}</span>
                        </div>
                    ))}
                </>)}

                {log.length > 0 && (<>
                    <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, margin: '26px 0 8px' }}>最近在這裡練</div>
                    {log.map((l, i) => (
                        <div key={l.id || `${l.at}-${i}`} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '10px 0', borderBottom: `1px solid ${HAIR}` }}>
                            <span style={{ width: 64, flexShrink: 0, fontSize: 13, fontWeight: 800 }}>{new Date(l.at).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric' })}</span>
                            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700 }}>
                                {`${l.exercises} 個動作 · ${l.sets} 組${l.volume ? ` · ${l.volume.toLocaleString()} kg` : ''}`}
                            </span>
                            {l.swapped > 0 && <span style={{ fontSize: 11, fontWeight: 700, color: MUTED, flexShrink: 0 }}>{`換了 ${l.swapped} 個`}</span>}
                        </div>
                    ))}
                </>)}

                <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, margin: '26px 0 10px' }}>這間沒有</div>
                {custom ? (<>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {missing.map((id) => (
                            <motion.button key={id} {...pressProps('pill')} aria-label={`${stationZh(id)}其實有`}
                                onClick={() => { haptic('light'); onChange(markAvailable(mem, gym.id, id)); }}
                                style={{ minHeight: 44, padding: '0 12px 0 16px', borderRadius: 999, border: `1.5px solid ${INK}`, background: INK, color: PAPER, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                {stationZh(id)} <X size={14} />
                            </motion.button>
                        ))}
                        <motion.button {...pressProps('pill')} onClick={() => { haptic('light'); setAdding((v) => !v); }}
                            style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1.5px dashed rgba(22,20,21,0.3)`, background: 'none', color: INK, fontSize: 14, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <Plus size={14} /> 加一台
                        </motion.button>
                    </div>
                    {adding && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, padding: 12, borderRadius: 18, background: 'rgba(22,20,21,0.04)' }}>
                            {addable.map((id) => (
                                <motion.button key={id} {...pressProps('pill')}
                                    onClick={() => { haptic('light'); const r = markMissing(mem, gym.id, id); if (r.ok) onChange(r.mem); }}
                                    style={{ minHeight: 44, padding: '0 14px', borderRadius: 999, border: `1px solid ${HAIR}`, background: '#fff', color: INK, fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                                    {stationZh(id)}
                                </motion.button>
                            ))}
                        </div>
                    )}
                    <div style={{ marginTop: 16 }}>
                        {canUse('placePlans')
                            ? (missing.length > 0 && <div style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>在這間練，課表會換成做得到的動作</div>)
                            : <MemberLockCard feature="placePlans" label="課表換成這間做得到的" />}
                    </div>
                </>) : (
                    replacing ? (
                    <div style={{ borderRadius: 18, border: `1px solid ${HAIR}`, background: '#fff', padding: '14px 16px' }}>
                        <div style={{ fontSize: 14, fontWeight: 800 }}>{`器材最多記 ${GYM_CUSTOM_SLOTS} 間，換掉哪一間？`}</div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>被換掉的那間紀錄還在，只是不再記缺哪些器材</div>
                        {others.map((o) => (
                            <motion.button key={o.id} {...pressProps('row')} onClick={() => replaceWith(o)}
                                style={{ width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', border: 'none', borderBottom: `1px solid ${HAIR}`, background: 'none', color: INK, cursor: 'pointer', textAlign: 'left' }}>
                                <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.name}</span>
                                <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, flexShrink: 0 }}>{`缺 ${Object.keys(o.missing || {}).length} 台 · ${ago(o.lastAt) || '還沒練過'}`}</span>
                            </motion.button>
                        ))}
                        <motion.button {...pressProps('pill')} onClick={() => setReplacing(false)}
                            style={{ marginTop: 10, minHeight: 44, padding: '0 14px', borderRadius: 999, border: `1px solid ${HAIR}`, background: 'none', color: INK, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                            先不要
                        </motion.button>
                    </div>
                ) : (
                    <motion.button {...pressProps('card')} onClick={toggleCustom}
                        style={{ width: '100%', minHeight: 56, borderRadius: 18, padding: '0 16px', border: `1px solid ${HAIR}`, background: '#fff', color: INK, fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxSizing: 'border-box' }}>
                        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            記住這間的器材
                            {slotsFull && <span style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>{`已記 ${GYM_CUSTOM_SLOTS} 間，要換掉一間`}</span>}
                        </span>
                        <ChevronRight size={18} color={MUTED} />
                    </motion.button>
                )
                )}

                <div style={{ display: 'flex', gap: 10, marginTop: 28 }}>
                    {custom && (
                        <motion.button {...pressProps('pill')} onClick={toggleCustom}
                            style={{ flex: 1, minHeight: 48, borderRadius: 18, border: `1px solid ${HAIR}`, background: 'none', color: INK, fontSize: 14, fontWeight: 800, cursor: 'pointer' }}>
                            不記器材
                        </motion.button>
                    )}
                    <motion.button {...pressProps('pill')}
                        onClick={async () => {
                            haptic('heavy');
                            if (await confirmDialog(`忘記「${gym.name}」？`, { confirmText: '忘記', danger: true })) { onChange(forgetGym(mem, gym.id)); onClose(); }
                        }}
                        style={{ ...quietDangerStyle, flex: 1 }}>
                        忘記這間
                    </motion.button>
                </div>
            </motion.div>
        </motion.div>,
        document.body,
    );
}

export default function GymMemoryPage() {
    const navigate = useNavigate();
    const userId = getUserId();
    const [mem, commit] = useGymMemory(userId);
    const [openId, setOpenId] = useState(null);

    const custom = useMemo(() => customGyms(mem), [mem]);
    const all = useMemo(() => gymsByRecent(mem), [mem]);
    const others = useMemo(() => all.filter((g) => !mem.custom.includes(g.id)), [all, mem]);
    const pins = useMemo(() => all.filter((g) => Number.isFinite(g.lat) && Number.isFinite(g.lng)), [all]);
    const points = useMemo(() => pins.map((g) => [g.lat, g.lng]), [pins]);
    const totalSessions = all.reduce((s, g) => s + (g.sessions || 0), 0);

    return (
        <div style={{ minHeight: '100dvh', background: PAPER, color: INK }}>
            <div style={PAGE_STYLE}>
                <PageHead title="健身房記憶" onBack={() => navigate(-1)} />

                {all.length === 0 ? (
                    <motion.button {...pressProps('card')} onClick={() => { haptic('light'); navigate('/luxury-plan-view-mobile'); }}
                        style={{ width: '100%', minHeight: 64, borderRadius: 24, padding: '0 18px', border: `1px solid ${HAIR}`, background: 'rgba(22,20,21,0.04)', color: INK, fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxSizing: 'border-box', textAlign: 'left' }}>
                        <span>去練一次</span>
                        <ChevronRight size={18} color={CORAL} />
                    </motion.button>
                ) : (<>
                    {/* 深色拉絲鈦牆：總次數（這頁唯一的珊瑚焦點，深色上用 Ember）＋記住器材的健身房（液態玻璃浮在牆上） */}
                    <DarkWall ambient="warm">
                        <WallHero kicker="All time" meta={`${all.length} 間健身房`} value={totalSessions} unit="次訓練" accent />
                        {custom.length > 0 && (<>
                            <WallLabel title="記住器材的健身房" meta={`${custom.length} / ${GYM_CUSTOM_SLOTS}`} />
                            {custom.map((g, i) => {
                                const pf = proficiencyOf(g);
                                const miss = Object.keys(g.missing || {}).length;
                                return (
                                    <GlassCard key={g.id} index={i} title={g.name} onClick={() => setOpenId(g.id)}
                                        cols={[
                                            { label: '次數', value: g.sessions || 0 },
                                            { label: '熟練度', value: pf?.label || '—' },
                                            { label: '沒有', value: miss ? `${miss} 台` : '都有' },
                                        ]} />
                                );
                            })}
                        </>)}
                    </DarkWall>

                    {pins.length > 0 && (
                        <MapFrame legend={[
                            { label: '記住器材', swatch: { background: INK } },
                            ...(others.length ? [{ label: '去過', swatch: { background: '#fff', border: `2.5px solid ${INK}`, boxSizing: 'border-box' } }] : []),
                        ]}>
                            <MapContainer className={mapThemeClass('light')} center={points[0]} zoom={13}
                                style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false} zoomSnap={0.25}>
                                <MapAutoResize />
                                <FitToPoints points={points} />
                                <DrvnTileLayer style="minimal" />
                                {pins.map((g) => (
                                    <Marker key={g.id} position={[g.lat, g.lng]} icon={dotIcon(mem.custom.includes(g.id) ? 'solid' : 'hollow')}
                                        eventHandlers={{ click: () => { haptic('light'); setOpenId(g.id); } }} />
                                ))}
                            </MapContainer>
                        </MapFrame>
                    )}

                    <HairlineList title={custom.length ? '其他去過的' : '去過的健身房'} items={others.map((g) => {
                        const pf = proficiencyOf(g);
                        return {
                            key: g.id, title: g.name, onClick: () => setOpenId(g.id),
                            sub: [pf ? `${pf.label} · ${pf.sessions} 次` : null, ago(g.lastAt)].filter(Boolean).join(' · '),
                        };
                    })} />
                </>)}
            </div>

            <AnimatePresence>
                {openId && mem.gyms[openId] && (
                    <GymDetailSheet key={openId} gym={mem.gyms[openId]} mem={mem} onChange={commit} onClose={() => setOpenId(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}
