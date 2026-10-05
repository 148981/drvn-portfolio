import * as T from 'three';
import {athleticNumerals} from './athleticNumerals.js';
import {applyBadgeFinish} from './badgeMaterialFinish.js';
import {drvnLogoShapes} from './badgeBrand.js';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import fontData from './fonts/helvetiker_regular.typeface.json' with {type:'json'};
const font=new FontLoader().parse(fontData);
export function createRunShoeBadge(e){
 const root=new T.Group(),shoe=new T.Group();root.add(shoe);root.name=`DRVN_${e.asset}`;root.userData={asset:e.asset,title:e.name,design:'couture-running-shoe'};
 const upper=new T.MeshPhysicalMaterial({color:['#eed8dc','#ac7759','#ced8df','#dbb665'][e.index],metalness:.7,roughness:.27,clearcoat:1});
 if(e.index===0){applyBadgeFinish(upper,'calcite');upper.color.set('#eed8dc');upper.iridescence=.8;}
 if(e.index===1)applyBadgeFinish(upper,'bronze');
 if(e.index===3)applyBadgeFinish(upper,'champagne');
 const trim=upper.clone();trim.color.set(e.index===1?'#e6bb94':e.index===3?'#ffe1a1':'#f2e9e2');trim.roughness=.17;
 const dark=new T.MeshStandardMaterial({color:'#383539',roughness:.6,metalness:.3});
 function mesh(g,m=upper,name='Shoe_panel'){const o=new T.Mesh(g,m);o.name=name;shoe.add(o);return o;}
 function tube(points,r=.01,m=trim){return mesh(new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p))),48,r,8,false),m,'Shoe_seam');}
 // Lofted sections form a rounded toe box, fitted waist and raised heel.
 function loft(sections,name,mat){const points=[],indices=[],N=48;sections.forEach(([x,y,ry,rz])=>{for(let j=0;j<=N;j++){const a=j/N*Math.PI*2;points.push(x,y+Math.sin(a)*ry,Math.cos(a)*rz);}});for(let k=0;k<sections.length-1;k++)for(let j=0;j<N;j++){const a=k*(N+1)+j,b=a+N+1;indices.push(a,a+1,b,a+1,b+1,b);}const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(points,3));g.setIndex(indices);g.computeVertexNormals();return mesh(g,mat,name);}
 loft([[-1.03,-.28,.02,.03],[-.97,-.32,.15,.30],[-.70,-.38,.19,.37],[-.3,-.39,.16,.34],[.15,-.36,.14,.36],[.58,-.28,.14,.39],[.90,-.15,.13,.31],[1.04,-.04,.045,.06]],'Sculpted_rocker_midsole',trim);
 loft([[-1.01,-.31,.01,.02],[-.9,-.43,.085,.31],[-.5,-.52,.055,.36],[0,-.48,.045,.35],[.5,-.39,.055,.37],[.91,-.22,.06,.28],[1.04,-.075,.01,.02]],'Segmented_outsole',dark);
 loft([[-.99,-.14,.02,.04],[-.89,.04,.34,.28],[-.65,.045,.35,.32],[-.34,-.035,.27,.30],[.02,-.09,.19,.32],[.40,-.095,.18,.36],[.75,-.07,.15,.30],[.97,-.035,.065,.14],[1.01,-.025,.01,.01]],'Tailored_upper',upper);
 const collar=mesh(new T.TorusGeometry(.23,.055,12,48),trim,'Padded_collar');collar.rotation.x=Math.PI/2;collar.scale.set(1.2,1,1);collar.position.set(-.66,.31,0);
 const opening=mesh(new T.CircleGeometry(.22,48),dark,'Collar_interior');opening.rotation.x=-Math.PI/2;opening.position.set(-.66,.30,0);
 tube([[-.84,.12,-.17],[-.87,.50,-.1],[-.80,.54,0],[-.77,.31,.13]],.032,trim);
 for(let j=0;j<5;j++){const x=-.35+j*.115,y=.20-j*.025;tube([[x,y,-.19],[x+.04,y+.07,0],[x,y,.19]],.018,trim);}
 for(const side of [-1,1]){tube([[-.92,-.19,side*.28],[-.62,-.24,side*.35],[-.12,-.28,side*.32],[.51,-.18,side*.38],[.91,-.055,side*.24]],.012);tube([[-.86,.23,side*.19],[-.57,.10,side*.29],[-.23,-.08,side*.32],[.34,-.06,side*.36],[.81,-.03,side*.28]],.009);}
 for(let j=0;j<10;j++){const x=-.78+j*.16;tube([[x,-.40,.30],[x+.08,-.45,.32]],.012,trim);}
 // Small perforations add textile detail without covering the side inscription.
 for(let j=0;j<9;j++)for(let k=0;k<3;k++){const dot=mesh(new T.SphereGeometry(.009,6,4),dark,'Vent_perforation');dot.position.set(.43+j*.045,-.10+k*.043,.33-j*.009);}
 const g=new T.ExtrudeGeometry(athleticNumerals(e.number),{depth:.018,bevelEnabled:true,bevelSize:.005,bevelThickness:.006,bevelSegments:3});g.computeBoundingBox();const b=g.boundingBox,w=b.max.x-b.min.x;g.translate(-(b.min.x+b.max.x)/2,-.5,0);const scale=Math.min(.30,.85/w);g.scale(scale,scale,1);g.translate(-.15,-.08,.334);mesh(g,trim,'Milestone_'+e.number);
 const brand=new T.Group();brand.name='DRVN_brand_hallmark';shoe.add(brand);brand.position.set(-.73,-.08,.323);brand.scale.setScalar(.75);
 drvnLogoShapes().forEach((s,i)=>{const geo=new T.ExtrudeGeometry(s,{depth:8,bevelEnabled:false});geo.scale(.00013,-.00013,-.00013);geo.translate(-.078,.08,.005);const o=new T.Mesh(geo,trim);o.name='DRVN_logo_contour_'+i;brand.add(o);});
 for(const [txt,y,size] of [['DRVN',-.072,.04],['EST.2026',-.11,.024]]){const geo=new T.ExtrudeGeometry(font.generateShapes(txt,size),{depth:.002,bevelEnabled:false});geo.computeBoundingBox();geo.translate(-geo.boundingBox.max.x/2,y,.005);const o=new T.Mesh(geo,trim);o.name=txt;brand.add(o);}
 shoe.rotation.set(.12,-.15,.36);root.updateMatrixWorld(true);const box=new T.Box3().setFromObject(root),c=box.getCenter(new T.Vector3()),size=box.getSize(new T.Vector3());shoe.position.sub(c);root.scale.setScalar(2.38/Math.max(size.x,size.y));return root;
}
