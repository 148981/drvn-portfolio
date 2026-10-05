// ════════════════════════════════════════════════════════════════════════
//  runBrickGuide.js — 「這一趟到底要怎麼跑」
//
//  使用者原話：「因為像我這種初學者我會不知道說要以多少心率、zone 幾、跑多遠。」
//
//  計劃引擎產出的 brick 只有 type / distance_km / target_pace / rpe_band，
//  卡片上寫「5.5 公里 輕鬆跑 · RPE 5–6」——RPE 是主觀感受，新手根本不知道
//  5 跟 6 差在哪。真正可執行的指令是「心率壓在 128–150，跑 5.5 公里」。
//
//  這支檔案把 brick type 翻譯成四件事：
//    ① 練什麼（目的）  ② 目標 Zone 幾  ③ 對應的心率 bpm（依使用者年齡換算）
//    ④ 怎麼判斷跑對了（不靠錶也能自我檢查的體感描述）
//
//  ⚠ 心率區間一律由 calculateHeartRateZones(age) 換算，不寫死數字 ——
//    20 歲和 50 歲的 Zone 2 差快 20 bpm，寫死等於給錯處方。
// ════════════════════════════════════════════════════════════════════════

import { calculateHeartRateZones } from './heartRateUtils';

/* brick type / subtype → 訓練意圖。
   zone 用 1–5，對應 heartRateUtils 的 zone1–zone5。 */
const GUIDE = {
    recovery: {
        zone: 1, zoneName: '恢復區',
        purpose: '把上一次訓練的疲勞排掉',
        why: '這天不是要進步，是讓身體修復。跑太快反而讓下一次質量課做不好。',
        feel: '能一路正常講話、鼻子呼吸就夠，結束時該覺得比開始還輕鬆。',
        tooFast: '如果你會喘到只能講短句 —— 太快了，慢下來。',
    },
    easy: {
        zone: 2, zoneName: '有氧基礎區',
        purpose: '打有氧底子（跑量的主體）',
        why: '80% 的里程都該在這裡。心臟和微血管的長期適應是在這一區發生的。',
        feel: '可以完整講一句話不用停下來換氣。',
        tooFast: '講話開始要斷句就是超過了 —— 這是新手最常犯的錯。',
    },
    zone2: {
        zone: 2, zoneName: '有氧基礎區',
        purpose: '打有氧底子',
        why: '低強度、長時間累積，是提升耐力最有效率的方式。',
        feel: '可以完整講一句話不用停下來換氣。',
        tooFast: '講話要斷句就是超過了。',
    },
    base: {
        zone: 2, zoneName: '有氧基礎區',
        purpose: '穩定累積跑量',
        why: '把週跑量堆起來，身體才有本錢做強度課。',
        feel: '輕鬆但不散漫，可以持續很久。',
        tooFast: '呼吸節奏亂掉就是超過了。',
    },
    long: {
        zone: 2, zoneName: '有氧基礎區',
        purpose: '拉長耐力上限',
        why: '重點是「跑久」不是「跑快」。時間本身就是刺激。',
        feel: '前三分之一要覺得慢到有點無聊，那才對。',
        tooFast: '前段跑太快，後段一定崩 —— 長跑的配速紀律比距離更重要。',
    },
    tempo: {
        zone: 3, zoneName: '節奏／乳酸閾值區',
        purpose: '推高「能撐住的速度」',
        why: '在乳酸剛開始堆積的邊緣持續跑，身體會學會處理它。',
        feel: '舒服地辛苦：只能講 3–5 個字，但還撐得住 20 分鐘。',
        tooFast: '講不出話就是跑進無氧了 —— 那是間歇課，不是節奏跑。',
    },
    hills: {
        zone: 4, zoneName: '無氧／閾值區',
        purpose: '練腿部力量與跑姿',
        why: '上坡是最安全的力量訓練 —— 高強度但落地衝擊小。',
        feel: '上坡用力、下坡完全放鬆走回來，別追下坡速度。',
        tooFast: '下坡衝刺最容易受傷，這堂課的下坡是休息。',
    },
    speed: {
        zone: 4, zoneName: '無氧區',
        purpose: '練速度與跑步經濟性',
        why: '短而快的刺激讓神經與肌肉學會更有效率地出力。',
        feel: '每一趟結束會很喘，但休息夠了還能再來一趟。',
        tooFast: '第一趟就跑到吐 —— 後面全毀。用「最後一趟還跑得動」的速度。',
    },
    interval: {
        zone: 4, zoneName: '無氧區',
        purpose: '推高最大攝氧量（VO₂max）',
        why: '反覆逼近極限再恢復，是提升心肺天花板最快的方式。',
        feel: '衝的時候幾乎講不出話，恢復段一定要慢到心率真的降下來。',
        tooFast: '恢復段偷跑會毀掉下一趟的品質 —— 恢復也是課表的一部分。',
    },
    race: {
        zone: 4, zoneName: '比賽強度',
        purpose: '驗收',
        why: '照比賽策略跑，不是拚訓練量。',
        feel: '依目標配速執行，前段務必保留。',
        tooFast: '前 2 公里超速是最常見的失敗原因。',
    },
};

