/**
 * ══════════════════════════════════════════════════════════════════════════
 * GearGaragePage —— 裝備倉庫
 * ══════════════════════════════════════════════════════════════════════════
 *
 * 稽核前能做的：新增、設為使用中、退役、刪除。
 * 做不到、但裝備倉庫該做到的：
 *   · 新增之後就不能改（品牌打錯、里程登錯只能刪掉重建）       → 編輯裝備
 *   · 里程不能校正（換錶、舊鞋登錄少算）                       → 調整里程（記一筆手動校正）
 *   · 看不到這雙跑了幾次、最後一次是哪天                       → 使用紀錄
 *   · 快磨完了也不會提醒                                       → 80% 起提醒、100% 建議退役
 *   · 腰帶、護膝這類沒有里程的裝備無從記錄                     → 「記一次使用」
 *   · 整頁英文（GEAR GARAGE / LIVE / Wear Level / INVENTORY…）  → 中文（§10）
 *   · 裝備存在全域 key，換帳號會看到上一個人的鞋               → shoeManager 改成每人一份
 *
 * 配色回到 DRVN（鈦金屬深底＋珊瑚），原本整頁是 #B22222 深紅，不在色票裡（§10）。
 */
import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Plus, Search, X, MoreHorizontal, Pencil, Gauge, Archive, RotateCcw, Trash2, Check, Camera, ChevronRight } from 'lucide-react';
import { pressProps } from '../utils/nutritionMotion';
import { haptic } from '../utils/haptics';
import { confirmDialog, toast } from '../utils/toast';
import {
    getShoes, getCurrentShoe, setCurrentShoe, addNewShoe, deleteShoe, setShoeRetired,
    updateShoe, adjustShoeMileage, getShoeStats,
} from '../utils/shoeManager';

const INK = '#161415';
const CORAL = '#F95C4B';
const EMBER = '#D94030';
const PAPER = '#F6F4F1';
const STONE = '#E4DED2';
const PEBBLE = '#CFC6B8';
const SUB = 'rgba(22,20,21,0.5)';
const TITANIUM = 'linear-gradient(165deg, #2A2724 0%, #161415 62%)';

/* 類別：value 是存進資料裡的舊英文值（跑步頁的運動對應也用它），畫面一律顯示 zh。
   unit：這種裝備用什麼計量；公里類才吃得到跑步里程（才能設為使用中）。 */
export const GEAR_CATEGORIES = [
    { value: 'Running Shoes', zh: '跑鞋', emoji: '👟', unit: '公里', max: 800, uses: ['日常訓練', '比賽／破 PR', '恢復跑', '間歇／速度'] },
    { value: 'Trail Shoes', zh: '越野跑鞋', emoji: '⛰️', unit: '公里', max: 600, uses: ['越野', '登山跑'] },
    { value: 'Hiking Boots', zh: '登山鞋', emoji: '🥾', unit: '公里', max: 1000, uses: ['健行', '重裝'] },
    { value: 'Bike', zh: '自行車', emoji: '🚴', unit: '公里', max: 8000, uses: ['公路', '通勤', '登山車'] },
    { value: 'Swim Gear', zh: '泳具', emoji: '🏊', unit: '公里', max: 200, uses: ['泳鏡', '泳帽', '防寒衣'] },
    { value: 'Ski Gear', zh: '滑雪裝備', emoji: '🎿', unit: '天', max: 60, uses: ['雙板', '單板'] },
    { value: 'Weightlifting Shoes', zh: '舉重鞋', emoji: '🏋️', unit: '次', max: 600, uses: ['大重量', '奧林匹克舉'] },
    { value: 'Lifting Belt', zh: '腰帶', emoji: '🥋', unit: '次', max: 5000, uses: ['快扣', '傳統扣', '魔鬼氈'] },
    { value: 'Knee/Wrist Sleeves', zh: '護膝／護腕', emoji: '🩹', unit: '次', max: 300, uses: ['氯丁橡膠 7mm', '氯丁橡膠 5mm', '彈性繃帶'] },
    { value: 'Smart Watch', zh: '運動手錶', emoji: '⌚️', unit: '天', max: 14, uses: ['GPS 運動錶', '智慧手錶', '手環', '心率帶'] },
];
const catOf = (value) => GEAR_CATEGORIES.find((c) => c.value === value) || GEAR_CATEGORIES[0];

