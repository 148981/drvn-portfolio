import * as T from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_bold.typeface.json' with {type:'json'};
import {sculptedRibbon} from './sculptedRibbon.js';
import {diamondFacets} from './badgeMaterialFinish.js';
import {drvnLogoShapes} from './badgeBrand.js';
const font=new FontLoader().parse(fontData);
export function createQuarterBadge(e){
 const root=new T.Group();root.name=`DRVN_${e.asset}`;root.userData={asset:e.asset,title:e.name,design:e.design};
 const distance=e.design==='quarter-distance',i=e.index;
 const metal=new T.MeshPhysicalMaterial({color:['#eadbd2','#d1d8dd','#dcb767','#e6edf4'][i],metalness:i===0?.45:.83,roughness:.24,clearcoat:1,iridescence:i===0?.7:i===3?1:0});
 const face=metal.clone();face.color.set(['#d4c7bf','#929da6','#88714f','#bdc9d9'][i]);face.roughness=.34;
 const textMetal=metal.clone();textMetal.color.set(i===2?'#f0d7a4':'#f1eee9');
 const ink=new T.MeshStandardMaterial({color:'#514940',metalness:.3,roughness:.4});
 function add(g,m,name){if(i===3&&(m===metal||m===face)){g=diamondFacets(g);m.vertexColors=true;}const mesh=new T.Mesh(g,m);mesh.name=name;root.add(mesh);return mesh;}
 function plate(radius,z,m){const s=new T.Shape();if(distance)s.absarc(0,0,radius,0,Math.PI*2,false);else for(let j=0;j<6;j++){const a=Math.PI/2+j*Math.PI/3;j?s.lineTo(Math.cos(a)*radius,Math.sin(a)*radius):s.moveTo(Math.cos(a)*radius,Math.sin(a)*radius);}s.closePath();const g=new T.ExtrudeGeometry(s,{depth:.12,bevelEnabled:true,bevelSize:.03,bevelThickness:.025,bevelSegments:5,curveSegments:80});g.translate(0,0,z);return add(g,m,'Quarter_medallion');}
 plate(1.02,-.12,metal);plate(.965,.005,face);
 function line(points,r=.008,m=textMetal,name='Contour_engraving'){const c=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)));return add(new T.TubeGeometry(c,64,r,6,false),m,name);}
 if(distance){
  for(const side of [-1,1])for(let k=0;k<4;k++){
   const points=[];for(let j=0;j<=50;j++){const x=-.70+j*.028,y=side*(.62+k*.065+.025*Math.sin(x*8+k));if(x*x+y*y<.91*.91)points.push([x,y,.15]);}if(points.length>2)line(points,.0045);
  }
  for(const [x,y] of [[-.68,-.61],[.65,.62]]){const pin=add(new T.SphereGeometry(.027,16,10),textMetal,'Route_endpoint');pin.position.set(x,y,.17);}
 }
 for(let ring=0;ring<(distance?2:3);ring++){
  const points=[],angle=distance?.38+ring*.18:ring*Math.PI/3+.3;
  for(let j=0;j<100;j++){const a=j/100*Math.PI*2,x=Math.cos(a)*1.25,y=Math.sin(a)*(distance?.77:1.08);points.push([x*Math.cos(angle)-y*Math.sin(angle),x*Math.sin(angle)+y*Math.cos(angle),-.02-Math.sin(a)*(.39+ring*.03)]);}
  add(sculptedRibbon(points,distance?.075:.12,{closed:true,twist:.5,depth:.018}),metal,'Quarter_orbit_'+ring);
 }
 function text(value,size,y,maxWidth,m=textMetal,name=value){const g=new T.ExtrudeGeometry(font.generateShapes(value,size),{depth:.055,bevelEnabled:true,bevelSize:.009,bevelThickness:.013,bevelSegments:4});g.computeBoundingBox();const b=g.boundingBox,w=b.max.x-b.min.x;g.translate(-(b.min.x+b.max.x)/2,-b.min.y,0);g.scale(Math.min(1,maxWidth/w),1,1);g.translate(0,y,.18);add(g,m,name);}
 text(Number(e.number).toLocaleString('en-US'),e.number.length>3?.42:.76,-.25,1.64,textMetal,'Quarter_target');
 text(e.unit,.115,-.46,1.4);
 const mark=new T.Group();mark.name='DRVN_brand_hallmark';mark.position.set(-.01,-.67,.20);root.add(mark);
 drvnLogoShapes().forEach((s,k)=>{const g=new T.ExtrudeGeometry(s,{depth:4,bevelEnabled:false});g.scale(.000075,-.000075,-.000075);g.translate(-.12,.035,0);const mesh=new T.Mesh(g,ink);mesh.name='DRVN_logo_contour_'+k;mark.add(mesh);});
 for(const [t,y,size] of [['DRVN',0,.045],['EST.2026',-.035,.023]]){const g=new T.ExtrudeGeometry(font.generateShapes(t,size),{depth:.003,bevelEnabled:false});g.translate(-.02,y,0);const mesh=new T.Mesh(g,ink);mesh.name=t;mark.add(mesh);}
 root.scale.setScalar(.94);return root;
}
