import * as T from 'three';
// Compact sports numerals with a consistent heavy stem, open counters and an 8% forward lean.
const poly=p=>new T.Shape(p.map(([x,y])=>new T.Vector2(x,y)));
export function athleticNumerals(text){
 let offset=0;const shapes=[];
 for(const digit of text){
  if(digit===':'){for(const y of [.2,.64])shapes.push(poly([[offset,y],[offset+.13,y],[offset+.15,y+.15],[offset+.02,y+.15]]));offset+=.25;continue;}
  let s;
  if(digit==='0'){
   s=poly([[.12,0],[.52,0],[.64,.12],[.64,.88],[.52,1],[.12,1],[0,.88],[0,.12]]);
   s.holes.push(new T.Path([[.22,.18],[.42,.18],[.46,.23],[.46,.77],[.42,.82],[.22,.82],[.18,.77],[.18,.23]].map(p=>new T.Vector2(...p))));
  }else if(digit==='1')s=poly([[.04,.72],[.04,.9],[.24,1],[.43,1],[.43,.17],[.59,.17],[.59,0],[.06,0],[.06,.17],[.24,.17],[.24,.76]]);
  else if(digit==='2')s=poly([[0,.73],[0,.89],[.12,1],[.52,1],[.64,.88],[.64,.66],[.20,.22],[.20,.18],[.64,.18],[.64,0],[0,0],[0,.26],[.44,.7],[.44,.8],[.40,.83],[.24,.83],[.20,.79],[.20,.73]]);
  else if(digit==='4'){
   s=poly([[.34,1],[.57,1],[.57,.38],[.68,.38],[.68,.20],[.57,.20],[.57,0],[.37,0],[.37,.20],[0,.20],[0,.42]]);
   s.holes.push(new T.Path([[.19,.38],[.37,.38],[.37,.72]].map(p=>new T.Vector2(...p))));
  }else if(digit==='5')s=poly([[.02,1],[.64,1],[.64,.82],[.22,.82],[.20,.61],[.51,.61],[.64,.48],[.64,.13],[.51,0],[.12,0],[0,.12],[0,.28],[.2,.28],[.2,.2],[.24,.17],[.41,.17],[.45,.21],[.45,.40],[.40,.44],[0,.44]]);
  else if(digit==='3')s=poly([[0,1],[.51,1],[.64,.87],[.64,.61],[.53,.50],[.64,.39],[.64,.13],[.51,0],[0,0],[0,.18],[.41,.18],[.45,.22],[.45,.38],[.41,.42],[.17,.42],[.17,.60],[.41,.60],[.45,.64],[.45,.78],[.41,.82],[0,.82]]);
  else if(digit==='6'||digit==='9'){
   s=poly([[.12,0],[.52,0],[.64,.12],[.64,.49],[.53,.61],[.19,.61],[.19,.78],[.23,.82],[.60,.82],[.60,1],[.12,1],[0,.88],[0,.12]]);
   s.holes.push(new T.Path([[.19,.21],[.23,.17],[.41,.17],[.45,.21],[.45,.40],[.41,.44],[.19,.44]].map(p=>new T.Vector2(...p))));
   if(digit==='9'){const turn=p=>p.map(v=>new T.Vector2(.64-v.x,1-v.y));const flipped=new T.Shape(turn(s.getPoints()));flipped.holes=s.holes.map(h=>new T.Path(turn(h.getPoints())));s=flipped;}
  }else if(digit==='8'){
   s=poly([[.12,0],[.52,0],[.64,.12],[.64,.4],[.56,.5],[.64,.6],[.64,.88],[.52,1],[.12,1],[0,.88],[0,.6],[.08,.5],[0,.4],[0,.12]]);
   for(const y of [.17,.59])s.holes.push(new T.Path([[.23,y],[.41,y],[.45,y+.04],[.45,y+.20],[.41,y+.24],[.23,y+.24],[.19,y+.20],[.19,y+.04]].map(p=>new T.Vector2(...p))));
  }
  else if(digit==='7')s=poly([[0,1],[.64,1],[.64,.82],[.28,0],[.06,0],[.42,.82],[0,.82]]);
  else if(digit===',')s=poly([[.04,.15],[.19,.15],[.19,-.02],[.10,-.12],[.02,-.12],[.07,0],[.04,0]]);
  else throw new Error('Unsupported athletic numeral '+digit);
  const transform=points=>points.map(p=>new T.Vector2(p.x+offset+p.y*.08,p.y));
  const result=new T.Shape(transform(s.getPoints()));result.holes=s.holes.map(h=>new T.Path(transform(h.getPoints())));shapes.push(result);
  offset+=digit===','?.27:.75;
 }
 return shapes;
}
