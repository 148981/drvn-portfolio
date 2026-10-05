import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {mergeGeometries,mergeVertices} from 'three/addons/utils/BufferGeometryUtils.js';
import {MarchingCubes} from 'three/addons/objects/MarchingCubes.js';
import serif from './fonts/seasonal-serif.typeface.json' with {type:'json'};
const font=new FontLoader().parse(serif);
export function seasonalKit(entry){
 const root=new T.Group();root.name=`DRVN_${entry.asset}`;root.userData={...entry};
 const materials=new Map();
 function material(color,kind='metal'){
  const key=color+kind;if(!materials.has(key))materials.set(key,new T.MeshPhysicalMaterial({color,metalness:kind==='metal'?.85:kind==='glass'?.12:.28,roughness:kind==='metal'?.24:kind==='glass'?.13:.65,clearcoat:kind==='stone'?.15:.7,transparent:kind==='glass',opacity:kind==='glass'?.36:1,side:T.DoubleSide}));return materials.get(key);
 }
 const gold=material('#d3b991'),silver=material('#d6d0c1'),dark=material('#39403c','stone'),cream=material('#c7c0ad','stone'),blue=material('#20495d','stone'),green=material('#254e48','stone'),red=material('#993e34','stone');
 function path(c){const s=new T.Shape();for(const [op,...v] of c)s[{M:'moveTo',L:'lineTo',Q:'quadraticCurveTo',C:'bezierCurveTo'}[op]](...v);s.closePath();return s;}
 const poly=p=>path(p.map((v,j)=>[j?'L':'M',...v]));
 const rect=(x,y,w,h)=>poly([[x,y],[x+w,y],[x+w,y+h],[x,y+h]]);
 function ellipse(x,y,rx,ry=rx){const s=new T.Shape();s.absellipse(x,y,rx,ry,0,Math.PI*2);return s;}
 function add(g,m,name='Relief'){const o=new T.Mesh(g,m);o.name=name;root.add(o);return o;}
 function solid(s,m,z=.05,depth=.06,bevel=.009,name='Relief'){
  const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:bevel>0,bevelSize:bevel,bevelThickness:bevel,bevelSegments:3,curveSegments:24});g.translate(0,0,z);return add(g,m,name);
 }
 function line(points,m=gold,r=.008){const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return add(new T.TubeGeometry(curve,Math.max(20,points.length*4),r,6,false),m,'Metal_inlay');}
 function border(s,z=.14,r=.013,m=gold){const points=s.getPoints(48),curve=new T.CurvePath();for(let j=1;j<points.length;j++)curve.add(new T.LineCurve3(new T.Vector3(points[j-1].x,points[j-1].y,z),new T.Vector3(points[j].x,points[j].y,z)));return add(new T.TubeGeometry(curve,Math.max(100,points.length),r,6,false),m,'Cast_border');}
 function stoneFace(s,m,z=.03){
  // Subdivided, mineral-coloured vertices survive GLB export without a shader.
  const base=new T.ShapeGeometry(s,32),src=base.index?base.toNonIndexed():base,pos=src.attributes.position,out=[],norm=[],col=[];
  function tri(a,b,c,d=0){
   if(d<6&&Math.max(a.distanceTo(b),b.distanceTo(c),a.distanceTo(c))>.09){const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);tri(a,ab,ca,d+1);tri(ab,b,bc,d+1);tri(ca,bc,c,d+1);tri(ab,bc,ca,d+1);return;}
   for(const p of [a,b,c]){const grain=Math.sin(p.x*733+p.y*569)*43758.5,noise=grain-Math.floor(grain),vein=Math.sin(p.x*11+p.y*7+Math.sin(p.y*13)*1.5);const tone=.74+noise*.18+vein*.08;out.push(p.x,p.y,z+.025*(1-p.x*p.x-p.y*p.y));const n=new T.Vector3(p.x*.05,p.y*.05,1).normalize();norm.push(...n.toArray());col.push(tone,tone,tone);}
  }
  for(let j=0;j<pos.count;j+=3)tri(new T.Vector3().fromBufferAttribute(pos,j),new T.Vector3().fromBufferAttribute(pos,j+1),new T.Vector3().fromBufferAttribute(pos,j+2));
  base.dispose();if(src!==base)src.dispose();const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(out,3));g.setAttribute('normal',new T.Float32BufferAttribute(norm,3));g.setAttribute('color',new T.Float32BufferAttribute(col,3));const finish=m.clone();finish.vertexColors=true;return add(g,finish,'Mineral_surface');
 }
 function panel(s,m,z=.05){solid(s,m,z,.045);stoneFace(s,m,z+.048);border(s,z+.1,.007);}
 function sphere(x,y,z,rx,ry=rx,rz=rx,m=gold){const o=add(new T.SphereGeometry(1,24,16),m,'Sculpted_relief');o.scale.set(rx,ry,rz);o.position.set(x,y,z);return o;}
 function beam(a,b,r,m=gold,r2=r){const va=new T.Vector3(...a),vb=new T.Vector3(...b),o=add(new T.CylinderGeometry(r2,r,va.distanceTo(vb),12),m,'Sculpted_member');o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vb.sub(va).normalize());return o;}
 function ring(x,y,z,r,t=.025,m=gold,sy=1){const o=add(new T.TorusGeometry(r,t,10,64),m,'Metal_ring');o.position.set(x,y,z);o.scale.y=sy;return o;}
 function box(x,y,z,w,h,d,m=gold){const o=add(new T.BoxGeometry(w,h,d),m,'Architecture');o.position.set(x,y,z);return o;}
 function text(value,x,y,height=.65,maxWidth=1,z=.16,m=gold){
  const g=new T.ExtrudeGeometry(font.generateShapes(value,1),{depth:.035,bevelEnabled:true,bevelSize:.004,bevelThickness:.006,bevelSegments:3,curveSegments:16});g.computeBoundingBox();const b=g.boundingBox.clone(),scale=height/(b.max.y-b.min.y);g.translate(-(b.min.x+b.max.x)/2,-b.min.y,0);g.scale(Math.min(scale,maxWidth/(b.max.x-b.min.x)),scale,1);g.translate(x,y,z);return add(g,m,`Text_${value}`);
 }
 function base(kind='circle',m=blue){
  let s;if(kind==='circle')s=ellipse(0,0,1);else if(kind==='oval')s=ellipse(-.08,0,.72,1);else if(kind==='hex')s=poly([[0,1],[.94,.48],[.94,-.52],[0,-1],[-.94,-.52],[-.94,.48]]);else if(kind==='flower'){
   s=new T.Shape();for(let j=0;j<=160;j++){const a=j/160*Math.PI*2,r=.84+.15*Math.cos(5*(a-Math.PI/2));j?s.lineTo(Math.cos(a)*r,Math.sin(a)*r):s.moveTo(Math.cos(a)*r,Math.sin(a)*r);}s.closePath();
  }else s=path([['M',-.72,1],['L',.74,1],['Q',1,1,1,.74],['L',1,-.74],['Q',1,-1,.74,-1],['L',-.74,-1],['Q',-1,-1,-1,-.74],['L',-1,.74],['Q',-1,1,-.72,1]]);
  solid(s,gold,-.14,.13,.016,'Medal_body');stoneFace(s,m,.035);border(s,.065,.019);border(s,-.11,.009);return s;
 }
 function leaf(a,b,width=.035,m=gold,z=.19){const [x,y]=a,[u,v]=b,dx=u-x,dy=v-y,l=Math.hypot(dx,dy),nx=-dy/l*width,ny=dx/l*width;solid(path([['M',x,y],['Q',(x+u)/2+nx,(y+v)/2+ny,u,v],['Q',(x+u)/2-nx,(y+v)/2-ny,x,y]]),m,z,.016,.004,'Botanical_relief');line([[x,y,z+.025],[u,v,z+.025]],gold,.003);}
 function flower(x,y,s=.12){const pink=material('#d78d98','stone');for(let k=0;k<5;k++){const a=k*Math.PI*2/5;const petal=sphere(x+Math.cos(a)*s*.48,y+Math.sin(a)*s*.48,.2,s*.43,s*.25,.026,pink);petal.rotation.z=a;}sphere(x,y,.235,s*.15,s*.15,.02,gold);}
 function human(x,y,s=1,pose='run',m=gold){
  const first=root.children.length;
  const z=.26,at=(a,b,c=0)=>[x+a*s,y+b*s,z+c*s];
  sphere(...at(0,.36),.073*s,.1*s,.07*s,m);sphere(...at(.052,.36,.045),.019*s,.024*s,.038*s,m);
  sphere(...at(-.008,.26),.049*s,.082*s,.046*s,m);
  const bulk=pose==='flex'?1.2:1;
  sphere(...at(-.025,.12),.14*s*bulk,.18*s,.065*s,m);sphere(...at(-.026,-.08),.09*s,.11*s,.065*s,m);
  for(let j=0;j<9;j++)sphere(...at(-.048+(j%3)*.03,.42+Math.floor(j/3)*.02,.016),.027*s,.024*s,.042*s,m);
  for(const sign of [-1,1]){sphere(...at(sign*.04,.378,.058),.023*s,.008*s,.015*s,m);sphere(...at(sign*.064,.352),.02*s,.032*s,.017*s,m);}
  for(const sign of [-1,1]){sphere(...at(sign*.068,.17,.064),.078*s*bulk,.065*s,.041*s,m);for(let k=0;k<3;k++)sphere(...at(sign*.028,.07-k*.052,.076),.027*s,.03*s,.02*s,m);}
  const arms=pose==='flex'?[[[-.13,.2],[-.27,.4],[-.14,.54]],[[.12,.2],[.31,.08],[.37,.24]]]:[[[-.12,.2],[-.25,.02],[-.37,.13]],[[.12,.2],[.26,.32],[.33,.48]]];
  const legs=pose==='flex'?[[[-.05,-.13],[-.12,-.37],[-.17,-.63]],[[.05,-.13],[.17,-.34],[.11,-.64]]]:[[[-.06,-.13],[-.24,-.3],[-.49,-.36]],[[.06,-.13],[.25,-.31],[.04,-.53]]];
  function muscle(a,b,width){const va=new T.Vector3(...a),vb=new T.Vector3(...b),mid=va.clone().add(vb).multiplyScalar(.5),length=va.distanceTo(vb);const o=sphere(...mid.toArray(),width,length*.63,width*.84,m);o.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),vb.sub(va).normalize());}
  [...arms,...legs].forEach((limb,j)=>{const pts=limb.map(p=>at(...p));muscle(pts[0],pts[1],s*(j<2?.061:.073));muscle(pts[1],pts[2],s*(j<2?.043:.051));sphere(...pts[1],.035*s,.035*s,.031*s,m);sphere(...pts[2],.038*s,.033*s,.033*s,m);});
  // Fuse the anatomical volumes into one cast surface, eliminating ball joints.
  const parts=root.children.slice(first),bounds=new T.Box3();
  for(const o of parts){o.updateMatrixWorld();bounds.expandByObject(o);}
  bounds.expandByScalar(s*.045);const size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3()),resolution=64;
  const cubes=new MarchingCubes(resolution,m,false,false,24000),point=new T.Vector3();
  const volumes=parts.map(o=>({inverse:o.matrixWorld.clone().invert(),radius:Math.min(o.scale.x,o.scale.y,o.scale.z)}));
  for(let zz=0;zz<resolution;zz++)for(let yy=0;yy<resolution;yy++)for(let xx=0;xx<resolution;xx++){
   const px=bounds.min.x+xx/resolution*size.x,py=bounds.min.y+yy/resolution*size.y,pz=bounds.min.z+zz/resolution*size.z;let distance=1;
   for(const v of volumes){point.set(px,py,pz).applyMatrix4(v.inverse);const d=(point.length()-1)*v.radius,blend=s*.009,h=Math.max(0,blend-Math.abs(distance-d))/blend;distance=Math.min(distance,d)-h*h*blend*.25;}
   cubes.field[xx+yy*resolution+zz*resolution*resolution]=80-distance*1500;
  }
  cubes.update();const count=cubes.geometry.drawRange.count,g=new T.BufferGeometry();
  for(const name of ['position','normal'])g.setAttribute(name,new T.Float32BufferAttribute(cubes.geometry.attributes[name].array.slice(0,count*3),3));
  g.scale(size.x/2,size.y/2,size.z/2);g.translate(center.x,center.y,center.z);cubes.geometry.dispose();
  for(const o of parts){o.geometry.dispose();root.remove(o);}add(g,m,'Cast_anatomical_sculpture');
 }
 function finish(){
  text('DRVN',0,-.88,.06,.3,.15).name='DRVN_brand_hallmark';
  const reverse=text('DRVN',0,-.08,.19,.75,0,gold);reverse.rotation.y=Math.PI;reverse.position.z=-.145;reverse.name='DRVN_reverse_signature';
  const groups=new Map();root.updateMatrixWorld(true);
  for(const o of [...root.children])if(o.isMesh&&!o.name.startsWith('Text_')&&!o.name.startsWith('DRVN')){const g=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();g.applyMatrix4(o.matrixWorld);g.deleteAttribute('uv');if(!groups.has(o.material))groups.set(o.material,[]);groups.get(o.material).push(g);o.geometry.dispose();root.remove(o);}
  for(const [m,gs]of groups){const g=mergeGeometries(gs),indexed=mergeVertices(g,1e-5);g.dispose();gs.forEach(g=>g.dispose());add(indexed,m,'Cast_relief_layers');}
  return root;
 }
 return {root,material,gold,silver,dark,cream,blue,green,red,path,poly,rect,ellipse,add,solid,line,border,stoneFace,panel,sphere,beam,ring,box,text,base,leaf,flower,human,finish};
}
