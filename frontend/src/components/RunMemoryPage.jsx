/**
 * RunMemoryPage — 跑步記憶：你在哪裡跑、常跑哪幾條路線
 * ─────────────────────────────────────────────────────────────
 * 地圖（跑點＋常跑路線）→ 常跑路線（次數、最快配速）→ 跑點（類型、次數、適合的課）。
 * 點任何一個開詳細：改名、改地點類型、忘記。
 * 紀錄免費；「在這裡把適合的課排前面」是會員（placePlans），整頁最多一張會員卡。
 * 沒有任何紀錄 → 只有一張動作卡（介面標準 §7）。
 */
import React, { useEffect, useMemo, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, X, Pencil } from 'lucide-react';
import { MapContainer, Marker, Polyline } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { mapThemeClass } from '../utils/mapTiles';
import DrvnTileLayer from './DrvnTileLayer';
import MapAutoResize from './MapAutoResize';
import { pressProps, RISE_EASE } from '../utils/nutritionMotion';
import { FitToPoints, dotIcon, DarkWall, WallHero, WallLabel, GlassCard, MapFrame, StatCols, HairlineList, PageHead, PAGE_STYLE, quietDangerStyle } from './memory/MemoryKit';
import haptic from '../utils/haptics';
import { confirmDialog } from '../utils/toast';
import { getUserId } from '../utils/auth';
import { uRawKey } from '../utils/userStorage';
import { canUse } from '../utils/membership';
import MemberLockCard from './MemberLockCard';
import {
    loadRunMemory, saveRunMemory, frequentRoutes, runPlacesByRecent, renameRunPlace, setRunPlaceKind,
    forgetRunPlace, renameRoute, forgetRoute, runPlaceProficiency, suitedCourses, paceLabel,
    RUN_KINDS, COURSE_ZH,
} from '../utils/runMemory';

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

function useRunMemory(userId) {
    const [mem, setMem] = useState(() => loadRunMemory(userId));
    useEffect(() => {
        const sync = () => setMem(loadRunMemory(userId));
        window.addEventListener('drvn:run-memory-changed', sync);
        import('../utils/cloudSync').then(({ hydrateIfLocalEmpty }) =>
            hydrateIfLocalEmpty(uRawKey(userId, 'runMemory'), 'run_memory', (v) => !v || !Object.keys(v.places || {}).length))
            .then((applied) => { if (applied) sync(); }).catch(() => {});
        return () => window.removeEventListener('drvn:run-memory-changed', sync);
    }, [userId]);
    const commit = (next) => { setMem(next); saveRunMemory(userId, next); };
    return [mem, commit];
}

function Sheet({ children, onClose }) {
    return ReactDOM.createPortal(
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
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
                {children}
            </motion.div>
        </motion.div>,
        document.body,
    );
}

