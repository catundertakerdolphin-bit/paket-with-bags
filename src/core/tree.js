import {createRandom} from './random.js';
const mix=(a,b,t)=>a+(b-a)*t;

/** A sparse, asymmetric spatial skeleton. Coordinates stay local until sway. */
export function generateTree(seed,{width=4,height=5,originX=.5}={}) {
 width=Math.max(1.5,Number(width)||4);height=Math.max(3,Number(height)||5);
 const random=createRandom(seed),range=(a,b)=>mix(a,b,random());
 const phase=range(-.22,.22),paths=[],hooks=[];
 function trunkAt(t) {
  // A short opposing bend at the foot opens into a long leftward S-curve.
  // The tip keeps travelling with the wind instead of returning to vertical.
  return [width*(-.34*t**1.3+.075*Math.sin(t*Math.PI*1.7+phase)-.075*Math.sin(phase)),height*t,.23*Math.sin(t*4.3+phase)*t];
 }
 const trunk=Array.from({length:10},(_,i)=>trunkAt(i/9*.82));
 paths.push({id:'trunk',points:trunk,radii:trunk.map((_,i)=>mix(.25,.047,(i/9)**.85)),level:0});
 const addHook=(path,index,suffix='')=>{
  const position=path.points[index].slice(),spread=.085;
  hooks.push({id:`hook-${path.id}${suffix}`,pair:[[position[0],position[1]+.018,position[2]+spread],[position[0],position[1]+.018,position[2]-spread]],position,branchId:path.id});
 };
 // Irregular rising layers follow the wind. One low, short counter-branch
 // balances the trunk; all of the upper crown and its fine growth sweep left.
 const roots=[.30,.43,.56,.69,.80],depths=[.43,-.42,-.47,.46,.15];
 const rises=[.12,.09,.11,.075,.095],reaches=[.55,.20,.55,.42,.31];
 for(let i=0;i<roots.length;i++) {
  const t=roots[i]+range(-.008,.008),base=trunkAt(t),left=i!==1;
  const reach=width*(reaches[i]+range(-.025,.025));
  const end=[base[0]+(left?-reach:reach),Math.min(height*.985,base[1]+height*(rises[i]+range(-.006,.006))),depths[i]+range(-.035,.035)];
  const bend=range(-.02,.02)*width,turn=range(-.07,.07);
  const points=Array.from({length:5},(_,j)=>{
   const u=j/4,reachU=u*.65+u*u*.35,riseU=Math.sin(u*Math.PI*.5)*.65+u*.35;
   return [mix(base[0],end[0],reachU)+Math.sin(u*Math.PI)*bend,mix(base[1],end[1],riseU),mix(base[2],end[2],u)+Math.sin(u*Math.PI)*turn];
  });
  const path={id:`branch-${i}`,points,radii:points.map((_,j)=>mix(.11-i*.012,.011,(j/4)**.82)),level:1};paths.push(path);addHook(path,4);
  // Fine bare fans grow at the ends of the strong arches, leaving clear air
  // beneath each layer. They suggest bonsai pads without adding any leaves.
  for(let fork=0;fork<3;fork++) {
   const source=points[fork===0?3:4],length=height*range(.052,.085),direction=left?-1:(fork===0?1:-1);
   const reach=width*(fork===0?range(.12,.18):fork===1?range(.065,.105):range(-.025,.025));
   const dx=direction*reach,dz=(fork===0?-1:fork===1?1:.3)*range(.12,.2),tipX=Math.min(width*.23,source[0]+dx);
   const twig={id:`twig-${i}-${fork}`,points:[source.slice(),[mix(source[0],tipX,.46),source[1]+length*.72,source[2]+dz*.45],[tipX,source[1]+length,clampDepth(source[2]+dz)]],radii:[.026-i*.002,.012-i*.0011,.0035],level:2};
   // A top twig may approach but never exceed the allocated crown.
   for(const p of twig.points)p[1]=Math.min(height*1.015,p[1]);
   paths.push(twig);
  }
  if(i<3)addHook(path,1,'-inner');
 }
 // Early waves span the whole crown before filling its inner branch lanes.
 hooks.sort((a,b)=>Number(a.id.endsWith('-inner'))-Number(b.id.endsWith('-inner')));
 return {seed,origin:[originX,0,0],height,paths,hooks};
}
const clampDepth=z=>Math.max(-.66,Math.min(.66,z));

export function treeSway(tree,time=0,wind=0) {
 const strength=Math.min(12,Math.max(0,Number(wind)||0));
 return -.0022*strength+Math.sin(time*1.35+(Number(tree.seed)||0)*.31)*(.0015+.0009*strength)+Math.sin(time*2.7)*.0005*strength;
}
function transform(tree,point,angle) {
 const c=Math.cos(angle),s=Math.sin(angle);
 return [tree.origin[0]+point[0]*c-point[1]*s,tree.origin[1]+point[0]*s+point[1]*c,tree.origin[2]+point[2]];
}
export function hookAt(tree,hookId,time=0,wind=0) {
 const hook=typeof hookId==='number'?tree.hooks[hookId]:tree.hooks.find(h=>h.id===hookId);
 if(!hook)throw new RangeError(`Unknown tree hook: ${hookId}`);
 const angle=treeSway(tree,time,wind);return hook.pair.map(p=>transform(tree,p,angle));
}
export function treeCapsules(tree,time=0,wind=0) {
 const angle=treeSway(tree,time,wind),capsules=[];
 for(const path of tree.paths)for(let i=1;i<path.points.length;i++)capsules.push({a:transform(tree,path.points[i-1],angle),b:transform(tree,path.points[i],angle),radius:(path.radii[i-1]+path.radii[i])*.5});
 return capsules;
}
