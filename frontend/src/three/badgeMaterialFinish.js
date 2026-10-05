import * as T from 'three';
// Shared optical finishes keep each tier consistent across badge families.
export function applyBadgeFinish(material,kind){
 const presets={
  calcite:{color:'#fff1dc',metalness:.16,roughness:.26,transmission:.07,iridescence:.2},
  champagne:{color:'#eed3a2',metalness:.46,roughness:.19,transmission:.08,iridescence:.8},
  bronze:{color:'#805337',metalness:.88,roughness:.34,transmission:0,iridescence:.04},
  diamond:{color:'#e8edf0',metalness:.48,roughness:.085,transmission:.12,iridescence:1},
 };
 const p=presets[kind];if(!p)return material;material.setValues({...p,clearcoat:1,clearcoatRoughness:.12,thickness:.18,ior:kind==='diamond'?2.2:1.5,iridescenceThicknessRange:[170,480]});material.userData.finish=kind;return material;
}
// Subdivide only front-facing triangles, giving the brilliant finish real small facets.
export function diamondFacets(source,kind='diamond'){
 const g=source.index?source.toNonIndexed():source,p=g.attributes.position,n=g.attributes.normal,positions=[],normals=[],colors=[];
 function emit(a,b,c,depth){
  const longest=Math.max(a.distanceTo(b),b.distanceTo(c),c.distanceTo(a));
  if(depth<4&&longest>.13){const ab=a.clone().add(b).multiplyScalar(.5),bc=b.clone().add(c).multiplyScalar(.5),ca=c.clone().add(a).multiplyScalar(.5);emit(a,ab,ca,depth+1);emit(ab,b,bc,depth+1);emit(ca,bc,c,depth+1);emit(ab,bc,ca,depth+1);return;}
  const center=a.clone().add(b).add(c).multiplyScalar(1/3),seed=Math.sin(center.x*193.1+center.y*271.7)*43758.5453,h=seed-Math.floor(seed),angle=Math.atan2(center.y,center.x);
  const normal=kind==='champagne'?new T.Vector3(.65*Math.sin(center.x*5+center.y*2),.45*Math.cos(center.y*5-center.x*2),1).normalize():new T.Vector3(Math.cos(angle)*(.15+h*.55),Math.sin(angle)*(.15+h*.55),1).normalize();
  const color=kind==='champagne'?new T.Color().setHSL(.10+.13*Math.sin(center.x*4+center.y*3),.10,.91):new T.Color().setHSL(h,.16+h*.25,.62+h*.34);
  for(const v of [a,b,c]){positions.push(v.x,v.y,v.z);normals.push(normal.x,normal.y,normal.z);colors.push(color.r,color.g,color.b);}
 }
 for(let i=0;i<p.count;i+=3){if(n.getZ(i)>.9){emit(new T.Vector3().fromBufferAttribute(p,i),new T.Vector3().fromBufferAttribute(p,i+1),new T.Vector3().fromBufferAttribute(p,i+2),0);}else for(let k=0;k<3;k++){positions.push(p.getX(i+k),p.getY(i+k),p.getZ(i+k));normals.push(n.getX(i+k),n.getY(i+k),n.getZ(i+k));colors.push(1,1,1);}}
 const out=new T.BufferGeometry();out.setAttribute('position',new T.Float32BufferAttribute(positions,3));out.setAttribute('normal',new T.Float32BufferAttribute(normals,3));out.setAttribute('color',new T.Float32BufferAttribute(colors,3));if(g!==source)g.dispose();source.dispose();return out;
}
