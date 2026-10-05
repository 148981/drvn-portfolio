import React, { useRef, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import useCardioPlanLifecycle from '../hooks/useCardioPlanLifecycle';
import PlanCompletionCelebration from './PlanCompletionCelebration';
import { toast } from '../utils/toast';

/* ════════════════════════════════════════════════════════════════════
   PlanCompletionGate — 全域結業攔截層

   掛在 App 最外層，任何頁面都能觸發：計劃到了 end_date 就跳結業畫面，
   不必等使用者自己點進「計劃」才發現這期已經結束。

   避開的時機（這些畫面被蓋掉會很糟）：
     · 跑步／訓練進行中 —— 不能在人家跑到一半蓋全螢幕
     · 登入／註冊流程
     · 計劃建立流程本身（他正在建新的，不用再叫他建）

   每份計劃只跳一次（localStorage 蓋章，在 hook 裡處理）。
   ════════════════════════════════════════════════════════════════════ */

const BLOCKED = [
    'cardio-tracker', 'workout-session', 'freestyle', 'login', 'auth',
    'onboarding', 'cardio-plan-builder', 'standby', 'pose', 'upload',
];

const PlanCompletionGate = () => {
    const navigate = useNavigate();
    const location = useLocation();

    const path = (location.pathname || '').toLowerCase();
    const blocked = BLOCKED.some((t) => path.includes(t));

    const { celebration, dismissCelebration, hideCelebration, applyNextPlan } = useCardioPlanLifecycle({ enabled: !blocked });
    // 套用中旗標：連點「直接套用」會生出兩份計劃，ref 擋同步連點、state 給按鈕顯示停用
    const busyRef = useRef(false);
    const [busy, setBusy] = useState(false);

    if (blocked || !celebration) return null;

    return (
        <AnimatePresence>
            <PlanCompletionCelebration
                key="global-plan-done"
                plan={celebration}
                busy={busy}
                onApplyNext={async (cfg) => {
                    if (busyRef.current) return;
                    busyRef.current = true;
                    setBusy(true);
                    try {
                        // 存檔失敗（saved=false）時以前照樣跳去 inbox，看到的還是舊計劃；
                        // 現在失敗就留在結業畫面、告訴使用者，成功才離開。
                        const res = await applyNextPlan(cfg);
                        if (!res?.saved) {
                            toast.error('下一期沒存成功，再按一次試試');
                            return;
                        }
                        navigate('/cardio-microcycle-inbox');
                    } catch (e) {
                        console.warn('[PlanCompletionGate] 套用下一期失敗:', e?.message);
                        toast.error('下一期沒存成功，再按一次試試');
                    } finally {
                        busyRef.current = false;
                        setBusy(false);
                    }
                }}
                onCustomise={(cfg) => {
                    // 只關畫面不蓋章：新計劃還沒建，蓋了章使用者在建立頁返回就找不到下一期了
                    hideCelebration();
                    navigate('/cardio-plan-builder', { state: { seedConfig: cfg } });
                }}
                onClose={dismissCelebration}
            />
        </AnimatePresence>
    );
};

export default PlanCompletionGate;
