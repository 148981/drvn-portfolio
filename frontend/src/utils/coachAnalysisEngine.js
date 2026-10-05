// coachAnalysisEngine.js  (v2 — 混合式：開場總評 + 精選 4–5 卡 + 週期化)
// ──────────────────────────────────────────────────────────────────────────
// DRVN 跑步教練分析引擎。依「教練分析引擎_規則書_v2.md」實作。
//   • 開場一段教練總評（定調 + 匹配判讀 + 最強項）。
//   • 候選池打分 → 取前 4–5 張重點卡（保證多樣性、至少 1 讚 1 行動、心率卡不過量）。
//   • 恆定一張「下一步 · 週期化」卡（恢復時數 / 下次練什麼 / 下週方向）。
//   • 語氣：一句判讀 + 一句白話 + 一句下一步。純函式、無 React 依賴。
// ──────────────────────────────────────────────────────────────────────────

import { computeDistanceRankings } from './personalRecords';

const fmtPace = (sec) => {
    if (!sec || sec <= 0) return '—';
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}'${String(s).padStart(2, '0')}"`;
};
// 秒數 → 人話（「3 分 50 秒」／「42 秒」）— 用在「比先前最佳快了 X」
const fmtDuration = (sec) => {
    const v = Math.abs(Math.round(sec || 0));
    if (v <= 0) return '0 秒';
    const m = Math.floor(v / 60);
    const s = v % 60;
    return m > 0 ? (s > 0 ? `${m} 分 ${s} 秒` : `${m} 分`) : `${s} 秒`;
};
const avg = (arr) => (arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);
const getPace = (s) => s?.pace ?? s?.avg_pace ?? s?.avgPace ?? 0;
const getHR = (s) => s?.avg_hr ?? s?.avgHR ?? s?.heartRate ?? 0;
const getKm = (s, i) => s?.km ?? s?.split_index ?? i + 1;

// ── 衍生指標 ──────────────────────────────────────────────────────────────
export function computeMetrics(session) {
    const stats = session.stats || {};
    const splits = (session.splitsAnalysis?.length ? session.splitsAnalysis : (stats.splits || session.splits)) || [];
    const stream = session.stream_data || {};
    const deep = session.deepData || {};
    const deepMetrics = deep.deep_metrics || {};
    const physio = deep.physio_metrics || {};

    const distanceKm = Number(stats.distance ?? stats.distance_km ?? 0);
    const durationSec = Number(stats.duration ?? stats.duration_seconds ?? 0);
    const avgPace = Number(stats.avgPace ?? stats.pace ?? 0) || (distanceKm > 0 ? durationSec / distanceKm : 0);

    const paces = splits.map(getPace).filter((p) => p > 0);
    const fastest = paces.length ? Math.min(...paces) : 0;
    const slowest = paces.length ? Math.max(...paces) : 0;
    const fastestIdx = splits.findIndex((s) => getPace(s) === fastest);
    const paceDiff = splits.length >= 2 ? getPace(splits[splits.length - 1]) - getPace(splits[0]) : 0;
    const paceSpread = paces.length ? slowest - fastest : 0;
    // 🩹 誠實：分段是否為「真實逐段量測」而非把平均值塞進每一段。
    //   合成資料的特徵：所有分段配速幾乎相同（波動 < 3 秒/km）或只有 1 種值。
    const distinctPaces = new Set(paces.map((p) => Math.round(p)));
    const splitsReliable = paces.length >= 2 && distinctPaces.size >= 2 && paceSpread >= 3;

    // 運動類型：騎車不套用跑步的步頻/步幅/亮點分段判讀。
    const sport = String(
        session.sport ?? session.sport_type ?? session.activity_type ?? session.mode ?? stats.sport ?? 'run'
    ).toLowerCase();
    const isRun = !/(bike|cycl|ride|腳踏|單車|自行|騎)/.test(sport);

    const hrValid = (stream.heart_rate || []).filter((h) => h > 40);
    let hrDrift = 0, meanHR = 0, peakHR = 0, firstHalf = 0, secondHalf = 0;
    if (hrValid.length > 10) {
        const half = Math.floor(hrValid.length / 2);
        firstHalf = avg(hrValid.slice(0, half));
        secondHalf = avg(hrValid.slice(half));
        hrDrift = secondHalf - firstHalf;
        meanHR = Math.round(avg(hrValid));
        peakHR = Math.round(Math.max(...hrValid));
    }

    const zoneDist = deepMetrics.zone_distribution || stats.zoneStats || {};
    const zTotal = Object.values(zoneDist).reduce((a, b) => a + (Number(b) || 0), 0);
    const zonePct = (keys) => (zTotal > 0 ? keys.reduce((s, k) => s + (Number(zoneDist[k]) || 0), 0) / zTotal * 100 : 0);
    const highPct = zonePct(['Anaerobic', 'anaerobic', 'Extreme', 'extreme', 'EXTREME']);
    const lowPct = zonePct(['Warm Up', 'Warm-up', 'warmup', 'Recovery']) + zonePct(['Fat Burn', 'fatburn']);

    const ef = parseFloat(physio.ef?.current || 0);
    const decoup = physio.decoupling && physio.decoupling.value != null ? Number(physio.decoupling.value) : null;
    const decoupEf1 = physio.decoupling?.first_half_ef, decoupEf2 = physio.decoupling?.second_half_ef;

    const gain = Number(stats.elevationGain ?? stats.elevation_gain ?? 0);
    const gainPerKm = distanceKm > 0 ? gain / distanceKm : 0;

    const cadArr = (stream.cadence || []).filter((c) => c > 0);
    const cadAvg = Number(stats.avgCadence) || Math.round(avg(cadArr));
    const strideAvg = Number(stats.avgStride) || Number(avg((stream.stride || []).filter((s) => s > 0)).toFixed(2));
    const recHrs = deepMetrics.recovery_hours || Math.max(4, Math.round((stats.score || 0) / 5));
    // 🩹 誠實：步頻是否為「逐秒真實量測」。整條串流同一個值＝感測來源沒有真的在動作偵測，
    //   多半是把單一數字塞滿，不可拿來下「步頻偏低要提速」的處方（那會誤導使用者）。
    const cadPresent = cadArr.length > 0 || Number(stats.avgCadence) > 0;
    const cadReliable = cadArr.length > 10
        ? new Set(cadArr.map((c) => Math.round(c))).size > 1
        : false;

    return {
        stats, splits, distanceKm, durationSec, avgPace, sport, isRun,
        // 🚴 自行車：用「速度 km/h」而非配速；scoreLabel 也切成 Ride Score。
        isBike: !isRun,
        avgSpeedKmh: durationSec > 0 ? +(distanceKm / (durationSec / 3600)).toFixed(1) : 0,
        fastest, slowest, fastestIdx, paceDiff, paceSpread, splitsReliable,
        hrValid, hrDrift, meanHR, peakHR, firstHalf, secondHalf,
        highPct, lowPct, ef, decoup, decoupEf1, decoupEf2,
        gain, gainPerKm, cadAvg, strideAvg, cadPresent, cadReliable, recHrs,
    };
}