/* ═══════════════════════════════════════════════════════════════════
   訓練效益：這一趟練完，身體會多出什麼
   ─────────────────────────────────────────────────────────────────
   使用者原話：「每個不同的訓練 block 要有不同的功效吧。」
   課表只寫「5.5 公里 輕鬆跑」，使用者不知道自己在換什麼。

   ⚠️ 講**成效**，不講機轉。
   「粒線體密度與微血管增生 ↑」「乳酸清除率 ↑」這種寫法是寫給教科書看的：
   使用者讀完並不知道自己會變得怎樣，而且三四條堆起來就是一整塊小字。
   每一種課只留：一句成效標題 ＋ 最多 2 條使用者感覺得到的結果 ＋ 一句提醒。
   每條 ≤ 14 字（drvn-interface-standard §2、§4.2）。
   ═══════════════════════════════════════════════════════════════ */
const GAINS = {
    recovery: {
        headline: '讓下一堂質量課跑得動',
        items: ['疲勞清得快一點', '不累積新的疲勞'],
        honest: '跑快了就沒意義',
    },
    easy: {
        headline: '同樣配速，越跑越省力',
        items: ['心肺底子變厚', '後段比較不掉速'],
        honest: '要 6–8 週才感覺得到',
    },
    zone2: {
        headline: '同樣配速，越跑越省力',
        items: ['心肺底子變厚', '脂肪更會出力'],
        honest: '要 6–8 週才感覺得到',
    },
    base: {
        headline: '把跑量堆起來',
        items: ['撐得起之後的強度課', '腳更耐得住衝擊'],
        honest: '每週加量別超過 10%',
    },
    long: {
        headline: '能連續跑更久',
        items: ['撞牆點往後推', '後半段不容易崩'],
        honest: '重點是跑久，不是跑快',
    },
    tempo: {
        headline: '能撐住的速度變快',
        items: ['同樣配速比較不喘', '比賽均速拉得上去'],
        honest: '跑太快就變成間歇課',
    },
    hills: {
        headline: '最不傷膝蓋的力量課',
        items: ['臀腿更有力', '步頻與前傾自然變好'],
        honest: '下坡用走的，別衝',
    },
    speed: {
        headline: '同樣速度花更少力氣',
        items: ['動作更有彈性', '最高速上限提高'],
        honest: '第一趟全力會練壞動作',
    },
    interval: {
        headline: '有氧馬力的上限拉高',
        items: ['進步最快的一種課', '累的時候還跑得穩'],
        honest: '恢復段偷跑會毀掉下一趟',
    },
    race: {
        headline: '把訓練換成成績',
        items: ['實測配速執行力', '試補給與節奏'],
        honest: '前 2 公里超速最常見',
    },
};

/** 這一趟練完會增加什麼（strength 等非跑步 block → null） */
export function runTypeGains(type, subtype) {
    return GAINS[subtype] || GAINS[type] || null;
}

/**
 * 沒對應到的 type（例如 strength 交叉訓練）→ null，呼叫端就不顯示這一區。
 *
 * ⚠ subtype 優先於 type：引擎會產出 { type:'recovery', subtype:'easy',
 *   title:'5.5 公里 輕鬆跑' } —— 這是一趟「輕鬆跑」，該給 Zone 2。
 *   若照 type 判成 recovery(Zone 1)，25 歲的人會拿到 96–115 bpm 的處方，
 *   那個心率基本上是在走路，跑 5.5 公里根本做不到 → 給錯處方。
 */
export function runTypeGuide(type, subtype) {
    return GUIDE[subtype] || GUIDE[type] || null;
}

/** 質量課（強度課）：這幾種排在疲勞時效果會顯著打折 */
export const isQualityRun = (b) =>
    ['tempo', 'interval', 'speed', 'hills', 'race'].includes(b?.subtype || b?.type);

/**
 * 把一個 brick 翻譯成新手看得懂的執行指令。
 *
 * @param {object} brick 計劃引擎的 brick（type / subtype / distance_km / duration_min / target_pace_label）
 * @param {number} [age] 使用者年齡；沒有就用 heartRateUtils 的預設（26）
 * @returns {null | {
 *   zone:number, zoneName:string, zoneLabel:string,
 *   hrMin:number, hrMax:number, hrLabel:string, maxHR:number,
 *   purpose:string, why:string, feel:string, tooFast:string,
 *   distanceKm:number|null, durationMin:number|null, paceLabel:string|null,
 *   headline:string
 * }}
 */
