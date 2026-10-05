import * as T from 'three';
import {seasonalKit} from './seasonalBadgeKit.js';
import {tokyoTower,taipeiTower,operaHouse,libertyBust} from './runLandmarkSculptures.js';
import {addRunBadgeDetails} from './seasonalRunDetails.js';
import {CITY_ENAMEL,createCityPhotoBadge} from './cityPhotoBadge.js';
// Art-directed city palettes: background, harbour/glass, foliage, accent, masonry.
const CITY_PALETTES={
 HKG:['#164d68','#148aa2','#376a4a','#ed5138','#e3d3b5'],
 TYO:['#9a596f','#4d8394','#557758','#f46d39','#f9dfce'],
 BOS:['#293f68','#41698b','#638258','#ba5947','#e6c8a6'],
 SYD:['#218b9e','#19a7b5','#4a987a','#ff874b','#ffe0a2'],
 BER:['#536f66','#3c6670','#639056','#ba7452','#dfcda4'],
 CHI:['#397a97','#368fae','#bd663c','#ea8545','#d4dbe0'],
 NYC:['#283d65','#4b7294','#53968a','#cd7852','#e6d6b3'],
 TPE:['#537d83','#237e7d','#397552','#e98498','#edd6b8'],
};
export function createSeasonalRunBadge(e){
 if(e.sport==='run')return createCityPhotoBadge(e);
 const k=seasonalKit(e),{material,gold,silver,dark,cream,blue,green,red,path,poly,rect,solid,line,panel,sphere,beam,ring,box,text,base,leaf,human,finish}=k,m=e.month;
 const palette=CITY_PALETTES[e.code];
 if(palette){blue.color.set(palette[1]);green.color.set(palette[2]);red.color.set(palette[3]);cream.color.set(palette[4]);}
 const snow=material('#ddd8c7','stone'),sky=material('#476677','stone'),forest=material('#233e35','stone');
 function flower(x,y,s=.12){
  const pink=material(m===2?'#ff9ebf':'#cf9396'),pale=material(m===2?'#ffe0b9':'#e7bab3');
  for(let j=0;j<5;j++){
   const a=j*Math.PI*2/5,start=k.root.children.length;
   solid(path([['M',0,0],['C',-s*.5,s*.25,-s*.5,s*.77,-s*.17,s*.88],['L',0,s*.77],['L',s*.17,s*.88],['C',s*.5,s*.77,s*.5,s*.25,0,0]]),j%2?pink:pale,.22,.022,.003,'Cherry_petal');
   line([[0,s*.13,.248],[-s*.07,s*.42,.25],[0,s*.68,.25]],gold,.002);
   for(const o of k.root.children.slice(start)){o.rotation.z=a;o.position.set(x,y,0);}
  }
  for(let j=0;j<7;j++){const a=j*Math.PI*2/7;sphere(x+Math.cos(a)*s*.16,y+Math.sin(a)*s*.16,.264,s*.03,s*.03,.008,gold);}
 }
 base(m===2?'flower':[7,9,10].includes(m)?'hex':'circle',m===2?material('#ff4e7b'):palette?material(palette[0],'stone'):m===7?cream:blue);
 function hills(){
  panel(path([['M',-.92,-.24],['L',-.62,.12],['L',-.34,-.03],['L',.03,.26],['L',.31,-.09],['L',.61,.13],['L',.94,-.27],['L',.69,-.7],['L',0,-.95],['L',-.73,-.66]]),sky,.05);
  for(const [x,y,w]of [[-.62,.12,.34],[.03,.26,.38],[.61,.13,.31]]){
   solid(poly([[x,y],[x+w*.7,y-.43],[x-.025,y-.29]]),material('#293f4c','stone'),.151,.012,.002,'Mountain_shadow_slope');
   for(let j=0;j<3;j++)line([[x,y-.035,.172],[x+(j-1)*w*.18,y-.16,.172],[x+(j-1)*w*.34,y-.33,.172]],silver,.002);
  }
  panel(poly([[-.22,.04],[.03,.26],[.3,-.08],[.1,.02],[.04,.12],[-.04,.03]]),snow,.17);
 }
 function road(){panel(path([['M',-.52,-.9],['C',-.4,-.57,.24,-.52,.05,-.35],['Q',-.17,-.21,.26,-.17],['Q',.05,-.23,.22,-.34],['C',.62,-.54,.05,-.61,-.08,-.96]]),cream,.18);}
 function sea(){panel(path([['M',-.91,-.49],['Q',-.5,-.32,-.02,-.59],['Q',.53,-.77,.94,-.36],['L',.75,-.64],['Q',0,-1.15,-.74,-.65]]),blue,.12);for(let j=0;j<3;j++)line([[-.76,-.55-j*.055],[-.28,-.62-j*.07],[.32,-.61-j*.06],[.79,-.46-j*.075]],silver,.01);}
 function building(x,y,w,h,type='plain',z=.17){
  const body=type==='taper'?poly([[x-w/2,y],[x+w/2,y],[x+w*.28,y+h],[x-w*.28,y+h]]):rect(x-w/2,y,w,h);
  solid(body,gold,z,.105,.005,'Tower_frame');solid(rect(x-w*.44,y+.012,w*.88,h-.024),blue,z+.108,.025,.002,'Glazed_facade');
  const cols=Math.max(2,Math.floor(w/.036)),rows=Math.max(3,Math.floor(h/.054));
  for(let c=1;c<cols;c++)box(x-w/2+c*w/cols,y+h/2,z+.141,.004,h,.009,silver);
  for(let r=1;r<rows;r++)box(x,y+r*h/rows,z+.141,w,.003,.008,silver);
  const lit=material(palette?palette[4]:'#73858c'),shade=material(palette?palette[1]:'#3b5360');
  for(let c=0;c<cols;c++)for(let r=0;r<rows;r++)box(x-w*.5+(c+.5)*w/cols,y+(r+.5)*h/rows,z+.135,w/cols*.72,h/rows*.72,.007,(c*7+r*13)%11===0?lit:shade);
  box(x+w*.45,y+h*.5,z+.08,w*.085,h,.13,material('#4e5b60'));
  box(x,y+h+.012,z+.085,w+.013,.024,.15,silver);
  if(type==='spire')beam([x,y+h,z+.07],[x,y+h+.2,z+.07],.004,silver);
 }
 function tree(x,y,s=.2){beam([x,y,.19],[x,y+s,.19],.008,gold);for(let j=0;j<4;j++)sphere(x+Math.sin(j*2)*s*.21,y+s*.35+j*s*.18,.19,s*.23,s*.2,.05,palette?green:forest);}
 function stars(){for(let j=0;j<14;j++){const x=-.7+(j*37%17)/12,y=.31+(j*13%9)/16;if(x*x+y*y<.83){beam([x-.013,y,.1],[x+.013,y,.1],.002,silver);beam([x,y-.022,.1],[x,y+.022,.1],.002,silver);}}}
 if(m===1){
  hills();for(const [x,h,w]of [[-.72,.65,.12],[-.54,.98,.15],[-.34,.76,.17],[-.12,1.07,.13],[.1,.7,.16]])building(x,-.5,w,h,'spire');
  building(.29,-.49,.21,1.47,'taper');sphere(.29,.98,.24,.1,.13,.04,silver);sea();
  solid(poly([[-.91,-.48],[-.29,-.5],[-.4,-.63],[-.8,-.61]]),gold,.33,.07);
  for(const [x,h]of [[-.77,.48],[-.56,.62],[-.36,.43]]){beam([x,-.49,.38],[x,-.49+h,.38],.007,gold);panel(path([['M',x,-.45],['L',x,-.49+h],['Q',x+.19,-.25+h*.4,x+.15,-.44]]),red,.34);for(let j=1;j<4;j++)line([[x,-.44+j*h/4,.45],[x+.13,-.44+j*h/4-.04,.45]],gold,.004);}
 }
 if(m===2){
  for(const [x,y,s]of [[-.3,.69,.14],[-.64,.19,.16],[.56,.33,.13],[.42,-.59,.16],[-.1,.53,.09],[-.49,-.09,.08],[.65,.14,.08]])flower(x,y,s);
  line([[-.66,-.53,.13],[-.38,-.03,.13],[-.22,.64,.13]],gold,.006);
  panel(path([['M',-.88,-.43],['Q',-.5,-.14,-.13,-.45],['Q',.14,-.75,.63,-.35],['L',.39,-.69],['Q',-.27,-.95,-.88,-.43]]),cream,.14);
 }
 if(m===3){
  hills();for(let j=0;j<8;j++)building(.07+j*.085,-.55,.06,.13+(j%3)*.055);
  tokyoTower(k);
  for(const [x,y]of [[-.73,-.6],[-.83,-.29],[-.76,.04],[-.65,.27],[-.5,-.48]])flower(x,y,.1);
 }
 if(m===4||m===9){
  const berlin=m===9,w=berlin?1.43:1.12,x=berlin?-.06:-.14;
  box(x,-.13,.2,w,.77,.18,cream);box(x,-.15,.305,w*.92,.61,.014,dark);
  for(let j=0;j<(berlin?6:5);j++){const xx=x-w*.43+j*w*.86/(berlin?5:4);beam([xx,-.51,.36],[xx,.22,.36],.035,gold);for(let f=0;f<5;f++)line([[xx-.025+f*.012,-.49,.398],[xx-.025+f*.012,.2,.398]],silver,.002);box(xx,.22,.37,.085,.045,.09,gold);box(xx,-.52,.37,.085,.04,.09,gold);}
  box(x,.28,.34,w+.14,.08,.2,gold);box(x,.37,.32,w+.05,.07,.18,cream);
  if(berlin){for(let j=0;j<4;j++){sphere(-.33+j*.17,.52,.27,.064,.034,.033,gold);beam([-.33+j*.17,.53,.27],[-.36+j*.17,.61,.27],.015,gold);for(const side of [-1,1])beam([-.33+j*.17+side*.035,.5,.27],[-.33+j*.17+side*.035,.43,.27],.006,gold);}human(.01,.52,.19,'flex',gold);}
  else{for(let j=0;j<3;j++){box(x,.46+j*.17,.27,.3-j*.075,.15,.18,cream);for(const side of [-1,1])box(x+side*(.115-j*.028),.46+j*.17,.38,.016,.14,.04,gold);}sphere(x,.94,.26,.07,.09,.06,gold);beam([x,1,.26],[x,1.13,.26],.009,gold);human(.41,-.16,.75,'run',gold);}
  for(const xx of [-.8,.79])tree(xx,-.62,.31);
  if(berlin){panel(poly([[-.6,-.66],[.03,-.48],[.59,-.7],[0,-.94]]),dark,.22);line([[0,-.94,.33],[.03,-.48,.33]],silver,.007);}
  else for(const side of [-1,1])for(let j=0;j<7;j++){const y=-.62+j*.12,x=side*(.79-Math.abs(j-3)*.045);leaf([x,y],[x-side*.12,y+.13],.043,gold,.34);}
 }
 if(m===5){
  hills();road();stars();
  const crescent=path([['M',-.1,.94],['C',-.89,.78,-1,-.39,-.38,-.79],['C',-.93,-.26,-.57,.6,-.1,.94]]);panel(crescent,cream,.15);
  for(let j=0;j<5;j++)tree(-.74+j*.065,-.61+j*.022,.16+j%2*.05);
  human(.08,-.41,.39,'run',silver);human(.36,-.45,.43,'run',gold);
 }
 if(m===6){
  for(let j=-2;j<=2;j++){const points=[];for(let a=0;a<=Math.PI*2+.08;a+=.08)points.push([Math.sin(a)*.89*j/2,Math.cos(a)*.89,.12]);line(points,gold,.003);}
  for(const p of [[[-.67,.56],[-.31,.79],[-.05,.53],[-.24,.11],[-.51,.26]],[[-.3,.04],[-.03,-.07],[-.16,-.64],[-.38,-.31]],[[.1,.66],[.6,.58],[.79,.27],[.3,.16],[.04,.33]],[[.11,.08],[.44,.02],[.32,-.4],[.12,-.25]]])panel(poly(p),green,.13);
  line([[-.95,-.54,.25],[-.45,-.46,.43],[.18,-.1,.47],[.87,.55,.26]],gold,.039);human(.41,-.15,.64,'run',silver);
 }
 if(m===7){
  const sun=material('#c9914d');solid(k.ellipse(0,.05,.31),sun,.13,.035);
  for(let j=0;j<17;j++){const a=j*Math.PI/16;line([[Math.cos(a)*.34,Math.sin(a)*.34+.04,.08],[Math.cos(a)*.84,Math.sin(a)*.84,.08]],gold,.006);}
  hills();panel(path([['M',-.91,-.36],['Q',-.4,-.17,.1,-.34],['Q',.6,-.2,.9,-.32],['L',.9,-.51],['L',0,-.95],['L',-.9,-.51]]),green,.12);road();
 }
 if(m===8){
  line([[-.48,.41,.17],[.03,.65,.17],[.58,.43,.17]],gold,.013);
  operaHouse(k);sea();
 }
 if(m===10){
  for(let j=0;j<11;j++){const x=-.8+j*.15,h=.33+(j*7%5)*.13;building(x,-.48,.12,h,'spire');}
  building(-.05,-.45,.2,1.31,'spire',.28);building(.08,-.45,.09,1.13,'spire',.27);
  for(const x of [-.75,-.62,.56,.71])tree(x,-.53,.22);
  const bean=sphere(.09,-.49,.48,.43,.21,.22,silver);bean.rotation.z=.08;sea();
 }
 if(m===11){
  for(let j=0;j<8;j++)building(-.76+j*.2,-.62,.1,.3+(j%3)*.11,'spire');
  libertyBust(k);
 }
 if(m===12){
  hills();taipeiTower(k);
  for(const [x,y]of [[.49,.4],[.69,.27],[.56,.13],[.8,.08],[.72,-.1],[.49,-.18]])flower(x,y,.1);
  panel(path([['M',-.93,-.43],['Q',-.6,-.42,-.34,-.83],['L',-.17,-.94],['Q',-.55,-.41,-.93,-.31]]),cream,.27);
 }
 addRunBadgeDetails(k,m);
 text(String(m),m===2?.05:m===7?.68:.67,m===2?-.15:m===7?-.83:.26,m===2?.72:m>9?.65:.8,m>9?.97:.7,m===2?.29:.57,gold);
 if(['HKG','TYO','BOS','SYD','BER','CHI','NYC','TPE'].includes(e.code)){solid(rect(.39,-.81,.54,.25),gold,.48,.045,.007,'City_plaque');solid(rect(.411,-.79,.498,.206),cream,.53,.015,.003);text(e.code,.66,-.75,.145,.45,.56,dark);}
 return finish();
}
