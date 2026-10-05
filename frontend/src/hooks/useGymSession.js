/**
 * useGymSession — 一場重訓裡的健身房記憶
 * ══════════════════════════════════════════════════════════════════════
 * 開始：
 *   · 預覽面板已經選好（preset = day.gymChoice）
 *       mode 'gym'  → 就是這一間；菜單在預覽時已經照這間換好，不再換一次
 *       mode 'none' → 使用者說不在健身房：不定位、不記、不問
 *       mode 'auto' → 預覽時認不出來，照舊在這裡定位
 *   · 沒有 preset（從別的入口開始）→ 定位 → 認出是哪一間（150 m 內）。
 *     是客製的健身房、又是會員（依健身房排課）→ 還沒開練的動作換成這間做得到的。
 * 結束：finish(動作, { recordId }) —— 回傳要不要跳問題卡：
 *        · 第一次來的地方 → 問「在哪練」（附近健身房清單／自己取名／不是健身房）
 *        · 計劃裡跳過的動作、器材在這間還不知道有沒有 → 問「這間沒有嗎」
 *        什麼都不用問 → 直接記一次訓練，不打擾。
 *      問完（resolve）後，這一場的訓練紀錄補上健身房（trainingRecords[recordId].gym）。
 * 定位拿不到、也沒手動選 → 整件事安靜略過，不問、不記。
 * ══════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { getOneShotLocation } from '../utils/nativeLocation';
import {
    loadGymMemory, saveGymMemory, findGymNear, isIgnoredPlace, ignorePlace, createGym,
    recordGymSession, skippedToAsk, adaptDayForGym, markMissing, markAvailable,
    setGymSwap, makeCustomGym, isCustomGym, customGyms, customSlotsFull, GYM_CUSTOM_SLOTS,
} from '../utils/gymMemory';
import { canUse } from '../utils/membership';
import { uStorage } from '../utils/userStorage';

const MAX_ASKS = 4;          // 一次最多問幾台器材（其餘下次再問）
const DETECT_WAIT_MS = 8000; // 結束時最多再等定位幾秒

/** 這一場的訓練紀錄補上在哪練（本機 trainingRecords；雲端那筆在存檔時就帶了） */
function tagRecord(userId, recordId, gym) {
    if (!userId || !recordId || !gym) return;
    try {
        uStorage(userId).getAndUpdate('trainingRecords', (records) => {
            if (records?.[recordId]) records[recordId] = { ...records[recordId], gym: { id: gym.id, name: gym.name } };
            return records;
        }, {});
    } catch { /* 紀錄本身已存好，補標籤失敗不影響 */ }
}

