import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
const poly=p=>new T.Shape(p.map(v=>new T.Vector2(...v)));
export function createNutritionBadge(e){
 const n=Number(e.number),weight=e.asset.startsWith('weigh_'),root=new T.Group();root.name=`DRVN_${e.asset}`;root.userData={title:e.name,asset:e.asset,design:'nutrition-object'};
 const silver=new T.MeshPhysicalMaterial({color:'#e3e0d6',metalness:.68,roughness:.26,anisotropy:.7,clearcoat:.5});
 const green=silver.clone();green.color.set('#344c40');green.roughness=.25;
 const champagne=silver.clone();champagne.color.set('#c9b598');
 const ink=silver.clone();ink.color.set('#252925');ink.metalness=.2;ink.roughness=.4;
 function add(g,m=silver,name='Nutrition_object'){const o=new T.Mesh(g,m);o.name=name;root.add(o);return o;}
 function ex(s,m=silver,z=0,depth=.07){const g=new T.ExtrudeGeometry(s,{depth,bevelEnabled:true,bevelSize:.019,bevelThickness:.022,bevelSegments:5,curveSegments:48});g.translate(0,0,z);const normals=g.attributes.normal,positions=g.attributes.position;for(let i=0;i<normals.count;i++)if(normals.getZ(i)>.9){const v=new T.Vector3(.3*Math.sin(positions.getX(i)*2.5),.28*Math.sin(positions.getY(i)*2.3),1).normalize();normals.setXYZ(i,v.x,v.y,v.z);}return add(g,m);}
 function line(p,r=.01,m=silver){return add(new T.TubeGeometry(new T.CatmullRomCurve3(p.map(v=>new T.Vector3(...v))),70,r,8,false),m);}
 function circle(r){const s=new T.Shape();s.absarc(0,0,r,0,Math.PI*2);return s;}
 function disc(x,y,z,sx=1,sy=1,material=silver){const o=ex(circle(.82),material,z);o.scale.set(sx,sy,1);o.position.set(x,y,0);return o;}
 function label(value,y,z,height=.38,mat=ink){const g=new T.ExtrudeGeometry(font.generateShapes(value,height),{depth:.022,bevelEnabled:true,bevelSize:.003,bevelThickness:.004,bevelSegments:3});g.computeBoundingBox();g.translate(-(g.boundingBox.min.x+g.boundingBox.max.x)/2,y,z);return add(g,mat,'Milestone_'+value);}
 function square(w,h){const r=.09,s=new T.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);return s;}
 function stack(){for(let i=0;i<3;i++){const o=ex(square(1.35,1.65),i===1?champagne:silver,-.16+i*.13);o.position.set((1-i)*.15,(1-i)*.12,0);o.rotation.z=(1-i)*-.08;}label(String(n),-.17,.22);}
 if(weight){
  if(n<=5){disc(.18,.08,-.12);disc(-.12,-.07,.02,.95,.95);line([[-.7,-.94,.19],[.75,1.02,.19]],.022);const o=add(new T.SphereGeometry(.095,24,16));o.position.set(-.3,-.38,.24);label(String(n),-.43,.17);}
  else if(n<=15){for(let i=0;i<3;i++){const o=add(new T.TorusGeometry(.62,.12,24,100),i===2?green:silver);o.position.set((i-1)*.27,(i-1)*.15,i*.08);o.rotation.y=(i-1)*.6;o.rotation.z=.3;}label(String(n),-.43,.32,.32);}
  else stack();
 }else if(n===7){
  const leaf=new T.Shape();leaf.moveTo(-.5,-.84);leaf.bezierCurveTo(-.65,.01,.28,.48,.86,.81);leaf.bezierCurveTo(.58,-.18,.07,-.67,-.5,-.84);ex(leaf,green,-.13,.1);line([[-.49,-.83,.02],[.13,-.2,.04],[.86,.81,.02]],.012);
  label('7',-.85,.14,1.65,silver);
 }else if(n===30){
  disc(0,0,0,1,1,green);
  const sector=new T.Shape();sector.moveTo(0,0);sector.absarc(0,0,.83,Math.PI/2,Math.PI*1.89,false);sector.lineTo(0,0);ex(sector,silver,.09,.045);
  for(let j=0;j<90;j++){const a=Math.PI/2+j/90*Math.PI*1.35;line([[Math.cos(a)*.08,Math.sin(a)*.08,.15],[Math.cos(a)*.78,Math.sin(a)*.78,.15]],.0015);}
  label('30',-.4,.18,.4);
 }else if(n===90){disc(.26,.18,-.12,.84,1.13,champagne).rotation.z=-.45;disc(-.17,-.14,.1,.83,1.1).rotation.z=-.45;label('90',-.58,.24);}
 else if(n===180)stack();
 else if(n===270){ex(poly([[-.92,-.34],[-.81,.36],[.9,.93],[.88,-.79]]),silver,-.05);ex(poly([[-.84,-.3],[-.73,.31],[.73,.8],[.72,-.63]]),green,.06,.04);label('270',-.15,.17,.44,silver);}
 else{
  for(let i=0;i<4;i++){const a=i*Math.PI/2+.025,b=(i+1)*Math.PI/2-.025,s=new T.Shape();s.absarc(0,0,.9,a,b,false);s.absarc(0,0,.73,b,a,true);s.closePath();ex(s,i%2?green:silver,0,.12);}
  // The central number floats on a shallow satin disc within the segmented frame.
  disc(0,0,-.04,.83,.83);label(String(n),-.18,.12,.43);
 }
 root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3());root.userData.modelCenter=c.toArray();root.children.forEach(o=>o.position.sub(c));root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
