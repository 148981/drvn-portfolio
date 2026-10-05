import * as THREE from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
import {nacreSurface,featherShape} from './badgeRelief.js';
import {peeledFlame,mountainRelief} from './badgeDepth.js';

const font=new FontLoader().parse(fontData);
const poly=points=>new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
function rounded(w=1.8,h=2.3,r=.24){
 const s=new THREE.Shape(),x=-w/2,y=-h/2;
 s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;
}
function flame(){const s=new THREE.Shape();s.moveTo(0,-1.12);s.bezierCurveTo(-1.4,-.9,-.72,.16,-.29,.69);s.bezierCurveTo(.03,1.09,.13,1.21,.02,1.4);s.bezierCurveTo(.77,.93,.39,.52,.73,.12);s.bezierCurveTo(1.35,-.71,.73,-1.15,0,-1.12);return s;}

export function createAchievementObject(entry){
 const root=new THREE.Group();root.name=`DRVN_${entry.asset}`;
 const gold=new THREE.MeshPhysicalMaterial({color:'#d6a65f',metalness:.83,roughness:.23,clearcoat:.8});
 const silver=new THREE.MeshPhysicalMaterial({color:'#d6e0ed',metalness:.82,roughness:.2,clearcoat:1});
 const stone=new THREE.MeshPhysicalMaterial({color:entry.index===0?'#e7e0d2':'#222a34',metalness:entry.index===0?.15:.5,roughness:.3,clearcoat:1,transmission:entry.index===0?.1:0});
 const trim=entry.index===3?gold:silver;
 const pearl=new THREE.MeshPhysicalMaterial({color:'#fff1e4',metalness:.2,roughness:.2,transmission:.16,thickness:.18,iridescence:.45,clearcoat:1});
 const add=(g,m,name,x=0,y=0,z=0)=>{const o=new THREE.Mesh(g,m);o.name=name;o.position.set(x,y,z);root.add(o);return o;};
 const relief=(s,m=stone,z=0,depth=.13,name='Sculpted_body')=>add(new THREE.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:4,curveSegments:24}),m,name,0,0,z);
 const line=(points,m=trim,r=.014,name='Polished_inlay')=>add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),Math.max(16,points.length*8),r,8,false),m,name);
 const ring=(r,t=.027,m=trim,x=0,y=0,z=.2)=>add(new THREE.TorusGeometry(r,t,12,80),m,'Sculpted_ring',x,y,z);
 const sphere=(x,y,z,r=.065,m=trim)=>add(new THREE.SphereGeometry(r,20,14),m,'Polished_node',x,y,z);
 const text=(label,size,x,y,z=.28,m=trim)=>{
  const g=new THREE.ExtrudeGeometry(font.generateShapes(label,size),{depth:.035,bevelEnabled:true,bevelSize:.003,bevelThickness:.005,bevelSegments:3,curveSegments:8});g.computeBoundingBox();g.translate(-(g.boundingBox.max.x+g.boundingBox.min.x)/2,0,0);return add(g,m,`Lettering_${label}`,x,y,z);
 };
 const frame=s=>{
  relief(s,stone);
  const rim=poly(s.getPoints(32).map(p=>[p.x*1.025,p.y*1.025]));rim.holes.push(new THREE.Path(s.getPoints(32).map(p=>new THREE.Vector2(p.x*.94,p.y*.94))));relief(rim,trim,.12,.035,'Double_beveled_frame');
 };
 const circle=(r=1.1,hole=0)=>{const s=new THREE.Shape();s.absarc(0,0,r,0,Math.PI*2,false);if(hole){const p=new THREE.Path();p.absarc(0,0,hole,0,Math.PI*2,true);s.holes.push(p);}return s;};
 const hex=()=>poly([[0,1.2],[1,.6],[1,-.6],[0,-1.2],[-1,-.6],[-1,.6]]);
 const shield=()=>poly([[-.9,1],[.9,1],[.77,-.55],[0,-1.16],[-.77,-.55]]);
 const crystal=(x,y,size,m=stone)=>{const o=add(new THREE.IcosahedronGeometry(size,0),m,'Cut_crystal',x,y,.25);o.scale.set(.65,1,.45);o.rotation.z=x*.9;return o;};

 if(entry.family==='squad'){
  const s=rounded();frame(s);
  if(entry.design==='join'){
   const mat=pearl.clone();mat.vertexColors=true;
   add(nacreSurface(s,.15,['#c4cbd4','#738093','#f4e3d2'],.02),mat,'Flowing_social_surface');
   line([[-.8,-.86,.25],[-.4,-.57,.25],[.06,-.34,.25],[.4,.25,.25],[.8,.9,.25]],silver,.035);sphere(-.39,-.55,.34,.16,silver);
  }else if(entry.design==='rings'){
   const a=ring(.43,.07,silver,-.23,-.23,.34);a.rotation.x=.16;
   const b=ring(.43,.07,silver,.22,.23,.41);b.rotation.y=.28;
  }else if(entry.design==='weave'){
   for(let i=0;i<3;i++){
    const points=Array.from({length:81},(_,j)=>{const t=j/80*Math.PI*2,angle=i*Math.PI/3,x=Math.cos(t)*.98,y=Math.sin(t)*.38;return [x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),.38+Math.sin(t*2+i)*.095];});
    line(points,silver,.065,'Interwoven_metal_ribbon');
   }
  }else{
   const nodes=[[-.68,.89],[-.39,.13],[.5,.65],[.76,-.02],[.56,-.72],[-.74,-.72],[0,-.99]];
   for(const [a,b] of [[0,1],[0,2],[1,2],[2,3],[1,4],[3,4],[1,5],[4,5],[4,6],[5,6],[0,5]])line([[...nodes[a],.24],[...nodes[b],.24]],gold,.015);
   nodes.forEach(([x,y],i)=>sphere(x,y,.26,i%2?.07:.09,gold));
   for(let i=0;i<8;i++)crystal(Math.sin(i*8)*.6,Math.cos(i*5)*.8,.25,stone);
  }
  text('DRVN',.065,.53,-1,.22,trim);
 }else if(['flame','burn'].includes(entry.design)){
  const s=flame();
  const amber=new THREE.MeshPhysicalMaterial({color:'#ffc975',metalness:.08,roughness:.09,transmission:.72,thickness:.22,ior:1.46,clearcoat:1,transparent:true,opacity:.52,side:THREE.DoubleSide,depthWrite:false});
  add(peeledFlame(s,0,1,0),amber,'Transparent_amber_outer_shell');
  for(const [i,a,b] of [[0,.03,.31],[1,.35,.67],[2,.71,.97]]){
   const membrane=amber.clone();membrane.color.set(['#ffe1a0','#d89136','#fff0cf'][i]);membrane.transmission=.72;membrane.opacity=.64;
   add(peeledFlame(s,a,b,1),membrane,`Separated_curling_flame_${i}`);
  }
  const core=amber.clone();core.color.set('#f5b747');core.transmission=.4;core.opacity=.92;
  const little=relief(s,core,.44,.18,'Molten_inner_flame');little.scale.set(.4,.49,1);little.position.y=-.26;little.rotation.y=-.18;
  const coreShape=poly(s.getPoints(40).map(p=>[p.x*.4,p.y*.49-.26]));const coreSheen=amber.clone();coreSheen.vertexColors=true;coreSheen.color.set('#ffffff');coreSheen.opacity=.8;
  add(nacreSurface(coreShape,.67,['#fff1c9','#c68027','#f2bc6d'],.045),coreSheen,'Undulating_molten_core');
  const rim=s.getSpacedPoints(100).map((p,i)=>[p.x,p.y,.24+.07*Math.sin(i/100*Math.PI*5)]);line(rim,gold,.011,'Fine_gold_flame_lip');
  if(entry.design==='flame')text('30',.28,0,-.61,.72,gold);
  else for(let i=0;i<33;i++){const t=Math.PI*1.05+i*Math.PI*.9/32;line([[Math.cos(t)*.6,Math.sin(t)*.6-.18,.62],[Math.cos(t)*.68,Math.sin(t)*.68-.18,.62]],gold,.008);}
 }else if(entry.design==='plate'||entry.design==='track'){
  const plate=entry.design==='plate';relief(circle(1.1,plate?.2:0),plate?stone:silver);
  ring(1.08,.045,plate?gold:silver);ring(plate?.3:.76,.025,plate?gold:silver);
  if(plate){
   relief(circle(.49,.2),stone,.14,.12,'Raised_weight_hub');ring(.48,.023,gold,0,0,.28);ring(.2,.03,gold,0,0,.29);
   relief(circle(1.06,.95),stone,-.14,.2,'Thick_plate_sidewall');ring(1.03,.014,gold,0,0,-.12);
   for(let i=0;i<48;i++){const t=i/48*Math.PI*2;line([[Math.cos(t)*.98,Math.sin(t)*.98,.15],[Math.cos(t)*1.04,Math.sin(t)*1.04,.15]],gold,.006);}
   text('100KG',.23,0,.62,.2,gold);text('CLUB',.2,0,-.8,.2,gold);text('DRVN',.085,-.7,-.03);text('DRVN',.085,.7,-.03);}
  else{
   for(const r of [.84,.92,1])ring(r,.012,silver);
   text('100',.48,0,-.13,.25,pearl);
   for(let i=0;i<4;i++){const t=i*Math.PI/2;line([[Math.cos(t)*.76,Math.sin(t)*.76,.23],[Math.cos(t)*1.04,Math.sin(t)*1.04,.23]],silver,.014);}
   sphere(0,-.45,.25,.045,silver);line([[0,-.5,.25],[-.08,-.65,.25],[.06,-.74,.25]],silver,.021);line([[-.07,-.62,.25],[-.24,-.79,.25],[-.32,-.79,.25]],silver,.018);line([[-.03,-.56,.25],[.12,-.6,.25],[.19,-.53,.25]],silver,.018);
  }
 }else if(entry.design==='calendar'){
  const s=new THREE.Shape();s.moveTo(-.95,-.82);s.lineTo(-.95,.69);s.quadraticCurveTo(-.95,.82,-.82,.82);s.lineTo(.82,.82);s.quadraticCurveTo(.95,.82,.95,.69);s.lineTo(.95,-.82);s.lineTo(.44,-.82);s.lineTo(.44,-.3);s.absarc(0,-.3,.44,0,Math.PI,false);s.lineTo(-.44,-.82);s.closePath();relief(s,pearl);
  const handle=rounded(1.5,.55,.2),hole=rounded(1.1,.25,.11);handle.holes.push(new THREE.Path(hole.getPoints(24)));const top=relief(handle,pearl);top.position.y=.95;
  for(const x of [-.63,.63]){const binder=ring(.11,.035,silver,x,.78,.22);binder.rotation.y=Math.PI/2;line([[x,-.67,.17],[x,.57,.17]],silver,.009,'Calendar_side_inlay');}
  for(const x of [-.73,.73]){const foot=relief(rounded(.48,.25,.05),pearl);foot.position.set(x,-.8,.04);}
  line([[-.85,.45,.23],[.85,.45,.23]],silver,.014);
  for(let i=0;i<7;i++){const x=-.72+i*.24;line([[x,.38,.23],[x,.52,.23]],silver,.012);text(String(i+1),.09,x,.22,.23,silver);}
  text('DRVN',.09,0,.62,.24,silver);
 }else if(entry.design==='speed'||entry.design==='velocity'){
  if(entry.design==='velocity')frame(shield());
  for(let i=0;i<5;i++){
   const s=featherShape(1,i),o=relief(s,silver,.18+i*.07,.07,'Swept_speed_blade');o.scale.set(1.3,.9,1);o.position.x=-.65;
   const p=o.geometry.attributes.position;for(let j=0;j<p.count;j++)p.setZ(j,p.getZ(j)+.15*Math.sin(p.getX(j)*2.5));o.geometry.computeVertexNormals();
   const shine=silver.clone();shine.vertexColors=true;const surface=add(nacreSurface(s,.29+i*.07,['#f5f7ff','#6c7f98','#cadce9'],.018),shine,'Curved_blade_highlight',-.65,0,0);surface.scale.set(1.3,.9,1);
  }
  line([[-.58,-.7,.3],[-.68,-.25,.3],[-.22,.35,.3],[.68,.95,.3]],silver,.045,'Curved_speed_spine');
  text('DRVN',.07,-.13,-.72,.4,silver);
 }else if(entry.design==='camp'){
  const s=shield();const slot=rounded(.5,.12,.06);
  const slotPath=new THREE.Path(slot.getPoints(24).map(p=>new THREE.Vector2(p.x,p.y+.81)));s.holes.push(slotPath);frame(s);
  text('TRAINING',.17,0,.43);text('CAMP',.2,0,.15);
  for(let i=0;i<13;i++)line([[-.63+i*.033,-.25,.24],[-.63+i*.033,-.02,.24]],gold,i%3?.007:.012);
  for(const points of [[[-.6,-.58],[-.48,-.68],[.8,.68],[.82,.86]],[[-.36,-.78],[-.23,-.89],[.75,.2],[.77,.41]],[[-.11,-.99],[.05,-1.07],[.71,-.31],[.73,-.09]]])relief(poly(points),gold,.19,.025,'Diagonal_camp_stripe');
  add(new THREE.ExtrudeGeometry(rounded(1.45,.58,.035),{depth:.01,bevelEnabled:false}),stone,'Recessed_lettering_panel',0,.4,.25);
  for(const x of [-.76,.76])sphere(x,.82,.2,.027,gold);
 }else if(entry.design==='mountain'||entry.design==='pr'){
  frame(hex());
  if(entry.design==='pr'){
   text('PR',.52,0,.2,.28,gold);relief(poly([[-.035,-.4],[.035,-.4],[.035,-.15],[.13,-.24],[.17,-.2],[0,-.03],[-.17,-.2],[-.13,-.24],[-.035,-.15]]),gold,.3,.025,'Progress_arrow');
   for(const side of [-1,1])for(let i=0;i<7;i++){const shard=crystal(side*(.3+i*.095),-1+i*.23,.24+(i%3)*.035,i%3?stone:silver);shard.scale.z=1.1;shard.position.z=.28+(i%2)*.13;shard.rotation.y=side*.3;line([[side*(.3+i*.095),-1+i*.23,.52],[side*(.24+i*.095),-.85+i*.23,.62]],gold,.009,'Gold_crystal_seam');}
  }else{
   for(const back of [true,false]){
    const rock=new THREE.MeshPhysicalMaterial({color:'#ffffff',vertexColors:true,metalness:.28,roughness:.48,flatShading:true});
    add(mountainRelief(back),rock,back?'Distant_mountain_ridge':'Sculpted_foreground_terrain');
   }
   line([[-.05,.61,.44],[-.05,.99,.44]],gold,.014,'Summit_flagpole');relief(poly([[0,.95],[.4,.9],[.3,.76],[0,.78]]),gold,.42,.014,'Summit_flag');
   const route=[[-.28,-.8,.67],[-.25,-.65,.8],[.08,-.4,.9],[-.02,-.09,.86],[-.05,.52,.56]];line(route,gold,.015);route.forEach(p=>sphere(...p,.028,gold));
  }
 }
 // One common maximum dimension, without stretching each object's proportions.
 root.updateMatrixWorld(true);const box=new THREE.Box3().setFromObject(root),size=box.getSize(new THREE.Vector3()),center=box.getCenter(new THREE.Vector3());
 const factor=2.38/Math.max(size.x,size.y);root.children.forEach(o=>o.position.sub(center));root.scale.setScalar(factor);
 root.userData={title:entry.name,asset:entry.asset,design:entry.design};return root;
}