export default function useGymSession({ userId, exercises, setExercises, enabled = true, trackSkips = true, preset = null }) {
    const presetMode = preset?.mode || null;
    const off = !enabled || !userId || presetMode === 'none';
    const [ctx, setCtx] = useState(null);           // { coords, gym, ignored, manual }
    const [review, setReview] = useState(null);     // 結束時要問的東西（GymSessionSheet 的 props）
    const [adapted, setAdapted] = useState([]);     // 開始時照健身房換掉的動作（訓練頁才換的）
    const plannedRef = useRef(null);
    const detectRef = useRef(null);
    const adaptedOnceRef = useRef(false);
    const metaRef = useRef({});                     // { recordId, focus, swapped }

    // 計劃裡原本有哪些動作（開始時的快照；中途刪掉、跳過、換掉的都算「沒做」）
    useEffect(() => {
        if (!trackSkips) { plannedRef.current = []; return; }   // 自由訓練沒有「計劃」，不問跳過
        if (plannedRef.current || !Array.isArray(exercises) || !exercises.length) return;
        plannedRef.current = exercises.filter((e) => e && !e.isWarmup).map((e) => e.name);
    }, [exercises, trackSkips]);

    // 開始：認健身房（預覽已選好 → 直接用；否則定位）
    useEffect(() => {
        if (off || detectRef.current) return;
        if (presetMode === 'gym' && preset.gymId) {
            const gym = loadGymMemory(userId).gyms[preset.gymId] || null;
            if (gym) {
                const next = { coords: preset.coords || null, gym, ignored: false, manual: preset.source === 'manual' };
                if (preset.adapted) adaptedOnceRef.current = true;     // 預覽已照這間換好菜單
                metaRef.current.swapped = Number(preset.swapped) || 0;
                setCtx(next);
                detectRef.current = Promise.resolve(next);
                return;
            }
            // 選的那間被刪了 → 當作沒選，往下定位
        }
        detectRef.current = (async () => {
            const coords = preset?.coords || await getOneShotLocation({ timeout: 6000 }).catch(() => null);
            if (!coords) return null;
            const mem = loadGymMemory(userId);
            const gym = findGymNear(mem, coords);
            const next = { coords, gym, ignored: !gym && isIgnoredPlace(mem, coords), manual: false };
            setCtx(next);
            return next;
        })();
    }, [off, userId, presetMode]);   // eslint-disable-line react-hooks/exhaustive-deps

    // 會員：客製的健身房 → 還沒開練就換成這間做得到的（預覽已換過就不動）
    useEffect(() => {
        const gym = ctx?.gym;
        if (!gym || adaptedOnceRef.current || !Array.isArray(exercises) || !exercises.length) return;
        adaptedOnceRef.current = true;
        if (!canUse('placePlans')) return;
        if (!Object.keys(gym.missing || {}).length) return;                              // 沒記缺什麼 → 菜單照原樣
        if (exercises.some((e) => (e.sets || []).some((s) => s?.completed))) return;   // 已經開練就不動
        const r = adaptDayForGym(exercises, gym, userId);
        const changed = r.exercises.some((e, i) => e?.name !== exercises[i]?.name);
        if (!changed) return;
        setExercises(r.exercises);
        if (trackSkips) plannedRef.current = r.exercises.filter((e) => e && !e.isWarmup).map((e) => e.name);
        metaRef.current.swapped = r.swaps.length;
        setAdapted(r.swaps);
    }, [ctx, exercises, setExercises, userId, trackSkips]);

    /** 存檔時用：現在算在哪一間（{id,name}，還不知道就 null） */
    const currentGym = useCallback(() => {
        if (off || !ctx?.gym) return null;
        const g = loadGymMemory(userId).gyms[ctx.gym.id];
        return g ? { id: g.id, name: g.name } : null;
    }, [off, ctx, userId]);

    /** 訓練結束時呼叫。回傳 true = 有問題要問（review 已設好，等畫面跳卡）。 */
    const finish = useCallback(async (doneExercises = [], meta = {}) => {
        if (off) return false;
        metaRef.current = { ...metaRef.current, ...meta };
        let c = ctx;
        if (!c && detectRef.current) {
            c = await Promise.race([detectRef.current, new Promise((r) => setTimeout(() => r(null), DETECT_WAIT_MS))]);
        }
        if (!c || c.ignored) return false;
        if (!c.gym && !c.coords) return false;
        const mem = loadGymMemory(userId);
        const gym = c.gym ? mem.gyms[c.gym.id] || null : findGymNear(mem, c.coords);
        if (!gym && !c.coords) return false;                 // 手動選的那間剛好被刪掉、又沒有定位
        const asks = skippedToAsk(gym, plannedRef.current || [], doneExercises).slice(0, MAX_ASKS);
        const recMeta = { recordId: metaRef.current.recordId || null, focus: metaRef.current.focus || null, swapped: metaRef.current.swapped || 0 };

        if (gym && !asks.length) {                       // 老地方、沒什麼好問 → 直接記
            saveGymMemory(userId, recordGymSession(mem, gym.id, doneExercises, Date.now(), recMeta));
            tagRecord(userId, recMeta.recordId, gym);
            return false;
        }
        let places = [], area = null;
        if (!gym) {
            const { getNearbyPlaces } = await import('../utils/nearbyPlaces');
            const { reverseGeocodeName } = await import('../utils/locationName');
            [places, area] = await Promise.all([
                getNearbyPlaces(c.coords, { kind: 'gym', radius: 400 }).catch(() => []),
                reverseGeocodeName(c.coords.lat, c.coords.lng).catch(() => null),
            ]);
        }
        setReview({
            gymId: gym?.id || null,
            gymName: gym?.name || null,
            isCustom: gym ? isCustomGym(mem, gym.id) : false,
            slotsFull: customSlotsFull(mem),
            customGyms: customGyms(mem).map((g) => ({ id: g.id, name: g.name })),
            slots: GYM_CUSTOM_SLOTS,
            coords: c.coords, area, places,
            asks, doneExercises, recMeta,
        });
        return true;
    }, [ctx, off, userId]);

    /**
     * 問題卡按「完成」：
     * @param {{ place?: {kind:'poi'|'named'|'ignore'|'skip', name?:string, poi?:object},
     *           answers?: Record<stationId, {missing:boolean, from:string, swapTo?:string}>,
     *           replaceId?: string|null }} result
     */
    const resolve = useCallback((result = {}) => {
        const rv = review;
        setReview(null);
        if (!rv || !userId) return;
        let mem = loadGymMemory(userId);
        let gymId = rv.gymId;
        const place = result.place || { kind: 'skip' };
        if (!gymId) {
            if (place.kind === 'ignore') { saveGymMemory(userId, ignorePlace(mem, rv.coords)); return; }
            if (place.kind === 'skip') return;
            const poi = place.poi || null;
            const r = createGym(mem, {
                name: place.name, poiName: poi?.name || null, area: poi?.area || rv.area || null,
                lat: poi?.lat ?? rv.coords?.lat, lng: poi?.lng ?? rv.coords?.lng,
            });
            mem = r.mem; gymId = r.gym.id;
        }
        if (!mem.gyms[gymId]) return;                     // 問卷開著時那間被刪了
        mem = recordGymSession(mem, gymId, rv.doneExercises, Date.now(), rv.recMeta || {});
        const answers = Object.entries(result.answers || {});
        if (answers.some(([, a]) => a.missing) && !isCustomGym(mem, gymId)) {
            const r = makeCustomGym(mem, gymId, result.replaceId || null);
            if (r.ok) mem = r.mem;
        }
        answers.forEach(([stationId, a]) => {
            if (a.missing) {
                const r = markMissing(mem, gymId, stationId);
                if (!r.ok) return;                         // 名額滿又沒選要換掉哪一間 → 這次不記
                mem = r.mem;
                if (a.swapTo) mem = setGymSwap(mem, gymId, a.from, a.swapTo);
            } else {
                mem = markAvailable(mem, gymId, stationId);
            }
        });
        saveGymMemory(userId, mem);
        tagRecord(userId, rv.recMeta?.recordId, mem.gyms[gymId]);
    }, [review, userId]);

    return { ctx, gym: off ? null : (ctx?.gym || null), adapted, review, finish, resolve, currentGym };
}