// 🏃 各裝備類別 → 對應的運動（跑步頁選運動模式時，裝備可依此對應）—— 保留舊匯出
export const CATEGORY_SPORT = {
    'Running Shoes': 'running', 'Trail Shoes': 'trail_running', 'Bike': 'cycling',
    'Hiking Boots': 'hiking', 'Swim Gear': 'swimming', 'Ski Gear': 'skiing',
    'Weightlifting Shoes': 'strength', 'Lifting Belt': 'strength', 'Knee/Wrist Sleeves': 'strength',
    'Smart Watch': 'all',
};

/* 舊資料的用途是英文 —— 只換顯示，不改存的值 */
const USE_ZH = {
    'Daily Trainer': '日常訓練', 'Racing / PRs': '比賽／破 PR', 'Heavy Lifting': '大重量', 'Recovery': '恢復跑',
    'GPS Sport Watch': 'GPS 運動錶', 'Smartwatch (Apple)': '智慧手錶', 'Fitness Band': '手環', 'Heart Rate Monitor': '心率帶',
    'Lever (快扣)': '快扣', 'Prong (傳統)': '傳統扣', 'Velcro (魔鬼氈)': '魔鬼氈',
    'Neoprene 7mm': '氯丁橡膠 7mm', 'Neoprene 5mm': '氯丁橡膠 5mm', 'Elastic Wrap': '彈性繃帶',
    'Trail / 越野': '越野', 'Road / 公路': '公路', 'Hiking / 健行': '健行',
};
const purposeZh = (u) => USE_ZH[u] || u || '';

/* 同一個動作在選單與焦點卡都有入口 —— 字只寫一份 */
const ACT_USE = '設為使用中';

const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
const wearPct = (g) => Math.min(100, Math.round((n(g.mileage) / Math.max(1, n(g.maxMileage) || 1)) * 100));
const isRetired = (g) => g.retired === true;
const tracksRuns = (g) => catOf(g.category).unit === '公里';
const fmtNum = (v) => (Math.round(n(v) * 10) / 10).toLocaleString();
const md = (iso) => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? `${d.getMonth() + 1}/${d.getDate()}` : ''; };
const gearName = (g) => [g.brand, g.model].filter(Boolean).join(' ') || catOf(g.category).zh;

/* 磨損狀態：一句話，顏色跟著走 */
const wearState = (g) => {
    const pct = wearPct(g);
    const left = Math.max(0, n(g.maxMileage) - n(g.mileage));
    const unit = catOf(g.category).unit;
    if (pct >= 100) return { tone: EMBER, text: '已超過建議上限，該換了', urgent: true };
    if (pct >= 80) return { tone: CORAL, text: `再 ${fmtNum(left)} ${unit}就到建議上限`, urgent: true };
    return { tone: 'rgba(246,244,241,0.6)', text: `還能用 ${fmtNum(left)} ${unit}`, urgent: false };
};

/* 照片先縮到 480px 再存 —— 手機原圖好幾 MB，塞進 localStorage 幾張就爆 */
const fileToSmallDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
            const scale = Math.min(1, 480 / Math.max(img.width, img.height));
            const c = document.createElement('canvas');
            c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
            c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
            resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.src = reader.result;
    };
    reader.readAsDataURL(file);
});

const GearVisual = ({ gear, size = 96 }) => {
    const img = gear?.imageUrl && String(gear.imageUrl).startsWith('data:') ? gear.imageUrl : null;
    return img
        ? <img src={img} alt={gearName(gear)} style={{ width: size, height: size, objectFit: 'contain', display: 'block' }} />
        : <span style={{ fontSize: Math.round(size * 0.62), lineHeight: 1 }}>{gear?.emoji || catOf(gear?.category).emoji}</span>;
};

/* ═══ 共用 sheet（由下彈出、封頂在瀏海下，§1.1）═══ */
const Sheet = ({ onClose, title, children, footer }) => createPortal(
    <>
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
            style={{ position: 'fixed', inset: 0, zIndex: 100400, background: 'rgba(22,20,21,0.45)' }} />
        <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            role="dialog" aria-label={title}
            style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, maxWidth: 440, margin: '0 auto', zIndex: 100401,
                background: PAPER, borderRadius: '28px 28px 0 0', boxShadow: '0 -8px 40px rgba(22,20,21,0.18)',
                maxHeight: 'calc(100dvh - env(safe-area-inset-top, 0px) - 12px)', display: 'flex', flexDirection: 'column',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 10 }}>
                <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(22,20,21,0.18)' }} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px 8px 20px' }}>
                <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: INK }}>{title}</h3>
                <motion.button {...pressProps('icon')} aria-label="關閉" onClick={onClose}
                    style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <X size={20} color={SUB} />
                </motion.button>
            </div>
            <div style={{ overflowY: 'auto', padding: '4px 20px 12px', flex: 1 }}>{children}</div>
            {footer && <div style={{ padding: '10px 20px', paddingBottom: 'max(16px, env(safe-area-inset-bottom))', borderTop: '1px solid rgba(22,20,21,0.07)' }}>{footer}</div>}
        </motion.div>
    </>,
    document.body,
);

