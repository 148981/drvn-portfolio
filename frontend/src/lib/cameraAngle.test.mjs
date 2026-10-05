/**
 * cameraAngle 的回歸測試 —— 純 node 直接跑，不需要任何測試框架：
 *
 *     node src/lib/cameraAngle.test.mjs
 *
 * 為什麼這幾條非測不可
 * ──────────────────
 *   方位角只要正負號寫反，UI 就會叫使用者「往右繞」但其實該往左，
 *   而且畫面上的數字看起來完全正常 —— 這種錯不會自己浮出來。
 *   ±180 的繞回也一樣：實測臥推自選 169.2° vs 俯視 −175.6°，直接相減
 *   是 344.8°，實際只差 15.2°，沒處理就會把可用的機位判成失效。
 */
import {
  wrap180, relativeAzimuth, azimuthVerdict, flatVerdict,
  poseOffsetDeg, skeletonVerdict, makeAngleSmoother,
  POSE_TOLERANCE_DEG,
} from './cameraAngle.js';
import { angleTargetFor, viewsFor, specFor } from './exerciseSpec.js';

let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
};
const near = (name, got, want, tol = 1e-6) =>
  ok(name, Math.abs(got - want) <= tol, `got ${Math.round(got * 100) / 100}, want ${want}`);
const is = (name, got, want) => ok(name, got === want, `got ${got}, want ${want}`);

console.log('\n── wrap180：收斂到 [−180, 180) ──');
near('370 → 10', wrap180(370), 10);
near('−190 → 170', wrap180(-190), 170);
near('180 → −180（正後方記成負的）', wrap180(180), -180);

console.log('\n── relativeAzimuth：0 = 正前方、+90 = 身體右側 ──');
near('相機在人的正前方（人朝北、相機朝南）', relativeAzimuth(180, 0), 0);
near('相機在正後方', relativeAzimuth(0, 0), -180);
near('相機在身體右側（相機在東朝西）', relativeAzimuth(270, 0), 90);
near('相機在身體左側（相機在西朝東）', relativeAzimuth(90, 0), -90);
near('換個朝向也要對：人朝東、相機在正前方', relativeAzimuth(270, 90), 0);
near('人朝東、相機在右側', relativeAzimuth(0, 90), 90);

console.log('\n── azimuthVerdict：方向提示不能反 ──');
is('偏身體右側 40° → 叫人往右繞', azimuthVerdict(40, 0).arrow, 'right');
is('偏身體左側 40° → 叫人往左繞', azimuthVerdict(-40, 0).arrow, 'left');
is('偏 5° → perfect，不再給箭頭', azimuthVerdict(5, 0).state, 'perfect');
is('偏 20° → ok（在 30° 容差內）', azimuthVerdict(20, 0).state, 'ok');
is('偏 35° → near', azimuthVerdict(35, 0).state, 'near');
is('偏 70° → far', azimuthVerdict(70, 0).state, 'far');
is('±180 繞回：−175 對 175 只差 10°', Math.round(azimuthVerdict(-175, 175).off), 10);

console.log('\n── poseOffsetDeg：與後端 camera_offset_deg 同一套向量夾角 ──');
near('同一個姿態 → 0°', poseOffsetDeg([-176.7, 6.5], [-176.7, 6.5]), 0);
near('深蹲正面 vs 正側面參考 ≈ 實測 63°', poseOffsetDeg([-176.7, 6.5], [-113.2, 0.5]), 63.5, 1.5);

console.log('\n── skeletonVerdict：對照已驗證機位 ──');
const sq = angleTargetFor('squat');
is('離 0.1° → perfect', skeletonVerdict({ azimuth: -176.8, elevation: 6.0 }, sq).state, 'perfect');
is(`離 63° → far（超過 ${POSE_TOLERANCE_DEG}° 容差）`,
  skeletonVerdict({ azimuth: -113.2, elevation: 0.5 }, sq).state, 'far');
ok('沒有 skeletonRef 的動作 → null，不假裝能判', skeletonVerdict({ azimuth: 0, elevation: 0 }, null) === null);

console.log('\n── flatVerdict：俯視機位的水平判定 ──');
is('傾斜 3° → perfect', flatVerdict(3).state, 'perfect');
is('傾斜 15° → ok', flatVerdict(15).state, 'ok');
is('傾斜 50° → far', flatVerdict(50).state, 'far');

console.log('\n── 角度平滑：359° 與 1° 之間不能跳到 180 ──');
const sm = makeAngleSmoother(0.5);
sm(359);
const s = sm(1);
ok('圓形平均正確', Math.abs(wrap180(s)) < 20, `平滑後 ${Math.round(s)}°`);

console.log('\n── 機位表 ──');
is('深蹲主機位 → 正面 0°', specFor('squat').validatedView, 'frontal_0');
is('臥推主機位 → 正上方俯視', specFor('bench_press').validatedView, 'overhead');
is('深蹲有 2 個可選機位', viewsFor('squat').length, 2);
is('臥推只有 1 個（正側面被骨長關卡擋掉）', viewsFor('bench_press').length, 1);
is('深蹲正側面的目標方位 = 身體右側 90°',
  angleTargetFor('squat', 'sagittal_90').targetAzimuth, 90);
ok('沒做過實驗的動作 → null（不宣告做不到的事）', angleTargetFor('lat_pulldown') === null);
ok('臥推正側面沒有角度目標（不開放）', angleTargetFor('bench_press', 'sagittal_90') === null);

console.log(fail === 0 ? '\n✅ 全部通過\n' : `\n❌ ${fail} 項失敗\n`);
process.exitCode = fail ? 1 : 0;
