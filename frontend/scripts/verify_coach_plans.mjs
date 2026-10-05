// 教練逐項檢查（npm run verify:coachplans；加 --full 含兩處傷病組合）：所有組合 × 所有週
// 檢查：時間預算、同日同肌群上限、分化純度、動作順序、處方（組數／次數／休息／遞減組）、高峰週大重量數、
//       每週組數上下限、推拉平衡、減量週、動作庫部位與圖片對照。任何一項不過就回傳 1。
/* ══ 教練標準（高階健身房教練開給學員的課表應該長這樣）══════════════════════
   結構  S1 3 天以上＝推／拉／腿骨架，2 天＝上／下半身；同一種日子不連排
         S2 選的重點部位：4 天只有一個重點 → 它一週 2 次；兩個以上 → 至少一個 2 次；5 天每個重點都 2 次
            重點部位在它自己那一天至少 2 個動作（中高階）
   單堂  C1 第一個動作一定是複合動作（手臂專項日、傷病移除推舉時除外）；複合→孤立、大肌群→小肌群、核心收尾
         C2 同一天不重複同一個動作模式（同部位同類型，核心除外）；每肌群有上限
         C3 動作數符合程度（新手 3、中階 4、高階 5–6），時間在預算內
   量    V1 重點部位每週：新手 ≥ 6 組、中高階 ≥ 8 組；2 天課表 ≥ 6 組
            （名額物理上限：新手 2 天胸背都選或加強肩臂 ≥ 3 組；中高階 2 天加強手臂、或胸背都選又加強肩 ≥ 4 組）
            任何肌群 ≤ 20 組；推拉比 ≤ 1.6
         V2 次數：肌肥大複合 5–15；力量主項 ≤ 8 下；新手選力量，複合 ≤ 10 下；主項休 ≥ 90 秒、孤立 ≤ 120 秒
         V3 中高階肌肥大：同一週兩天不共用 2 個以上一樣的動作（第二次練同部位換變化；新手刻意重複練技術）
   週期  P1 高峰週一天最多 2 個大重量；減量週總組數比基礎週少
   平衡  B1 有練腿就要有「髖鉸鏈」（硬舉、45 度背伸展、繩索髖伸）；背是重點（一週 2 個以上背動作）時
            要同時有垂直拉（下拉／引體）跟水平拉（划船）
   安全  傷病避開清單、新手不上槓鈴／極限動作、遞減組只用在器械孤立 */
import * as esbuild from 'esbuild';
import fs from 'fs';
const r = await esbuild.build({ entryPoints: ['src/utils/UnifiedTrainingEngine.js'], bundle: true, format: 'esm', platform: 'node', write: false, define: { 'import.meta.env': '{}' }, logLevel: 'error' });
const E = await import('data:text/javascript;base64,' + Buffer.from(r.outputFiles[0].text).toString('base64'));
const { generateUnifiedPlan, ALL_EXERCISES, estimateDayMinutes, getLevelCode } = E;
const FULL = process.argv.includes('--full');

// ── 靜態：動作庫本身 ─────────────────────────────
const staticIssues = [];
const ZONE_OK = {
  chest: /^chest-/, back: /^back-|^core$/, shoulders: /^shoulders-/, biceps: /^biceps$/, triceps: /^triceps$/,
  quads: /^quads-/, hamstrings: /^hamstrings-/, glutes: /^glutes-/, calves: /^calves$/, core: /^core$/,
};
const dbText = fs.readFileSync('src/utils/exerciseDB.js', 'utf8');
const mapBlock = dbText.slice(dbText.indexOf('const SPECIFIC_MAPPINGS'), dbText.indexOf('};', dbText.indexOf('const SPECIFIC_MAPPINGS')))
  + dbText.slice(dbText.indexOf('Object.assign(SPECIFIC_MAPPINGS'), dbText.indexOf('});', dbText.indexOf('Object.assign(SPECIFIC_MAPPINGS')))
  + dbText.slice(dbText.indexOf('const NO_IMAGE'), dbText.indexOf(']);', dbText.indexOf('const NO_IMAGE')));
