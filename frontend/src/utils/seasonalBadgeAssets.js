const run=[['香港馬拉松','HKG'],['新春歡樂跑','FEB'],['東京馬拉松','TYO'],['波士頓馬拉松','BOS'],['星光夜跑','MAY'],['全球跑步日','JUN'],['晨曦路跑','JUL'],['雪梨馬拉松','SYD'],['柏林馬拉松','BER'],['芝加哥馬拉松','CHI'],['紐約馬拉松','NYC'],['台北馬拉松','TPE']];
const strength=[['新年重啟','JAN'],['CrossFit Open','FEB'],['Arnold Classic','MAR'],['世界大力士','APR'],['舉重世界盃','MAY'],['夏季備戰','JUN'],['CrossFit Games','JUL'],['大英國協運動會','AUG'],['Mr. Olympia','SEP'],['世界舉重','OCT'],['增肌季','NOV'],['年終總結','DEC']];
// These are artwork definitions. Unlock rules are deliberately kept separate.
export const SEASONAL_BADGES=Object.fromEntries(Object.entries({run,strength}).flatMap(([sport,items])=>items.map(([title,code],j)=>{
 const asset=`season_${sport}_${String(j+1).padStart(2,'0')}`;
 return [asset,{asset,name:`${sport==='run'?'跑步':'健身'} ${j+1} 月 · ${title}`,family:`seasonal-${sport}`,sport,month:j+1,code,title}];
})));
