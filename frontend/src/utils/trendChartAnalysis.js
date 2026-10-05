/**
 * trendChartAnalysis.js — 趨勢頁每一張圖「點下去」的數據分析（單一真相源）
 * ══════════════════════════════════════════════════════════════════════
 * 以前點圖表跳出來的是一段固定的衛教文字（這個指標在練什麼、三條常識），
 * 跟你的數據無關 —— 每個人點進去看到的都一樣。
 * 現在點下去就是「這張圖的數據在說什麼」：
 *   { title, big: { value, unit, label }, facts: [..≤3], verdict, action }
 *     big      這張圖最重要的一個數字
 *     facts    佐證，一行「A · B · C」
 *     verdict  數據代表什麼（一句）
 *     action   接下來做什麼（一句）
 * 資料不到門檻 → { empty: '去跑…' } 只給一個動作，不編數字（介面標準 §7）。
 *
 * 門檻常數也搬到這裡，卡片上的一句話跟點開的分析用同一套數字。
 */
import { startOfWeek, toLocalDateKey } from './localDate';
import { CADENCE_IDEAL } from './cadenceCoach';

export const CARDIO_CONSTANTS = {
    FORM_PEAK: 5,          // form > 5 → 巔峰
    FORM_PRODUCTIVE: -10,  // form > -10 → 有效訓練／過度負荷分界
    FORM_OVERREACH: -25,   // form < -25 → 受傷風險
    FATIGUE_HIGH: 100,     // fatigue > 100 → 高風險
    INJURY_RISK_PCT: 70,   // injuryRisk ≥ 70 → 警示
    Z3_HIGH_PCT: 30,       // Z3 > 30% → 灰色地帶太多
    Z2_IDEAL_PCT: 70,      // Z2 ≥ 70% → 理想的極化
};
/** 最長一趟占週量的健康區間（25–35%） */
export const LSD_HEALTHY = { min: 0.25, max: 0.35 };

/** 週一起算，跟重訓頁、首頁同一支 startOfWeek */
export const getWeekKey = (date) => {
    const d = startOfWeek(date);
    return isNaN(d.getTime()) ? 'invalid' : toLocalDateKey(d);
};

/** 過去 N 天（日曆上的最近，不是最近 N 筆） */
export const withinDays = (sessions = [], days = 14) => {
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);
    cutoff.setDate(cutoff.getDate() - days);
    return (sessions || []).filter((s) => {
        const d = s?.date ? new Date(s.date) : null;
        return d && !isNaN(d) && d >= cutoff;
    });
};

const r1 = (n) => Math.round((Number(n) || 0) * 10) / 10;
const r0 = (n) => Math.round(Number(n) || 0);

export const TREND_CHART_TITLES = {
    lsd: '長距離慢跑', cadence: '步頻', heartRate: '心率區間', relativeEffort: '訓練負荷',
    fitnessFreshness: '體能與疲勞', vo2max: '有氧能力 VO₂max', trainingFocus: '今天適合練什麼',
};

/** 「?」裡的說明：每張圖看什麼（一句），規則收在這裡，不常駐在卡片上 */
export const TREND_CHART_GUIDE = {
    trainingFocus: '游標越靠左越適合練強度，越靠右越該休息',
    lsd: '每週最長的一趟有多長、占整週跑量幾成',
    heartRate: '最近兩週在各心率區間跑了多少時間',
    cadence: '每分鐘踩幾步；170–185 最省力、最護膝',
    relativeEffort: '過去 7 天每天的訓練壓力，看練了幾天、休了幾天',
    fitnessFreshness: '長期體能跟短期疲勞兩條線，差距就是今天的狀態',
    vo2max: '有氧引擎的最大馬力，看週平均有沒有往上',
};