function NameRow({ name, onRename, onClose }) {
    const [editing, setEditing] = useState(false);
    const [val, setVal] = useState(name);
    const save = () => { if (val.trim() && val.trim() !== name) { onRename(val); haptic('success'); } setEditing(false); };
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {editing ? (
                <input autoFocus value={val} maxLength={24} onChange={(e) => setVal(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') save(); }} onBlur={save}
                    style={{ flex: 1, minWidth: 0, height: 48, borderRadius: 12, border: `1.5px solid ${INK}`, padding: '0 14px', fontSize: 19, fontWeight: 900, color: INK, background: '#fff', boxSizing: 'border-box', outline: 'none' }} />
            ) : (
                <motion.button {...pressProps('row')} onClick={() => { haptic('light'); setEditing(true); }} aria-label="改名"
                    style={{ flex: 1, minWidth: 0, minHeight: 48, display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 'none', background: 'none', color: INK, cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ fontSize: 22, fontWeight: 900, letterSpacing: '-0.025em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{name}</span>
                    <Pencil size={15} color={MUTED} style={{ flexShrink: 0 }} />
                </motion.button>
            )}
            <motion.button {...pressProps('icon')} onClick={() => { haptic('light'); onClose(); }} aria-label="關閉"
                style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'rgba(22,20,21,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}>
                <X size={18} color={INK} />
            </motion.button>
        </div>
    );
}

function ForgetButton({ label, onForget }) {
    return (
        <motion.button {...pressProps('pill')}
            onClick={async () => { haptic('heavy'); if (await confirmDialog(`忘記「${label}」？`, { confirmText: '忘記', danger: true })) onForget(); }}
            style={{ ...quietDangerStyle, width: '100%', marginTop: 28 }}>
            忘記
        </motion.button>
    );
}

function PlaceSheet({ place, mem, onChange, onClose }) {
    const pf = runPlaceProficiency(place);
    const suits = suitedCourses(place);
    const topType = Object.entries(place.types || {}).sort((a, b) => b[1] - a[1])[0];
    const placeRoutes = useMemo(() => Object.values(mem.routes || {}).filter((r) => r.placeId === place.id && r.path?.length > 1), [mem, place.id]);
    const placePts = useMemo(() => [[place.lat, place.lng], ...placeRoutes.flatMap((r) => r.path.map((q) => [q.lat, q.lng]))], [place.lat, place.lng, placeRoutes]);
    return (
        <Sheet onClose={onClose}>
            <NameRow key={place.id} name={place.name} onRename={(n) => onChange(renameRunPlace(mem, place.id, n))} onClose={onClose} />
            {place.area && place.area !== place.name && <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>{place.area}</div>}
            {Number.isFinite(place.lat) && Number.isFinite(place.lng) && (
                <div style={{ marginTop: 16 }}>
                    <MapFrame height={148} radius={20} gap={0}>
                        <MapContainer className={mapThemeClass('light')} center={[place.lat, place.lng]} zoom={15} zoomSnap={0.25}
                            style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
                            <MapAutoResize />
                            <FitToPoints points={placePts} maxZoom={16} bottomPad={28} />
                            <DrvnTileLayer style="minimal" />
                            {placeRoutes.map((r) => <Polyline key={r.id} positions={r.path.map((q) => [q.lat, q.lng])} color={INK} weight={3} opacity={0.55} />)}
                            <Marker position={[place.lat, place.lng]} icon={dotIcon('coral')} />
                        </MapContainer>
                    </MapFrame>
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 20 }}>
                <span style={{ fontSize: 44, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{place.totalKm.toFixed(1)}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>公里</span>
                <span style={{ marginLeft: 'auto', fontSize: 12, fontWeight: 600, color: MUTED }}>
                    {[pf ? `${pf.label} · ${pf.sessions} 次` : null, topType ? `最常${COURSE_ZH[topType[0]] || '跑'}` : null].filter(Boolean).join(' · ')}
                </span>
            </div>
            <div style={{ fontSize: 12, fontWeight: 800, color: MUTED, margin: '24px 0 10px' }}>這裡是</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(RUN_KINDS).map(([k, v]) => {
                    const on = place.kind === k;
                    return (
                        <motion.button key={k} {...pressProps('pill')} onClick={() => { haptic('light'); onChange(setRunPlaceKind(mem, place.id, k)); }}
                            style={{ minHeight: 44, padding: '0 16px', borderRadius: 999, fontSize: 14, fontWeight: 800, cursor: 'pointer', border: `1.5px solid ${on ? INK : HAIR}`, background: on ? INK : 'rgba(22,20,21,0.03)', color: on ? PAPER : INK }}>
                            {v.zh}
                        </motion.button>
                    );
                })}
            </div>
            {suits.length > 0 && (
                <div style={{ marginTop: 16 }}>
                    {canUse('placePlans')
                        ? <div style={{ fontSize: 14, fontWeight: 800 }}>{`在這裡先排${suits.map((id) => COURSE_ZH[id]).join('、')}`}</div>
                        : <MemberLockCard feature="placePlans" label="在這裡先排適合的課" />}
                </div>
            )}
            <ForgetButton label={place.name} onForget={() => { onChange(forgetRunPlace(mem, place.id)); onClose(); }} />
        </Sheet>
    );
}

function RouteSheet({ route, mem, onChange, onClose }) {
    const path = useMemo(() => (route.path || []).map((q) => [q.lat, q.lng]), [route]);
    const place = route.placeId ? mem.places?.[route.placeId] : null;
    return (
        <Sheet onClose={onClose}>
            <NameRow key={route.id} name={route.name} onRename={(n) => onChange(renameRoute(mem, route.id, n))} onClose={onClose} />
            {place?.name && place.name !== route.name && <div style={{ fontSize: 12, fontWeight: 600, color: MUTED, marginTop: 2 }}>{place.name}</div>}
            {/* 這條路線本身就是詳情頁的珊瑚焦點 */}
            {path.length > 1 && (
                <div style={{ marginTop: 16 }}>
                    <MapFrame height={168} radius={20} gap={0}>
                        <MapContainer className={mapThemeClass('light')} center={path[0]} zoom={14} zoomSnap={0.25}
                            style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false}>
                            <MapAutoResize />
                            <FitToPoints points={path} maxZoom={16} bottomPad={28} />
                            <DrvnTileLayer style="minimal" />
                            <Polyline positions={path} color={CORAL} weight={5} opacity={0.95} />
                            <Marker position={path[0]} icon={dotIcon('solid')} />
                        </MapContainer>
                    </MapFrame>
                </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 20 }}>
                <span style={{ fontSize: 44, fontWeight: 300, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{paceLabel(route.bestPaceSec) || '—'}</span>
                <span style={{ fontSize: 14, fontWeight: 800 }}>最快配速</span>
            </div>
            <StatCols size={21} rule="16px 0 10px" cols={[
                { label: '距離', value: `${route.distanceKm.toFixed(2)} 公里` },
                { label: '次數', value: `${route.runs}` },
                { label: '最近', value: ago(route.lastAt) || '—' },
            ]} />
            <ForgetButton label={route.name} onForget={() => { onChange(forgetRoute(mem, route.id)); onClose(); }} />
        </Sheet>
    );
}

export default function RunMemoryPage() {
    const navigate = useNavigate();
    const userId = getUserId();
    const [mem, commit] = useRunMemory(userId);
    const [open, setOpen] = useState(null);    // { kind:'place'|'route', id }

    const routes = useMemo(() => frequentRoutes(mem), [mem]);
    const places = useMemo(() => runPlacesByRecent(mem), [mem]);
    const pins = useMemo(() => places.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng)), [places]);
    const topRoute = routes[0] || null;
    const points = useMemo(() => [
        ...pins.map((p) => [p.lat, p.lng]),
        ...routes.flatMap((r) => (r.path || []).map((q) => [q.lat, q.lng])),
    ], [pins, routes]);
    const totalKm = places.reduce((s, p) => s + (p.totalKm || 0), 0);
    const runs = places.reduce((s, p) => s + (p.sessions || 0), 0);

    return (
        <div style={{ minHeight: '100dvh', background: PAPER, color: INK }}>
            <div style={PAGE_STYLE}>
                <PageHead title="跑步記憶" onBack={() => navigate(-1)} />

                {places.length === 0 ? (
                    <motion.button {...pressProps('card')} onClick={() => { haptic('light'); navigate(-1); }}
                        style={{ width: '100%', minHeight: 64, borderRadius: 24, padding: '0 18px', border: `1px solid ${HAIR}`, background: 'rgba(22,20,21,0.04)', color: INK, fontSize: 17, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', boxSizing: 'border-box' }}>
                        <span>去跑一趟</span>
                        <ChevronRight size={18} color={CORAL} />
                    </motion.button>
                ) : (<>
                    {/* 深色拉絲鈦牆：總里程＋常跑路線（液態玻璃浮在牆上）。珊瑚焦點留給地圖上最常跑的那條路線 */}
                    <DarkWall ambient="warm">
                        <WallHero kicker="All time" meta={`${places.length} 個跑點 · ${runs} 趟`} value={totalKm} decimals={1} unit="公里" />
                        {routes.length > 0 && (<>
                            <WallLabel title="常跑路線" meta={`${routes.length} 條`} />
                            {routes.map((r, i) => (
                                <GlassCard key={r.id} index={i} title={r.name} onClick={() => setOpen({ kind: 'route', id: r.id })}
                                    cols={[
                                        { label: '距離', value: `${r.distanceKm.toFixed(1)} 公里` },
                                        { label: '次數', value: r.runs },
                                        { label: '最快', value: paceLabel(r.bestPaceSec) || '—' },
                                    ]} />
                            ))}
                        </>)}
                    </DarkWall>

                    {pins.length > 0 && (
                        <MapFrame legend={[
                            ...(topRoute ? [{ label: '最常跑', swatch: { background: CORAL, height: 4, width: 14 } }] : []),
                            { label: '跑點', swatch: { background: INK } },
                        ]}>
                            <MapContainer className={mapThemeClass('light')} center={points[0]} zoom={13}
                                style={{ width: '100%', height: '100%' }} zoomControl={false} attributionControl={false} zoomSnap={0.25}>
                                <MapAutoResize />
                                <FitToPoints points={points} />
                                <DrvnTileLayer style="minimal" />
                                {routes.map((r) => (r.path?.length > 1 && (
                                    <Polyline key={r.id} positions={r.path.map((q) => [q.lat, q.lng])}
                                        color={r.id === topRoute?.id ? CORAL : INK} weight={r.id === topRoute?.id ? 5 : 3} opacity={r.id === topRoute?.id ? 0.95 : 0.55}
                                        eventHandlers={{ click: () => { haptic('light'); setOpen({ kind: 'route', id: r.id }); } }} />
                                )))}
                                {pins.map((p) => (
                                    <Marker key={p.id} position={[p.lat, p.lng]} icon={dotIcon('solid')}
                                        eventHandlers={{ click: () => { haptic('light'); setOpen({ kind: 'place', id: p.id }); } }} />
                                ))}
                            </MapContainer>
                        </MapFrame>
                    )}

                    <HairlineList title="跑點" items={places.map((p) => {
                        const pf = runPlaceProficiency(p);
                        return {
                            key: p.id, title: p.name, onClick: () => setOpen({ kind: 'place', id: p.id }),
                            sub: [RUN_KINDS[p.kind]?.zh, pf ? `${pf.label} · ${pf.sessions} 次` : null, `${p.totalKm.toFixed(1)} 公里`, ago(p.lastAt)].filter(Boolean).join(' · '),
                        };
                    })} />
                </>)}
            </div>

            <AnimatePresence>
                {open?.kind === 'place' && mem.places[open.id] && (
                    <PlaceSheet key={open.id} place={mem.places[open.id]} mem={mem} onChange={commit} onClose={() => setOpen(null)} />
                )}
                {open?.kind === 'route' && mem.routes[open.id] && (
                    <RouteSheet key={open.id} route={mem.routes[open.id]} mem={mem} onChange={commit} onClose={() => setOpen(null)} />
                )}
            </AnimatePresence>
        </div>
    );
}
