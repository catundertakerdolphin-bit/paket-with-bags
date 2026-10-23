import test from 'node:test';
import assert from 'node:assert/strict';
import {BAG_TEMPLATE,SoftBag} from '../src/core/cloth.js';
const point=(array,i)=>Array.from(array.subarray(i*3,i*3+3));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const finite=a=>a.every(Number.isFinite);
function edges(){const set=new Map();const p=BAG_TEMPLATE.positions,t=BAG_TEMPLATE.indices;for(let i=0;i<t.length;i+=3)for(let j=0;j<3;j++){const a=t[i+j],b=t[i+(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');set.set(key,{a,b,length:distance(point(p,a),point(p,b))});}return [...set.values()];}

test('sparse template is a real open 3D shell with two integral side handles',()=>{
 const {positions:p,indices,particleCount,handleTips,bodyIndices}=BAG_TEMPLATE;
 assert.ok(p instanceof Float32Array&&indices instanceof Uint16Array);
 assert.equal(p.length,particleCount*3);assert.ok(particleCount<=100);assert.ok(indices.length/3<=180);
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

test('integral T-shirt silhouette has high side bands and a deeply cut central neckline',()=>{
 const p=BAG_TEMPLATE.positions,bodyTop=Math.max(...BAG_TEMPLATE.bodyIndices.map(i=>p[i*3+1])),tips=BAG_TEMPLATE.handleTips.map(i=>point(p,i));
 assert.ok(tips[0][0]*tips[1][0]<0&&Math.abs(tips[0][0]-tips[1][0])>.48,'the two handles rise on opposite sides, not front/back arch centres');
 for(let i=0;i<p.length;i+=3)if(p[i+1]>bodyTop+.35)assert.ok(Math.abs(p[i])>.15,'no central arched ribbon above the neckline');
 const neck=BAG_TEMPLATE.rimIndices.filter(i=>Math.abs(p[i*3])<.12);assert.ok(neck.length>=2);
 const lowestTip=Math.min(...tips.map(v=>v[1]));for(const i of neck)assert.ok(lowestTip-p[i*3+1]>.5,'front/back rim drops into a deep U cutout');
 const highTriangles=[];for(let t=0;t<BAG_TEMPLATE.indices.length;t+=3){const ids=Array.from(BAG_TEMPLATE.indices.subarray(t,t+3));if(ids.some(i=>p[i*3+1]>bodyTop+.25))highTriangles.push(ids);}
 assert.ok(highTriangles.length>=20,'side bands are broad continuous areas of the shell');
});

test('weak wind visibly changes internal distances during a two-second free flight',()=>{
 const bag=new SoftBag({id:'gust',position:[0,3,0],seed:17}),before=bag.positions.slice(),ids=BAG_TEMPLATE.bodyIndices;
 bag.setVelocity([-2.5,.25,.1]);let peak=0,final=0;
 for(let k=0;k<120;k++){
  bag.step(1/60,{wind:-1.5,time:k/60});if(k%10!==9)continue;
  let difference=0,pairs=0;
  for(let i=0;i<ids.length;i+=3)for(let j=i+6;j<ids.length;j+=5){difference+=Math.abs(distance(point(before,ids[i]),point(before,ids[j]))-distance(point(bag.positions,ids[i]),point(bag.positions,ids[j])));pairs++;}
  final=difference/pairs;peak=Math.max(peak,final);
 }
 assert.ok(peak>.025,'the actual membrane buckles, beyond a rigid translation or rotation');
 assert.ok(final<peak*.8,'the film partly unfolds again instead of keeping one scripted squash');
 assert.ok(finite(bag.positions));
});
test('calm air does not inject a gust into a freely falling membrane',()=>{
 const bag=new SoftBag({id:'calm',position:[0,3,0],seed:17}),before=bag.positions.slice(),start=bag.center();
 for(let k=0;k<60;k++)bag.step(1/60,{wind:0,time:k/60});
 const center=bag.center();let deformation=0;
 for(let i=0;i<bag.positions.length;i++)deformation=Math.max(deformation,Math.abs((bag.positions[i]-center[i%3])-(before[i]-start[i%3])));
 assert.ok(deformation<.005,'only gravity acts in still air; a quiet receiver must not get full flight gusts');
});

test('a local material grip moves its patch before the distant membrane',()=>{
 const bag=new SoftBag({id:'local',position:[0,3,0],seed:31}),index=BAG_TEMPLATE.bodyIndices[0],before=bag.positions.slice();
 const target=point(before,index);target[0]+=.28;
 bag.step(1/60,{wind:0,time:0,grip:{index,point:target}});
 const grabbed=distance(point(before,index),point(bag.positions,index));
 const remote=BAG_TEMPLATE.bodyIndices.at(-2),distant=distance(point(before,remote),point(bag.positions,remote));
 assert.ok(grabbed>.02,'local patch follows the hand');
 assert.ok(grabbed>distant*2,'remote material does not translate rigidly with the hand');
});

test('a quick six-unit local drag follows the hand without stretching the membrane apart',()=>{
 const bag=new SoftBag({id:'quick-hand',position:[0,3,0],seed:31,scale:.72}),index=BAG_TEMPLATE.bodyIndices[Math.floor(BAG_TEMPLATE.bodyIndices.length*.45)],start=point(bag.positions,index),before=bag.positions.slice();
 let target=start;
 for(let frame=0;frame<24;frame++){
  target=[start[0]+6*(frame+1)/24,start[1],start[2]];
  bag.step(1/60,{wind:-1.5,time:frame/60,grip:{index,point:target}});
 }
 assert.ok(distance(point(bag.positions,index),target)<.2,'the picked material stays at the moving hand');
 assert.ok(finite(bag.positions));
 for(const edge of edges())assert.ok(distance(point(bag.positions,edge.a),point(bag.positions,edge.b))<edge.length*.72*1.8+.008,'the fast grip preserves bounded local stretch');
 const far=BAG_TEMPLATE.bodyIndices.at(-2),deltaPicked=point(bag.positions,index).map((v,i)=>v-before[index*3+i]),deltaFar=point(bag.positions,far).map((v,i)=>v-before[far*3+i]);
 assert.ok(distance(deltaPicked,deltaFar)>.03,'the free body deforms behind the hand instead of translating rigidly');
});

test('a supported open rim leaves a visibly folding membrane under gusts',()=>{
 assert.ok(BAG_TEMPLATE.rimIndices?.length>=8);
 const bag=new SoftBag({id:'rim',position:[0,2,0],seed:51});
 const pins=BAG_TEMPLATE.rimIndices.map(index=>({index,point:point(bag.positions,index)})),start=bag.positions.slice();
 for(let k=0;k<180;k++)bag.step(1/60,{wind:7,time:k/60,pins});
 for(const pin of pins)assert.ok(distance(point(bag.positions,pin.index),pin.point)<1e-5);
 assert.ok(Math.max(...bag.positions.map((v,i)=>Math.abs(v-start[i])))>.05);
 assert.ok(finite(bag.positions));
});

test('containment folds the same membrane instead of uniformly shrinking its edges',()=>{
 const bag=new SoftBag({id:'fold',position:[0,.75,0],seed:10});
 const before=bag.positions.slice(),containment={center:[0,.2,0],halfWidth:.31,halfDepth:.23,floor:.08,ceiling:.44};
 for(let k=0;k<150;k++)bag.step(1/60,{wind:0,time:k/60,containment});
 assert.ok(finite(bag.positions));
 let low=Infinity,high=-Infinity;for(let i=0;i<bag.positions.length;i+=3){assert.ok(Math.abs(bag.positions[i])<=.311);assert.ok(Math.abs(bag.positions[i+2])<=.231);low=Math.min(low,bag.positions[i+1]);high=Math.max(high,bag.positions[i+1]);}
 assert.ok(low>=.079&&high<=.441,'the shell remains physically inside the receiver');
 const fractions=edges().map(e=>distance(point(bag.positions,e.a),point(bag.positions,e.b))/e.length);
 assert.ok(fractions.reduce((a,b)=>a+b,0)/fractions.length>.65,'local material lengths remain while the silhouette compresses');
 assert.notDeepEqual(bag.positions,before);
});

test('a floor-only support constrains the shell with unbounded side and upper limits',()=>{
 const bag=new SoftBag({id:'floor',position:[0,.2,0],seed:73});
 const containment={center:[0,0,0],halfWidth:Infinity,halfDepth:Infinity,floor:.085,ceiling:Infinity};
 for(let k=0;k<90;k++)bag.step(1/60,{wind:0,time:k/60,containment});
 for(let i=1;i<bag.positions.length;i+=3)assert.ok(bag.positions[i]>=.0849,'finite floor acts independently of the infinite ceiling');
});

test('capsule can contact a face interior while every face vertex is outside it',()=>{
 const bag=new SoftBag({id:'face',position:[0,2,0],seed:10}),tri=Array.from(BAG_TEMPLATE.indices.subarray(0,3)),p=tri.map(i=>point(bag.positions,i));
 const center=[0,0,0];for(const q of p)for(let a=0;a<3;a++)center[a]+=q[a]/3;
 const u=p[1].map((v,i)=>v-p[0][i]),v=p[2].map((v,i)=>v-p[0][i]);let n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]],length=Math.hypot(...n);n=n.map(v=>v/length);
 const capsule={a:center.map((v,i)=>v-n[i]*.04),b:center.map((v,i)=>v+n[i]*.04),radius:.015};
 assert.ok(p.every(q=>distance(q,center)>.03));
 bag.step(1e-6,{wind:0,time:0,capsules:[capsule]});
 assert.ok(bag.contacts?.some(c=>c.capsuleIndex===0),'real triangle contact reports a material pin candidate');
 for(const c of bag.contacts){assert.ok(Number.isInteger(c.index)&&finite(c.point));assert.ok(distance(c.point,point(bag.positions,c.index))<1e-5);}
 bag.step(1e-6,{wind:0,time:0,capsules:[]});assert.equal(bag.contacts.length,0,'contacts are rebuilt for each step');
});

test('nonuniform rest shape and seeded velocity survive a continuing snapshot',()=>{
 const bag=new SoftBag({id:'shape',position:[1,2,.3],seed:18,shape:[1.5,.7,1.2]});
 assert.deepEqual(bag.shape,[1.5,.7,1.2]);bag.setVelocity([-2,.1,.3]);
 for(let k=0;k<30;k++)bag.step(1/60,{wind:-3,time:k/60});
 const copy=SoftBag.fromSnapshot(bag.snapshot());
 for(let k=30;k<45;k++){const o={wind:-3,time:k/60};bag.step(1/60,o);copy.step(1/60,o);}
 assert.deepEqual(copy.positions,bag.positions);assert.deepEqual(copy.previous,bag.previous);
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
 // The yawed integral shell may deflect differently when airflow reverses,
 // but strong leftward flow must retain finite out-of-plane flutter.
 assert.ok(finite(left.positions)&&finite(right.positions));
 assert.ok(Math.abs(left.center()[2])>.001&&Math.abs(right.center()[2])>.001);
});
