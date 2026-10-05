import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_bold.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
const poly=p=>new T.Shape(p.map(v=>new T.Vector2(...v)));
export function createSingleRunBadge(e){
 const n=Number(e.number),root=new T.Group();root.name=`DRVN_${e.asset}`;root.userData={title:e.name,asset:e.asset,design:'single-run'};
 const silver=new T.MeshPhysicalMaterial({color:'#dde2e4',metalness:.85,roughness:.24,clearcoat:.8});
 const dark=silver.clone();dark.color.set('#25292b');dark.roughness=.38;
 const green=silver.clone();green.color.set('#657b6b');
 const gold=silver.clone();gold.color.set('#d9b98e');
 const red=silver.clone();red.color.set('#bc3037');red.roughness=.2;
 function mesh(g,m=silver,name='Single_run_detail'){const o=new T.Mesh(g,m);o.name=name;root.add(o);return o;}
 function extrude(s,m=silver,z=0,depth=.08){const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelThickness:.02,bevelSize:.02,bevelSegments:4,curveSegments:32});g.translate(0,0,z);return mesh(g,m);}
 function text(value,x,y,height,width,m=silver,z=.24){const g=new T.ExtrudeGeometry(font.generateShapes(value,1),{depth:.14,bevelEnabled:true,bevelSize:.016,bevelThickness:.022,bevelSegments:4,curveSegments:24});g.computeBoundingBox();const b=g.boundingBox,size=b.getSize(new T.Vector3());g.translate(-(b.min.x+b.max.x)/2,-b.min.y,0);g.scale(Math.min(width/size.x,height/size.y*.8),height/size.y,1);const normals=g.attributes.normal,positions=g.attributes.position;for(let i=0;i<normals.count;i++)if(normals.getZ(i)>.9){const v=new T.Vector3(.22*Math.sin(positions.getX(i)*2),.24*Math.sin(positions.getY(i)*2.7),1).normalize();normals.setXYZ(i,v.x,v.y,v.z);}
 const o=mesh(g,m,'Milestone_'+value);o.position.set(x,y,z);return o;}
 function tube(points,r=.018,m=silver){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),100,r,8,false),m);}
 function ring(radius,m=silver,y=0){const o=mesh(new T.TorusGeometry(radius,.045,16,128),m);o.position.y=y;return o;}
 function ribbon(y,m){const pos=[],indices=[];for(let i=0;i<=100;i++){const t=i/100*Math.PI*2;for(let j=0;j<2;j++)pos.push(Math.cos(t)*1.36,y+Math.sin(t*2)*.12+(j-.5)*.28,Math.sin(t)*.41);}for(let i=0;i<100;i++){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();const mat=m.clone();mat.side=T.DoubleSide;mesh(g,mat,'Folded_finish_tape');}
 if(n===5){
  const s=poly([[-1.12,-.82],[1.1,-.55],[1.03,.86],[-1.07,.61]]);
  for(const [x,y] of [[-.92,-.61],[.87,.65]]){const h=new T.Path();h.absarc(x,y,.045,0,Math.PI*2,true);s.holes.push(h);}
  extrude(s,silver,-.13,.1);
  extrude(poly([[-1.13,-.13],[.93,.83],[.48,.6],[-1.14,-.45]]),green,.005,.035);
  text('5K',-.06,-.44,1.2,1.86);
 }else if(n===10){
  ring(.94);const blue=silver.clone();blue.color.set('#83b1ca');ring(.88,blue);
  const button=mesh(new T.CylinderGeometry(.09,.09,.22,24),silver);button.position.set(.04,1.08,0);button.rotation.z=-.13;
  text('10K',-.08,-.41,1.1,2.05);
  for(let i=0;i<12;i++){const a=i/12*Math.PI*2;tube([[Math.cos(a)*.79,Math.sin(a)*.79,0],[Math.cos(a)*.84,Math.sin(a)*.84,0]],.009);}
 }else if(n<30){
  for(let side=0;side<2;side++)for(let i=0;i<3;i++){
   const x=side?-.95:.25,y=side?-.53:-.04;
   const s=new T.Shape();s.moveTo(x-.38,y-i*.12);s.bezierCurveTo(x+.26,y+.15-i*.1,x+.88,y+.3-i*.09,x+1.24,y+.74-i*.19);s.bezierCurveTo(x+1.15,y+.35-i*.18,x+.42,y-.12-i*.12,x-.38,y-i*.12);
   const o=extrude(s,side?gold:silver,-.08+i*.025,.05);o.rotation.z=.08;
  }
  text('21',-.63,-.29,.99,.98);text('.0975',.45,-.15,.47,1.15);text('K',1.02,-.44,.42,.34);
 }else if(n<45){
  ribbon(-.53,red);text('42',-.67,-.26,.98,1.12);text('.195',.43,-.22,.7,1.1);text('K',1.1,-.4,.49,.36);
 }else if(n===50){
  ring(.88,green);text('50K',-.02,-.41,1.08,2.1);
  extrude(poly([[-.45,-1.02],[.07,.11],[.58,1.13],[-.06,-.1]]),green,.43,.06);
  extrude(poly([[-.45,-1.02],[-.06,-.1],[.58,1.13],[.08,.02]]),silver,.45,.025);
  text('N',0,.99,.12,.12,silver,0);
 }else{
  // Championship form: raised perimeter, inset side panels, etched contour lines and route nodes.
  const outline=[[-1.62,-.4],[-1.62,.42],[-.99,.58],[-.78,.75],[0,.88],[.8,.71],[1.03,.54],[1.62,.4],[1.62,-.42],[.87,-.6],[0,-.84],[-.92,-.61]];
  extrude(poly(outline),gold,-.18,.11);extrude(poly(outline.map(([x,y])=>[x*.96,y*.92])),dark,-.05,.055);
  for(const side of [-1,1]){tube([[side*.99,-.48,.05],[side*.99,.47,.05]],.023,gold);for(const y of [-.42,.42]){const o=mesh(new T.SphereGeometry(.04,12,8),gold);o.position.set(side*1.04,y,.1);}}
  for(let j=0;j<13;j++){const y=-.51+j*.082;tube(Array.from({length:35},(_,i)=>{const x=-.9+i/34*1.8;return [x,y+.023*Math.sin(x*15+j)+.018*Math.sin(x*29-j),.025];}),.0045,gold);}
  const route=[[-.8,.52,.09],[-.58,.6,.09],[-.35,.53,.09],[0,.73,.09],[.3,.53,.09],[.55,.58,.09],[.82,.44,.09]];tube(route,.012,gold);for(const p of route){const o=mesh(new T.SphereGeometry(.031,12,8),gold);o.position.set(...p);}
  text('100K',0,-.3,.83,1.86,gold,.18);
 }
 root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3());root.userData.modelCenter=c.toArray();root.children.forEach(o=>o.position.sub(c));root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
