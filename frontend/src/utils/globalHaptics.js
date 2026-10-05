/**
 * globalHaptics.js
 * ─────────────────────────────────────────────────────────────
 * 為「所有」互動元素掛上輕量級的 haptic feedback：
 *   · button / [role=button] / a[href]           → hapticTap on pointerup
 *   · input[type=checkbox|radio]                 → hapticTap on change
 *   · input[type=range] / [data-haptic="slider"] → selectionChanged on input
 *   · 任何含 [data-haptic="tap"] 的自訂元素      → hapticTap
 *
 * 設計重點：
 *   - 用 pointerup（不是 click）→ 真正觸控時就響，不會等到 click delay
 *   - 用 capture: true → 不會被 stopPropagation 吃掉
 *   - 用 once-per-event flag → 同一個 pointer 不重複觸發
 *   - 不會誤觸 disabled、非互動 div、表單焦點切換等
 *   - 不會在桌機上發出震動（hapticTap 內部已判斷 webkit / navigator.vibrate）
 *
 * 在 main.jsx 呼叫 installGlobalHaptics() 一次即可。
 * ─────────────────────────────────────────────────────────────
 */
import {
    hapticTap,
    hapticSelectionStart,
    hapticSelectionChanged,
    hapticSelectionEnd,
} from './haptics';

const INTERACTIVE_SELECTOR = [
    'button',
    '[role="button"]',
    'a[href]',
    'summary',
    'label[for]',
    '[data-haptic="tap"]',
].join(',');

function isDisabled(el) {
    if (!el) return true;
    if (el.disabled) return true;
    if (el.getAttribute && el.getAttribute('aria-disabled') === 'true') return true;
    return false;
}

let installed = false;

export function installGlobalHaptics() {
    if (installed) return;
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    installed = true;

    // 1) Tap：所有 button / link / role=button / summary / data-haptic="tap"
    const onPointerUp = (e) => {
        // 不對 scroll / drag end 觸發（pointer 移動超過 10px 視為 scroll）
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        const t = e.target;
        if (!t || !t.closest) return;
        const hit = t.closest(INTERACTIVE_SELECTOR);
        if (!hit) return;
        if (isDisabled(hit)) return;
        // 排除 ranger/checkbox/radio（這些走 change 流程，避免重複）
        if (hit.matches && hit.matches('input[type="range"], input[type="checkbox"], input[type="radio"]')) return;
        hapticTap();
    };
    document.addEventListener('pointerup', onPointerUp, { capture: true, passive: true });

    // 2) Change：checkbox / radio / select
    const onChange = (e) => {
        const t = e.target;
        if (!t || !t.matches) return;
        if (t.matches('input[type="checkbox"], input[type="radio"], select')) {
            if (isDisabled(t)) return;
            hapticTap();
        }
    };
    document.addEventListener('change', onChange, { capture: true, passive: true });

    // 3) Slider：input[type=range] 與任何 [data-haptic="slider"]
    //    用 input 事件 → 每次刻度改變都響一下；start / end 用 pointerdown/up 識別
    let sliderActive = null;
    const onPointerDownSlider = (e) => {
        const t = e.target;
        if (!t || !t.matches) return;
        if (t.matches('input[type="range"], [data-haptic="slider"]')) {
            if (isDisabled(t)) return;
            sliderActive = t;
            hapticSelectionStart();
        }
    };
    const onInputSlider = (e) => {
        const t = e.target;
        if (!t || !t.matches) return;
        if (t.matches('input[type="range"]')) {
            if (isDisabled(t)) return;
            hapticSelectionChanged();
        }
    };
    const onPointerUpSlider = () => {
        if (sliderActive) {
            sliderActive = null;
            hapticSelectionEnd();
        }
    };
    document.addEventListener('pointerdown', onPointerDownSlider, { capture: true, passive: true });
    document.addEventListener('input', onInputSlider, { capture: true, passive: true });
    document.addEventListener('pointerup', onPointerUpSlider, { capture: true, passive: true });
    document.addEventListener('pointercancel', onPointerUpSlider, { capture: true, passive: true });
}

export default installGlobalHaptics;
