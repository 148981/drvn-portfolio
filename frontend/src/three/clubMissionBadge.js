import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
import {diamondFacets} from './badgeMaterialFinish.js';
const font=new FontLoader().parse(fontData);

// Closed enamel cells, raised wires and stepped relief are all real geometry.
// Every material tier shares exactly the same artwork and silhouette.
export function createClubMissionBadge(e){
 const [number,outline,,base]=e.art,i=e.index,id=({rc1:'rc12',rc2:'rc4',rc10:'rc3',rc13:'rc7',rc14:'rc8',sc1:'sc10',sc2:'sc4',sc12:'sc6',sc13:'sc9'})[e.mission]||e.mission,root=new T.Group();
 const seed=[...e.mission].reduce((s,c)=>s+c.charCodeAt(0),0),bendX=.055+(seed%7)*.006,bendY=.04+(seed%5)*.008;
 root.name=`DRVN_${e.asset}`;root.userData={asset:e.asset,title:e.name,mission:id,tier:e.tier};
 const metal=new T.MeshPhysicalMaterial({color:['#ba8658','#dce3e6','#f4c66b','#e5f3ff'][i],metalness:.78,roughness:[.3,.23,.2,.13][i],clearcoat:1});
 const colors=new Map(),ivory='#fff1d5',teal='#008b8f',orange='#ff742d',green='#146b43';
 function mat(c){if(!colors.has(c))colors.set(c,new T.MeshPhysicalMaterial({color:c,metalness:[.12,.22,.32,.36][i],roughness:[.32,.25,.2,.13][i],clearcoat:1,clearcoatRoughness:.12,iridescence:i===3?.35:0}));return colors.get(c);}
 function path(commands){const s=new T.Shape();for(const [op,...v] of commands)s[{M:'moveTo',L:'lineTo',C:'bezierCurveTo',Q:'quadraticCurveTo'}[op]](...v);s.closePath();return s;}
 function poly(p){return path(p.map((v,j)=>[j?'L':'M',...v]));}
 function circle(x,y,r){const s=new T.Shape();s.absarc(x,y,r,0,Math.PI*2);return s;}
 function rect(x,y,w,h){return poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);}
 function mesh(g,m,name){
  // A shallow minted dome creates moving reflections across the enamel and type.
  const p=g.attributes.position,n=g.attributes.normal;
  for(let j=0;j<p.count;j++){
   const x=p.getX(j),y=p.getY(j);p.setZ(j,p.getZ(j)+bendX*(1-x*x)-bendY*y*y);
   if(n){const v=new T.Vector3(n.getX(j)+2*bendX*x*n.getZ(j),n.getY(j)+2*bendY*y*n.getZ(j),n.getZ(j)).normalize();n.setXYZ(j,v.x,v.y,v.z);}
  }
  const o=new T.Mesh(g,m);o.name=name;root.add(o);return o;
 }
 function solid(s,m,z=.1,depth=.035,name='Enamel_cell',facets=false){let g=new T.ExtrudeGeometry(s,{depth,curveSegments:32,bevelEnabled:true,bevelSize:.008,bevelThickness:.009,bevelSegments:3});g.translate(0,0,z);if(i===3&&facets){g=diamondFacets(g);m=m.clone();m.vertexColors=true;}return mesh(g,m,name);}
 function wire(s,z=.16,r=.012,name='Polished_cell_border'){
  const p=s.getPoints(40).map(v=>new T.Vector3(v.x,v.y,z));if(p[0].distanceTo(p.at(-1))>.001)p.push(p[0].clone());
  const curve=new T.CurvePath();for(let j=1;j<p.length;j++)if(p[j].distanceTo(p[j-1])>.00001)curve.add(new T.LineCurve3(p[j-1],p[j]));
  return mesh(new T.TubeGeometry(curve,Math.max(80,p.length),r,6,false),metal,name);
 }
 function cell(s,c,z=.105){solid(s,mat(c),z,.027,'Enamel_cell',true);wire(s,z+.04);}
 function line(p,r=.014,z=.19){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(p.map(([x,y])=>new T.Vector3(x,y,z))),64,r,8,false),metal,'Raised_metal_inlay');}
 function gem(x,y,r,c,z=.17){solid(circle(x,y,r),metal,z,.035,'Circular_bezel');solid(circle(x,y,r-.018),mat(c),z+.038,.025,'Enamel_cabochon',true);}
 let plate;
 if(outline==='round'||outline==='watch')plate=circle(0,0,1);
 else if(outline==='heart')plate=path([['M',0,.57],['C',-.65,1.3,-1.32,.5,-.87,-.02],['L',0,-1],['L',.87,-.02],['C',1.32,.5,.65,1.3,0,.57]]);
 else if(id==='sc11')plate=path([['M',0,1],['Q',.16,1,.25,.86],['Q',.62,1,.75,.69],['Q',1,.7,.96,.35],['L',.93,-.48],['Q',.7,-.79,0,-1],['Q',-.7,-.79,-.93,-.48],['L',-.96,.35],['Q',-1,.7,-.75,.69],['Q',-.62,1,-.25,.86],['Q',-.16,1,0,1]]);
 else if(outline==='hex')plate=poly([[0,1],[.93,.49],[.93,-.49],[0,-1],[-.93,-.49],[-.93,.49]]);
 else if(outline==='triangle')plate=path([['M',0,1.12],['Q',.025,1.14,.055,1.08],['L',1,-.8],['Q',1.03,-.9,.88,-.91],['L',-.88,-.91],['Q',-1.03,-.9,-1,-.8],['L',-.055,1.08],['Q',-.025,1.14,0,1.12]]);
 else if(outline==='bolt')plate=poly([[-.82,.62],[1,1.02],[.7,.47],[1,.5],[.65,-.57],[-.85,-1],[-.62,-.45],[-1,-.55]]);
 else plate=path([['M',-.68,1],['L',.68,1],['Q',1,1,1,.68],['L',1,-.68],['Q',1,-1,.68,-1],['L',-.68,-1],['Q',-1,-1,-1,-.68],['L',-1,.68],['Q',-1,1,-.68,1]]);
 solid(plate,metal,-.13,.18,'Cast_metal_body');
 const face=solid(plate,mat(['rc4','rc12','sc10','sc5'].includes(id)?ivory:base),.052,.034,'Recessed_enamel_face',true);face.scale.set(.966,.966,1);
 wire(plate,.11,.023,'Outer_rolled_bezel');wire(plate,-.075,.012,'Reverse_edge_rail');
 if(id==='rc3'){
  cell(path([['M',-.94,-.22],['C',-.3,-.52,.14,-.48,.52,-.08],['Q',.72,.1,.98,.1],['Q',1,-.6,.52,-.84],['Q',-.4,-1.24,-.94,-.22]]),orange);
  line([[-.88,-.44],[-.38,-.63],[.12,-.59],[.58,-.23],[.96,-.1]],.022);
  line([[-.72,-.67],[-.3,-.81],[.22,-.72],[.65,-.39],[.9,-.32]]);gem(.4,-.52,.083,orange,.2);
 }
 if(id==='rc4'||id==='rc6'){
  const square=id==='rc4';gem(.54,.42,.17,'#ffb321',.11);
  cell(path(square?[
   ['M',-.94,.08],['C',-.62,.14,-.3,-.25,.02,-.06],['C',.42,.23,.54,-.12,.94,.2],['L',.94,-.65],['Q',.94,-.94,.65,-.94],['L',-.65,-.94],['Q',-.94,-.94,-.94,-.65]
  ]:[['M',-.88,-.01],['C',-.53,-.2,-.19,-.06,.07,.03],['Q',.55,.56,.88,-.03],['L',.88,-.45],['L',0,-.94],['L',-.88,-.45]]),square?'#18adb1':'#589b4c');
  cell(path([['M',square?-.94:-.88,-.27],['C',-.5,-.43,-.16,-.06,.12,-.25],['Q',.59,-.5,square?.94:.88,-.19],...(square?[['L',.94,-.65],['Q',.94,-.94,.65,-.94],['L',-.65,-.94],['Q',-.94,-.94,-.94,-.65]]:[['L',.88,-.45],['L',0,-.94],['L',-.88,-.45]])]),square?'#057680':green,.151);
  cell(path([['M',-.44,square?-.94:-.7],['C',-.1,-.63,.47,-.61,.24,-.48],['C',.04,-.36,-.22,-.39,-.09,-.28],['Q',.15,-.13,.37,-.22],['C',.13,-.25,.03,-.3,.14,-.33],['C',.89,-.52,.42,-.7,.08,square?-.94:-.89]]),ivory,.2);
 }
 if(id==='rc5'||id==='rc11'){
  const tri=id==='rc5';gem(.57,.68,.28,'#ffd21c',-.06);
  cell(poly(tri?[[0,1.05],[.46,.18],[.14,.38],[-.03,.54],[-.2,.29],[-.39,.31]]:[[0,.94],[.68,.55],[.35,.23],[.12,.46],[-.1,.16],[-.44,.32]]),ivory,.12);
  if(tri)cell(path([['M',-.86,-.79],['C',-.62,-.3,.01,-.18,.34,.06],['Q',.67,.27,.13,.48],['Q',.79,.19,.53,-.01],['C',.27,-.27,-.21,-.4,-.43,-.83]]),ivory,.17);
  else{
   cell(path([['M',-.87,.14],['Q',-.48,.53,-.12,.24],['Q',.16,.67,.43,.27],['L',.87,.02],['L',.87,-.46],['L',0,-.93],['L',-.87,-.46]]),green,.17);
   line([[-.82,-.54],[-.25,-.7],[.22,-.63],[.6,-.39],[.86,-.35]],.014,.23);line([[-.62,-.64],[-.12,-.82],[.4,-.6],[.7,-.48]],.014,.23);
  }
 }
 if(id==='rc7'||id==='sc6'||id==='sc11'){
  const shield=id==='sc11';
  if(!shield){
   cell(poly([[-.94,-.68],[-.94,-.36],[.06,.96],[-.16,.96]]),ivory);
   cell(path([['M',-.88,-.86],['L',.62,-.86],['Q',.92,-.86,.94,-.61],['L',.94,-.24],['L',.05,-.94],['L',-.66,-.94],['Q',-.85,-.94,-.88,-.86]]),id==='rc7'?'#ff8053':ivory);
  }else{
   cell(path([['M',-.88,-.36],['Q',-.18,-.39,.88,.18],['L',.87,-.44],['Q',.43,-.82,0,-.94],['Q',-.63,-.73,-.88,-.44]]),teal);
   for(let k=0;k<3;k++)line([[-.53+k*.19,-.69-k*.035],[-.02+k*.18,-.54-k*.1],[.8,-.12-k*.13]],.015);
  }
  line(shield?[[-.78,-.46],[0,-.29],[.76,-.01]]:[[-.94,-.49],[0,-.49],[.94,-.49]],.02,.2);
  for(let k=0;k<(shield?6:5);k++)gem(-.7+k*(shield?.28:.35),shield?-.45+k*.074:-.49,.075,shield?teal:orange,.21);
 }
 if(outline==='watch'){
  const multi=id==='sc7';
  for(let k=0;k<8;k++){const a=k*Math.PI/4,b=(k+1)*Math.PI/4,s=new T.Shape();s.absarc(0,0,.93,a,b);s.absarc(0,0,.69,b,a,true);s.closePath();cell(s,multi?['#ff7630','#16c1bd','#197fac','#148bad','#15b1bf','#a9c52e',ivory,'#ff8b2e'][k]:(k%3===0?ivory:teal));}
  cell(circle(0,0,.675),ivory,.13);
  solid(rect(-.17,1,.34,.16),metal,-.04,.12,'Stopwatch_crown');solid(rect(-.105,1.04,.21,.06),mat('#534332'),.09,.014,'Crown_recess');
  if(multi){for(const a of [0,Math.PI/4,Math.PI/2,Math.PI,Math.PI*1.25,Math.PI*1.5])line([[Math.cos(a)*.5,Math.sin(a)*.5],[Math.cos(a)*.57,Math.sin(a)*.57]],.013,.22);}
  else cell(path([['M',.19,.39],['Q',.14,.38,.18,.48],['L',.53,.99],['L',.66,.89],['L',.3,.4],['Q',.25,.35,.19,.39]]),orange,.25);
 }
 if(id==='rc9'||id==='sc8'){
  cell(poly([[-.85,-.45],[-.6,.13],[.19,.86],[-.08,.79],[-.89,-.02]]),ivory);
  cell(poly([[-.59,-.87],[.61,-.52],[.89,.38],[.62,.32],[.4,-.34]]),ivory);
  if(id==='sc8')cell(poly([[.38,.65],[.78,.95],[.69,.48],[.56,.66],[.09,.08],[-.05,.2]]),'#ffd573',.17);
 }
 // Stepped elliptical relief: the sidewalls remain visible when the badge turns.
 function weight(x,y,rx,ry,c,z=.2){
  const s=new T.Shape();s.absellipse(x,y,rx,ry,0,Math.PI*2);solid(s,metal,z,.048,'Weight_plate_edge');
  const f=new T.Shape();f.absellipse(x,y,rx-.012,ry-.012,0,Math.PI*2);solid(f,mat(c),z+.05,.055,'Weight_plate_face',true);wire(s,z+.11,.01,'Machined_weight_rim');
 }
 if(id==='sc3'){
  cell(path([['M',-.95,-.31],['L',.81,-.31],['Q',.81,-.95,.02,-.95],['Q',-.75,-.95,-.95,-.31]]),'#00757d');
  solid(rect(-.94,-.41,1.92,.07),metal,.27,.055,'Barbell_shaft');
  weight(.48,-.15,.31,.68,'#00616b',.2);weight(.64,-.15,.24,.61,'#008c93',.27);weight(.77,-.15,.16,.51,'#005463',.34);solid(rect(.79,-.2,.25,.12),metal,.48,.09,'Barbell_sleeve');
 }
 if(id==='sc4'||id==='sc5'){
  if(id==='sc4'){
   cell(path([['M',-.94,.1],['Q',-.73,.3,-.67,-.12],['L',-.44,-.91],['L',-.67,-.94],['Q',-.94,-.94,-.94,-.65]]),ivory);
   cell(path([['M',.94,.25],['Q',.64,.3,.55,-.36],['L',.66,-.94],['Q',.94,-.94,.94,-.64]]),ivory);
  }else cell(poly([[-.88,.02],[.88,.02],[.88,-.44],[0,-.94],[-.88,-.44]]),green);
  for(let k=0;k<(id==='sc4'?4:3);k++){
   const y=(id==='sc5'?-.51:-.62)+k*.16,r=(id==='sc5'?.57:.73)-k*.105,z=.17+k*.055;
   cell(path([['M',-r,y],['C',-r,y-.18,r,y-.18,r,y],['L',r,y-.1],['C',r,y-.29,-r,y-.29,-r,y-.1]]),id==='sc4'?'#181b1e':'#005b55',z);
   weight(0,y,r,.11,id==='sc4'?'#34383b':'#008c80',z+.045);
  }
  solid(rect(-.046,-.21,.092,.24),metal,.48,.08,'Plate_stack_spindle');
 }
 function barbell(x,y,s){solid(rect(x-.64*s,y-.025*s,1.28*s,.05*s),metal,.3,.06,'Barbell_shaft');for(const sign of [-1,1])for(let k=0;k<3;k++)weight(x+sign*(.43+k*.075)*s,y,(.08-k*.01)*s,(.23-k*.035)*s,'#292c2d',.31+k*.012);}
 if(id==='sc8')barbell(0,-.49,1.24);
 if(id==='sc9'){
  cell(poly([[-.93,-.85],[0,-.85],[0,-.12],[-.47,.11]]),orange);cell(poly([[0,-.85],[.93,-.85],[.46,.11],[0,-.12]]),green);barbell(0,.4,.57);
  for(const [x,y,w,h] of [[-.73,-.44,.57,.045],[-.68,-.73,.04,.31],[-.24,-.73,.04,.31],[-.73,-.25,.04,.28]])solid(rect(x,y,w,h),metal,.2,.065,'Bench_equipment');
  gem(.46,-.48,.19,green,.18);solid(rect(.44,-.74,.04,.49),metal,.3,.055,'Plate_rack');gem(0,-.13,.105,ivory,.25);
 }
 if(id==='rc12'||id==='sc10'){
  const left=id==='rc12'?'#169bcd':orange,right=id==='rc12'?orange:'#15b8c3';
  cell(path([['M',-.89,.04],['C',-.65,.41,-.37,.35,-.12,.1],['C',.17,-.19,.4,-.38,.76,-.15],['L',.49,-.48],['C',.1,-.61,-.13,-.27,-.39,-.1],['Q',-.65,.11,-.89,.04]]),left,.14);
  cell(path([['M',.89,.04],['C',.57,.41,.38,.35,.1,.04],['C',-.18,-.31,-.4,-.36,-.66,-.2],['L',-.43,-.51],['C',-.05,-.51,.15,-.2,.37,-.09],['Q',.64,.08,.89,.04]]),right,.21);
  cell(poly([[-.44,-.43],[-.25,-.3],[.17,-.78],[0,-.94]]),id==='sc10'?'#00616b':'#1476ad',.135);gem(-.39,.48,.14,left,.21);gem(.39,.48,.14,right,.21);
 }
 function text(value,size,x,y,width=1.65,z=.095,depth=.19){
  const g=new T.ExtrudeGeometry(font.generateShapes(value,size),{depth,bevelEnabled:true,bevelSize:.012,bevelThickness:.014,bevelSegments:4,curveSegments:20});g.computeBoundingBox();
  const b=g.boundingBox.clone(),height=b.max.y-b.min.y,w=b.max.x-b.min.x;
  g.translate(-(b.min.x+b.max.x)/2,-b.min.y,0);g.scale(Math.min(size/height,width/w),size/height,1);g.translate(x,y,z);return mesh(g,metal,value);
 }
 const layout={rc3:[.83,-.1,-.01,1.55],rc4:[.58,-.14,.27,1.49],rc5:[.43,.23,-.77,1.12],rc6:[.62,-.08,.02,1.48],rc7:[.86,.05,-.16,1.48],rc8:[.61,0,-.37,1.39],rc9:[.76,-.04,-.29,1.51],rc11:[.56,-.1,-.54,1.4],sc3:[.91,-.26,-.07,.88],sc4:[.75,0,.1,1.42],sc5:[.59,0,.08,1.53],sc6:[.86,0,-.16,1.48],sc7:[.59,0,-.29,1.34],sc8:[.59,0,-.13,1.55],sc11:[.76,0,-.12,1.45]};
 if(number)text(number,...(layout[id]||[.3,0,.48,.6]));
 text('DRVN',.055,id==='rc9'?.18:0,id==='rc9'?-.52:id==='sc8'?-.32:-.86,.28).name='DRVN_brand_hallmark';
 const reverse=text('DRVN',.21,0,-.08,.8,0,.025);reverse.rotation.y=Math.PI;reverse.position.z=.075;reverse.name='DRVN_reverse_signature';
 return root;
}
