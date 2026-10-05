import { buildRunIntelligence } from './coachAnalysisEngine.js';
const baseStats = {
  distance: 5.0, duration: 1680, avgPace: 336,
  splits: [{km:1,pace:340},{km:2,pace:338},{km:3,pace:335},{km:4,pace:333},{km:5,pace:330}],
  zoneStats: { Recovery:100, 'Fat Burn':300, Aerobic:900, Anaerobic:300, Extreme:80 },
};
const hr=[], cad=[], pace=[];
for(let i=0;i<1680;i++){ hr.push(150 + Math.round(12*(i/1680)) + (i%7-3)); cad.push(178 + (i%5-2)); pace.push(336 + (i%9-4)); }
const sessionA = { stats: baseStats, splits: baseStats.splits, stream_data:{heart_rate:hr,cadence:cad,pace}, deepData:{physio_metrics:{ef:{current:1.15},decoupling:{value:4.2}},deep_metrics:{zone_distribution:baseStats.zoneStats}} };
const efFab = +(((1000/336)*60)/145).toFixed(2);
const sessionB = { stats: baseStats, splits: baseStats.splits, stream_data:{heart_rate:[],cadence:cad,pace}, deepData:{physio_metrics:{ef:{current:efFab},decoupling:{value:3.5}},deep_metrics:{zone_distribution:baseStats.zoneStats}} };
const sessionC = { stats: baseStats, splits: baseStats.splits, stream_data:{heart_rate:[],cadence:cad,pace}, deepData:{deep_metrics:{zone_distribution:baseStats.zoneStats}} };
for (const [name,s] of [['A 剛結束(有HR+真physio)',sessionA],['B feed(GPS-only,假physio ef='+efFab+',decoup=3.5)',sessionB],['C feed(physio完全缺)',sessionC]]) {
  const r = buildRunIntelligence(s);
  const pill=(r.scorePillars||[]).map(p=>`${p.label}:${p.points}/${p.max}`).join(' | ');
  const sumMax=(r.scorePillars||[]).reduce((a,p)=>a+p.max,0), sumPts=(r.scorePillars||[]).reduce((a,p)=>a+p.points,0);
  console.log(`\n[${name}] runScore=${r.runScore} grade=${r.runGrade} basis=${r.scoreBasis} (sumPts=${sumPts}/sumMax=${sumMax})`);
  console.log(`   pillars => ${pill}`);
}