// ── 候選池 ────────────────────────────────────────────────────────────────
//  🟢 v2.1：教練卡只保留「初中階聽得懂的表現評判」4 維度：
//     配速策略 / 心率表現 / 步頻 / 配速穩定度。
//     進階指標（EF、脫鉤、爬升力學）留在 deep analysis，不放這裡。
//     週期化建議另由 buildPeriodization 輸出到「下次預約」，不進教練卡。
export function buildPool(M) {
    const pool = [];
    const add = (o) => pool.push(o);

    // C1 配速策略
    if (M.splits.length >= 2) {
        if (M.paceDiff < -8) add({
            category: 'pacing', tone: 'praise', priority: 90,
            title: '教科書級負分割', metric: `後段快 ${Math.abs(Math.round(M.paceDiff))}″/km`,
            verdict: `後半比前半快了 ${Math.abs(Math.round(M.paceDiff))} 秒/公里，是菁英跑法。`,
            why: '代表你前段沒衝過頭、把力氣留到後面。',
            action: '維持策略；下次後段再快 3–5 秒/km 挑戰極限。',
        });
        else if (M.paceDiff > 25) add({
            category: 'pacing', tone: 'warn', priority: 95,
            title: '體能分配需調整', metric: `後段掉 ${Math.round(M.paceDiff)}″/km`,
            verdict: `後段掉了 ${Math.round(M.paceDiff)} 秒/公里，起跑偏快。`,
            why: '前段太快會提早耗盡肝醣，後段就會撞牆掉速。',
            action: '下次前 2 公里刻意放慢 10–15 秒。',
        });
        else if (M.paceSpread > 0 && M.paceSpread < 15 && M.splits.length >= 3) add({
            category: 'pacing', tone: 'praise', priority: 60,
            title: '穩定如節拍器', metric: `波動 ${Math.round(M.paceSpread)}″`,
            verdict: `全程配速波動僅 ${Math.round(M.paceSpread)} 秒。`,
            why: '穩定的配速代表你對節奏掌握度高、能量輸出平均。',
            action: '加入節奏跑（tempo）提升乳酸閾值。',
        });
    }

    // C2 心率智慧
    if (M.hrValid.length > 10) {
        if (M.hrDrift > 10) add({
            category: 'heart', tone: 'warn', priority: 88,
            title: '偵測到心率漂移', metric: `+${Math.round(M.hrDrift)} bpm`,
            verdict: `後半心率高了 ${Math.round(M.hrDrift)} bpm（${Math.round(M.firstHalf)}→${Math.round(M.secondHalf)}）。`,
            why: '配速沒變心率卻一直升，多半是脫水或體溫升高。',
            action: '長跑每 15–20 分鐘補水；天熱配速再保守。',
        });
        else if (M.hrDrift < -4) add({
            category: 'heart', tone: 'praise', priority: 70,
            title: '心率控制出色', metric: `${Math.round(M.hrDrift)} bpm`,
            verdict: `維持配速的同時，後段心率還降了 ${Math.abs(Math.round(M.hrDrift))} bpm。`,
            why: '代表身體進入省力的有氧狀態，是訓練有素的訊號。',
            action: '此配速適合拉長，下次多跑 1–2 公里累積有氧。',
        });
        if (M.highPct > 50) add({
            category: 'heart', tone: 'warn', priority: 85,
            title: '高強度佔比偏高', metric: `${Math.round(M.highPct)}%`,
            verdict: `無氧＋極限區間佔了 ${Math.round(M.highPct)}%。`,
            why: '若非比賽或間歇課，長期高強度易累積疲勞、增加受傷風險。',
            action: '採 80/20：八成輕鬆有氧、兩成才高強度。',
        });
        else if (M.lowPct > 80 && M.distanceKm >= 3) add({
            category: 'heart', tone: 'praise', priority: 55,
            title: '完美的輕鬆跑', metric: `${Math.round(M.lowPct)}% 低強度`,
            verdict: `幾乎全程在低心率區間（${Math.round(M.lowPct)}%）。`,
            why: '輕鬆跑打底有氧引擎，是高強度日之間最重要的修復訓練。',
            action: '保持，把這種跑當週課表的主食。',
        });
    }

    // 🟢 v2.1：EF / 有氧脫鉤 已移除 → 屬進階指標，改由 deep analysis 呈現，不放教練卡。

    // C5 步頻 — 只在「跑步」且「步頻為真實逐秒量測」時判讀。
    //   騎車不套用；步頻是塞出來的常數就誠實說沒偵測到，不硬下處方。
    if (M.isRun && M.cadReliable && M.cadAvg > 0) {
        if (M.cadAvg < 165) add({
            category: 'gait', tone: 'info', priority: 65,
            title: '步頻偏低', metric: `${M.cadAvg} spm`,
            verdict: `平均步頻 ${M.cadAvg} 步/分鐘偏低${M.strideAvg > 0 ? `，步幅 ${M.strideAvg} 公尺` : ''}。`,
            why: '這不是要你跑更快——是把步子改小、頻率加快，配速不變也能減少跨步煞車與膝蓋衝擊。',
            action: '用節拍器設 175 spm，維持現在的速度、只把步伐縮短一點。',
        });
        else add({
            category: 'gait', tone: 'praise', priority: 30,
            title: '步頻理想', metric: `${M.cadAvg} spm`,
            verdict: `平均步頻 ${M.cadAvg} 步/分鐘，落在理想區。`,
            why: '170–180 spm 通常更省力、更護膝。',
            action: '維持即可。',
        });
    } else if (M.isRun && M.cadPresent && !M.cadReliable) {
        add({
            category: 'gait', tone: 'info', priority: 40,
            title: '步頻未取得逐秒數據', metric: 'N/A',
            verdict: '這次步頻整段是同一個數值，代表沒有真的逐秒量測。',
            why: '手機放口袋或未授權動作感測時，步頻無法逐秒偵測——沒有真數據我們就不做判讀。',
            action: '配戴 Apple Watch，或在權限中開啟「動作與健身」後戶外跑，即可取得真實步頻曲線。',
        });
    }

    // C6 地形
    if (M.gainPerKm > 15) add({
        category: 'terrain', tone: 'info', priority: 58,
        title: '丘陵地形 · 隱形肌力課', metric: `+${M.gain}m`,
        verdict: `總爬升 ${M.gain} 公尺，平均每公里 ${Math.round(M.gainPerKm)} 公尺。`,
        why: '爬坡墊高心率與配速數字，但同時練到臀腿肌力。',
        action: '評估配速時加分看待；想專練速度可改平路。',
    });

    // C7 亮點段 — 只在有「真實逐段配速（有波動）」時才選最快段。
    //   若分段是把平均塞進每一段（無波動），fastest 會等於平均、fastestIdx 永遠指向第 1 段，
    //   那是假亮點；此時不硬指某一公里，改用整體完成度當肯定。
    if (M.splitsReliable && M.fastestIdx >= 0 && M.fastest > 0) {
        const fhr = getHR(M.splits[M.fastestIdx]);
        let why = '這段步幅與步頻達到最佳平衡，跑姿經濟性最高。';
        if (fhr > 0 && fhr < 155) why = `這段心率只有 ${Math.round(fhr)} bpm——速度快、心臟卻很省，心肺效率極佳。`;
        else if (fhr >= 170) why = `心率衝到 ${Math.round(fhr)} bpm 仍守住配速，抗乳酸耐力很強。`;
        add({
            category: 'highlight', tone: 'praise', priority: 75,
            title: `本場亮點 · 第 ${getKm(M.splits[M.fastestIdx], M.fastestIdx)} 公里`, metric: fmtPace(M.fastest),
            verdict: `這是你今天跑得最漂亮的一段（${fmtPace(M.fastest)}）。`,
            why, action: '記住這段的呼吸節奏，那就是你的甜蜜點配速。',
        });
    } else if (M.distanceKm >= 1 && M.avgPace > 0) {
        add({
            category: 'highlight', tone: 'praise', priority: 50,
            title: '穩定完成', metric: fmtPace(M.avgPace),
            verdict: `全程平均配速 ${fmtPace(M.avgPace)}，${M.distanceKm.toFixed(2)} 公里穩定收下。`,
            why: '這次沒有可靠的逐段配速可挑「最快段」，但整體節奏維持得很好。',
            action: '配戴手錶或戶外開啟 GPS 逐段記錄，下次就能標出你今天最漂亮的那一公里。',
        });
    }

    return pool;
}