export function brickGuide(brick, age) {
    if (!brick) return null;
    const g = runTypeGuide(brick.type, brick.subtype);
    if (!g) return null;

    const zones = calculateHeartRateZones(age);
    const z = zones[`zone${g.zone}`];
    const distanceKm = Number(brick.distance_km ?? brick.distanceKm) || null;
    const durationMin = Number(brick.duration_min ?? brick.durationMin) || null;
    const paceLabel = brick.target_pace_label
        || (Number(brick.target_pace_sec) > 0
            ? `${Math.floor(brick.target_pace_sec / 60)}:${String(Math.round(brick.target_pace_sec % 60)).padStart(2, '0')}`
            : null);

    // 一句話講完「今天要做什麼」——卡片標題用這句，不用使用者自己拼湊
    const bits = [];
    if (distanceKm) bits.push(`${distanceKm} 公里`);
    else if (durationMin) bits.push(`${durationMin} 分鐘`);
    bits.push(`心率 ${z.min}–${z.max}`);
    const headline = `${bits.join('，')}`;

    return {
        gains: runTypeGains(brick.type, brick.subtype),
        zone: g.zone,
        zoneName: g.zoneName,
        zoneLabel: `Zone ${g.zone} · ${g.zoneName}`,
        hrMin: z.min, hrMax: z.max, hrLabel: `${z.min}–${z.max} bpm`,
        maxHR: zones.maxHR,
        purpose: g.purpose, why: g.why, feel: g.feel, tooFast: g.tooFast,
        distanceKm, durationMin, paceLabel,
        headline,
    };
}

/* ── 「今天原定要練什麼」防呆 ───────────────────────────────────────────
   使用者原話：「如果不是當天的訓練你要提醒使用者今天原定訓練什麼。」
   直接擋下來是錯的（人本來就會調整順序），但要先講清楚再讓他決定。 */

const WD = ['一', '二', '三', '四', '五', '六', '日'];

/** 今天是週幾（週一 = 0），與 dailyAgenda 的 JS_MON_FIRST 一致 */
export const todayIndexMonFirst = (now = new Date()) => (now.getDay() + 6) % 7;

/**
 * 檢查「使用者選的這一趟」是不是今天原定的課表。
 *
 * @param {object}   picked      使用者點的 brick
 * @param {object[]} weekBricks  本週所有 brick（含各自的 dayIndex，週一=0）
 * @param {Date}     [now]
 * @returns {null | { isToday:boolean, todayBrick:object|null, message:string, title:string }}
 *          回 null＝沒有排程資訊可比對（自由跑），不需要提醒
 */
export function checkNotTodaysBrick(picked, weekBricks, now = new Date()) {
    if (!picked || !Array.isArray(weekBricks) || !weekBricks.length) return null;

    const dayOf = (b) => {
        const v = b?.dayIndex ?? b?.day_index ?? b?.calendarDay;
        if (!Number.isFinite(Number(v))) return null;
        const n = Number(v);
        // calendarDay 是 1–7（週一=1），dayIndex 是 0–6（週一=0）——兩種都吃
        return n >= 1 && n <= 7 && b?.calendarDay != null ? n - 1 : n;
    };
    const ti = todayIndexMonFirst(now);
    const pickedDay = dayOf(picked);
    if (pickedDay == null) return null;              // 這張卡沒有排定日期 → 不提醒
    if (pickedDay === ti) return { isToday: true, todayBrick: picked, message: '', title: '' };

    const todayBrick = weekBricks.find((b) => dayOf(b) === ti) || null;
    const pickedName = picked.title || picked.type || '這一趟';
    const todayName = todayBrick
        ? (todayBrick.title || todayBrick.type)
        : null;
    const todayStatus = todayBrick?.status === 'completed' ? '（已完成）' : '';

    // 建議語要看今天那趟「實際是什麼課」才給，不要用「如果…」把判斷丟回給使用者
    let advice;
    if (!todayName) {
        advice = '提早跑沒問題，但記得把休息日往後挪一天 —— 一週至少留 1 天完全休息。';
    } else if (todayBrick?.status === 'completed') {
        advice = '今天那趟已經做完了，多跑這一趟等於加量 —— 確認今天身體吃得下再開始。';
    } else if (isQualityRun(todayBrick) && !isQualityRun(picked)) {
        advice = `今天那趟是質量課（強度課），排在疲勞時效果會打折。\n建議先把「${todayName}」做完，輕鬆跑再補。`;
    } else if (isQualityRun(picked) && !isQualityRun(todayBrick)) {
        advice = '你選的是質量課，今天原定是輕鬆日 —— 提前做強度會壓縮恢復，確認腿沒有殘留痠痛再開始。';
    } else {
        advice = '換順序沒問題，記得把今天那趟往後補上就好。';
    }

    return {
        isToday: false,
        todayBrick,
        title: '這不是今天排定的課表',
        message: todayName
            ? `今天（週${WD[ti]}）原定是「${todayName}」${todayStatus}。\n`
                + `你選的是週${WD[pickedDay]}的「${pickedName}」。\n\n${advice}`
            : `今天（週${WD[ti]}）原定是休息日。\n`
                + `你選的是週${WD[pickedDay]}的「${pickedName}」。\n\n${advice}`,
    };
}
