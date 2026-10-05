import {applyBadgeFinish,diamondFacets} from './badgeMaterialFinish.js';
import {drvnLogoShapes} from './badgeBrand.js';
import {athleticNumerals} from './athleticNumerals.js';
import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_bold.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
// Closed, rectangular ribbon sections: highlights move across actual curved metal.
function ribbonGeometry(curve,width,twist=0){
 const steps=240,sides=12,pos=[],indices=[];
 for(let i=0;i<=steps;i++){
  const t=i/steps,p=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize(),n=new T.Vector3(-tangent.y,tangent.x,0).normalize();
  if(n.lengthSq()<.01)n.set(1,0,0);n.applyAxisAngle(tangent,Math.sin(t*Math.PI*2)*twist);
  const b=new T.Vector3().crossVectors(tangent,n).normalize();
  for(let j=0;j<sides;j++){const a=j/sides*Math.PI*2;pos.push(...p.clone().addScaledVector(n,Math.cos(a)*width/2).addScaledVector(b,Math.sin(a)*.022).toArray());}
 }
 for(let i=0;i<steps;i++)for(let j=0;j<sides;j++){const a=i*sides+j,b=i*sides+(j+1)%sides;indices.push(a,b,a+sides,b,b+sides,a+sides);}
 if(!curve.closed)for(let j=1;j<sides-1;j++){indices.push(0,j+1,j,steps*sides,steps*sides+j,steps*sides+j+1);}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(indices);g.computeVertexNormals();
 if(curve.closed){const normals=g.attributes.normal;for(let j=0;j<sides;j++){const v=new T.Vector3().fromBufferAttribute(normals,j).add(new T.Vector3().fromBufferAttribute(normals,steps*sides+j)).normalize();normals.setXYZ(j,v.x,v.y,v.z);normals.setXYZ(steps*sides+j,v.x,v.y,v.z);}}
 return g;
}
export function createDistanceBadge(e){
 const value=Number(e.number),root=new T.Group();root.name=`DRVN_${e.asset}`;root.userData={title:e.name,asset:e.asset,design:'unified-orbital-distance',brandPlacement:'on-body'};
 const metal=new T.MeshPhysicalMaterial({color:'#e4e4df',metalness:.88,roughness:.19,clearcoat:1});
 const finish=value===40075?'diamond':null;applyBadgeFinish(metal,finish);
 const palette={50:'#eee0df',200:'#b77a53',500:'#c5c9ce',1000:'#e5b854',5000:'#eeebe4',10000:'#f2e4db',40075:'#e6edf3'};
 metal.color.set(palette[value]);metal.roughness=value===1000?.30:.19;metal.metalness=value===50?.55:.88;
 if(value===50){metal.iridescence=.95;metal.iridescenceThicknessRange=[170,460];metal.clearcoat=1;metal.transmission=.07;metal.thickness=.2;}
 if(value===10000){metal.metalness=.45;metal.roughness=.16;metal.iridescence=1;metal.iridescenceThicknessRange=[180,440];metal.clearcoat=1;metal.transmission=.08;metal.thickness=.25;}
 if(value===5000){metal.metalness=.9;metal.roughness=.19;}
 if(value===40075){metal.metalness=.5;metal.roughness=.14;metal.emissive.set('#c5c9d2');metal.emissiveIntensity=.09;}
 if(value===200){metal.roughness=.30;metal.anisotropy=.55;}
 if(value===500||value===1000){metal.anisotropy=.6;metal.roughness=.23;}
 const band=metal.clone();band.color.set(value===5000?'#b4a38c':palette[value]);band.roughness=value===5000?.32:.21;band.clearcoatRoughness=.22;band.anisotropy=0;band.envMapIntensity=.7;
 if(value===40075){band.iridescence=1;band.iridescenceThicknessRange=[180,480];band.metalness=.55;}
 function add(g,m=metal,name='Distance_sculpture'){
  if(value===40075||value===10000){g=diamondFacets(g,value===10000?'champagne':'diamond');m.vertexColors=true;}
  if(value===10000){const p=g.attributes.position,n=g.attributes.normal,c=g.attributes.color;for(let j=0;j<p.count;j++){
   const x=p.getX(j),y=p.getY(j);
   if(n.getZ(j)>.75){const v=new T.Vector3(.22*Math.sin(x*4+y*2),.17*Math.cos(y*4-x*2),1).normalize();n.setXYZ(j,v.x,v.y,v.z);}
   const color=new T.Color('#f5dedc').lerp(new T.Color('#d8eeee'),(Math.sin(x*3+y*4)+1)/2);c.setXYZ(j,color.r,color.g,color.b);
  }}
  if(value===50){const p=g.attributes.position,colors=[];for(let j=0;j<p.count;j++){const t=(Math.sin(p.getX(j)*2+p.getY(j)*3)+1)/2,c=new T.Color('#a5c5df').lerp(new T.Color('#ffe0bb'),t);colors.push(c.r,c.g,c.b);}g.setAttribute('color',new T.Float32BufferAttribute(colors,3));m.vertexColors=true;}
  const o=new T.Mesh(g,m);o.name=name;root.add(o);return o;
 }
 const base=-.52,height=1.04,maxWidth=value===50?1.26:2.10;
 let g=new T.ExtrudeGeometry(athleticNumerals(value.toLocaleString('en-US')),{depth:.18,bevelEnabled:true,bevelSize:.028,bevelThickness:.035,bevelSegments:8});g.computeBoundingBox();const b=g.boundingBox,w=b.max.x-b.min.x;g.translate(-(b.min.x+b.max.x)/2,-b.min.y,0);g.scale(maxWidth/w,height,1);g.translate(-.06,base,.18);
 // Bold numerals remain bright and legible while the surrounding ring carries the tier colour.
 const normals=g.attributes.normal,positions=g.attributes.position;for(let j=0;j<normals.count;j++)if(normals.getZ(j)>.9){const v=new T.Vector3(.3*Math.sin(positions.getX(j)*3),.35*Math.sin(positions.getY(j)*3),1).normalize();normals.setXYZ(j,v.x,v.y,v.z);}const numeral=add(g,metal,'Distance_'+value);g.computeBoundingBox();
 const unit=new T.ExtrudeGeometry(font.generateShapes('K',.25),{depth:.065,bevelEnabled:true,bevelSize:.008,bevelThickness:.008,bevelSegments:3});unit.translate(g.boundingBox.max.x+.055,base,.19);add(unit,metal,'Distance_K');
 function orbit(extra=0){const points=[];for(let j=0;j<160;j++){const a=j/160*Math.PI*2,x=Math.cos(a)*(1.30+extra),y=Math.sin(a)*(.60+extra*.3),angle=.60+extra*.65;points.push(new T.Vector3(x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),-.07-Math.sin(a)*(.56+extra*.45)+extra*.10));}const curve=new T.CatmullRomCurve3(points,true,'centripetal');add(ribbonGeometry(curve,.11-extra*.07,.55),band,'Continuous_orbit');}
 orbit();orbit(.15);if(value>=500)orbit(.29);

 const mark=new T.Group();mark.name='DRVN_brand_hallmark';root.add(mark);
 const firstWidth=maxWidth/(String(value).length+(value>=1000?.35:0)),mw=Math.min(.20,firstWidth*.76);
 mark.position.set(g.boundingBox.min.x+firstWidth*.52,base+.07,.399);mark.scale.setScalar(mw/.25);if(value===40075){mark.position.set(g.boundingBox.min.x+firstWidth*.79,base+.065,.399);mark.scale.setScalar(.35);}
 const ink=new T.MeshStandardMaterial({color:'#6b5541',metalness:.5,roughness:.3});
 drvnLogoShapes().forEach((shape,i)=>{const geo=new T.ExtrudeGeometry(shape,{depth:8,bevelEnabled:false});geo.scale(.00010,-.00010,-.00010);geo.translate(-.13,.06,.003);const mesh=new T.Mesh(geo,ink);mesh.name='DRVN_logo_contour_'+i;mark.add(mesh);});
 for(const [txt,y,size] of [['DRVN',.006,.035],['EST.2026',-.03,.022]]){const geo=new T.ExtrudeGeometry(font.generateShapes(txt,size),{depth:.003,bevelEnabled:false});geo.translate(-.025,y,.003);const mesh=new T.Mesh(geo,ink);mesh.name=txt;mark.add(mesh);}
 root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3());root.userData.modelCenter=c.toArray();root.children.forEach(o=>o.position.sub(c));root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