// ── 開場總評 ──────────────────────────────────────────────────────────────
function buildOpeningSummary(M, pool) {
    const level = M.distanceKm >= 15 ? '長距離耐力課'
        : M.distanceKm >= 8 ? '中距離節奏課'
        : M.distanceKm >= 3 ? '基礎有氧課' : '短程啟動課';

    let match = '';
    if (M.meanHR > 0) {
        if (M.meanHR > 165) match = ' 今天強度偏高，屬於刺激日。';
        else if (M.meanHR < 150) match = ' 速度與心率都在甜蜜點，效率很好。';
        else match = ' 配速與心率大致匹配，是一堂穩定的課。';
    }
    const summaryText = `完成 ${M.distanceKm.toFixed(2)} 公里、${Math.round(M.durationSec / 60)} 分鐘，`
        + `平均配速 ${fmtPace(M.avgPace)}。${match}`
        + (M.meanHR > 0 ? ` 平均心率 ${M.meanHR}、峰值 ${M.peakHR} bpm。` : '');

    const bestCard = pool.filter((c) => c.tone === 'praise').sort((a, b) => b.priority - a.priority)[0];
    const bestText = bestCard ? `今天最亮眼：${bestCard.title}。` : '基礎穩定，接下來把重點放在下方建議。';

    return { level, summaryText, bestText };
}

// ── 卡片截斷：取前 5、多樣性、平衡 ───────────────────────────────────────
function selectTopCards(pool, N = 5) {
    const sorted = [...pool].sort((a, b) => b.priority - a.priority);
    const picked = [];
    const catCount = {};
    let heartWarn = 0;
    for (const c of sorted) {
        if (picked.length >= N) break;
        const cat = c.category;
        if ((catCount[cat] || 0) >= 2) continue;               // 同類最多 2
        if (cat === 'heart' && c.tone === 'warn' && heartWarn >= 1) continue; // 心率 warn 最多 1
        picked.push(c);
        catCount[cat] = (catCount[cat] || 0) + 1;
        if (cat === 'heart' && c.tone === 'warn') heartWarn++;
    }
    // 平衡：至少 1 praise
    if (!picked.some((c) => c.tone === 'praise')) {
        const p = sorted.find((c) => c.tone === 'praise' && !picked.includes(c));
        if (p) picked[picked.length - 1] = p;
    }
    // 平衡：至少 1 可行動（warn/info 帶 action）
    if (!picked.some((c) => (c.tone === 'warn' || c.tone === 'info') && c.action)) {
        const a = sorted.find((c) => (c.tone === 'warn' || c.tone === 'info') && c.action && !picked.includes(c));
        if (a) picked[picked.length - 1] = a;
    }
    return picked;
}

// ── 週期化卡（恆定最後一張） ─────────────────────────────────────────────
function buildPeriodization(M) {
    let recWhy;
    if (M.recHrs >= 24) recWhy = '今天負荷較重，肌肉與神經需要較長修復。';
    else if (M.recHrs >= 12) recWhy = '中等負荷，肌肉有微損傷但可快速修復。';
    else recWhy = '負荷輕，身體很快就能回到備戰狀態。';

    let nextWhat;
    if ((M.decoup != null && M.decoup > 8) || M.highPct > 50) nextWhat = '下次：輕鬆有氧長跑，把有氧基礎打厚。';
    else if (M.paceDiff > 25) nextWhat = '下次：均速課，前 2 公里刻意放慢。';
    else if (M.isRun && M.cadReliable && M.cadAvg > 0 && M.cadAvg < 165) nextWhat = '下次：步頻課，用節拍器維持 175 spm。';
    else if (M.ef >= 1.3) nextWhat = '下次：節奏跑或進階間歇，挑戰速度。';
    else nextWhat = '下次：維持穩定有氧，緩步加量。';

    let dir;
    if (M.decoup != null && M.decoup > 8) dir = '下週方向：週跑量 +10% 以內，先把耐力撐穩。';
    else if (M.ef > 0) dir = `下週方向：目標配速 ${fmtPace(Math.max(120, M.avgPace - 5))}，EF 每 +0.05 為一個里程碑。`;
    else dir = '下週方向：週跑量 +10% 以內，穩定加量。';

    return {
        category: 'plan', tone: 'coach',
        title: `下一步 · 恢復 ${M.recHrs} 小時`, metric: `${M.recHrs}h`,
        verdict: `${recWhy}`,
        why: nextWhat,
        action: dir,
        // 給「下次預約」與「公布欄」用的結構化欄位
        recoveryHours: M.recHrs,
        nextWorkout: nextWhat.replace(/^下次：/, ''),
        weekDirection: dir.replace(/^下週方向：/, ''),
    };
}

