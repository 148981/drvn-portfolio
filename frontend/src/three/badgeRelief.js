import * as THREE from 'three';

// A baked, gently undulating surface: exportable geometry and vertex colours,
// so the moving nacre reflections also work in the downloadable GLB.
export function nacreSurface(shape, z, palette, amplitude=.014) {
    const base=new THREE.ShapeGeometry(shape,24),p=base.attributes.position,idx=base.index;
    const positions=[],normals=[],colors=[];
    const tones=palette.map(c=>new THREE.Color(c));
    const phase=(x,y)=>x*10+y*3+Math.sin(y*5+x*2)*1.6+Math.sin(x*7-y*3)*.35;
    const height=(x,y)=>amplitude*(.55+.3*Math.sin(phase(x,y))+.15*Math.sin(phase(x,y)*2.4));
    const emit=(a,b,c,depth=0)=>{
        const pairs=[[a,b,c],[b,c,a],[c,a,b]].sort((u,v)=>v[0].distanceToSquared(v[1])-u[0].distanceToSquared(u[1]));
        if(depth<12&&pairs[0][0].distanceToSquared(pairs[0][1])>.008){
            const [v,w,o]=pairs[0],m=v.clone().add(w).multiplyScalar(.5);emit(v,m,o,depth+1);emit(m,w,o,depth+1);return;
        }
        for(const v of [a,b,c]){
            const x=v.x,y=v.y,t=(Math.sin(phase(x,y)) + 1)*.5;
            const color=tones[0].clone().lerp(tones[1],t*.7).lerp(tones[2],(Math.sin(y*6-x*4)+1)*.16);
            const eps=.001,n=new THREE.Vector3(-(height(x+eps,y)-height(x-eps,y))/(2*eps),-(height(x,y+eps)-height(x,y-eps))/(2*eps),1).normalize();
            positions.push(x,y,z+height(x,y));normals.push(n.x,n.y,n.z);colors.push(color.r,color.g,color.b);
        }
    };
    for(let i=0;i<idx.count;i+=3)emit(...[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+j))));
    base.dispose();
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    return g;
}

export function kgShapes(){
    const k=new THREE.Shape([[0,0],[0,.19],[.024,.19],[.024,.105],[.105,.19],[.137,.19],[.052,.096],[.14,0],[.106,0],[.024,.084],[.024,0]].map(p=>new THREE.Vector2(...p)));
    const g=new THREE.Shape();
    g.moveTo(.35,.16);g.bezierCurveTo(.31,.214,.206,.206,.183,.136);g.bezierCurveTo(.153,.041,.211,-.018,.283,0);
    g.bezierCurveTo(.315,.004,.337,.017,.35,.032);g.lineTo(.35,.103);g.lineTo(.273,.103);g.lineTo(.273,.079);g.lineTo(.325,.079);g.lineTo(.325,.044);
    g.bezierCurveTo(.28,.006,.192,.015,.205,.11);g.bezierCurveTo(.214,.175,.294,.188,.331,.143);g.closePath();
    return [k,g];
}

export function featherShape(side,level){
    const s=new THREE.Shape();
    const y=-.57+level*.15,tipX=1.02+level*.064,tipY=-.19+level*.245;
    s.moveTo(side*.19,y);
    s.bezierCurveTo(side*.56,y+.02,side*(tipX-.12),tipY-.24,side*tipX,tipY);
    s.bezierCurveTo(side*(tipX-.14),tipY-.02,side*.53,y+.32,side*.22,y+.21);
    s.quadraticCurveTo(side*.07,y+.12,side*.19,y);return s;
}