for (const ex of ALL_EXERCISES) {
  if (ex.zone && !ZONE_OK[ex.muscle]?.test(ex.zone)) staticIssues.push(`部位對不上：${ex.name} muscle=${ex.muscle} zone=${ex.zone}`);
  if (ex.tier !== 4 && !mapBlock.includes(`'${ex.name}'`)) staticIssues.push(`沒有指定圖片（會走模糊比對，可能配錯圖）：${ex.name}`);
}

// ── 動態：每一份課表 ─────────────────────────────
const T = ['chest', 'back', 'shoulders', 'arms', 'core', 'legs'];
const subsets = []; for (let m = 1; m < 64; m++) subsets.push(T.filter((_, i) => m >> i & 1));
const INJ = ['knee', 'back', 'shoulder', 'wrist', 'hip', 'ankle'];
const injSets = [[]];
if (FULL) { for (let m = 1; m < 64; m++) { const s = INJ.filter((_, i) => m >> i & 1); if (s.length <= 2) injSets.push(s); } }
else INJ.forEach(i => injSets.push([i]));

const BIG = new Set(['chest', 'back', 'quads', 'hamstrings', 'glutes']);
const HINGE_EN = new Set(['45° Back Extension', 'Cable Pull Through', 'Good Morning', 'Deadlift', 'Romanian Deadlift']);
const ARM = new Set(['biceps', 'triceps']);
const PULLISH = /^(PULL|UPPER B|BACK)$/i, PUSHISH = /^(PUSH|UPPER A|CHEST)$/i, LOWERISH = /^(LEGS|LOWER|LOWER A|LOWER B|QUADS|GLUTES)$/i;
const counts = {}, examples = {};
let combos = 0;
const flag = (code, ctx, msg) => {
  counts[code] = (counts[code] || 0) + 1;
  (examples[code] ||= []); if (examples[code].length < 3) examples[code].push(`${ctx} → ${msg}`);
  if (process.env.BRK === code) { const k = ctx.split(' ')[0].split('/').filter((x, i) => i !== 1).join('/') + ' · ' + String(msg).replace(/\d+/g, '#').slice(0, 40); brk[k] = (brk[k] || 0) + 1; }
};
const brk = {};
const parseReps = (r) => { const m = String(r).match(/(\d+)\s*[-–]\s*(\d+)/); return m ? [+m[1], +m[2]] : (/->/.test(r) ? [6, 12] : [parseInt(r), parseInt(r)]); };
const restSec = (r) => { const s = String(r || ''); const n = parseFloat(s); return /min/.test(s) ? n * 60 : n; };