// ── Deep Analysis 專用：進階指標的完整教練解說（EF / 脫鉤 / HRR / 高強度佔比） ──
//   這批放進 deep analysis，不進結算頁的簡潔卡。
function buildDeepCards(M) {
    const deep = [];
    const add = (o) => deep.push(o);

    if (M.ef > 0) {
        const good = M.ef >= 1.3;
        add({
            key: 'ef', category: 'efficiency', tone: good ? 'praise' : 'info',
            title: '心肺效率 EF', metric: `EF ${M.ef.toFixed(2)}`,
            verdict: `效率因子 EF＝${M.ef.toFixed(2)}（每一次心跳換到的速度）。`,
            why: 'EF 越高＝同樣心跳能跑更快，是長期有氧進步最可靠的指標，比單看配速更誠實。',
            action: good ? '效率很好，持續累積有氧跑量即可。' : '想提升 EF：規律的輕鬆長跑比偶爾的衝刺更有效。',
        });
    }
    if (M.decoup != null) {
        // 統一分級（與 physio 解說卡一致）：<5% 極佳、5–10% 可接受、>10% 衰退
        const bad = M.decoup > 10;
        const mid = M.decoup > 5 && M.decoup <= 10;
        add({
            key: 'decoupling', category: 'efficiency', tone: bad ? 'warn' : mid ? 'info' : 'praise',
            title: '有氧脫鉤 Decoupling', metric: `${M.decoup.toFixed(1)}%`,
            verdict: bad
                ? `前後半效率掉了 ${M.decoup.toFixed(1)}%${M.decoupEf1 ? `（${M.decoupEf1}→${M.decoupEf2}）` : ''}，耐力出現衰退。`
                : mid
                    ? `前後半效率差 ${M.decoup.toFixed(1)}%，剛好碰到你的耐力邊界，仍在可接受範圍。`
                    : `前後半效率僅差 ${M.decoup.toFixed(1)}%，耐力撐得很穩。`,
            why: '脫鉤＝後半段「心率對配速的性價比變差」。低於 5% 代表有氧基礎扎實；超過 10% 代表這距離還偏吃力。',
            action: bad
                ? '這個距離對你還偏長，先穩定累積週跑量，脫鉤會慢慢下降。'
                : mid
                    ? '維持這個距離多跑幾次，等脫鉤降到 5% 以下再拉長距離。'
                    : '耐力門檻很穩，可以挑戰更長距離了。',
        });
    }
    if (M.highPct > 50) add({
        key: 'intensity', category: 'heart', tone: 'warn',
        title: '高強度佔比偏高', metric: `${Math.round(M.highPct)}%`,
        verdict: `無氧＋極限區間佔了 ${Math.round(M.highPct)}%。`,
        why: '若非比賽或間歇課，長期高強度會累積疲勞、增加受傷風險。耐力的地基是大量的輕鬆跑。',
        action: '採 80/20 原則：八成跑量放在輕鬆有氧區，兩成才做高強度。',
    });
    return deep;
}

// ── physio 卡點擊展開用：依 metric key 回傳一段教練白話解說 ──────────────
//   UI 傳入 'ef' | 'decoupling' | 'hrr'，回傳 { title, verdict, why, action } | null
export function metricCoachNote(metricKey, session = {}) {
    const M = computeMetrics(session);
    const found = buildDeepCards(M).find((c) => c.key === metricKey);
    if (found) return found;
    // HRR 沒進 deepCards（來自 physio.hrr），單獨處理
    if (metricKey === 'hrr') {
        const hrr = Number(session?.deepData?.physio_metrics?.hrr?.value) || 0;
        const good = hrr >= 20; // 與 physio 解說卡、chartCoachNote 一致：>20 良好、12–20 正常、<12 需注意
        return {
            key: 'hrr', title: '心率恢復 HRR', metric: `${hrr} bpm`, tone: good ? 'praise' : 'info',
            verdict: `結束後心率下降了 ${hrr} bpm。`,
            why: '運動後 1 分鐘心率下降越多，代表自律神經恢復越快、心肺越健康。>20 為佳、12–20 屬正常範圍。',
            action: good ? '恢復能力不錯，維持規律有氧即可。' : '多累積輕鬆有氧跑量，HRR 會逐步提升。',
        };
    }
    return null;
}

/**
 * 主入口 — 混合式教練報告（雙層）。
 * @returns {{ opening, cards, deepCards, nextStep, insights, summary }}
 *   • opening   : 開場總評（結算頁頂部一段）
 *   • cards     : 簡潔 4 張表現卡（配速策略/心率/步頻/穩定度）→ 結算頁一般區、初中階看
 *   • deepCards : 進階指標完整解說（EF/脫鉤/高強度）→ deep analysis
 *   • nextStep  : 週期化（恢復時數/下次練什麼/下週方向）→ 「下次預約」與公布欄用
 *   • insights  : = cards（相容舊畫面；週期化不再混進來）
 */
export function buildCoachReport(session = {}) {
    const M = computeMetrics(session);

    // 資料不足
    if (M.distanceKm < 1 || M.splits.length < 1) {
        const nextStep = buildPeriodization(M);
        const opening = {
            level: '短程啟動課',
            summaryText: `完成 ${M.distanceKm.toFixed(2)} 公里、${Math.round(M.durationSec / 60)} 分鐘。`,
            bestText: '資料還不夠深入分析。',
        };
        const cards = [{
            category: 'highlight', tone: 'info', priority: 0,
            title: '資料不足', metric: `${M.distanceKm.toFixed(1)}K`,
            verdict: '目前距離較短，深層分析尚未解鎖。',
            why: '5 公里以上才有足夠分段能看出配速策略與耐力。',
            action: '下次把距離拉到 5 公里以上，解鎖完整教練分析。',
        }];
        return { opening, cards, deepCards: [], nextStep, insights: cards, summary: summarize(M, cards) };
    }

    const pool = buildPool(M);
    const opening = buildOpeningSummary(M, pool);
    const cards = selectTopCards(pool, 4);   // 🟢 簡潔：4 張表現卡
    const deepCards = buildDeepCards(M);      // 🟢 進階：EF/脫鉤/高強度 → deep analysis
    const nextStep = buildPeriodization(M);   // 🟢 週期化 → 下次預約 / 公布欄

    return { opening, cards, deepCards, nextStep, insights: cards, summary: summarize(M, cards) };
}

function summarize(M, cards) {
    return {
        distanceKm: M.distanceKm, durationSec: M.durationSec, avgPace: M.avgPace,
        count: cards.length,
        praise: cards.filter((c) => c.tone === 'praise').length,
        warn: cards.filter((c) => c.tone === 'warn').length,
    };
}

