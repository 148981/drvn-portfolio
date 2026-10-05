// ─────────────────────────────────────────────────────────────
// 🥁 Cadence Metronome — 步頻節拍器
//
// 為什麼需要：app 已經會建議「聽 170 BPM 維持步頻」，卻沒有內建節拍器。
// 步頻穩定是跑步效率的關鍵；給跑者一個可在跑步中開啟的節拍器，
// 跟著「嗒、嗒」落地，比看數字更直覺。
//
// 用 Web Audio API 合成短促木魚聲（oscillator + 快速衰減包絡），
// 不需音檔、延遲低、不吃流量。每拍排程到精準的 audio clock 上，
// 不受 JS setInterval 抖動影響。
// ─────────────────────────────────────────────────────────────

export const CADENCE_RANGE = { min: 150, max: 200, default: 170, step: 1 };
const LS_BPM = 'cardio_metronome_bpm';
const LS_ON = 'cardio_metronome_on';

export const getSavedBpm = () => {
    const v = parseInt(localStorage.getItem(LS_BPM), 10);
    return Number.isFinite(v) ? Math.min(CADENCE_RANGE.max, Math.max(CADENCE_RANGE.min, v)) : CADENCE_RANGE.default;
};
export const saveBpm = (bpm) => { try { localStorage.setItem(LS_BPM, String(bpm)); } catch { /* noop */ } };
export const wasOn = () => localStorage.getItem(LS_ON) === 'true';
export const saveOn = (on) => { try { localStorage.setItem(LS_ON, String(!!on)); } catch { /* noop */ } };

class Metronome {
    constructor() {
        this.ctx = null;
        this.bpm = getSavedBpm();
        this.running = false;
        this.nextNoteTime = 0;
        this.lookaheadMs = 25;        // scheduler 執行間隔
        this.scheduleAheadSec = 0.1;  // 提前排程的時間窗
        this.timer = null;
        this.accent = false;          // 每 N 拍加重音（這裡關閉，跑步用均勻拍）
    }

    _ensureCtx() {
        if (!this.ctx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            this.ctx = new AC();
        }
        // iOS：必須在使用者手勢內 resume
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
        return this.ctx;
    }

    _scheduleClick(time) {
        const ctx = this.ctx;
        if (!ctx) return;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = 1800;   // 清脆木魚音
        // 快速衰減包絡：5ms 起音 → 40ms 收尾，形成「嗒」
        gain.gain.setValueAtTime(0.0001, time);
        gain.gain.exponentialRampToValueAtTime(0.35, time + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.045);
        osc.connect(gain).connect(ctx.destination);
        osc.start(time);
        osc.stop(time + 0.05);
    }

    _scheduler = () => {
        if (!this.ctx) return;
        const secPerBeat = 60.0 / this.bpm;
        while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadSec) {
            this._scheduleClick(this.nextNoteTime);
            this.nextNoteTime += secPerBeat;
        }
    };

    start() {
        const ctx = this._ensureCtx();
        if (!ctx || this.running) return false;
        this.running = true;
        this.nextNoteTime = ctx.currentTime + 0.05;
        this.timer = setInterval(this._scheduler, this.lookaheadMs);
        saveOn(true);
        return true;
    }

    stop() {
        this.running = false;
        if (this.timer) { clearInterval(this.timer); this.timer = null; }
        saveOn(false);
    }

    setBpm(bpm) {
        this.bpm = Math.min(CADENCE_RANGE.max, Math.max(CADENCE_RANGE.min, Math.round(bpm)));
        saveBpm(this.bpm);
        return this.bpm;
    }

    isRunning() { return this.running; }
}

// 單例 — 整個 app 只有一個節拍器，避免多重音軌疊加
let _instance = null;
export const getMetronome = () => {
    if (!_instance) _instance = new Metronome();
    return _instance;
};
