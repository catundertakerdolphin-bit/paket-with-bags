import test from 'node:test';
import assert from 'node:assert/strict';
import {generateTree,treeSway,hookAt,treeCapsules} from '../src/core/tree.js';

const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
test('tree generation is reproducible, varied, bounded and truly spatial',()=>{
 const tree=generateTree(31),again=generateTree(31),other=generateTree(32);
 assert.deepEqual(tree,again);assert.notDeepEqual(tree.paths,other.paths);
 assert.ok(tree.paths.length>=10&&tree.paths.length<=32);
 assert.deepEqual(tree.origin,[.5,0,0]);
 const all=tree.paths.flatMap(p=>p.points);
 assert.ok(all.every(p=>p.length===3&&p.every(Number.isFinite)&&p[0]>=-4&&p[0]<=1&&p[1]>=0&&p[1]<=5.15&&Math.abs(p[2])<.7));
 assert.ok(Math.max(...all.map(p=>p[2]))-Math.min(...all.map(p=>p[2]))>.15);
 assert.ok(tree.paths.every(p=>p.radii.length===p.points.length&&p.radii.every(r=>r>0&&r<.2)));
});
test('a hundred tree seeds provide at least eight distinct accessible hook locations',()=>{
 for(let seed=0;seed<100;seed++){
  const tree=generateTree(seed,{width:2.45,height:4.8,originX:.7});
  assert.ok(tree.hooks.length>=8);
  for(let i=0;i<tree.hooks.length;i++){
   const h=tree.hooks[i];assert.ok(h.pair.length===2&&distance(...h.pair)>.08);
   assert.ok(h.position[0]>=-2.45&&h.position[0]<=.5&&h.position[1]>1.1&&h.position[1]<4.9);
   for(let j=0;j<i;j++)assert.ok(Math.hypot(h.position[0]-tree.hooks[j].position[0],h.position[1]-tree.hooks[j].position[1])>.32,`overlapping hooks seed ${seed}`);
  }
 }
});
test('hook anchors and branch capsules share the renderer sway transform',()=>{
 const tree=generateTree(4),time=2.1,wind=7,angle=treeSway(tree,time,wind);
 assert.equal(typeof angle,'number');assert.ok(Math.abs(angle)<.08);
 const local=tree.hooks[0].pair[0],world=hookAt(tree,tree.hooks[0].id,time,wind)[0];
 const transform=p=>[tree.origin[0]+p[0]*Math.cos(angle)-p[1]*Math.sin(angle),p[0]*Math.sin(angle)+p[1]*Math.cos(angle),p[2]];
 assert.ok(distance(world,transform(local))<1e-10);
 const capsules=treeCapsules(tree,time,wind);assert.ok(capsules.length<120);
 assert.ok(distance(capsules[0].a,transform(tree.paths[0].points[0]))<1e-10);
 assert.ok(distance(capsules[0].b,transform(tree.paths[0].points[1]))<1e-10);
 assert.ok(capsules.every(c=>c.radius>0&&c.a.every(Number.isFinite)&&c.b.every(Number.isFinite)));
});
test('anchor order keeps front and rear handle ribbons untwisted',()=>{
 const tree=generateTree(3);for(const hook of tree.hooks)assert.ok(hook.pair[0][2]>hook.pair[1][2]);
});