/** 圖表看圖說話短評（維持相容）。 */
export function chartCoachNote(chart, session = {}) {
    const stats = session.stats || {};
    const stream = session.stream_data || {};
    const splits = (stats.splits || session.splits) || [];
    switch (chart) {
        case 'pace': {
            if (splits.length < 2) return '資料不足，跑長一點就能看出你的配速策略。';
            const diff = getPace(splits[splits.length - 1]) - getPace(splits[0]);
            if (diff < -8) return '看曲線：後段往上抬（變快），是漂亮的負分割，體力分配成熟。';
            if (diff > 25) return '看曲線：後段明顯下墜（變慢），前段起跑偏快了。';
            return '配速曲線平穩，節奏掌握得不錯。';
        }
        case 'elevation': {
            const gain = Number(stats.elevationGain ?? stats.elevation_gain ?? 0);
            if (gain <= 0) return '這條路線幾乎平坦，配速數據最能反映純跑力。';
            return `總爬升 ${gain} 公尺。爬坡段配速變慢是肌力在工作，不是退步。`;
        }
        case 'cadence': {
            const cadArr = (stream.cadence || []).filter((c) => c > 0);
            const cad = Number(stats.avgCadence) || Math.round(avg(cadArr));
            if (!cad) return '尚未取得步頻數據。';
            // 🩹 誠實檢查：整條串流都是同一個值 → 感測器沒有真的在更新，不做進一步判讀
            const uniq = new Set(cadArr.map((c) => Math.round(c)));
            if (cadArr.length > 10 && uniq.size <= 1) {
                return `步頻感測只回報單一數值（${cad} spm）— 來源可能未持續更新，本次不做步頻判讀。配戴手錶或開啟動作感測後可取得逐秒步頻。`;
            }
            if (cad < 165) return `步頻 ${cad} spm 偏低，往 175 靠會更省力又護膝。`;
            return `步頻 ${cad} spm 落在理想區，維持即可。`;
        }
        case 'stride': {
            const st = Number(stats.avgStride) || Number(avg((stream.stride || []).filter((s) => s > 0)).toFixed(2));
            if (!st) return '尚未取得步幅數據。';
            return `平均步幅 ${st} 公尺。步幅由肌力與柔軟度決定，先把步頻顧好。`;
        }
        // 🫀 生理指標三卡（EF / HRR / Decoupling）— 依「真實數值」給判讀；null → 誠實說資料不足
        case 'ef': {
            const ef = Number(session.efValue);
            if (!(ef > 0)) return '需要心率數據才能計算效率係數 — 確認手錶連線後，這裡會告訴你「同心率下跑多快」的進步幅度。';
            if (ef >= 1.3) return `EF ${ef}：心肺效率相當好 — 同樣心率下輸出的速度高，維持目前的有氧底子。`;
            if (ef >= 1.0) return `EF ${ef}：中等效率。多累積 Zone 2 長距離，EF 會隨有氧底子慢慢抬升。`;
            return `EF ${ef}：偏低 — 可能是天氣熱、疲勞或配速偏保守。連續觀察 3–5 次趨勢比單次數字重要。`;
        }
        case 'hrr': {
            const v = Number(session.hrrValue);
            if (!(v > 0)) return '需要停止後的心率量測才能計算恢復力 — 跑完別急著關掉手錶，站著等 1 分鐘。';
            if (v >= 20) return `1 分鐘降 ${v} bpm：心臟回收血流的能力很好，自律神經恢復快。`;
            if (v >= 12) return `1 分鐘降 ${v} bpm：正常範圍。睡眠與恢復日安排好，這個數字會再進步。`;
            return `1 分鐘降 ${v} bpm：偏慢 — 若最近訓練量大，這是「該休息」的訊號，別連續高強度。`;
        }
        case 'decoupling': {
            const d = Number(session.decouplingValue);
            if (!Number.isFinite(d)) return '需要完整的心率＋配速串流才能比較前後半段效率 — 資料不足時不顯示估計值。';
            if (d < 5) return `漂移 ${d}%：前後半段效率幾乎一致，有氧耐力穩固，這個距離對你來說游刃有餘。`;
            if (d <= 10) return `漂移 ${d}%：可接受範圍 — 後半段心率開始爬升，代表這個距離剛好碰到你的耐力邊界。`;
            return `漂移 ${d}%：後半段效率明顯掉了 — 距離或配速超出目前有氧能力，先降速把長距離跑穩。`;
        }
        default: return '';
    }
}

/**
 * DRVN Run Score — 一趟跑步「執行品質」的 0–100 分（與 Effort Depth 的「訓練負荷」不同）。
 *   規則（每個 pillar 只有在有真實數據時才計分，缺的不算、權重自動重新分配 → 誠實不灌水）：
 *     配速執行 30 / 有氧效率 20 / 心率控制 15 / 強度分配 15 / 續航 10 / 步頻 10
 *   分數 = Σ得分 / Σ可評滿分 × 100。可評維度 < 2 或核心(配速/心率)皆無 → 不評分(null)。
 *   分級：S≥90 卓越 · A≥80 優秀 · B≥70 紮實 · C≥60 穩定 · D<60 基礎。
 * @returns {{ score:number|null, grade:string|null, pillars:Array, basis:'full'|'no_hr'|'insufficient' }}
 */
