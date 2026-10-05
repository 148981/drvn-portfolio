import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
const polygon=points=>new T.Shape(points.map(p=>new T.Vector2(...p)));
export function createSportBadge(e){
 const root=new T.Group();root.name=`DRVN_${e.asset}`;root.userData={title:e.name,asset:e.asset,design:e.design};
 const colors=[['#e9dfd1','#fff7e8'],['#424b54','#aeb9c1'],['#a3b7ce','#ecf5ff'],['#b9a17d','#fff0cb']][e.index];
 const body=new T.MeshPhysicalMaterial({color:colors[0],metalness:e.index===0?.12:.78,roughness:.27,clearcoat:1});
 const edge=new T.MeshPhysicalMaterial({color:colors[1],metalness:.6,roughness:.19,clearcoat:1});
 const dark=new T.MeshPhysicalMaterial({color:'#242931',metalness:.45,roughness:.3});
 function mesh(g,m=body,name='Sculpted_emblem'){const o=new T.Mesh(g,m);o.name=name;root.add(o);return o;}
 function relief(shape,z=0,m=body,depth=.075){const g=new T.ExtrudeGeometry(shape,{depth,bevelEnabled:true,bevelThickness:.012,bevelSize:.015,bevelSegments:3,curveSegments:28});g.translate(0,0,z);const flat=g.toNonIndexed(),p=flat.attributes.position,out=[];
 function split(a,b,c,level=0){if(level<5&&Math.max(a.distanceToSquared(b),b.distanceToSquared(c),c.distanceToSquared(a))>.035){const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);split(a,ab,ca,level+1);split(ab,b,bc,level+1);split(ca,bc,c,level+1);split(ab,bc,ca,level+1);}else out.push(...a.toArray(),...b.toArray(),...c.toArray());}
 for(let i=0;i<p.count;i+=3)split(new T.Vector3().fromBufferAttribute(p,i),new T.Vector3().fromBufferAttribute(p,i+1),new T.Vector3().fromBufferAttribute(p,i+2));
 const smooth=new T.BufferGeometry();smooth.setAttribute('position',new T.Float32BufferAttribute(out,3));smooth.computeVertexNormals();g.dispose();flat.dispose();return mesh(smooth,m);}
 function line(points,r=.022,m=edge){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),100,r,8,false),m,'Route_orbit');}
 function ring(x,y,r,z=0,sx=1,sy=1){const o=mesh(new T.TorusGeometry(r,.04,12,96),edge,'Precision_ring');o.position.set(x,y,z);o.scale.set(sx,sy,1);return o;}
 function rect(w,h){const s=new T.Shape();s.moveTo(-w/2+.12,-h/2);s.lineTo(w/2-.12,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+.12);s.lineTo(w/2,h/2-.12);s.quadraticCurveTo(w/2,h/2,w/2-.12,h/2);s.lineTo(-w/2+.12,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-.12);s.lineTo(-w/2,-h/2+.12);s.quadraticCurveTo(-w/2,-h/2,-w/2+.12,-h/2);return s;}
 function text(value,y,z,width,size=.65){const g=new T.ExtrudeGeometry(font.generateShapes(value,size),{depth:.055,bevelEnabled:true,bevelThickness:.007,bevelSize:.009,bevelSegments:3});g.computeBoundingBox();const b=g.boundingBox;g.translate(-(b.max.x+b.min.x)/2,-(b.max.y+b.min.y)/2,0);const o=mesh(g,edge,'Milestone_number');o.scale.x=Math.min(1,width/(b.max.x-b.min.x));o.position.set(0,y,z);return o;}
 const d=e.design;
 if(d==='route'){
  const s=new T.Shape();s.absarc(0,0,.94,0,Math.PI*2);relief(s,0,body,.07);
  for(let j=0;j<2;j++)line(Array.from({length:81},(_,i)=>{const a=i/80*Math.PI*2;return [Math.cos(a)*(.96+j*.08),Math.sin(a)*(.68+j*.07),.13+Math.sin(a*2)*.10];}));
  text(e.number,.03,.22,1.7);text('KM',-.52,.13,.4,.12);
 }else if(d==='bib'||d==='calendar'||d==='camera'){
  relief(rect(1.9,1.7));
  [-.72,.72].forEach(x=>{ring(x,.65,.05,.11);});
  if(d==='calendar'){for(let i=0;i<4;i++){const r=ring(-.6+i*.4,.85,.09,.08);r.rotation.x=Math.PI/2;}line([[-.8,.45,.12],[.8,.45,.12]],.014);}
  if(d==='camera'){relief(polygon([[-.65,.83],[-.5,1.03],[.08,1.03],[.2,.83]]));ring(0,0,.67,.11);}
  text(e.number+(d==='bib'?'K':''),-.04,.16,1.65,.83);text(d==='bib'?'RUN / DRVN':d==='camera'?'MOMENTS':'DAILY',-.57,.13,1,.12);
 }else if(d==='timer'||d==='dial'){
  const s=new T.Shape();s.absarc(0,0,.95,0,Math.PI*2);relief(s);ring(0,0,.9,.12);
  for(let i=0;i<40;i++){const a=i*Math.PI/20;line([[Math.cos(a)*.77,Math.sin(a)*.77,.12],[Math.cos(a)*.84,Math.sin(a)*.84,.12]],.008);}
  if(d==='timer'){const b=relief(rect(.48,.19));b.position.y=1.05;}
  text(e.number,0,.17,1.45,.76);text(d==='timer'?'KM':'BODY',-.43,.16,.5,.13);
 }else if(d==='wing'||d==='tape'||d==='velocity'){
  const sharp=d==='velocity'?e.index*.12:.15;
  relief(polygon([[-1.2,-.45],[-1,-.08],[-1.15,.43],[.95,.43],[1.3,.05],[1.06,-.45]]));
  for(let j=0;j<3;j++){
   const y=-.45+j*.33;
   relief(polygon([[-1.3-j*.13,y],[-.7,y+.11],[1.0+j*.08,y+.18+sharp],[.73,y-.02]]),-.045-j*.025,edge,.025);
  }
  text(e.number,.09,.18,2,.59);
  text(d==='velocity'?'MIN / KM':'KM',-.34,.19,.7,.09);
 }else if(d==='links'||d==='loop'){
  const count=d==='links'?2:Math.min(4,e.index+1);
  for(let j=0;j<count;j++){const r=ring((j-(count-1)/2)*.16,0,.9,.02+j*.065,1,.87);r.rotation.y=(j%2===0?1:-1)*.22;}
  // Numeral bridges the open loop, with a narrow curved inset providing readable contrast.
  relief(rect(1.65,.8),.13,dark,.035);text(e.number,0,.23,1.5,.8);
  text(d==='links'?'TOGETHER':'SESSIONS',-.59,.13,1,.12);
 }
 // Gently cambered body and lettering share one surface instead of floating planar layers.
 root.traverse(o=>{if(o.isMesh){const p=o.geometry.attributes.position;for(let i=0;i<p.count;i++){const x=p.getX(i)+o.position.x;p.setZ(i,p.getZ(i)+.07*x*x);}p.needsUpdate=true;o.geometry.computeVertexNormals();}});
 root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),c=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());root.children.forEach(o=>o.position.sub(c));root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
