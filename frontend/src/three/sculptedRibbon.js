import * as T from 'three';

// A closed, crowned section: real side walls and polished edges from every angle.
export function sculptedRibbon(points, width, {closed=false, depth=.035, twist=.25, taper=.0}={}) {
 const curve=new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed,'centripetal');
 const steps=180,sides=16,vertices=[],indices=[];
 for(let j=0;j<=steps;j++){
  const t=j/steps,p=curve.getPointAt(t),tangent=curve.getTangentAt(t).normalize();
  const n=new T.Vector3(-tangent.y,tangent.x,0).normalize();
  n.applyAxisAngle(tangent,twist*Math.sin(t*Math.PI*2));
  const b=new T.Vector3().crossVectors(tangent,n).normalize();
  const w=width*(1-taper+taper*Math.pow(Math.sin(Math.PI*t),.5));
  for(let k=0;k<sides;k++){
   const a=k/sides*Math.PI*2;
   vertices.push(...p.clone().addScaledVector(n,Math.cos(a)*w/2).addScaledVector(b,Math.sin(a)*depth).toArray());
  }
 }
 for(let j=0;j<steps;j++)for(let k=0;k<sides;k++){
  const a=j*sides+k,b=j*sides+(k+1)%sides;
  indices.push(a,b,a+sides,b,b+sides,a+sides);
 }
 if(!closed)for(let k=1;k<sides-1;k++)indices.push(0,k+1,k,steps*sides,steps*sides+k,steps*sides+k+1);
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 if(closed){const normal=geometry.attributes.normal;for(let k=0;k<sides;k++){
  const v=new T.Vector3().fromBufferAttribute(normal,k).add(new T.Vector3().fromBufferAttribute(normal,steps*sides+k)).normalize();
  normal.setXYZ(k,v.x,v.y,v.z);normal.setXYZ(steps*sides+k,v.x,v.y,v.z);
 }}
 return geometry;
}