for (const level of ['beginner', 'intermediate', 'advanced'])
for (const days of [2, 3, 4, 5]) {
  if (days > getLevelCode(level).maxDaysPerWeek) continue;
  for (const equipment of ['mixed', 'equipment', 'bodyweight'])
  for (const style of ['bodybuilding', 'strength'])
  for (const tags of subsets) {
    // 介面規則：重點部位（胸／背／腿）至少 1 個；加強的輔助部位（肩／手臂／核心）2 天 1 個、3 天 2 個、4 天以上 3 個
    const focusN = tags.filter(t => ['chest', 'back', 'legs'].includes(t)).length;
    const boostN = tags.length - focusN;
    const units = tags.filter(t => !['chest', 'back', 'legs'].includes(t)).reduce((a, t) => a + (t === 'arms' && level === 'beginner' ? 2 : 1), 0);
    const boostCap = level !== 'beginner' ? (days <= 2 ? 1 : days === 3 ? 2 : 3) : Math.max(0, Math.min(3, days - focusN));
    if (focusN < 1 || units > boostCap) continue;
    for (const injuries of injSets) {
      combos++;
      const ctx = `${level}/${tags.join('+')}/${days}天/${equipment}/${style}${injuries.length ? '/傷:' + injuries.join('+') : ''}`;
      const p = generateUnifiedPlan({ level, selectedHashtags: tags, daysPerWeek: days, equipment, trainingStyle: style, injuries });
      const budget = p.weeks[0].days[0]?.time_budget || 999;
      const sel = new Set(tags.flatMap(t => E.MUSCLES[t]?.muscles || []));
      p.weeks.forEach((w, wi) => {
        const weekSets = {};
        w.days.forEach((d, di) => {
          const tag = `${ctx} W${wi + 1}${w.phase} D${di + 1}`;
          const main = d.exercises.filter(e => !e.isWarmup && e.tier !== 4);
          const sf = String(d.shortFocus || '');
          // 時間
          if (+d.time > budget) flag('TIME', tag, `${d.time} > ${budget} 分鐘`);
          // 中文名
          d.exercises.forEach(e => { if (/[A-Za-z]{3,}/.test(e.name)) flag('EN_NAME', tag, e.name); });
          // 同日重複／同模式
          const names = main.map(e => e.nameEn || e.name);
          if (new Set(names).size !== names.length) flag('DUP', tag, names.join(','));
          // 每肌群上限
          const c = {}; main.forEach(e => { c[e.muscle] = (c[e.muscle] || 0) + 1; weekSets[e.muscle] = (weekSets[e.muscle] || 0) + (+e.sets || 0); });
          for (const m in c) {
            const cap = BIG.has(m) ? 3 : m === 'shoulders' ? ((sel.has('shoulders') || /ARMS/.test(sf)) ? 3 : 2) : m === 'calves' ? 1 : 2;
            if (c[m] > cap) flag('MUSCLE_CAP', tag, `${m} ${c[m]} 個`);
          }
          // 分化純度
          if (PULLISH.test(sf) && main.some(e => ['chest', 'triceps'].includes(e.muscle) || e.zone === 'shoulders-press')) flag('PURITY', tag, `拉日出現推的動作：${main.map(e => e.name).join('、')}`);
          if (PUSHISH.test(sf) && main.some(e => ['back', 'biceps'].includes(e.muscle))) flag('PURITY', tag, `推日出現拉的動作`);
          // 🔧 [2026-10] 腿日一律不放上半身（含維持量）：只選腿的下肢專項，使用者明確只要下肢（同 verify_strength_coverage）
          if (LOWERISH.test(sf) && main.some(e => ['chest', 'back', 'shoulders', 'biceps', 'triceps'].includes(e.muscle))) flag('PURITY', tag, `腿日出現上半身`);
          // 順序（超級組視為一個單位，跳過）
          const solo = main.filter(e => !e.supersetId);
          const armDay = main.every(e => ARM.has(e.muscle) || e.muscle === 'core');
          let seenArm = false, seenIso = {}, seenCore = false, maxTierSeen = 0;
          for (const e of solo) {
            if (e.muscle === 'core') { seenCore = true; continue; }
            if (seenCore) flag('ORDER_CORE', tag, `核心不在最後：${solo.map(x => x.name).join('→')}`);
            if (!armDay && seenArm && !ARM.has(e.muscle)) flag('ORDER_ARM', tag, `手臂排在大肌群前：${solo.map(x => x.name).join('→')}`);
            if (ARM.has(e.muscle)) seenArm = true;
            if (e.cat === 'compound' && seenIso[e.muscle]) flag('ORDER_ISO', tag, `同肌群孤立在複合前：${solo.map(x => x.name).join('→')}`);
            if (e.cat === 'isolation') seenIso[e.muscle] = true;
            if ((e.tier || 3) === 1 && maxTierSeen >= 3) flag('ORDER_TIER', tag, `大重量主項排在輕動作後：${solo.map(x => x.name).join('→')}`);
            maxTierSeen = Math.max(maxTierSeen, e.tier || 3);
          }
          // C1 第一個動作是複合（手臂專項日、只剩核心的日子除外）
          const firstMain = main.find(e => e.muscle !== 'core');
          if (firstMain && !/ARMS/i.test(sf) && !injuries.length && firstMain.cat !== 'compound') flag('FIRST_COMPOUND', tag, `第一個動作是孤立：${firstMain.name}`);
          // C2 同一天同部位同類型兩次（例：兩個中胸複合推）
          const pats = main.filter(e => e.muscle !== 'core').map(e => `${e.muscle}|${e.zone}|${e.cat}`);
          if (new Set(pats).size !== pats.length) flag('DUP_PATTERN', tag, main.map(e => e.name).join('、'));
          // S2 重點部位在它自己那一天至少 2 個動作
          const needOn = /^PUSH$/i.test(sf) && tags.includes('chest') ? ['chest'] : /^PULL$/i.test(sf) && tags.includes('back') ? ['back']
            : /^(LEGS|LOWER B)$/i.test(sf) && tags.includes('legs') ? ['quads', 'hamstrings', 'glutes'] : null;
          if (needOn && level !== 'beginner' && !injuries.length && equipment !== 'bodyweight'
            && main.filter(e => needOn.includes(e.muscle)).length < 2) flag('FOCUS_DAY', tag, `${sf} 的重點部位只有 1 個動作`);
          // V2 次數範圍（基礎週）
          if (wi === 0) main.forEach(e => {
            const [lo, hi] = parseReps(e.reps);
            if (e.isDropSet) return;
            if (style === 'bodybuilding' && e.cat === 'compound' && e.muscle !== 'core' && (lo < 5 || hi > 15)) flag('REP_RANGE', tag, `${e.name} ${e.reps}`);
            if (style === 'strength' && level !== 'beginner' && e.tier === 1 && e.cat === 'compound' && hi > 8) flag('REP_RANGE', tag, `${e.name} ${e.reps}（力量主項）`);
            if (style === 'strength' && level === 'beginner' && e.cat === 'compound' && e.muscle !== 'core' && hi > 10) flag('REP_RANGE', tag, `${e.name} ${e.reps}（新手力量）`);
          });
          // 處方
          let drops = 0;
          main.forEach(e => {
            const s = +e.sets, [lo, hi] = parseReps(e.reps), rs = restSec(e.rest);
            if (!(s >= 1 && s <= 5)) flag('SETS', tag, `${e.name} ${e.sets} 組`);
            if (!(lo >= 1 && hi <= 20 && lo <= hi)) flag('REPS', tag, `${e.name} ${e.reps}`);
            if (e.isDropSet) {
              drops++;
              if (!['cable', 'machine', 'dumbbell'].includes(e.eq) || e.cat !== 'isolation') flag('DROPSET_EQ', tag, `${e.name} 不適合遞減組`);
              if (s > 2) flag('DROPSET_SETS', tag, `${e.name} 遞減組 ${s} 輪`);
            }
            if (e.cat === 'compound' && e.tier === 1 && !/deload/i.test(w.phase) && rs < 90) flag('REST_SHORT', tag, `${e.name} 主項只休 ${e.rest}`);
            if (e.cat === 'isolation' && rs > 120) flag('REST_LONG', tag, `${e.name} 孤立休 ${e.rest}`);
            if (level === 'beginner' && (e.eq === 'barbell' || e.cns === 'extreme')) flag('BEGINNER', tag, `${e.name}`);
          });
          if (drops > 1) flag('DROPSET_MANY', tag, `${drops} 個遞減組`);
          if (/peak/i.test(w.phase)) {
            const heavy = main.filter(e => e.cat === 'compound' && parseReps(e.reps)[1] <= 5).length;
            if (heavy > 2) flag('PEAK_HEAVY', tag, `高峰週 ${heavy} 個大重量`);
          }
        });
        // 週量（只看基礎週）：選了的大肌群每週至少 6 組；任何肌群不超過 20 組
        if (wi === 0) {
          const need = 6;   // 每個選了的大部位每週至少 6 組直接組數（研究上可見成長的下限）
          const legsSets = (weekSets.quads || 0) + (weekSets.hamstrings || 0) + (weekSets.glutes || 0);
          if (days >= 3 && !injuries.length && equipment !== 'bodyweight') {
            for (const m of ['chest', 'back']) if (sel.has(m) && (weekSets[m] || 0) < need) flag('LOW_VOLUME', ctx, `${m} 每週只有 ${weekSets[m] || 0} 組`);
            if (tags.includes('legs') && legsSets < need) flag('LOW_VOLUME', ctx, `腿 每週只有 ${legsSets} 組`);
          }
          for (const m in weekSets) if (weekSets[m] > 20) flag('HIGH_VOLUME', ctx, `${m} 每週 ${weekSets[m]} 組`);
          if (sel.has('chest') && sel.has('back') && !injuries.length && equipment !== 'bodyweight') {   // 徒手的推類動作只有伏地挺身系列，量本來就難對等   // 有傷病時推或拉的動作會被移除，量本來就不對等
            // 推＝胸＋肩推；拉＝背＋後束（肩推是推、面拉／反向飛鳥是拉）
            const zoneSets = (z) => p.weeks[0].days.flatMap(d => d.exercises).filter(e => !e.isWarmup && e.tier !== 4 && e.zone === z).reduce((a, e) => a + (+e.sets || 0), 0);
            const push = (weekSets.chest || 0) + zoneSets('shoulders-press'), pull = (weekSets.back || 0) + zoneSets('shoulders-rear');
            if (push && pull && (push / pull > 1.6 || pull / push > 1.6)) flag('PUSH_PULL', ctx, `胸 ${push} 組 vs 背 ${pull} 組`);
          }
        }
        // 分化骨架：3 天以上一定有推、拉、腿三種日子；2 天是上／下半身
        if (wi === 0) {
          const kinds = new Set(w.days.map(d => String(d.shortFocus || '').toUpperCase()));
          if (days >= 3 && !(kinds.has('PUSH') && kinds.has('PULL') && kinds.has('LEGS'))) flag('SPLIT', ctx, `不是推拉腿：${[...kinds].join('/')}`);
          if (days === 2 && !(kinds.has('UPPER') && kinds.has('LOWER'))) flag('SPLIT', ctx, `2 天不是上下半身：${[...kinds].join('/')}`);
        }
        if (wi === 0) {
          const kindOf = (d) => { const k = String(d.shortFocus || '').toUpperCase(); return k === 'PUSH' ? 'push' : k === 'PULL' ? 'pull' : /LEG|LOWER/.test(k) ? 'legs' : 'upper'; };
          const ks = w.days.map(kindOf);
          for (let i = 1; i < ks.length; i++) if (ks[i] === ks[i - 1]) flag('ADJACENT', ctx, `同種日子連排：${ks.join('→')}`);
          if (days >= 4) {
            const trainsOn = (m) => w.days.filter(d => d.exercises.some(e => !e.isWarmup && e.tier !== 4 && (m === 'legs' ? ['quads', 'hamstrings', 'glutes'].includes(e.muscle) : e.muscle === m))).length;
            // 4 天：重點只有一個 → 它一週 2 次；重點兩個以上 → 至少一個 2 次（多出來的那天只能給一個）。5 天：每個重點都 2 次
            const fts = ['chest', 'back', 'legs'].filter(t => tags.includes(t));
            if (!injuries.length && fts.length) {
              const twice = fts.filter(t => trainsOn(t) >= 2);
              if ((days >= 5 || fts.length === 1) && twice.length < fts.length) fts.filter(t => !twice.includes(t)).forEach(t => flag('FOCUS_FREQ', ctx, `${t} 是重點但一週只練 ${trainsOn(t)} 次`));
              else if (days === 4 && !twice.length) flag('FOCUS_FREQ', ctx, `重點部位沒有一個一週練 2 次`);
            }
          }
          // V3 同一週第二次練同部位要換變化（肌肥大）：兩天共用 2 個以上一模一樣的動作 → 等於把同一天做兩次
          if (style === 'bodybuilding' && level !== 'beginner' && !(equipment === 'bodyweight' && injuries.length)) {   // 徒手又有傷病時動作池只剩幾個，重複是必然
            const nm = w.days.map(d => new Set(d.exercises.filter(e => !e.isWarmup && e.tier !== 4 && e.muscle !== 'core').map(e => e.nameEn || e.name)));
            for (let i = 0; i < nm.length; i++) for (let j = i + 1; j < nm.length; j++) {
              const shared = [...nm[i]].filter(x => nm[j].has(x));
              if (shared.length >= 2) flag('REPEAT_DAY', ctx, `D${i + 1}／D${j + 1} 重複：${shared.join('、')}`);
            }
          }
          const all = w.days.flatMap(d => d.exercises.filter(e => !e.isWarmup && e.tier !== 4));
          if (!injuries.length && equipment !== 'bodyweight') {
            if (all.some(e => ['quads', 'glutes'].includes(e.muscle)) && !all.some(e => e.zone === 'hamstrings-hinge' || e.zone === 'back-lower' || HINGE_EN.has(e.nameEn))) flag('NO_HINGE', ctx, '有練腿卻沒有髖鉸鏈（硬舉類）');
            if (tags.includes('back') && level !== 'beginner' && all.filter(e => e.muscle === 'back').length >= 2 && !(all.some(e => e.zone === 'back-lats') && all.some(e => e.zone === 'back-mid'))) flag('PULL_PLANES', ctx, '背是重點但垂直拉／水平拉缺一');
            const upperFocusN = ['chest', 'back'].filter(t => tags.includes(t)).length;
            // V1 重點部位週量下限：新手 6 組、中高階 8 組；一週只練一次的 2 天課表 6 組；
            //    新手 2 天上半身只有 3 格，胸背都選、或還加強肩／手臂時，各 3 組；中高階 2 天加強手臂（二頭三頭各一格）、或胸背都選又加強肩 → 胸背各 4 組（名額物理上限）
            const upperBoost = tags.includes('shoulders') || tags.includes('arms');
            const needOf = (t) => level === 'beginner' ? (days < 3 && t !== 'legs' && (upperFocusN === 2 || upperBoost) ? 3 : 6) : (days >= 3 ? 8 : ((tags.includes('arms') || (tags.includes('shoulders') && upperFocusN === 2)) && t !== 'legs' ? 4 : 6));
            const legs = ['quads', 'hamstrings', 'glutes'].reduce((a, m) => a + (weekSets[m] || 0), 0);
            for (const t of ['chest', 'back']) if (tags.includes(t) && (weekSets[t] || 0) < needOf(t)) flag('FOCUS_VOLUME', ctx, `${t} 是重點每週只有 ${weekSets[t] || 0} 組`);
            if (tags.includes('legs') && legs < needOf('legs')) flag('FOCUS_VOLUME', ctx, `腿是重點每週只有 ${legs} 組`);
          }
        }
        // 維持量：胸、背、腿（股四頭）沒被選也要練到（「沒選 ≠ 不練」）
        if (wi === 0 && !injuries.length && equipment !== 'bodyweight') {
          const hit = new Set(w.days.flatMap(d => d.exercises.filter(e => !e.isWarmup && e.tier !== 4).map(e => e.muscle)));
          for (const m of ['chest', 'back', 'quads']) if (!hit.has(m)) flag('MAINTAIN', ctx, `${m} 整週沒練到`);
        }
        // 減量週要比基礎週輕
        if (/deload/i.test(w.phase)) {
          const tot = (wk) => wk.days.flatMap(d => d.exercises).filter(e => !e.isWarmup && e.tier !== 4).reduce((a, e) => a + (+e.sets || 0), 0);
          if (tot(w) >= tot(p.weeks[0])) flag('DELOAD', ctx, `減量週 ${tot(w)} 組 ≥ 基礎週 ${tot(p.weeks[0])} 組`);
        }
      });
    }
  }
}
console.log(`靜態檢查：${staticIssues.length} 項`); staticIssues.forEach(s => console.log('  · ' + s));
console.log(`\n組合數 ${combos}（${FULL ? '含兩處以內傷病組合' : '含單一傷病'}），逐週檢查`);
const codes = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
if (!codes.length) console.log('✅ 全部通過');
codes.forEach(c => { console.log(`\n${c}: ${counts[c]}`); examples[c].forEach(x => console.log('   ' + x)); });
if (process.env.BRK) Object.entries(brk).sort((a, b) => b[1] - a[1]).slice(0, 40).forEach(([k, v]) => console.log(`  ${v}\t${k}`));
process.exit(codes.length || staticIssues.length ? 1 : 0);
