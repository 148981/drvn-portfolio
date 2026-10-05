import * as T from 'three';
// Large luminous cards and dark gaps are reflected by the metal, rather than painted on it.
export function createBadgeStudio(){
 const scene=new T.Scene();scene.background=new T.Color('#36393e');
 const resources=[];
 function card(w,h,x,y,z,power,color){const g=new T.PlaneGeometry(w,h),m=new T.MeshBasicMaterial({color,side:T.DoubleSide});m.color.multiplyScalar(power);const o=new T.Mesh(g,m);o.position.set(x,y,z);o.lookAt(0,0,0);scene.add(o);resources.push(g,m);}
 card(3,6,-4,2,6,1.6,'#fff4e8');
 card(1.1,8,3,1,5,2.4,'#e3eeff');
 card(7,1.6,0,5,3,2,'#ffffff');
 card(3,5,-2,0,-5,2,'#dce9ff');
 card(2,5,5,-1,-3,3,'#fff2da');
 card(1.4,8,.7,0,6,0,'#000000');
 scene.dispose=()=>resources.forEach(r=>r.dispose());return scene;
}
