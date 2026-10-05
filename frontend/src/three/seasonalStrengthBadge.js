import * as T from 'three';
import {seasonalKit} from './seasonalBadgeKit.js';
import {sculptedRibbon} from './sculptedRibbon.js';
export function createSeasonalStrengthBadge(e){
 const k=seasonalKit(e),{material,gold,silver,dark,cream,green,red,poly,rect,ellipse,path,solid,line,panel,sphere,beam,ring,box,text,base,leaf,human,finish}=k,m=e.month;
 const bronze=material('#9e9078'),black=material('#232625'),jade=material('#284b43','stone');
 base([2,4,6,11,12].includes(m)?'square':[7,8,10].includes(m)?'hex':m===9?'oval':'circle',[1,6,12].includes(m)?cream:[5,11].includes(m)?green:dark);
 function plate(x,y,r,z=.2,color=jade){solid(ellipse(x,y,r),color,z,.09,.015,'Weight_disc');if(color===jade)k.stoneFace(ellipse(x,y,r-.025),color,z+.092);ring(x,y,z+.12,r-.025,.012,gold);ring(x,y,z+.125,r*.75,.007,black);solid(ellipse(x,y,r*.17),gold,z+.12,.04);}
 function barbell(y,s=1,z=.36){beam([-.67*s,y,z],[.67*s,y,z],.023*s,silver);for(const side of [-1,1])for(let j=0;j<3;j++){const o=k.add(new T.CylinderGeometry((.19+j*.035)*s,(.19+j*.035)*s,.045*s,32),j===2?bronze:black,'Barbell_plates');o.rotation.z=Math.PI/2;o.position.set(side*(.39+j*.07)*s,y,z);}}
 if(m===1){
  ring(-.1,.03,.13,.18,.016,gold);
  const points=[];for(let j=0;j<=60;j++){const a=j/60*Math.PI*2;points.push([Math.cos(a)*.97,Math.sin(a)*.42,-.03+Math.cos(a*2)*.18]);}
  // Broad ribbon with separate front and reverse faces.
  k.add(sculptedRibbon([[-.91,.42,-.06],[-.8,.12,.2],[-.29,.06,.3],[.25,.21,.29],[.68,.07,.32],[.81,-.35,.17],[.66,-.78,-.05]],.27,{closed:false,twist:.7,depth:.025}),bronze,'Reset_ribbon');
  text('A FRESH START',-.13,.59,.062,1.05,.09,silver);text('HIGHER STANDARDS',-.08,-.53,.06,1.18,.09,silver);
 }
 if(m===2){
  panel(poly([[-.94,-.94],[.18,-.94],[.18,.8],[-.33,.93],[-.94,.33]]),cream);
  for(const x of [-.72,.05]){box(x,0,.23,.054,1.83,.075,black);box(x-.028,0,.275,.008,1.81,.01,silver);for(let j=0;j<19;j++)solid(ellipse(x,-.82+j*.09,.009),black,.283,.005,0,'Rack_holes');}
  for(const y of [.71,.49])beam([-.72,y,.25],[.05,y-.1,.25],.018,red);
  for(let j=0;j<4;j++)box(-.69,-.82+j*.09,.24,.46,.068,.08,red);
 }
 if(m===3||m===9){
  if(m===9)ring(-.08,0,.13,.71,.014,gold,1.34);
  human(m===3?-.17:-.1,m===3?.02:-.01,m===3?1.42:1.23,'flex',silver);
  if(m===3)panel(poly([[-.64,-.92],[.94,-.92],[.94,-.22]]),cream,.39);
  else box(-.14,-.84,.32,.65,.042,.22,gold);
 }
 if(m===4){
  const o=sphere(-.15,.1,.07,.83,.83,.41,material('#77766c','stone'));const p=o.geometry.attributes.position,n=o.geometry.attributes.normal;
  const colors=[];for(let j=0;j<p.count;j++){const grain=Math.sin(p.getX(j)*93+p.getY(j)*57)*Math.cos(p.getZ(j)*87),f=1+.027*grain;p.setXYZ(j,p.getX(j)*f,p.getY(j)*f,p.getZ(j)*f);const c=.68+.28*grain;colors.push(c,c,c);}o.geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));o.material=o.material.clone();o.material.vertexColors=true;o.geometry.computeVertexNormals();
  panel(poly([[-.97,-.87],[.94,-.91],[.94,-.03]]),dark,.47);line([[-.97,-.88,.55],[.2,-.18,.55],[.92,.36,.55]],gold,.016);
 }
 if(m===5||m===11){
  plate(m===5?-.1:-.28,m===5?0:-.04,m===5?.86:.73,.08);
  if(m===5){const shaft=beam([-.62,-.2,.28],[.05,.07,.66],.096,silver);for(const x of [-.61,-.07])sphere(x,-.2+(x+.61)*.4,.35,.09,.1,.045,bronze);}
  else for(let j=0;j<5;j++)plate(-.47-j*.05,-.19-j*.025,.43-j*.063,.28+j*.09,black);
 }
 if(m===6){
  solid(ellipse(-.18,.15,.32),bronze,.09,.025);line([[-.83,-.72,.14],[-.67,-.1,.14],[-.52,.53,.14]],gold,.022);
  for(let j=0;j<8;j++){const a=.25+j*.36,end=[-.52+Math.cos(a)*.57,.45+Math.sin(a)*.37];line([[-.52,.5,.16],[(end[0]-.52)/2,end[1]+.09,.16],[...end,.16]],black,.015);for(let f=1;f<7;f++){const t=f/7,x=-.52+(end[0]+.52)*t,y=.5+(end[1]-.5)*t;leaf([x,y],[x-.07,y-.15],.024,black);}}
  const bottle=k.add(new T.CylinderGeometry(.145,.115,.62,48),bronze,'Shaker_body');bottle.position.set(.49,-.47,.31);ring(.49,-.12,.32,.135,.018,gold,.36);box(.49,-.13,.31,.28,.06,.24,black);box(.49,-.07,.3,.095,.06,.08,gold);
 }
 if(m===7){
  panel(poly([[-.9,.45],[-.04,.98],[.85,.49],[.85,-.62],[-.9,-.57]]),dark);
  for(const [x,y]of [[-.36,-.18],[.36,-.39]]){box(x,.45+y*.4,.21,.065,.96,.045,black);box(x-.028,.45+y*.4,.244,.007,.96,.007,gold);ring(x,y,.3,.24,.045,bronze,1.13);}
 }
 if(m===8){
  for(let j=0;j<12;j++){const a=.25+j*.22;line([[0,.15,.17],[Math.cos(a)*.77,Math.sin(a)*.79,.15]],gold,.012);}
  solid(path([['M',-.29,.03],['L',-.36,.28],['L',-.2,.21],['L',-.16,.38],['L',0,.24],['L',.16,.38],['L',.2,.21],['L',.36,.28],['L',.29,.03]]),gold,.25,.06,.01,'Royal_crown');
  ring(0,.03,.3,.28,.025,gold,.25);for(const x of [-.27,-.14,0,.14,.27])sphere(x,.12,.35,.022,.023,.018,silver);
  for(const x of [-.19,0,.19])line([[x,.11,.36],[x*.9,.32,.39],[0,.4,.38]],gold,.014);beam([0,.36,.38],[0,.46,.38],.01,gold);beam([-.036,.43,.38],[.036,.43,.38],.01,gold);
  for(let j=0;j<8;j++)line([[0,-.1,.14],[-.77+j*.13,-.76,.14]],gold,.008);
 }
 if(m===10){
  // Raised continental islands and fine meridian engraving under the barbell.
  for(const p of [[[-.65,.62],[-.34,.8],[-.13,.49],[-.31,.13],[-.56,.29]],[[-.27,.1],[-.07,-.04],[-.2,-.54],[-.38,-.31]],[[.16,.66],[.59,.62],[.79,.27],[.36,.14],[.12,.28]],[[.12,.12],[.49,.04],[.39,-.43],[.15,-.27]],[[.54,-.47],[.77,-.37],[.79,-.62],[.53,-.67]]])solid(poly(p),cream,.11,.035,.006,'Raised_continent');barbell(-.03,1.03,.33);
 }
 if(m===12){
  for(let j=0;j<4;j++){ring(-.49-j*.03,-.02,.13+j*.04,.51-j*.07,.018,bronze);}
  const glass=material('#e2dacc','glass');
  const profile=[new T.Vector2(.22,-.56),new T.Vector2(.21,-.39),new T.Vector2(.17,-.23),new T.Vector2(.035,-.03),new T.Vector2(.035,.03),new T.Vector2(.17,.23),new T.Vector2(.21,.39),new T.Vector2(.22,.56)];
  const o=k.add(new T.LatheGeometry(profile,48),glass,'Hourglass_glass');o.position.set(.04,-.03,.39);
  for(const y of [-.6,.54]){const cap=k.add(new T.CylinderGeometry(.25,.25,.065,48),gold,'Hourglass_cap');cap.position.set(.04,y,.39);}
  for(const x of [-.2,.28])beam([x,-.58,.4],[x,.54,.4],.012,gold);
  const sand=k.add(new T.ConeGeometry(.19,.22,32),cream,'Hourglass_sand');sand.position.set(.04,-.43,.39);beam([.04,.05,.39],[.04,-.39,.39],.003,cream);
 }
 text(String(m),m>9?.62:.65,.32,m>9?.65:.81,m>9?1:.7,.52,gold);
 if(m!==1)text(e.code,.51,-.75,.17,.67,.48,silver);
 return finish();
}