const fieldLabel = { display: 'block', fontSize: 12, fontWeight: 700, color: SUB, margin: '18px 2px 8px' };
const inputBox = {
    width: '100%', boxSizing: 'border-box', minHeight: 48, padding: '0 14px', borderRadius: 14,
    border: `1px solid ${PEBBLE}`, background: '#fff', outline: 'none', fontSize: 16, color: INK, fontFamily: 'var(--font-body)',
};
const chip = (on) => ({
    minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
    border: on ? `1.5px solid ${INK}` : `1px solid ${PEBBLE}`, background: on ? INK : '#fff',
    color: on ? PAPER : INK, fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-body)',
});
const primaryBtn = (disabled) => ({
    width: '100%', minHeight: 52, borderRadius: 999, border: 'none', cursor: disabled ? 'default' : 'pointer',
    background: disabled ? 'rgba(22,20,21,0.08)' : INK, color: disabled ? 'rgba(22,20,21,0.3)' : PAPER,
    fontSize: 16, fontWeight: 800, fontFamily: 'var(--font-body)',
});

/* ═══ 新增／編輯裝備（同一張表）═══ */
const GearFormSheet = ({ gear = null, onClose, onSaved }) => {
    const editing = !!gear;
    const [f, setF] = useState(() => ({
        category: gear?.category || 'Running Shoes',
        brand: gear?.brand || '',
        model: gear?.model || '',
        primaryUse: gear ? purposeZh(gear.primaryUse) : catOf('Running Shoes').uses[0],
        maxMileage: gear?.maxMileage ?? catOf('Running Shoes').max,
        mileage: gear?.mileage ?? 0,
        image: gear?.imageUrl && String(gear.imageUrl).startsWith('data:') ? gear.imageUrl : null,
    }));
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);
    const cat = catOf(f.category);
    const set = (k, v) => setF((x) => ({ ...x, [k]: v }));
    const valid = f.brand.trim() || f.model.trim();

    const pickCategory = (value) => {
        const c = catOf(value);
        setF((x) => ({
            ...x, category: value,
            // 換類別時，建議上限與用途跟著換（編輯既有裝備時不動使用者填過的上限）
            maxMileage: editing ? x.maxMileage : c.max,
            primaryUse: c.uses.includes(x.primaryUse) ? x.primaryUse : c.uses[0],
        }));
    };

    const onPhoto = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        try { set('image', await fileToSmallDataUrl(file)); } catch { toast.error('這張照片讀不進來'); }
    };

    const save = () => {
        if (!valid || busy) return;
        setBusy(true);
        const base = {
            category: f.category,
            brand: f.brand.trim(),
            model: f.model.trim(),
            primaryUse: f.primaryUse,
            maxMileage: Math.max(1, n(f.maxMileage) || cat.max),
            emoji: cat.emoji,
            imageUrl: f.image || cat.emoji,
        };
        let saved;
        if (editing) {
            saved = updateShoe(gear.id, base);
            if (n(f.mileage) !== n(gear.mileage)) saved = adjustShoeMileage(gear.id, n(f.mileage));
        } else {
            saved = addNewShoe({ ...base, mileage: Math.max(0, n(f.mileage)) });
        }
        haptic('success');
        toast.success(editing ? '已更新裝備' : '已加入裝備倉庫');
        setBusy(false);
        onSaved?.(saved);
        onClose();
    };

    return (
        <Sheet onClose={onClose} title={editing ? '編輯裝備' : '新增裝備'}
            footer={<motion.button {...pressProps('cta')} onClick={save} disabled={!valid || busy} style={primaryBtn(!valid || busy)}>{editing ? '儲存' : '加入倉庫'}</motion.button>}>
            {/* 照片 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 4 }}>
                <div style={{ width: 84, height: 84, borderRadius: 20, background: STONE, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                    {f.image ? <img src={f.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : <span style={{ fontSize: 44 }}>{cat.emoji}</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <motion.button {...pressProps('pill')} onClick={() => fileRef.current?.click()} style={{ ...chip(false), display: 'flex', alignItems: 'center', gap: 6, minHeight: 44 }}>
                        <Camera size={16} /> {f.image ? '換照片' : '加照片'}
                    </motion.button>
                    {f.image && (
                        <motion.button {...pressProps('pill')} onClick={() => set('image', null)} style={{ ...chip(false), minHeight: 44 }}>移除</motion.button>
                    )}
                </div>
                <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} style={{ display: 'none' }} />
            </div>

            <label style={fieldLabel}>類別</label>
            <div className="no-scrollbar" style={{ display: 'flex', gap: 8, overflowX: 'auto', margin: '0 -20px', padding: '0 20px 2px' }}>
                {GEAR_CATEGORIES.map((c) => (
                    <motion.button {...pressProps('pill')} key={c.value} aria-pressed={f.category === c.value} onClick={() => pickCategory(c.value)} style={{ ...chip(f.category === c.value), flexShrink: 0 }}>
                        {c.emoji} {c.zh}
                    </motion.button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={fieldLabel}>品牌</label>
                    <input value={f.brand} onChange={(e) => set('brand', e.target.value.slice(0, 30))} placeholder="Nike" style={inputBox} />
                </div>
                <div style={{ flex: 1.3, minWidth: 0 }}>
                    <label style={fieldLabel}>型號</label>
                    <input value={f.model} onChange={(e) => set('model', e.target.value.slice(0, 40))} placeholder="Pegasus 41" style={inputBox} />
                </div>
            </div>

            <label style={fieldLabel}>用途</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {cat.uses.map((u) => (
                    <motion.button {...pressProps('pill')} key={u} aria-pressed={f.primaryUse === u} onClick={() => set('primaryUse', u)} style={chip(f.primaryUse === u)}>{u}</motion.button>
                ))}
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={fieldLabel}>{editing ? `目前累積（${cat.unit}）` : `已經用了（${cat.unit}）`}</label>
                    <input type="number" inputMode="decimal" min={0} value={f.mileage} onChange={(e) => set('mileage', e.target.value)} style={inputBox} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <label style={fieldLabel}>建議上限（{cat.unit}）</label>
                    <input type="number" inputMode="numeric" min={1} value={f.maxMileage} onChange={(e) => set('maxMileage', e.target.value)} style={inputBox} />
                </div>
            </div>
        </Sheet>
    );
};

/* ═══ 調整里程（或記一次使用）═══ */
const MileageSheet = ({ gear, onClose, onSaved }) => {
    const cat = catOf(gear.category);
    const [val, setVal] = useState(String(n(gear.mileage)));
    const changed = n(val) !== n(gear.mileage) && n(val) >= 0 && val !== '';
    const save = () => {
        if (!changed) return;
        onSaved?.(adjustShoeMileage(gear.id, n(val)));
        haptic('success');
        toast.success('已校正');
        onClose();
    };
    return (
        <Sheet onClose={onClose} title="調整累積"
            footer={<motion.button {...pressProps('cta')} onClick={save} disabled={!changed} style={primaryBtn(!changed)}>儲存</motion.button>}>
            <p style={{ margin: '4px 2px 12px', fontSize: 14, color: SUB }}>{gearName(gear)}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <input type="number" inputMode="decimal" min={0} autoFocus value={val} onChange={(e) => setVal(e.target.value)}
                    style={{ ...inputBox, fontSize: 26, fontWeight: 300, minHeight: 60, fontVariantNumeric: 'tabular-nums' }} />
                <span style={{ fontSize: 16, fontWeight: 700, color: SUB, flexShrink: 0 }}>{cat.unit}</span>
            </div>
        </Sheet>
    );
};

/* ═══ 單件裝備的動作 ═══ */
const GearActions = ({ gear, isActive, onClose, onEdit, onAdjust, onActivate, onRetire, onDelete }) => {
    const items = [
        !isActive && !isRetired(gear) && tracksRuns(gear) && { id: 'use', label: ACT_USE, Icon: Check, run: onActivate },
        { id: 'edit', label: '編輯', Icon: Pencil, run: onEdit },
        { id: 'adjust', label: '調整累積', Icon: Gauge, run: onAdjust },
        { id: 'retire', label: isRetired(gear) ? '恢復使用' : '退役', Icon: isRetired(gear) ? RotateCcw : Archive, run: onRetire },
        { id: 'delete', label: '刪除', Icon: Trash2, danger: true, run: onDelete },
    ].filter(Boolean);
    return createPortal(
        <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
                style={{ position: 'fixed', inset: 0, zIndex: 100400, background: 'rgba(22,20,21,0.42)' }} />
            <motion.div role="menu" initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 32, stiffness: 340 }}
                style={{ position: 'fixed', left: 0, right: 0, bottom: 0, maxWidth: 440, margin: '0 auto', zIndex: 100401, padding: '0 10px', boxSizing: 'border-box', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
                <div style={{ background: PAPER, borderRadius: 22, overflow: 'hidden' }}>
                    <p style={{ margin: 0, padding: '14px 20px 10px', fontSize: 13, fontWeight: 700, color: SUB, textAlign: 'center' }}>{gearName(gear)}</p>
                    {items.map((it) => (
                        <motion.button key={it.id} {...pressProps('row')} role="menuitem" onClick={() => { onClose(); it.run(); }}
                            style={{ width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', gap: 12, padding: '0 20px', background: 'transparent', border: 'none', borderTop: '1px solid rgba(22,20,21,0.07)', cursor: 'pointer', color: it.danger ? EMBER : INK, fontSize: 16, fontWeight: 600, fontFamily: 'var(--font-body)', textAlign: 'left' }}>
                            <it.Icon size={19} strokeWidth={1.9} color={it.danger ? EMBER : 'rgba(22,20,21,0.6)'} /> {it.label}
                        </motion.button>
                    ))}
                </div>
                <motion.button {...pressProps('row')} onClick={onClose}
                    style={{ width: '100%', minHeight: 54, marginTop: 8, borderRadius: 22, border: 'none', background: PAPER, color: INK, fontSize: 16, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--font-body)' }}>
                    取消
                </motion.button>
            </motion.div>
        </>,
        document.body,
    );
};

/* ═══ 頁面 ═══ */
const GearGaragePage = () => {
    const navigate = useNavigate();
    const initial = () => {
        const all = getShoes();
        const cur = getCurrentShoe();
        const activeId = cur && !isRetired(cur) ? cur.id : null;
        return { all, activeId, selectedId: activeId || all.find((g) => !isRetired(g))?.id || all[0]?.id || null };
    };
    const [state, setState] = useState(initial);
    const [tab, setTab] = useState('inuse');          // inuse | retired
    const [query, setQuery] = useState('');
    const [searchOpen, setSearchOpen] = useState(false);
    const [form, setForm] = useState(null);           // null | { gear: object|null }
    const [adjusting, setAdjusting] = useState(null);
    const [menuFor, setMenuFor] = useState(null);

    const { all: gear, activeId, selectedId } = state;
    const refresh = (select) => {
        const next = initial();
        const keep = select !== undefined ? select : selectedId;
        setState({ ...next, selectedId: next.all.some((g) => g.id === keep) ? keep : next.selectedId });
    };

    // 跑完步回到這頁、或從別的分頁回來 → 重讀（里程可能剛加上去）
    useEffect(() => {
        const onVis = () => { if (document.visibilityState === 'visible') setState((s) => ({ ...initial(), selectedId: s.selectedId })); };
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, []);

    const selected = gear.find((g) => g.id === selectedId) || null;
    const inUse = gear.filter((g) => !isRetired(g));
    const retired = gear.filter(isRetired);
    const q = query.trim().toLowerCase();
    const shown = (tab === 'retired' ? retired : inUse).filter((g) => {
        if (!q) return true;
        return `${g.brand || ''} ${g.model || ''} ${catOf(g.category).zh}`.toLowerCase().includes(q);
    });

    const activate = (g) => {
        setCurrentShoe(g.id);
        haptic('success');
        toast.success(`之後跑步的里程會記到 ${gearName(g)}`);
        refresh(g.id);
    };
    const toggleRetire = (g) => {
        const to = !isRetired(g);
        setShoeRetired(g.id, to);
        haptic(to ? 'medium' : 'light');
        toast.success(to ? '已退役，紀錄都留著' : '已恢復使用');
        if (to) setTab('inuse');
        refresh(g.id);
    };
    const remove = async (g) => {
        const ok = await confirmDialog(`${gearName(g)} 的累積與使用紀錄會一起刪掉，沒辦法復原。`, {
            title: '刪除這件裝備？', confirmText: '刪除', cancelText: '取消', danger: true,
        });
        if (!ok) return;
        deleteShoe(g.id);
        haptic('heavy');
        refresh(g.id === selectedId ? null : selectedId);
    };
    const logUse = (g) => {
        adjustShoeMileage(g.id, n(g.mileage) + 1);
        haptic('light');
        toast.success('已記一次');
        refresh(g.id);
    };

    const cat = selected ? catOf(selected.category) : null;
    const pct = selected ? wearPct(selected) : 0;
    const ws = selected ? wearState(selected) : null;
    const stats = selected ? getShoeStats(selected) : null;
    const isActive = selected && selected.id === activeId;

    const heroBtn = (dark) => ({
        minHeight: 44, padding: '0 18px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
        border: dark ? 'none' : '1px solid rgba(246,244,241,0.28)', background: dark ? CORAL : 'rgba(246,244,241,0.08)',
        color: dark ? '#fff' : PAPER, fontSize: 14, fontWeight: 800, fontFamily: 'var(--font-body)',
        display: 'inline-flex', alignItems: 'center', gap: 6,
    });

    return (
        <div style={{ minHeight: '100dvh', background: PAPER, overflowX: 'hidden' }}>
            <div style={{ maxWidth: 440, margin: '0 auto', paddingBottom: 'calc(40px + env(safe-area-inset-bottom))' }}>

                {/* ─── 焦點裝備 ─── */}
                <section style={{
                    background: TITANIUM, color: PAPER, borderRadius: '0 0 28px 28px',
                    paddingTop: 'calc(8px + env(safe-area-inset-top))', paddingBottom: 22,
                    boxShadow: '0 18px 40px -20px rgba(22,20,21,0.6)', position: 'relative', overflow: 'hidden',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 8px' }}>
                        <motion.button {...pressProps('icon')} aria-label="返回" onClick={() => navigate(-1)}
                            style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <ChevronLeft size={22} color={PAPER} />
                        </motion.button>
                        <h1 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '0.02em' }}>裝備倉庫</h1>
                        <motion.button {...pressProps('icon')} aria-label="新增裝備" onClick={() => { haptic('light'); setForm({ gear: null }); }}
                            style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                            <Plus size={22} color={PAPER} />
                        </motion.button>
                    </div>

                    {!selected ? (
                        /* 沒有任何裝備：整塊只留一個動作（§7） */
                        <motion.button {...pressProps('card')} onClick={() => setForm({ gear: null })}
                            style={{ margin: '28px 20px 6px', width: 'calc(100% - 40px)', minHeight: 120, borderRadius: 22, border: '1.5px dashed rgba(246,244,241,0.3)', background: 'rgba(246,244,241,0.05)', color: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 22px', cursor: 'pointer' }}>
                            <span style={{ fontSize: 19, fontWeight: 800 }}>新增第一件裝備</span>
                            <ChevronRight size={22} />
                        </motion.button>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div key={selected.id}
                                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                                style={{ padding: '6px 22px 0' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 16, minWidth: 0 }}>
                                    <div style={{ width: 104, height: 104, borderRadius: 26, background: 'rgba(246,244,241,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, overflow: 'hidden' }}>
                                        <GearVisual gear={selected} size={88} />
                                    </div>
                                    <div style={{ minWidth: 0, flex: 1 }}>
                                        {(isActive || isRetired(selected)) && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: isActive ? CORAL : 'rgba(246,244,241,0.55)', marginBottom: 6 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: 3, background: isActive ? CORAL : 'rgba(246,244,241,0.4)' }} />
                                                {isActive ? '使用中' : '已退役'}
                                            </span>
                                        )}
                                        <h2 style={{ margin: 0, fontSize: 24, fontWeight: 900, lineHeight: 1.15, letterSpacing: '-0.02em', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                            {gearName(selected)}
                                        </h2>
                                        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'rgba(246,244,241,0.6)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {cat.zh}{selected.primaryUse ? ` · ${purposeZh(selected.primaryUse)}` : ''}
                                        </p>
                                    </div>
                                </div>

                                <div style={{ marginTop: 20, display: 'flex', alignItems: 'baseline', gap: 6 }}>
                                    <span style={{ fontSize: 44, fontWeight: 300, lineHeight: 1, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{fmtNum(selected.mileage)}</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(246,244,241,0.55)' }}>/ {fmtNum(selected.maxMileage)} {cat.unit}</span>
                                </div>
                                <div style={{ height: 6, borderRadius: 99, background: 'rgba(246,244,241,0.12)', overflow: 'hidden', marginTop: 12 }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(2, pct)}%` }} transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                                        style={{ height: '100%', borderRadius: 99, background: pct >= 100 ? EMBER : CORAL }} />
                                </div>
                                <p style={{ margin: '10px 0 0', fontSize: 13, fontWeight: ws.urgent ? 800 : 600, color: ws.tone }}>
                                    {ws.text}
                                    {stats.runs > 0 && tracksRuns(selected) ? <span style={{ color: 'rgba(246,244,241,0.5)', fontWeight: 600 }}> · 穿了 {stats.runs} 次 · 最後 {md(stats.lastUsedAt)}</span> : null}
                                </p>

                                <div style={{ display: 'flex', gap: 8, marginTop: 18, flexWrap: 'wrap' }}>
                                    {isRetired(selected) ? (
                                        <motion.button {...pressProps('pill')} onClick={() => toggleRetire(selected)} style={heroBtn(true)}><RotateCcw size={15} /> 恢復使用</motion.button>
                                    ) : tracksRuns(selected) ? (
                                        !isActive && <motion.button {...pressProps('pill')} onClick={() => activate(selected)} style={heroBtn(true)}><Check size={15} /> {ACT_USE}</motion.button>
                                    ) : (
                                        <motion.button {...pressProps('pill')} onClick={() => logUse(selected)} style={heroBtn(true)}><Plus size={15} /> 記一次使用</motion.button>
                                    )}
                                    {pct >= 100 && !isRetired(selected) && (
                                        <motion.button {...pressProps('pill')} onClick={() => toggleRetire(selected)} style={heroBtn(false)}><Archive size={15} /> 退役</motion.button>
                                    )}
                                    <motion.button {...pressProps('pill')} onClick={() => setForm({ gear: selected })} style={heroBtn(false)}><Pencil size={15} /> 編輯</motion.button>
                                    <motion.button {...pressProps('icon')} aria-label="更多動作" onClick={() => setMenuFor(selected)} style={{ ...heroBtn(false), padding: 0, width: 44, justifyContent: 'center' }}>
                                        <MoreHorizontal size={18} />
                                    </motion.button>
                                </div>
                            </motion.div>
                        </AnimatePresence>
                    )}
                </section>

                {/* ─── 最近穿（只有吃跑步里程的裝備才有）─── */}
                {selected && tracksRuns(selected) && stats.recent.length > 0 && (
                    <section style={{ padding: '22px 20px 0' }}>
                        <h3 style={{ margin: '0 0 8px', fontSize: 16, fontWeight: 800, color: INK }}>最近穿</h3>
                        <div style={{ background: '#fff', borderRadius: 18, border: `1px solid ${PEBBLE}`, overflow: 'hidden' }}>
                            {stats.recent.map((r, i) => (
                                <div key={`${r.at}_${i}`} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 46, padding: '0 16px', borderTop: i ? '1px solid rgba(22,20,21,0.06)' : 'none' }}>
                                    <span style={{ fontSize: 14, color: INK }}>{md(r.at)}</span>
                                    <span style={{ fontSize: 14, fontWeight: 700, color: INK, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(r.km)} 公里</span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                {/* ─── 全部裝備 ─── */}
                {gear.length > 0 && (
                    <section style={{ padding: '24px 20px 0' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                            {[{ id: 'inuse', zh: '使用中', count: inUse.length }, { id: 'retired', zh: '已退役', count: retired.length }].map((t) => (
                                <motion.button {...pressProps('pill')} key={t.id} aria-pressed={tab === t.id} onClick={() => setTab(t.id)} style={chip(tab === t.id)}>
                                    {t.zh} {t.count}
                                </motion.button>
                            ))}
                            <div style={{ flex: 1 }} />
                            <motion.button {...pressProps('icon')} aria-label={searchOpen ? '關閉搜尋' : '搜尋裝備'} onClick={() => { setSearchOpen((o) => !o); if (searchOpen) setQuery(''); }}
                                style={{ width: 44, height: 44, borderRadius: 999, border: 'none', background: searchOpen ? INK : 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                {searchOpen ? <X size={17} color={PAPER} /> : <Search size={17} color={SUB} />}
                            </motion.button>
                        </div>
                        <AnimatePresence>
                            {searchOpen && (
                                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                                    <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="品牌、型號或類別" style={{ ...inputBox, marginBottom: 12 }} />
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12 }}>
                            {shown.map((g) => {
                                const c = catOf(g.category);
                                const p = wearPct(g);
                                const on = g.id === selectedId;
                                return (
                                    <motion.div key={g.id} {...pressProps('card')} onClick={() => { haptic('light'); setState((s) => ({ ...s, selectedId: g.id })); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                                        style={{ position: 'relative', minWidth: 0, background: '#fff', borderRadius: 20, padding: '14px 14px 16px', cursor: 'pointer', border: on ? `2px solid ${INK}` : `1px solid ${PEBBLE}`, boxSizing: 'border-box' }}>
                                        <motion.button {...pressProps('icon')} aria-label={`${gearName(g)} 的動作`} onClick={(e) => { e.stopPropagation(); setMenuFor(g); }}
                                            style={{ position: 'absolute', top: 2, right: 2, width: 44, height: 44, border: 'none', background: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                                            <MoreHorizontal size={18} color={SUB} />
                                        </motion.button>
                                        <div style={{ height: 64, display: 'flex', alignItems: 'center' }}><GearVisual gear={g} size={58} /></div>
                                        {g.id === activeId && (
                                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 800, color: CORAL, marginTop: 6 }}>
                                                <span style={{ width: 6, height: 6, borderRadius: 3, background: CORAL }} /> 使用中
                                            </span>
                                        )}
                                        <p style={{ margin: '6px 0 2px', fontSize: 15, fontWeight: 800, color: INK, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{gearName(g)}</p>
                                        <p style={{ margin: 0, fontSize: 12, color: SUB }}>{c.zh}</p>
                                        <div style={{ height: 4, borderRadius: 99, background: 'rgba(22,20,21,0.08)', overflow: 'hidden', marginTop: 10 }}>
                                            <div style={{ width: `${Math.max(2, p)}%`, height: '100%', borderRadius: 99, background: p >= 100 ? EMBER : p >= 80 ? CORAL : INK }} />
                                        </div>
                                        <p style={{ margin: '6px 0 0', fontSize: 12, color: SUB, fontVariantNumeric: 'tabular-nums' }}>{fmtNum(g.mileage)} / {fmtNum(g.maxMileage)} {c.unit}</p>
                                    </motion.div>
                                );
                            })}
                            {tab === 'inuse' && !q && (
                                <motion.button {...pressProps('card')} onClick={() => setForm({ gear: null })}
                                    style={{ minHeight: 190, borderRadius: 20, border: `1.5px dashed ${PEBBLE}`, background: 'rgba(255,255,255,0.4)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, cursor: 'pointer' }}>
                                    <span style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(22,20,21,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={20} color={INK} /></span>
                                    <span style={{ fontSize: 14, fontWeight: 800, color: INK }}>新增裝備</span>
                                </motion.button>
                            )}
                        </div>
                        {shown.length === 0 && (q || tab === 'retired') && (
                            <p style={{ textAlign: 'center', margin: '24px 0', fontSize: 14, fontWeight: 700, color: SUB }}>
                                {q ? `找不到「${query.trim()}」` : '沒有退役的裝備'}
                            </p>
                        )}
                    </section>
                )}
            </div>

            <AnimatePresence>
                {form && <GearFormSheet key="form" gear={form.gear} onClose={() => setForm(null)} onSaved={(g) => refresh(g?.id)} />}
            </AnimatePresence>
            <AnimatePresence>
                {adjusting && <MileageSheet key="adjust" gear={adjusting} onClose={() => setAdjusting(null)} onSaved={(g) => refresh(g?.id)} />}
            </AnimatePresence>
            <AnimatePresence>
                {menuFor && (
                    <GearActions key="actions" gear={menuFor} isActive={menuFor.id === activeId} onClose={() => setMenuFor(null)}
                        onActivate={() => activate(menuFor)} onEdit={() => setForm({ gear: menuFor })}
                        onAdjust={() => setAdjusting(menuFor)} onRetire={() => toggleRetire(menuFor)} onDelete={() => remove(menuFor)} />
                )}
            </AnimatePresence>
        </div>
    );
};

export default GearGaragePage;
