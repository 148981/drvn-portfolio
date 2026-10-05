import {QUARTERLY_AXES} from './challengeRegistry.js';
export const EXTRA_BADGES=Object.fromEntries([
 ['squad_together_1','併肩訓練','squad_together_1','squad',0,'partner'],
 ['squad_streak_4','社團常客','squad_streak_4','squad',1,'partner'],
 ['squad_mission_1','任務達成','squad_mission_1','squad',2,'partner'],
 ['squad_streak_12','社團支柱','squad_streak_12','squad',3,'partner'],
 ['squad_join_1','加入第一個社團','squad_join','squad',0,'join'],
 ['squad_active_20','社團活躍會員','squad_active','squad',1,'rings'],
 ['squad_core_100','社團核心成員','squad_core','squad',2,'weave'],
 ['squad_legend_300','社團傳奇','squad_legend','squad',3,'network'],
 ['pc_month_100km','月跑 100 公里','2','permanent',1,'track'],
 ['pc_iron_week','週週重訓不缺席','1','permanent',0,'calendar'],
 ['pc_pace_breaker','破風配速','3','permanent',1,'speed'],
 ['pc_100kg_club','百公斤俱樂部','4','permanent',3,'plate'],
 ['pc_streak_30','連續訓練 30 天','5','permanent',3,'flame'],
 ['q_expedition','季度遠征','6','quarterly',3,'mountain'],
 ['q_training_camp','季度訓練營','7','quarterly',2,'camp'],
 ['q_fat_burn','季度燃脂季','8','quarterly',3,'burn'],
 ['q_pace_challenge','季度配速挑戰','9','quarterly',1,'velocity'],
 ['q_strength_tier','季度力量階段','10','quarterly',3,'pr'],
].map(([id,name,source,family,index,design])=>[id,{asset:id,name,source,family,index,design}]));
for(const axis of QUARTERLY_AXES)axis.steps.forEach((step,index)=>{
 EXTRA_BADGES[step.asset]={asset:step.asset,name:step.name,family:'quarterly',index:axis.steps.length===1?3:index,design:axis.id==='q_km'?'quarter-distance':'quarter-sessions',number:String(step.target),unit:axis.unit==='km'?'KM':axis.unit==='kg'?'KG':'SESSIONS'};
});