export function computeRunScore(M, opts = {}) {
    const pillars = [];
    const add = (key, label, points, max, note) => pillars.push({ key, label, points: Math.round(points), max, note });

    // ── 情境判定（評分要看「這是什麼課」，不能用同一把尺量所有跑步）──
    const isPRefford = Array.isArray(opts.rankings) && opts.rankings.some((x) => x.rank === 1 && x.historyCount > 0);
    const longRun = (M.durationSec || 0) >= 2700;             // ≥45 分鐘
    // ⛰ 坡度補償：每公里爬升 10m 大約讓配速合理慢 15–20 秒（實務經驗值）。
    //    app 自己在爬升卡就跟使用者說「爬坡變慢是肌力在工作，不是退步」，
    //    評分不能反過來為同一件事扣分。
    const gainPerKm = M.distanceKm > 0 ? (M.gain || 0) / M.distanceKm : 0;
    const hillAllowanceSec = Math.min(40, gainPerKm * 1.7);

    // 1. 配速執行（需真實逐段）— 先扣掉坡度該給的寬容
    if (M.splitsReliable) {
        const adjDiff = M.paceDiff - hillAllowanceSec;
        let p;
        if (adjDiff <= -8) p = 30;
        else if (Math.abs(adjDiff) <= 8) p = 26;
        else if (adjDiff <= 25) p = 21;
        else if (adjDiff <= 50) p = 15;
        else p = 9;
        if (M.paceSpread - hillAllowanceSec > 60) p -= 4;
        add('pacing', M.isBike ? '均速執行' : '配速執行', Math.max(0, Math.min(30, p)), 30,
            adjDiff <= -8 ? '後段加速的負分割'
                : adjDiff > 25 ? (gainPerKm >= 10 ? '後段掉速（已扣除坡度）' : '後段掉速偏多')
                    : (M.isBike ? '均速穩定' : '配速穩定'));
    }
    // 2. 有氧效率（EF / 脫鉤，需心率才算得出）
    if (M.ef > 0 || M.decoup != null) {
        let p = 0, mx = 0;
        if (M.ef > 0) { mx += 12; p += M.ef >= 1.3 ? 12 : M.ef >= 1.1 ? 8 : 4; }
        if (M.decoup != null) { mx += 8; p += M.decoup < 5 ? 8 : M.decoup <= 10 ? 5 : 2; }
        add('efficiency', '有氧效率', p / mx * 20, 20, M.ef > 0 ? `EF ${M.ef.toFixed(2)}` : '');
    }
    // 3. 心率控制（漂移，需心率）
    //    ⚠️ 修正：心血管漂移（cardiac drift）本來就會隨時間與體溫上升，
    //    45 分鐘以上的長跑漂 10–20 bpm 是正常生理，不是執行失誤。
    //    舊版對 17 bpm 直接給 2/15，等於懲罰「跑得夠久」。改為依時長放寬。
    if (M.hrValid.length > 10) {
        const d = M.hrDrift;
        const tol = longRun ? 1.8 : 1.0;                 // 長跑容忍度加大
        const n = d / tol;                               // 正規化後的漂移
        const p = n <= 0 ? 15 : n <= 5 ? 14 : n <= 10 ? 11 : n <= 15 ? 8 : n <= 22 ? 5 : 3;
        add('hr', '心率控制', p, 15,
            n <= 5 ? '後段心率穩住' : longRun ? '長跑後段心率上飄（正常生理漂移）' : '後段心率上飄');
    }
    // 4. 強度分配（80/20）
    //    ⚠️ 修正：80/20 是「一週訓練分配」的原則，不是單一課表的評分標準。
    //    一趟拚 PR 的比賽配速跑本來就該有 80% 在無氧區 —— 用 80/20 去扣它的分
    //    是把週策略誤用在單場執行上。因此：PR／拚速度的課直接不評這一項。
    if (!isPRefford && M.hrValid.length > 10 && (M.highPct > 0 || M.lowPct > 0)) {
        const p = M.lowPct >= 75 ? 15 : M.highPct <= 35 ? 12 : M.highPct <= 55 ? 9 : 6;
        add('intensity', '強度分配', p, 15, M.lowPct >= 75 ? '有氧打底扎實' : M.highPct > 55 ? '高強度偏多' : '強度適中');
    }
    // 5. 續航
    //    ⚠️ 修正：舊版用 hrDrift 評續航 = 跟「心率控制」重複扣同一件事的分（雙重懲罰）。
    //    續航改為看「後段是否守得住配速」（已扣除坡度），有真實分段才評。
    if (M.splitsReliable) {
        const adj = M.paceDiff - hillAllowanceSec;
        add('durability', '續航', adj <= 8 ? 10 : adj <= 25 ? 7 : adj <= 50 ? 5 : 3, 10,
            adj <= 8 ? '後段守得住' : '後段有掉速');
    } else if (M.hrValid.length > 10) {
        add('durability', '續航', M.hrDrift <= 5 ? 10 : M.hrDrift <= 12 ? 7 : 5, 10, '');
    }
    // 6. 步頻（需真實逐秒步頻、且為跑步）
    if (M.isRun && M.cadReliable && M.cadAvg > 0) {
        const c = M.cadAvg;
        const p = (c >= 170 && c <= 185) ? 10 : (c >= 165 && c <= 190) ? 8 : (c >= 155) ? 6 : 4;
        add('gait', '步頻', p, 10, `${c} spm`);
    }

    // ══════════════════════════════════════════════════════════════════
    // 7. 突破（成就）— 20 分【新增】
    //
    //    使用者回報：「我超辛苦跑完 10k 甚至是第一次破紀錄，然後看到 29 分。」
    //    舊版計分只看「執行品質」（配速穩不穩、心率飄不飄），
    //    完全沒有「你今天比過去的自己更強」這個維度 —— 於是破 PR 反而沒加分。
    //
    //    這一項用真實的名次資料計分（rankings 來自 personalRecords.computeDistanceRankings），
    //    沒有歷史可比就不計這一項（缺的維度不算分，不灌水）。
    // ══════════════════════════════════════════════════════════════════
    const rk = Array.isArray(opts.rankings) ? opts.rankings.filter((x) => x.historyCount > 0) : [];
    if (rk.length > 0) {
        const gold = rk.filter((x) => x.rank === 1).length;
        const silver = rk.filter((x) => x.rank === 2).length;
        const bronze = rk.filter((x) => x.rank === 3).length;
        let p;
        let note;
        if (gold > 0) {
            p = 20;
            note = `刷新 ${gold} 項個人紀錄`;
        } else if (silver > 0) {
            p = 15;
            note = `${silver} 項歷史第 2 佳`;
        } else if (bronze > 0) {
            p = 12;
            note = `${bronze} 項歷史第 3 佳`;
        } else if (typeof opts.paceDeltaVsLast === 'number' && opts.paceDeltaVsLast >= 2) {
            p = 10;
            note = `比上次同距離快 ${Math.round(opts.paceDeltaVsLast)} 秒/km`;
        } else {
            p = 7;   // 沒破紀錄也不是零分：完成本身就有價值（鞏固期）
            note = '鞏固期 — 把地基踩實';
        }
        add('achievement', '突破', p, 20, note);
    }

    // 8. 完成度 — 10 分【新增】
    //    誠實但不冷酷：把距離跑完這件事本身要被承認。
    //    5km 以上滿分，1km 起有分；這一項永遠可評，不會因為沒手錶就消失。
    if (M.distanceKm > 0) {
        const d = M.distanceKm;
        const p = d >= 10 ? 10 : d >= 5 ? 9 : d >= 3 ? 7 : d >= 1 ? 5 : 2;
        add('completion', '完成度', p, 10, `${d.toFixed(2)} km`);
    }

    const sumMax = pillars.reduce((s, p) => s + p.max, 0);
    const sumPts = pillars.reduce((s, p) => s + p.points, 0);
    const hasCore = pillars.some((p) => p.key === 'pacing' || p.key === 'hr' || p.key === 'efficiency' || p.key === 'achievement');
    if (pillars.length < 2 || !hasCore || sumMax === 0) {
        return { score: null, grade: null, pillars, basis: 'insufficient' };
    }
    const score = Math.round((sumPts / sumMax) * 100);
    const grade = score >= 90 ? 'S' : score >= 80 ? 'A' : score >= 70 ? 'B' : score >= 60 ? 'C' : 'D';
    return { score, grade, pillars, basis: M.hrValid.length > 10 ? 'full' : 'no_hr' };
}

/**
 * Run Intelligence — 每次跑步結束，AI 只回答四件事，並依「肯定 → 進步 → 教練」排序。
 * @param {object} session  單場 session（同 buildCoachReport 輸入）
 * @param {object} opts     { priorRuns: [] } 過往跑步（用於長期趨勢 & 進步比較）
 * @returns {{ validation, progress, tone, emotion, intelligence:{highlight,problem,trend,next}, metrics, report }}
 */