export function analyzeTrendChart(metric, { sessions = [], trainingLoad = [], vo2Data = [], injuryRisk = 0 } = {}) {
    const title = TREND_CHART_TITLES[metric] || '';
    const C = CARDIO_CONSTANTS;
    switch (metric) {
        case 'lsd': {
            const buckets = {};
            sessions.forEach((s) => {
                const km = Number(s.distance) || 0;
                if (km <= 0 || !s.date) return;
                const k = getWeekKey(s.date);
                if (!buckets[k]) buckets[k] = { total: 0, longest: 0, date: s.date };
                buckets[k].total += km;
                if (km > buckets[k].longest) buckets[k].longest = km;
            });
            const weeks = Object.values(buckets).sort((a, b) => new Date(a.date) - new Date(b.date)).slice(-8);
            if (weeks.length < 2) return { title, empty: '再跑一週，就看得出最長一趟怎麼往前推' };
            const last = weeks[weeks.length - 1], first = weeks[0];
            const share = last.total > 0 ? Math.round((last.longest / last.total) * 100) : 0;
            const grew = r1(last.longest - first.longest);
            const facts = [`占這週跑量 ${share}%`, `${weeks.length} 週前 ${r1(first.longest)} 公里`, grew ? `${grew > 0 ? '+' : ''}${grew} 公里` : '持平'];
            let verdict, action;
            if (share < LSD_HEALTHY.min * 100) {
                verdict = '跑量攤得太平均，沒有一趟真的夠長';
                action = `這週排一趟 ${r1(last.total * 0.3)} 公里的慢長跑`;
            } else if (share > LSD_HEALTHY.max * 100) {
                verdict = '長跑占太多，週間其他幾趟跑太少';
                action = '週間多補一兩趟 30 分鐘輕鬆跑';
            } else if (grew > 0.5) {
                verdict = '比例健康，耐力天花板正在往上';
                action = `下次長跑加到 ${r1(last.longest * 1.1)} 公里，不超過一成`;
            } else {
                verdict = '比例健康，但最長一趟停在原地';
                action = `下次長跑加到 ${r1(last.longest * 1.1)} 公里`;
            }
            return { title, big: { value: r1(last.longest), unit: '公里', label: '這週最長一趟' }, facts, verdict, action };
        }
        case 'cadence': {
            const data = sessions.filter((s) => s.cadence > 0).slice(-10).map((s) => Math.round(s.cadence));
            if (data.length < 2) return { title, empty: data.length === 1 ? '再跑一次有步頻的紀錄，就看得出趨勢' : '戴著手錶跑一次，才有步頻' };
            const [LO, HI] = CADENCE_IDEAL;
            const last = data[data.length - 1];
            const avg = r0(data.reduce((a, b) => a + b, 0) / data.length);
            const inZone = data.filter((c) => c >= LO && c <= HI).length;
            const recent = withinDays(sessions, 14).filter((s) => s.cadence > 0);
            const chronic = recent.length >= 3 && recent.every((s) => s.cadence < 165);
            const facts = [`${data.length} 次平均 ${avg}`, `${inZone}／${data.length} 次在 ${LO}–${HI}`, last > data[0] ? '比第一次高' : last < data[0] ? '比第一次低' : '跟第一次一樣'];
            let verdict, action;
            if (chronic) { verdict = '最近連續幾次都低於 165，步子跨太大'; action = '維持配速、縮小步伐，節拍器設 170 跑 10 分鐘'; }
            else if (last < 165) { verdict = '這次步頻偏低，每一步衝擊比較大'; action = '下次跑步把步伐縮小一點'; }
            else if (last > HI) { verdict = '這次步頻很高，多半是間歇或下坡'; action = '輕鬆跑時確認心率沒有跟著飆高'; }
            else if (last >= LO) { verdict = '落在最省力的區間'; action = '維持就好'; }
            else { verdict = '接近理想，還差一點'; action = `用 ${LO} 拍的節拍器跑幾次`; }
            return { title, big: { value: last, unit: 'spm', label: '最近一次' }, facts, verdict, action };
        }
        case 'heartRate': {
            const zone = [0, 0, 0, 0, 0];
            let total = 0;
            withinDays(sessions, 14).forEach((s) => (s.zones?.array || []).forEach((z, i) => { zone[i] += Number(z) || 0; total += Number(z) || 0; }));
            if (total <= 0) return { title, empty: sessions.length ? '戴心率錶跑一次，就看得到區間分布' : '去跑第一趟' };
            const pct = zone.map((t) => Math.round((t / total) * 100));
            const hard = pct[3] + pct[4];
            const facts = [`輕鬆 Z1 ${pct[0]}%`, `灰色 Z3 ${pct[2]}%`, `高強度 Z4–5 ${hard}%`];
            let verdict, action;
            if (pct[1] >= C.Z2_IDEAL_PCT) { verdict = '大部分時間在有氧區，分配很標準'; action = '照這個比例練下去'; }
            else if (pct[2] > C.Z3_HIGH_PCT) { verdict = '太多時間在不上不下的 Z3，累了卻練不到有氧'; action = '輕鬆跑刻意放慢，慢到能講完整句話'; }
            else if (hard > 30) { verdict = '高強度占太多，最近練得很操'; action = '接下來兩天只跑 Z1 的恢復跑'; }
            else { verdict = '分配還可以，有氧區再多一點會更好'; action = `把 Z2 從 ${pct[1]}% 慢慢拉到 70%`; }
            return { title, big: { value: pct[1], unit: '%', label: '有氧 Z2（近 14 天）' }, facts, verdict, action };
        }
        case 'relativeEffort': {
            const last7 = (trainingLoad || []).slice(-7);
            if (!(trainingLoad || []).some((l) => l.trimp > 0)) return { title, empty: '去跑一趟，就開始算訓練負荷' };
            const total = last7.reduce((a, d) => a + (d.trimp || 0), 0);
            const avg = total / 7;
            const days = last7.filter((d) => d.trimp > 0).length;
            let lastT = 0;
            for (let i = last7.length - 1; i >= 0; i--) if (last7[i].trimp > 0) { lastT = last7[i].trimp; break; }
            const ratio = avg > 0 ? r1(lastT / avg) : 0;
            const facts = [`練 ${days} 天、休 ${7 - days} 天`, `最近一次 ${r0(lastT)}`, `是平均的 ${ratio} 倍`];
            let verdict, action;
            if (lastT > avg * 1.5) { verdict = '最近一次比這週平均重很多'; action = '今天睡飽、吃夠，明天排輕鬆跑'; }
            else if (lastT < avg * 0.5) { verdict = '最近一次是輕鬆的恢復'; action = '恢復好了就可以排下一堂質量課'; }
            else { verdict = '負荷穩定，節奏剛好'; action = '照課表練'; }
            if (days >= 7) { verdict = '七天都有練，沒有休息日'; action = '這週至少排一天完全休息'; }
            return { title, big: { value: r0(total), unit: '', label: '過去 7 天總負荷' }, facts, verdict, action };
        }
        case 'fitnessFreshness': {
            if (!(trainingLoad || []).length) return { title, empty: '累積兩三週的跑步，這張圖才畫得出來' };
            const last = trainingLoad[trainingLoad.length - 1] || {};
            const ago = trainingLoad[Math.max(0, trainingLoad.length - 15)] || {};
            const fitDelta = r1((last.fitness || 0) - (ago.fitness || 0));
            const form = r0(last.form);
            const facts = [`體能 ${r0(last.fitness)}`, `疲勞 ${r0(last.fatigue)}`, `體能兩週 ${fitDelta >= 0 ? '+' : ''}${fitDelta}`];
            const risky = injuryRisk >= C.INJURY_RISK_PCT || (last.form || 0) < C.FORM_OVERREACH;
            let verdict, action;
            if (risky) { verdict = '疲勞明顯高過體能，身體還沒吸收完'; action = '接下來兩天休息或只跑 Z1'; }
            else if ((last.form || 0) > 10 && (last.fitness || 0) > 30) { verdict = '疲勞退了、體能還在，正是狀態最好的時候'; action = '這幾天適合挑戰紀錄或質量課'; }
            else if ((last.form || 0) < C.FORM_PRODUCTIVE) { verdict = '正在承受有效的訓練壓力'; action = '注意睡眠跟蛋白質，下週排一個輕鬆週'; }
            else { verdict = fitDelta > 0 ? '體能穩定往上、疲勞在控制內' : '體能持平，疲勞也不高'; action = fitDelta > 0 ? '維持現在的訓練量' : '可以把週量加一成'; }
            return { title, big: { value: form > 0 ? `+${form}` : form, unit: '', label: '今天的狀態（體能 − 疲勞）' }, facts, verdict, action };
        }
        case 'vo2max': {
            const list = (vo2Data || []).filter((e) => Number(e.vo2) > 0);
            if (!list.length) return { title, empty: sessions.length ? '戴心率錶跑一次，才算得出 VO₂max' : '去跑第一趟' };
            const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
            const days = (e) => (Date.now() - new Date(e.rawDate || e.date || 0)) / 86400000;
            const thisW = avg(list.filter((e) => days(e) < 7).map((e) => e.vo2));
            const lastW = avg(list.filter((e) => days(e) >= 7 && days(e) < 14).map((e) => e.vo2));
            const latest = r1(list[list.length - 1].vo2);
            const delta = thisW != null && lastW != null ? r1(thisW - lastW) : null;
            const facts = [thisW != null ? `本週平均 ${r1(thisW)}` : '本週沒有新數值', lastW != null ? `上週平均 ${r1(lastW)}` : '上週沒有數值', `${list.length} 筆`];
            let verdict, action;
            if (delta != null && delta > 1.5) { verdict = '週平均明顯上升，是真的進步'; action = '維持每週一次間歇'; }
            else if (delta != null && delta < -1.5) { verdict = '週平均掉得比誤差還多'; action = '先看睡眠與疲勞，不要再加量'; }
            else { verdict = delta == null ? '數值還不夠兩週，先累積' : '在誤差範圍內，持平'; action = '想往上推，每週加一次亞索 800 間歇'; }
            return { title, big: { value: latest, unit: '', label: '最近一次' }, facts, verdict, action };
        }
        case 'trainingFocus': {
            if (!(trainingLoad || []).length) return { title, empty: '去跑第一趟，就知道今天適合練什麼' };
            const last = trainingLoad[trainingLoad.length - 1] || {};
            const facts = [`狀態 ${r0(last.form)}`, `疲勞 ${r0(last.fatigue)}`, `受傷風險 ${r0(injuryRisk)}%`];
            let big, verdict, action;
            if (injuryRisk >= C.INJURY_RISK_PCT || (last.fatigue || 0) > C.FATIGUE_HIGH) { big = '休息'; verdict = '疲勞太高，硬練只會增加受傷機率'; action = '今天完全休息'; }
            else if ((last.form || 0) < C.FORM_PRODUCTIVE) { big = '恢復'; verdict = '身體正承受高負荷'; action = '休息，或只跑 20 分鐘 Z1'; }
            else if ((last.form || 0) > C.FORM_PEAK && (last.fitness || 0) > 20) { big = '強度'; verdict = '體能充沛、疲勞消退'; action = '今天適合間歇或挑戰紀錄'; }
            else { big = '有氧'; verdict = '狀態穩定，適合累積跑量'; action = '跑 Z2 輕鬆跑'; }
            return { title, big: { value: big, unit: '', label: '今天適合' }, facts, verdict, action };
        }
        default:
            return { title, empty: '這張圖還沒有分析' };
    }
}

export default analyzeTrendChart;
