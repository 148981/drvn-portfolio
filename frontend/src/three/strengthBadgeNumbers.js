import * as THREE from 'three';

// Drawn geometric numerals: elongated stems, open counters and beveled outlines.
// Coordinates use a unit-width, two-unit-height design grid.
export function numberShapes(text) {
    const result=[];
    const polygon=points=>new THREE.Shape(points.map(p=>new THREE.Vector2(...p)));
    for(const [index,digit] of [...text].entries()) {
        let s;
        if(digit==='1')s=polygon([[.08,.48],[.65,1],[.51,-1],[.21,-1],[.39,.51]]);
        if(digit==='7')s=polygon([[.02,1],[.96,1],[.39,-1],[.07,-1],[.63,.73],[.02,.73]]);
        if(digit==='4'){
            s=polygon([[.83,1],[0,-.3],[0,-.51],[.52,-.51],[.49,-1],[.79,-1],[.82,-.51],[1,-.51],[1,-.25],[.84,-.25]]);
            s.holes.push(new THREE.Path([new THREE.Vector2(.26,-.25),new THREE.Vector2(.6,.41),new THREE.Vector2(.55,-.25)]));
        }
        if(digit==='0'){
            s=new THREE.Shape();s.absellipse(.5,0,.46,.95,0,Math.PI*2,false);
            const h=new THREE.Path();h.absellipse(.5,0,.31,.8,0,Math.PI*2,true);s.holes.push(h);
        }
        if(digit==='8'){
            s=new THREE.Shape();s.moveTo(.5,1);s.bezierCurveTo(1.08,1,1.06,.22,.73,.08);
            s.bezierCurveTo(1.18,-.18,1.06,-1,.5,-1);s.bezierCurveTo(-.06,-1,-.18,-.18,.27,.08);s.bezierCurveTo(-.06,.22,-.08,1,.5,1);
            for(const [y,rx,ry] of [[.52,.25,.27],[-.46,.3,.34]]){const h=new THREE.Path();h.absellipse(.5,y,rx,ry,0,Math.PI*2,true);s.holes.push(h);}
        }
        if(digit==='6'){
            s=new THREE.Shape();s.moveTo(.94,1);s.lineTo(.35,.04);s.bezierCurveTo(1.13,.28,1.13,-1,.51,-1);s.bezierCurveTo(-.1,-1,-.1,-.24,.1,.1);s.closePath();
            const h=new THREE.Path();h.absellipse(.5,-.5,.28,.28,0,Math.PI*2,true);s.holes.push(h);
        }
        if(digit==='2'){
            s=new THREE.Shape();s.moveTo(.02,.58);s.bezierCurveTo(.1,1.23,1.12,1.1,.97,.48);s.bezierCurveTo(.93,.12,.37,-.38,.2,-.7);
            s.lineTo(.94,-.7);s.lineTo(.91,-1);s.lineTo(0,-1);s.lineTo(.02,-.69);s.bezierCurveTo(.23,-.19,.72,.23,.72,.49);s.bezierCurveTo(.77,.9,.25,.91,.03,.32);s.closePath();
        }
        if(!s)throw new Error(`Unsupported numeral ${digit}`);
        // Convert curves into sampled outlines before affine positioning; holes remain true voids.
        const width=text.length===1?.88:1.48/text.length;
        const x=index*width-(text.length*width)/2;
        const lowerZero=text==='100'&&index>0;
        const transform=path=>path.getPoints(24).map(p=>new THREE.Vector2(x+p.x*width*.92,p.y*(lowerZero?.48:.72)+(lowerZero?-.12:.02)));
        const placed=new THREE.Shape(transform(s));placed.holes=s.holes.map(h=>new THREE.Path(transform(h)));result.push(placed);
    }
    return result;
}