export function buildRunIntelligence(session = {}, opts = {}) {
    const M = computeMetrics(session);
    const report = buildCoachReport(session);
    const priorRuns = Array.isArray(opts.priorRuns) ? opts.priorRuns : [];

    const rDist = (r) => Number(r?.distance_km ?? r?.distance ?? r?.stats?.distance ?? r?.stats?.distance_km ?? 0);
    const rPace = (r) => {
        const p = Number(r?.avg_pace ?? r?.pace ?? r?.pace_per_km ?? r?.avgPace ?? r?.stats?.avgPace ?? 0);
        if (p > 0) return p;
        const d = rDist(r);
        const t = Number(r?.duration_seconds ?? r?.duration ?? r?.stats?.duration ?? 0);
        return d > 0 && t > 0 ? t / d : 0;
    };
    // 只採計「距離>=1km 且 配速落在合理範圍(2:00–20:00/km)」的過往跑步，
    // 避免 0.0km 測試 / 壞資料算出天文數字（例如 19703 秒/km）。
    const MIN_PACE = 120, MAX_PACE = 1200;
    const validRun = (r) => { const d = rDist(r); if (d < 1) return false; const p = rPace(r); return p >= MIN_PACE && p <= MAX_PACE; };

    // ── 資料不足（沒跑 / 0.0km）→ 乾淨的「資料不足」回饋，不硬算 ──
    if (!M.distanceKm || M.distanceKm < 1) {
        return {
            validation: '這趟距離還很短，就當作今天的啟動——有動就是好的開始。',
            progress: `本場 ${(M.distanceKm || 0).toFixed(2)} km，資料還不足以做分析。`,
            tone: 'steady', emotion: false,
            intelligence: {
                highlight: '距離太短，深層分析尚未解鎖。',
                problem: '資料不足，先把距離拉長再看配速策略。',
                trend: '多跑幾次 3 公里以上，這裡就會長出你的長期趨勢線。',
                next: '下次把距離拉到 5 公里以上，就能解鎖完整教練分析。',
            },
            metrics: { paceDeltaVsLast: null, distanceKm: M.distanceKm || 0, avgPace: 0 },
            runScore: null, runGrade: null, scorePillars: [], scoreBasis: 'insufficient',
            scoreLabel: M.isBike ? 'Ride Score' : 'Run Score', isBike: M.isBike, avgSpeedKmh: M.avgSpeedKmh,
            report,
        };
    }

    // ── ② Progress：與「上次同距離」比較（±35% 距離視為可比）──
    let paceDeltaVsLast = null;
    const comparable = priorRuns.filter(
        (r) => validRun(r) &&
            Math.abs(rDist(r) - M.distanceKm) <= Math.max(1, M.distanceKm * 0.35)
    );
    if (comparable.length && M.avgPace > 0) {
        paceDeltaVsLast = rPace(comparable[0]) - M.avgPace; // >0 → 這次更快
    }

    let progress;
    if (paceDeltaVsLast !== null && Math.abs(paceDeltaVsLast) >= 2) {
        progress = paceDeltaVsLast > 0
            ? `這次比上次同距離快了 ${Math.round(paceDeltaVsLast)} 秒/km，平均 ${fmtPace(M.avgPace)}/km。`
            : `這次比上次慢了 ${Math.round(-paceDeltaVsLast)} 秒/km（${fmtPace(M.avgPace)}/km）——但每一次累積都算數。`;
    } else if (M.avgPace > 0) {
        progress = `本場 ${M.distanceKm.toFixed(2)} km、平均配速 ${fmtPace(M.avgPace)}/km。`;
    } else {
        progress = `本場 ${M.distanceKm.toFixed(2)} km 完成。`;
    }

    // 🆕 進步列點（結算頁逐點呈現：一點講一件事，一眼看懂）
    const progressPoints = [];
    if (M.avgPace > 0) {
        progressPoints.push(M.isBike
            ? `完成 ${M.distanceKm.toFixed(2)} km，均速 ${M.avgSpeedKmh} km/h。`
            : `完成 ${M.distanceKm.toFixed(2)} km，平均配速 ${fmtPace(M.avgPace)}/km。`);
    } else {
        progressPoints.push(`完成 ${M.distanceKm.toFixed(2)} km。`);
    }
    // 🩹 「進步」區只放真正變快的比較；變慢不是進步 → 移到教練區(趨勢/建議)講。
    //    這樣使用者不會再看到「比上次慢94秒」被列在「進步 PROGRESS」下的矛盾。
    if (paceDeltaVsLast !== null && paceDeltaVsLast >= 2) {
        progressPoints.push(`比上次同距離快 ${Math.round(paceDeltaVsLast)} 秒/km — 有感進步。`);
    }
    if (M.gain >= 30) progressPoints.push(`累積爬升 ${Math.round(M.gain)} m，腿部額外加碼了一份坡度紅利。`);
    if (M.meanHR > 0) progressPoints.push(`平均心率 ${M.meanHR} bpm${M.hrDrift >= 8 ? '，後段心率有上漂 — 屬正常疲勞訊號' : '，心率控制得很穩'}。`);
    if (M.splitsReliable && M.paceSpread > 0) {
        progressPoints.push(M.paceSpread <= 20
            ? `分段配速最大落差僅 ${Math.round(M.paceSpread)} 秒 — 節奏感很好。`
            : `分段配速落差 ${Math.round(M.paceSpread)} 秒 — 下次試著把節奏拉得更平。`);
    }

    // ── Emotion / tone：表現明顯下滑 → 同理語氣 ──
    const isDown = paceDeltaVsLast !== null && paceDeltaVsLast < -3;
    const tone = isDown ? 'supportive' : (report.summary.praise >= report.summary.warn ? 'praise' : 'steady');

    // ── 🥇 本場名次／破紀錄（真實資料，供評分與肯定文案使用）──
    //    這是「使用者辛苦運動後應該得到的回報」的資料來源，
    //    必須算在肯定文案「之前」，讓破紀錄永遠是第一眼看到的東西。
    let rankings = [];
    try {
        rankings = computeDistanceRankings(
            { activity_type: 'running', distance: M.distanceKm, duration: M.durationSec ?? (M.avgPace * M.distanceKm), splits: session?.splits || session?.metrics?.splits || session?.stats?.splits || [] },
            priorRuns
        );
    } catch (_) { rankings = []; }
    const medals = rankings.filter((x) => x.rank != null && x.historyCount > 0);
    const prList = medals.filter((x) => x.rank === 1);
    // 破紀錄要排在進步列點的第一條 —— 使用者最想看到的東西不能被埋在下面。
    prList.slice().sort((a, b) => b.km - a.km).forEach((x, i) => {
        progressPoints.unshift(
            x.improveSec > 0
                ? `🥇 ${x.label}新紀錄 ${fmtPace(x.paceSec)}/km — 比先前最佳快了 ${fmtDuration(x.improveSec)}。`
                : `🥇 ${x.label}新紀錄 ${fmtPace(x.paceSec)}/km。`
        );
    });
    medals.filter((x) => x.rank === 2 || x.rank === 3).forEach((x) => {
        progressPoints.push(`${x.rank === 2 ? '🥈' : '🥉'} ${x.label}歷史第 ${x.rank} 佳（${fmtPace(x.paceSec)}/km）。`);
    });

    // ── ① Validation：先肯定（Emotion-aware + 分數/最強項驅動 → 每趟不一樣，不再固定講第 1 公里）──
    const runScore = computeRunScore(M, { rankings, paceDeltaVsLast });
    const topPillar = runScore.pillars.length
        ? runScore.pillars.slice().sort((a, b) => (b.points / b.max) - (a.points / a.max))[0]
        : null;
    const topTxt = topPillar ? `，${topPillar.label}是今天最亮眼的一塊` : '';
    // 🚴 分數名稱依運動別：跑步 = Run Score、自行車 = Ride Score。
    const scoreLabel = M.isBike ? 'Ride Score' : 'Run Score';
    const didVerb = M.isBike ? '騎得很流暢' : '跑得很漂亮';
    let validation;
    // 🥇 破紀錄永遠是第一順位的肯定 —— 而且必須說得出「快了多少」，
    //    每一句都能對回一筆真實紀錄（禁止空泛鼓勵）。
    if (prList.length > 0) {
        const main = prList.slice().sort((a, b) => b.km - a.km)[0];   // 取最長距離的那項當主角
        const imp = main.improveSec > 0
            ? `，比先前最佳快了 ${fmtDuration(main.improveSec)}`
            : '';
        validation = prList.length > 1
            ? `今天一次刷新 ${prList.length} 項個人紀錄 —— ${main.label} ${fmtPace(main.paceSec)}/km${imp}。這是你自己跑出來的。`
            : `${main.label}個人新紀錄 ${fmtPace(main.paceSec)}/km${imp}。今天這趟，你把自己往前推了一步。`;
    } else if (medals.length > 0) {
        const m = medals.slice().sort((a, b) => a.rank - b.rank || b.km - a.km)[0];
        validation = `${m.label}拿下歷史第 ${m.rank} 佳（${fmtPace(m.paceSec)}/km）—— 離自己的最佳只差一點點。`;
    } else if (isDown) {
        validation = M.isBike
            ? '今天狀態不在高點，速度慢了些，但你把課完成了——恢復也是訓練的一部分。'
            : '今天狀態不在高點，速度慢了些，但你把課上完了——恢復也是訓練的一部分。';
    } else if (runScore.score == null) {
        validation = '這一趟資料還不夠深入評分，但有出門、有累積，這一步就值得肯定。';
    } else if (runScore.score >= 85) {
        validation = `今天${didVerb}，${scoreLabel} ${runScore.score}（${runScore.grade}）${topTxt}。`;
    } else if (runScore.score >= 70) {
        validation = `整體執行很紮實，${scoreLabel} ${runScore.score}（${runScore.grade}）${topTxt}。`;
    } else {
        validation = `有出門、有累積就是好的開始，${scoreLabel} ${runScore.score}${topPillar ? `，${topPillar.label}是相對亮眼的一塊` : ''}。`;
    }

    // ── ③ 教練：Run Intelligence 四答 ──
    const praiseCard = report.cards.find((c) => c.tone === 'praise') || report.deepCards.find((c) => c.tone === 'praise');
    const warnCard = report.cards.find((c) => c.tone === 'warn') || report.deepCards.find((c) => c.tone === 'warn');

    const highlight = praiseCard
        ? `${praiseCard.title}：${praiseCard.verdict}`
        : (report.opening?.bestText || '整體節奏穩定，沒有明顯短板。');
    const problem = warnCard
        ? `${warnCard.title}：${warnCard.verdict} ${warnCard.action || ''}`.trim()
        : '這一趟沒有明顯問題，維持節奏即可。';

    // 長期趨勢：近幾次「同距離級距」配速走向。
    // 🩹 不能把 3K/5K/10K 的配速混在一起比 —— 不同距離配速本來就不同，混比會誤報下滑。
    //    只取和本場距離相近(±25%)的歷史跑步，才是有意義的同級距比較。
    let trend;
    const distBucket = (r) => Math.abs(rDist(r) - M.distanceKm) <= Math.max(1, M.distanceKm * 0.25);
    const sameDistSeries = priorRuns.filter((r) => validRun(r) && distBucket(r)).slice(0, 6).map(rPace);
    const distTag = `${M.distanceKm.toFixed(1)} km 級距`;
    if (sameDistSeries.length >= 3) {
        const half = Math.floor(sameDistSeries.length / 2);
        const newer = avg(sameDistSeries.slice(0, half));
        const older = avg(sameDistSeries.slice(half));
        if (older - newer >= 3) trend = `${distTag}最近幾次配速持續變快（約 ${Math.round(older - newer)} 秒/km），有氧能力在穩定進步。`;
        else if (newer - older >= 5) trend = `${distTag}最近配速略有下滑（約 ${Math.round(newer - older)} 秒/km），可能累積了疲勞，安排一次輕鬆跑會有幫助。`;
        else trend = `${distTag}最近幾次表現穩定，正在把有氧地基打厚。`;
    } else if (paceDeltaVsLast !== null && paceDeltaVsLast <= -3) {
        // 同距離歷史還不夠 → 至少把「比上次同距離慢了多少」如實講在教練區(而非進步區)。
        trend = `這次比上次同距離慢了約 ${Math.round(-paceDeltaVsLast)} 秒/km；累積量也是訓練，下次可安排一趟輕鬆跑再回來衝。`;
    } else {
        trend = `多跑幾次 ${distTag}，這裡就會長出你的長期趨勢線。`;
    }

    const ns = report.nextStep;
    const next = ns
        ? `${ns.why || ns.nextWorkout || ''}（恢復約 ${ns.recoveryHours} 小時）${ns.action ? '；' + ns.action : ''}`.trim()
        : '下次維持穩定有氧，緩步加量即可。';

    return {
        validation,
        progress,
        progress_points: progressPoints,      // 🆕 結算頁列點呈現
        coach_points: [                        // 🆕 教練建議列點（趨勢→下一步）
            `趨勢：${trend}`,
            `下一步：${next}`,
        ],
        tone,
        emotion: isDown,
        intelligence: { highlight, problem, trend, next },
        metrics: { paceDeltaVsLast, distanceKm: M.distanceKm, avgPace: M.avgPace },
        runScore: runScore.score,
        runGrade: runScore.grade,
        scorePillars: runScore.pillars,
        scoreBasis: runScore.basis,
        // 🥇 本場名次與獎牌（結算頁里程碑區、動態卡、分享卡共用同一份）
        rankings,
        medals,
        medalSummary: {
            gold: medals.filter((x) => x.rank === 1).length,
            silver: medals.filter((x) => x.rank === 2).length,
            bronze: medals.filter((x) => x.rank === 3).length,
            total: medals.length,
        },
        // 🚴 給 UI 用：分數名稱（Run/Ride Score）、是否騎車、平均速度 km/h
        scoreLabel: M.isBike ? 'Ride Score' : 'Run Score',
        isBike: M.isBike,
        avgSpeedKmh: M.avgSpeedKmh,
        report,
    };
}

export default { buildCoachReport, chartCoachNote, buildRunIntelligence };
