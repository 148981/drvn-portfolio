import * as T from 'three';

// Distinct shallow minted profiles. Front, rim, lettering and reverse bend together.
const profiles=[[.045,.018,.006],[.025,.05,-.008],[.055,.018,.009],[.027,.044,.014],[.05,.025,-.012],[.045,.045,0],[.026,.055,.012],[.052,.022,-.015],[.032,.041,-.01],[.06,.018,.006],[.023,.05,.015],[.046,.033,-.009]];
export function applySeasonalCurvature(root,month){
 const [a,b,c]=profiles[(month-1)%12];root.updateMatrixWorld(true);
 root.traverse(o=>{
  if(!o.isMesh)return;
  const source=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone(),p=source.attributes.position,uv=source.attributes.uv,positions=[],coords=[];
  const read=i=>({p:new T.Vector3().fromBufferAttribute(p,i),uv:uv?new T.Vector2().fromBufferAttribute(uv,i):null});
  const mid=(x,y)=>({p:x.p.clone().add(y.p).multiplyScalar(.5),uv:x.uv?x.uv.clone().add(y.uv).multiplyScalar(.5):null});
  function tri(x,y,z,depth=0){
   if(depth<4&&Math.max(x.p.distanceTo(y.p),y.p.distanceTo(z.p),z.p.distanceTo(x.p))>.2){const xy=mid(x,y),yz=mid(y,z),zx=mid(z,x);tri(x,xy,zx,depth+1);tri(xy,y,yz,depth+1);tri(zx,yz,z,depth+1);tri(xy,yz,zx,depth+1);return;}
   for(const v of [x,y,z]){positions.push(...v.p.toArray());if(v.uv)coords.push(...v.uv.toArray());}
  }
  for(let i=0;i<p.count;i+=3)tri(read(i),read(i+1),read(i+2));
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));if(uv)g.setAttribute('uv',new T.Float32BufferAttribute(coords,2));
  const inverse=o.matrixWorld.clone().invert(),v=new T.Vector3(),out=g.attributes.position;
  for(let i=0;i<out.count;i++){v.fromBufferAttribute(out,i).applyMatrix4(o.matrixWorld);v.z+=a*(1-v.x*v.x)-b*v.y*v.y+c*v.x*v.y;v.applyMatrix4(inverse);out.setXYZ(i,v.x,v.y,v.z);}
  g.computeVertexNormals();source.dispose();o.geometry.dispose();o.geometry=g;
 });
 root.userData.curveProfile=profiles[(month-1)%12];return root;
}
