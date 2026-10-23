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
 assert.ok(tree.paths.every(p=>p.radii.length===p.points.length&&p.radii.every(r=>r>0&&r<.3)));
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
test('reference tree keeps substantial depth and low arches with rising bare branchlets',()=>{
 for(let seed=0;seed<20;seed++){
  const tree=generateTree(seed),points=tree.paths.flatMap(path=>path.points),depths=points.map(p=>p[2]);
  assert.ok(Math.max(...depths)-Math.min(...depths)>=.7,'front and rear limbs occupy visibly separate depths');
  const trunk=tree.paths.find(path=>path.level===0);assert.ok(trunk.radii[0]>=.23&&trunk.radii[0]<=.26,'sculptural bonsai trunk reveals its facets');
  const limbs=tree.paths.filter(path=>path.level===1);
  assert.ok(limbs.length>=4&&limbs.every(path=>{const rise=path.points.at(-1)[1]-path.points[0][1];return rise>tree.height*.045&&rise<tree.height*.16;}),'main limbs form low rising arches');
  assert.ok(tree.paths.filter(path=>path.level===2).some(path=>path.points.at(-1)[1]>path.points[0][1]+tree.height*.05),'bare branchlets still rise from the arches');
  assert.ok(treeCapsules(tree).length<120,'collision budget remains bounded');
 }
});
test('leafless bonsai has a broad layered crown rather than a long upright leader',()=>{
 for(const width of [2.45,4])for(let seed=0;seed<20;seed++){
  const tree=generateTree(seed,{width}),trunk=tree.paths.find(path=>path.level===0),crown=tree.paths.filter(path=>path.level>0).flatMap(path=>path.points);
  const span=Math.max(...crown.map(p=>p[0]))-Math.min(...crown.map(p=>p[0]));
  assert.ok(span>width*.82,'bare crown spreads broadly over the bending trunk');
  assert.ok(trunk.points.at(-1)[1]<tree.height*.86,'trunk ends within the crown instead of becoming an upright whip');
  const left=tree.paths.filter(path=>path.level===1&&path.points.at(-1)[0]<path.points[0][0]);
  assert.ok(left.length>=4&&left.every(path=>path.points[0][0]-path.points.at(-1)[0]>(path.points.at(-1)[1]-path.points[0][1])*1.2),'strong left limbs extend sideways before delicate tips rise');
 }
});
test('windswept silhouette forms an S-curve and carries its upper crown to the left',()=>{
 for(const width of [2.45,4])for(let seed=0;seed<20;seed++){
  const tree=generateTree(seed,{width}),trunk=tree.paths.find(path=>path.level===0).points;
  assert.ok(trunk.at(-1)[0]<trunk[2][0]-width*.28,'upper trunk sweeps clearly left of its lower bend');
  assert.ok(trunk[1][0]>trunk[0][0]+width*.005,'lower trunk begins with the opposing curve');
  assert.ok(trunk.at(-1)[0]<trunk.at(-3)[0]-width*.035,'upper tangent continues left rather than returning upright');
  const upper=tree.paths.filter(path=>path.level===1&&path.points[0][1]>tree.height*.5);
  assert.ok(upper.length>=3&&upper.every(path=>path.points.at(-1)[0]<path.points[0][0]-width*.18),'upper crown follows the wind');
 }
});
