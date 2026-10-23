import {createRandom} from './random.js';
const mix=(a,b,t)=>a+(b-a)*t;
const midpoint=(a,b)=>a.map((v,i)=>(v+b[i])*.5);

/** A sparse, asymmetric spatial skeleton. Coordinates stay local until sway. */
export function generateTree(seed,{width=4,height=5,originX=.5}={}) {
 width=Math.max(1.5,Number(width)||4);height=Math.max(3,Number(height)||5);
 const random=createRandom(seed),range=(a,b)=>mix(a,b,random());
 const phase=range(-.18,.18),paths=[],hooks=[];
 function trunkAt(t) {
  return [width*(-.11*t+.075*Math.sin(t*Math.PI*2+phase)-.075*Math.sin(phase)),height*t,.09*Math.sin(t*5+phase)*t];
 }
 const trunk=Array.from({length:12},(_,i)=>trunkAt(i/11));
 paths.push({id:'trunk',points:trunk,radii:trunk.map((_,i)=>mix(.105,.013,(i/11)**.75)),level:0});
 const addHook=(path,index,suffix='')=>{
  const position=path.points[index].slice(),spread=.085;
  hooks.push({id:`hook-${path.id}${suffix}`,pair:[[position[0],position[1]+.018,position[2]+spread],[position[0],position[1]+.018,position[2]-spread]],position,branchId:path.id});
 };
 for(let i=0;i<6;i++) {
  const t=.28+i*.116+range(-.009,.009),base=trunkAt(t),left=i!==1&&i!==4;
  const reach=width*(left?range(.36,.55):range(.17,.23));
  const end=[Math.min(width*.18,base[0]+(left?-reach:reach)),base[1]+height*range(.055,.085),range(-.18,.18)];
  const points=Array.from({length:5},(_,j)=>{
   const u=j/4;return [mix(base[0],end[0],u),mix(base[1],end[1],u)+Math.sin(u*Math.PI)*height*.023,mix(base[2],end[2],u)+Math.sin(u*Math.PI)*range(-.06,.06)];
  });
  const path={id:`branch-${i}`,points,radii:points.map((_,j)=>mix(.041-i*.002,.006,j/4)),level:1};paths.push(path);addHook(path,4);
  // Forks turn upward and away from the parent, leaving an airy bare crown.
  for(let fork=0;fork<2;fork++) {
   const source=points[fork+2],length=height*range(.13,.2),dx=(left?-1:1)*width*range(.06,.1);
   const twig={id:`twig-${i}-${fork}`,points:[source.slice(),[source[0]+dx*.7,source[1]+length*.5,source[2]+range(-.11,.11)],[source[0]+dx,source[1]+length,source[2]+range(-.15,.15)]],radii:[.018,.009,.0035],level:2};
   // A top twig may approach but never exceed the allocated crown.
   for(const p of twig.points)p[1]=Math.min(height*1.015,p[1]);
   paths.push(twig);
  }
  if(i===2||i===5)addHook(path,2,'-inner');
 }
 return {seed,origin:[originX,0,0],height,paths,hooks};
}

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
