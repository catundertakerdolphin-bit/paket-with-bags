import test from 'node:test';
import assert from 'node:assert/strict';
import {BAG_TEMPLATE,SoftBag} from '../src/core/cloth.js';
const point=(array,i)=>Array.from(array.subarray(i*3,i*3+3));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const finite=a=>a.every(Number.isFinite);
function edges(){const set=new Map();const p=BAG_TEMPLATE.positions,t=BAG_TEMPLATE.indices;for(let i=0;i<t.length;i+=3)for(let j=0;j<3;j++){const a=t[i+j],b=t[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');set.set(key,{a,b,length:distance(point(p,a),point(p,b))});}return [...set.values()];}

test('sparse template is a real open 3D shell with two ribbon loops',()=>{
 const {positions:p,indices,particleCount,handleTips,bodyIndices}=BAG_TEMPLATE;
 assert.ok(p instanceof Float32Array&&indices instanceof Uint16Array);
 assert.equal(p.length,particleCount*3);assert.ok(particleCount<=64);assert.ok(indices.length/3<=180);
 assert.equal(handleTips.length,2);assert.ok(handleTips[0]!==handleTips[1]);
 assert.ok(Math.max(...p.filter((_,i)=>i%3===2))-Math.min(...p.filter((_,i)=>i%3===2))>.2);
 assert.ok(distance(point(p,handleTips[0]),point(p,handleTips[1]))>.2);
 assert.ok(bodyIndices.length>=24&&bodyIndices.length<particleCount);
 const bodyMaxY=Math.max(...bodyIndices.map(i=>p[i*3+1]));
 for(const tip of handleTips)assert.ok(p[tip*3+1]>bodyMaxY+.25);
 // A cap across the top would seal the opening. Wall triangles may touch the rim but cannot contain three rim nodes.
 const rim=new Set(bodyIndices.filter(i=>p[i*3+1]>bodyMaxY-.001));
 assert.ok(indices.every((_,i)=>i%3||![indices[i],indices[i+1],indices[i+2]].every(v=>rim.has(v))));
});
test('constructor and translations target the body center without creating velocity',()=>{
 const bag=new SoftBag({id:'x',position:[1,2,.7],seed:4,scale:.9});assert.ok(distance(bag.center(),[1,2,.7])<1e-6);
 bag.translateTo([-2,3,.1]);assert.ok(distance(bag.center(),[-2,3,.1])<1e-6);
 assert.deepEqual(bag.positions,bag.previous);
});
test('tethered handles stay pinned during gusts while the membrane flutters in depth',()=>{
 const bag=new SoftBag({id:'p',position:[0,3,0],seed:9});
 const anchors=BAG_TEMPLATE.handleTips.map(i=>point(bag.positions,i));const start=bag.positions.slice();
 for(let k=0;k<600;k++)bag.step(1/60,{wind:8,time:k/60,anchors,capsules:[]});
 for(let i=0;i<2;i++)assert.ok(distance(point(bag.positions,BAG_TEMPLATE.handleTips[i]),anchors[i])<1e-5);
 assert.ok(finite(bag.positions));assert.ok(Math.max(...bag.positions.map((v,i)=>i%3===2?Math.abs(v-start[i]):0))>.02);
 for(const edge of edges())assert.ok(distance(point(bag.positions,edge.a),point(bag.positions,edge.b))<edge.length*1.65+.008,'bounded membrane stretch');
});
test('free bag follows wind and gravity; a soft grip follows the requested center',()=>{
 const bag=new SoftBag({id:'f',position:[0,3,0],seed:2});const start=bag.center();
 for(let k=0;k<120;k++)bag.step(1/60,{wind:5,time:k/60,anchors:[null,null],capsules:[]});
 const end=bag.center();assert.ok(end[0]>start[0]+.15);assert.ok(end[1]<start[1]-.4);assert.ok(Math.abs(end[2]-start[2])>.001);
 const target=[-1,2,.8];for(let k=0;k<90;k++)bag.step(1/60,{wind:9,time:k/60,grip:{point:target},anchors:[null,null],capsules:[]});
 assert.ok(distance(bag.center(),target)<.1);assert.ok(finite(bag.positions));
});
test('capsule contacts prevent penetrating a branch without unbounded shape growth',()=>{
 const bag=new SoftBag({id:'c',position:[0,1,0],seed:4});const capsule={a:[-1,1,0],b:[1,1,0],radius:.12};
 for(let k=0;k<20;k++)bag.step(1/120,{wind:2,time:k/120,grip:{point:[0,1,.2]},capsules:[capsule]});
 assert.ok(finite(bag.positions));
 for(let i=0;i<BAG_TEMPLATE.particleCount;i++){const p=point(bag.positions,i),q=[Math.max(-1,Math.min(1,p[0])),1,0];assert.ok(distance(p,q)>=.115);}
});
test('snapshots are independent and reproduce continuing motion',()=>{
 const bag=new SoftBag({id:'s',position:[1,2,.2],scale:.7,seed:8});for(let k=0;k<50;k++)bag.step(1/120,{wind:4,time:k/120});
 const snapshot=bag.snapshot(),restored=SoftBag.fromSnapshot(snapshot);assert.deepEqual(bag.positions,restored.positions);snapshot.positions[0]+=10;assert.notEqual(snapshot.positions[0],restored.positions[0]);
 for(let k=50;k<100;k++){const options={wind:4,time:k/120};bag.step(1/120,options);restored.step(1/120,options);}
 assert.deepEqual(bag.positions,restored.positions);assert.deepEqual(bag.previous,restored.previous);
});
test('one released handle permits a swing without detaching the remaining handle',()=>{
 const bag=new SoftBag({id:'one',position:[0,3,0],seed:14,scale:.7});const tip=BAG_TEMPLATE.handleTips[0],anchor=point(bag.positions,tip),start=bag.center();
 for(let k=0;k<240;k++)bag.step(1/60,{wind:10,time:k/60,anchors:[anchor,null]});
 assert.ok(distance(point(bag.positions,tip),anchor)<1e-5);assert.ok(distance(start,bag.center())>.1);assert.ok(finite(bag.positions));
 for(const edge of edges())assert.ok(distance(point(bag.positions,edge.a),point(bag.positions,edge.b))<edge.length*.7*1.8+.008);
});
test('contact at a branch center pushes only the required distance',()=>{
 const bag=new SoftBag({id:'center',position:[0,2,0],seed:1});const particle=point(bag.positions,1),before=bag.positions.slice();
 bag.step(1e-9,{wind:0,time:0,capsules:[{a:particle,b:particle,radius:.12}]});
 assert.ok(distance(point(bag.positions,1),point(before,1))<.14,'no arbitrary large correction for a zero-length normal');
 assert.ok(distance(point(bag.positions,1),particle)>=.12);
});
test('signed wind reverses travel without cancelling depth flutter at strong left gusts',()=>{
 const left=new SoftBag({id:'left',position:[0,3,0],seed:2}),right=new SoftBag({id:'right',position:[0,3,0],seed:2});
 for(let k=0;k<120;k++){left.step(1/60,{wind:-12,time:k/60});right.step(1/60,{wind:12,time:k/60});}
 assert.ok(left.center()[0]<-.3&&right.center()[0]>.3);
 // Wind direction belongs to the travel force; membrane turbulence is a speed magnitude.
 assert.ok(Math.abs(left.center()[2]-right.center()[2])<.005);
});
