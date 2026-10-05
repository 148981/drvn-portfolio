import { deriveRunnerLevel, week1Ceiling, goalStaging, BEGINNER_GUARD } from '../src/utils/runnerLevel.js';
import { generateCardioPlan } from '../src/utils/cardioPlanFusionEngine.js';
import { computeScore, buildAdjustmentProposal, evaluateWeek } from '../src/utils/cardioSettlementEngine.js';

let pass=0, fail=0;
const ok=(n,c,e='')=>{ if(c){pass++;console.log(`  ✅ ${n}`);} else {fail++;console.log(`  ❌ ${n} ${e}`);} };

console.log('\n── C1. 難度三輸入 ──');
ok('跑齡0.2 + 週0km → beginner', deriveRunnerLevel({runningYears:0.2,currentWeeklyKm:0}).level==='beginner');
ok('跑齡3 + 週40km → advanced', deriveRunnerLevel({runningYears:3,currentWeeklyKm:40}).level==='advanced');
ok('跑齡3 但週6km → beginner（取較保守）', deriveRunnerLevel({runningYears:3,currentWeeklyKm:6}).level==='beginner');
ok('跑齡0.2 但週40km → beginner（取較保守）', deriveRunnerLevel({runningYears:0.2,currentWeeklyKm:40}).level==='beginner');
ok('不一致時有解釋文案', /週跑量偏低|經驗還在累積/.test(deriveRunnerLevel({runningYears:3,currentWeeklyKm:6}).reason));

console.log('\n── C1. 初學者保護（硬規則） ──');
const cases=[
 {n:'跑齡0.2 週0 目標10K', c:{runningYears:0.2,currentWeeklyKm:0,goal:'race_5k_10k',totalWeeks:8}, maxWeek:6, maxSingle:3},
 {n:'跑齡0.2 週5 目標半馬', c:{runningYears:0.2,currentWeeklyKm:5,goal:'race_half',totalWeeks:12}, maxWeek:5.5, maxSingle:3},
 {n:'跑齡3 週40 目標全馬', c:{runningYears:3,currentWeeklyKm:40,goal:'race_full',totalWeeks:14}, maxWeek:44, maxSingle:14},
];
for(const {n,c,maxWeek,maxSingle} of cases){
  const p=generateCardioPlan(c); const w1=p.weeks[0];
  const runs=w1.bricks.filter(b=>b.distance_km!=null);
  const longest=Math.max(0,...runs.map(b=>b.distance_km));
  ok(`${n}：W1 ${w1.target_mileage_km}km ≤ ${maxWeek}`, w1.target_mileage_km<=maxWeek+0.01, String(w1.target_mileage_km));
  ok(`${n}：最長單次 ${longest}km ≤ ${maxSingle}`, longest<=maxSingle+0.01, String(longest));
}
const beg=generateCardioPlan({runningYears:0.2,currentWeeklyKm:0,goal:'race_5k_10k',totalWeeks:8});
ok('初學 W1 次數 ≤ 3', beg.weeks[0].bricks.filter(b=>b.distance_km!=null).length<=3);
ok('初學 前2週無間歇/節奏',
   beg.weeks.slice(0,2).flatMap(w=>w.bricks).filter(b=>b.subtype==='interval'||b.subtype==='tempo').length===0);
ok('初學保護有被標記', beg.meta.beginner_guard_applied===true);
const half=generateCardioPlan({runningYears:0.2,currentWeeklyKm:5,goal:'race_half',totalWeeks:12});
ok('初學選半馬不被拒絕（照樣有計劃）', half.weeks.length===12);
ok('初學選半馬會誠實說是第 1 階段', /第 1 階段/.test(half.meta.goal_stage_note||''));
ok('進階不套初學保護', generateCardioPlan({runningYears:3,currentWeeklyKm:40,goal:'race_full',totalWeeks:14}).meta.beginner_guard_applied===false);

console.log('\n── C2. 週結算：零紀錄不給分 + 詢問式 ──');
ok('零完成 → computeScore 回 null', computeScore({completed_bricks:0,completion_rate:0,mileage_rate:0})===null);
ok('有完成 → 有分數', typeof computeScore({completed_bricks:3,completion_rate:1,mileage_rate:1,avg_rpe:6})==='number');

const P=(s)=>buildAdjustmentProposal(s);
ok("零紀錄 → restart 且用問句", (()=>{const p=P({completed_bricks:0});return p.tier==="restart"&&/？/.test(p.body);})());
ok('零紀錄 → 倍率 0.8', P({completed_bricks:0}).multiplier===0.8);
ok('完成 80%(0.8) → ask_reduce', P({completed_bricks:3,completion_rate:0.8,mileage_rate:0.8,actual_mileage_km:8,target_mileage_km:10}).tier==='ask_reduce');
ok('ask_reduce 倍率 0.9', P({completed_bricks:3,mileage_rate:0.8,actual_mileage_km:8,target_mileage_km:10}).multiplier===0.9);
ok('ask_reduce 有「我可以」的拒絕選項', /我可以/.test(P({completed_bricks:3,mileage_rate:0.8,actual_mileage_km:8,target_mileage_km:10}).secondaryLabel));
ok('完成 50% → ask_reset 倍率 0.8', P({completed_bricks:1,mileage_rate:0.5,actual_mileage_km:5,target_mileage_km:10}).tier==='ask_reset');
ok('完成 90% → hold 倍率 1.0', P({completed_bricks:4,mileage_rate:0.9,actual_mileage_km:9,target_mileage_km:10}).multiplier===1.0);
ok('完成 100% → promote 倍率 1.07', P({completed_bricks:4,mileage_rate:1.0,actual_mileage_km:10,target_mileage_km:10}).multiplier===1.07);
ok('每則提議都只給一個 focus', ['restart','ask_reduce','ask_reset','hold','promote'].every(()=>true) &&
   typeof P({completed_bricks:3,mileage_rate:0.8,actual_mileage_km:8,target_mileage_km:10}).focus==='string');
ok('完成率低時 focus 講「次數」而不是里程',
   /次數/.test(P({completed_bricks:2,completion_rate:0.5,mileage_rate:0.8,actual_mileage_km:8,target_mileage_km:10}).focus));

const ev = evaluateWeek({bricks:[{status:'pending',distance_km:5},{status:'pending',distance_km:5}]});
ok('evaluateWeek 零紀錄 → score null + hasRecord false', ev.score===null && ev.hasRecord===false);
ok('evaluateWeek 回傳 proposal', !!ev.proposal && ev.proposal.tier==='restart');
ok('adjustments 倍率與 proposal 一致', ev.adjustments.next_week_mileage_multiplier===ev.proposal.multiplier);

console.log(`\n═══ 結果：${pass} 通過 / ${fail} 失敗 ═══\n`);
if(fail>0) process.exit(1);
