/**
 * useGymChoice — 開始訓練前選「在哪間練」，菜單跟著換
 * ══════════════════════════════════════════════════════════════════════
 * 預覽面板用。三種選法：
 *   · 自動（預設）：定位 → 150 m 內記過的那間；認不出來就照課表原樣
 *   · 指定一間：客製的（最多三間，記了沒有哪些器材）排前面，其餘依最近去的
 *   · 不在健身房：不記地點、不換菜單
 * 換菜單一律「從原課表重新套」（utils/gymMemory.adaptDayForGym），
 * 切來切去不會越換越歪；這是會員功能（placePlans），非會員只記地點。
 * 選好的結果（choice）跟著課表帶進訓練頁，由 useGymSession 接手記錄。
 * ══════════════════════════════════════════════════════════════════════
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getOneShotLocation } from '../utils/nativeLocation';
import {
    loadGymMemory, saveGymMemory, findGymNear, createGym, gymChoiceList, adaptDayForGym,
    swappedInMenu, isCustomGym, proficiencyOf,
} from '../utils/gymMemory';
import { canUse } from '../utils/membership';

export default function useGymChoice({ userId, exercises = [], enabled = true }) {
    const [mem, setMem] = useState(() => (userId ? loadGymMemory(userId) : null));
    const [detect, setDetect] = useState({ status: enabled && userId ? 'pending' : 'off', coords: null, gymId: null });
    const [sel, setSel] = useState('auto');          // 'auto' | 'none' | gymId
    const member = canUse('placePlans');

    // 別頁（健身房記憶頁、結算問題卡）改了記憶 → 這裡跟著更新
    useEffect(() => {
        if (!userId) return undefined;
        const reload = () => setMem(loadGymMemory(userId));
        window.addEventListener('drvn:gym-memory-changed', reload);
        return () => window.removeEventListener('drvn:gym-memory-changed', reload);
    }, [userId]);

    // 自動：定位一次（拿不到就安靜當作認不出來）
    useEffect(() => {
        if (!enabled || !userId) return undefined;
        let dead = false;
        getOneShotLocation({ timeout: 6000 })
            .then((coords) => {
                if (dead) return;
                if (!coords) { setDetect({ status: 'none', coords: null, gymId: null }); return; }
                const g = findGymNear(loadGymMemory(userId), coords);
                setDetect({ status: g ? 'found' : 'unknown', coords, gymId: g?.id || null });
            })
            .catch(() => { if (!dead) setDetect({ status: 'none', coords: null, gymId: null }); });
        return () => { dead = true; };
    }, [enabled, userId]);

    // 指定的那間被刪掉了 → 回到自動
    useEffect(() => {
        if (sel !== 'auto' && sel !== 'none' && mem && !mem.gyms[sel]) setSel('auto');
    }, [mem, sel]);

    const list = useMemo(() => (mem ? gymChoiceList(mem) : []), [mem]);
    const detectedGym = detect.gymId && mem ? mem.gyms[detect.gymId] || null : null;
    const gym = sel === 'none' ? null : sel === 'auto' ? detectedGym : (mem?.gyms[sel] || null);

    /* 菜單：
       · 有健身房 → 從原課表重新套這間（會員）；非會員照原樣
       · 自動但認不出來 → 課表原樣（可能是排課時就照某間換好的，不動它）
       · 不在健身房 → 原樣 */
    const result = useMemo(() => {
        const list0 = Array.isArray(exercises) ? exercises : [];
        if (!gym || !member) return { exercises: list0, swaps: swappedInMenu(list0), wouldChange: 0 };
        return adaptDayForGym(list0, gym, userId);
    }, [exercises, gym, member, userId]);

    // 非會員：這間記了沒有的器材，但不能換 —— 算出「本來會換幾個」給畫面放一行會員提示
    const lockedChanges = useMemo(() => {
        if (member || !gym || !Object.keys(gym.missing || {}).length) return 0;
        return adaptDayForGym(exercises || [], gym, userId).swaps.length;
    }, [member, gym, exercises, userId]);

    /** 在這裡新增一間（使用者自己取名）；有定位就記座標，下次自動認得 */
    const addGym = useCallback((name) => {
        const clean = String(name || '').trim();
        if (!clean || !userId) return null;
        const base = loadGymMemory(userId);
        const near = detect.coords ? findGymNear(base, detect.coords) : null;
        const coords = near ? {} : (detect.coords || {});      // 這個位置已經有一間 → 不重複佔座標
        const r = createGym(base, { name: clean, lat: coords.lat ?? null, lng: coords.lng ?? null });
        saveGymMemory(userId, r.mem);
        setMem(r.mem);
        setSel(r.gym.id);
        return r.gym;
    }, [userId, detect.coords]);

    /** 帶進訓練頁的選擇（useGymSession 的 preset） */
    const choice = useMemo(() => {
        if (sel === 'none') return { mode: 'none', source: 'manual' };
        if (gym) {
            return {
                mode: 'gym', gymId: gym.id, gymName: gym.name,
                source: sel === 'auto' ? 'auto' : 'manual',
                coords: detect.coords || null,
                adapted: member,                       // 菜單已照這間換過 → 訓練頁不再換一次
                swapped: result.swaps.length,
            };
        }
        return { mode: 'auto', source: 'auto', coords: detect.coords || null, located: detect.status !== 'none' && detect.status !== 'pending' };
    }, [sel, gym, detect, member, result.swaps.length]);

    return {
        ready: !!mem,
        sel, setSel, list, detect, detectedGym, gym,
        isCustom: gym && mem ? isCustomGym(mem, gym.id) : false,
        proficiency: gym ? proficiencyOf(gym) : null,
        exercises: result.exercises, swaps: result.swaps,
        lockedChanges, member, addGym, choice,
    };
}
