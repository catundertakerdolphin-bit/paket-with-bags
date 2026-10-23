const COUNTS=[6,8,10,12,14,15,16,18];
const LIFETIMES=[[7,9],[6.6,8.2],[6,7.6],[5.6,7],[5.1,6.5],[4.7,6.1],[4.4,5.8],[4.1,5.5]];
function random(seed){let a=(Number(seed)||1)>>>0;return()=>{a=(a+0x6D2B79F5)>>>0;let t=Math.imul(a^(a>>>15),a|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}

export function roundConfig(round=1,seed=1){
 round=Math.max(1,Math.floor(Number(round)||1));
 const total=round<=8?COUNTS[round-1]:Math.min(22,18+round-8);
 const lifetime=round<=8?[...LIFETIMES[round-1]]:[3.2+.9*.85**(round-8),4.4+1.1*.85**(round-8)];
 const interval=Math.max(3.75,4.8-.12*(round-1));
 const at=i=>1+Math.floor(i/3)*interval+i%3;
 const duration=Math.min(34,Math.max(22,2*Math.ceil((at(total-1)+lifetime[1]+2)/2)));
 const rng=random((Number(seed)^Math.imul(round,0x9e3779b9))>>>0),schedule=[];
 let earliest=0;
 for(let i=0;i<total;i++){
  const attachAt=at(i);earliest=Math.max(attachAt,earliest)+1.35;
  const low=Math.max(lifetime[0],earliest-attachAt+.25),high=Math.min(lifetime[1],duration-2-attachAt);
  if(high+1e-9<low)throw new RangeError(`Unfair round schedule: ${round}/${i}`);
  schedule.push({index:i,arrivalAt:Math.max(0,attachAt-1),attachAt,lifetime:low+(high-low)*rng(),colorIndex:Math.floor(rng()*6),hookIndex:i%8});
 }
 return {round,total,quota:Math.ceil(.6*total),duration,wind:12-10.5*.9**(round-1),lifetime,interval,schedule};
}

export function makeLayout(aspect=1){
 aspect=Math.max(.35,Math.min(3.5,Number(aspect)||1));
 const viewHeight=2*Math.tan(20*Math.PI/180)*10,viewWidth=viewHeight*aspect;
 const width=Math.min(1.8,Math.max(.96,viewWidth*.31));
 return {aspect,viewWidth,viewHeight,treeWidth:Math.min(4.3,viewWidth*.84),treeX:viewWidth*.16,mouth:{center:[-viewWidth*.28,.9,.8],width,depth:.95},collectorScale:width/.74};
}

// This target volume is shared by pointer glow and accepted releases.
export function acceptsDrop(point,layout){
 if(!point||point.length<3||!point.every(Number.isFinite))return false;
 const m=layout.mouth;
 return Math.abs(point[0]-m.center[0])<=m.width*.54&&Math.abs(point[1]-m.center[1])<=.48&&Math.abs(point[2]-m.center[2])<=m.depth*.75;
}
