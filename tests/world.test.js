import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/core/world.js';
import {acceptsDrop} from '../src/core/rules.js';
import {BAG_TEMPLATE} from '../src/core/cloth.js';
import {treeCapsules} from '../src/core/tree.js';
const command=(seq,type,rest={})=>({seq,type,...rest});
function started(seed=11){const w=new World({seed});w.advance(0,[command(1,'start',{at:0})]);return w;}
function run(w,seconds,step=.1){for(let t=0;t<seconds-1e-9;t+=step)w.advance(Math.min(step,seconds-t));return w.snapshot();}
function firstBag(w){for(let i=0;i<30&&!w.bags.length;i++)w.advance(.1);return w.bags[0];}
function collect(w,bag,seq){const p=w.layout.mouth.center;w.advance(0,[command(seq,'grab',{id:bag.id,point:bag.soft.center(),at:w.time}),command(seq+1,'drop',{point:p,at:w.time})]);}

test('ready world has a real tree and receiver and no automatic win',()=>{
 const w=new World({seed:12});let s=w.snapshot();assert.equal(s.phase,'ready');assert.equal(s.bags.length,0);assert.ok(s.tree.hooks.length>=8);assert.ok(s.collector.positions.length>0);assert.equal(s.timeLeft,22);
 w.advance(30);assert.equal(w.phase,'ready');w.advance(0,[command(1,'start',{at:w.time})]);run(w,23);s=w.snapshot();assert.equal(s.phase,'over');assert.equal(s.caught,0);assert.equal(s.missed,6);assert.equal(s.roundMissed,6);
});
test('a flight that misses real branches is never snapped to a scheduled hook',()=>{
 const w=started(),b=firstBag(w);
 b.soft.translateTo([0,3,3]);b.soft.previous.set(b.soft.positions);
 run(w,2,1/60);
 assert.notEqual(b.state,'tethered');assert.equal(b.pins?.length||0,0);
});
test('desktop flight lanes reach the crown before falling, with both natural snags and passes',()=>{
 for(const seed of [11,31]){
  const w=new World({seed,aspect:16/9});w.advance(0,[command(1,'start',{at:0})]);
  run(w,22,1/60);
  const snags=w.events.filter(e=>e.kind==='snagged');
  assert.ok(snags.length>=3,`seed ${seed}: only ${snags.length} bags touched a branch`);
  assert.ok(!snags.some(e=>e.bagId.endsWith(':4')),'a depth lane genuinely passes the crown');
 }
});
test('actual cloth contact creates local temporary pins rather than designated handle anchors',()=>{
 const w=started(),b=firstBag(w),capsules=treeCapsules(w.tree,w.time,w.wind);
 const c=capsules.find(c=>c.a[1]>2&&c.a[1]<3)||capsules[3],mid=c.a.map((v,i)=>(v+c.b[i])/2);
 const index=BAG_TEMPLATE.bodyIndices[Math.floor(BAG_TEMPLATE.bodyIndices.length*.7)],p=b.soft.positions;
 const offset=[p[index*3]-b.soft.center()[0],p[index*3+1]-b.soft.center()[1],p[index*3+2]-b.soft.center()[2]];
 b.soft.translateTo(mid.map((v,i)=>v-offset[i]));b.soft.previous.set(b.soft.positions);
 w.advance(1/60);
 assert.equal(b.state,'tethered');assert.ok(b.pins.length>=1&&b.pins.length<=2);
 assert.ok(b.pins.some(pin=>!BAG_TEMPLATE.handleTips.includes(pin.index)));
 const id=b.id;run(w,b.lifetime+1,1/60);
 const released=w.bags.find(b=>b.id===id);if(released)assert.equal(released.pins.length,0);
 assert.ok(w.events.some(e=>e.kind==='unhooked'&&e.bagId===id));
});
test('held bag is wind safe, shared mouth accepts exactly once, and free release is recapturable',()=>{
 const w=started();let b=firstBag(w),seq=2;w.advance(0,[command(seq++,'grab',{id:b.id,point:b.soft.center(),at:w.time})]);run(w,10);assert.equal(b.state,'held');assert.equal(b.resolved,false);assert.ok(!w.events.some(e=>e.kind==='missed'&&e.bagId===b.id));
 w.advance(0,[command(seq++,'drop',{point:[0,3,.8],at:w.time})]);assert.equal(b.state,'loose');assert.equal(w.caught,0);
 const p=w.layout.mouth.center;assert.ok(acceptsDrop(p,w.layout));w.advance(0,[command(seq++,'grab',{id:b.id,point:b.soft.center(),at:w.time}),command(seq++,'move',{point:p,at:w.time}),command(seq++,'drop',{point:p,at:w.time})]);assert.equal(w.caught,1);assert.equal(w.roundCaught,1);
 w.advance(0,[command(seq++,'drop',{point:p,at:w.time})]);assert.equal(w.caught,1);
});
test('sustained membrane tension can release a real snag before its lifetime expires',()=>{
 const w=started(),b=firstBag(w),c=treeCapsules(w.tree,w.time,w.wind).find(c=>c.a[1]>2&&c.a[1]<3),mid=c.a.map((v,i)=>(v+c.b[i])/2);
 const index=BAG_TEMPLATE.bodyIndices[20],p=b.soft.positions,center=b.soft.center(),offset=vertexAt(p,index).map((v,i)=>v-center[i]);
 b.soft.translateTo(mid.map((v,i)=>v-offset[i]));b.soft.previous.set(b.soft.positions);w.advance(1/60);
 assert.equal(b.state,'tethered');const before=b.pins.length;
 for(let frame=0;frame<18&&b.pins.length===before;frame++){
  const fixed=new Set(b.pins.map(pin=>pin.index));
  for(const id of BAG_TEMPLATE.bodyIndices)if(!fixed.has(id)){b.soft.positions[id*3]-=.35;b.soft.previous[id*3]-=.35;}
  w.advance(1/60);
 }
 assert.ok(b.pins.length<before,'local contact gives way under sustained material extension');
 assert.ok(w.time-b.snagAt<b.lifetime*.2);
});
function vertexAt(p,i){return Array.from(p.subarray(i*3,i*3+3));}
test('60% quota advances to a new tree and retains cumulative score',()=>{
 const w=started(34),tree=JSON.stringify(w.tree);let seq=2;
 for(let i=0;i<4;i++){while(!w.bags.some(b=>!b.resolved&&b.state!=='capturing'))w.advance(.1);collect(w,w.bags.find(b=>!b.resolved),seq);seq+=2;}
 assert.equal(w.caught,4);run(w,24-w.time);assert.equal(w.phase,'playing');assert.equal(w.round,2);assert.equal(w.caught,4);assert.equal(w.missed,2);assert.notEqual(JSON.stringify(w.tree),tree);assert.equal(w.roundCaught,0);
});
test('accepted release exactly at the deadline is processed before timeout',()=>{
 const w=started(),b=firstBag(w);w.advance(0,[command(2,'grab',{id:b.id,point:b.soft.center(),at:w.time})]);w.advance(22-w.time,[command(3,'drop',{point:w.layout.mouth.center,at:22})]);assert.equal(w.caught,1);assert.equal(w.missed,5);assert.equal(w.phase,'over');assert.equal(w.lastCommandSeq,3);
});
test('snapshot restores full continuing physics, totals, held target and command deduplication',()=>{
 const w=started(44),b=firstBag(w);w.advance(.1,[command(2,'grab',{id:b.id,point:[-.3,2,.8],at:w.time+.1})]);const state=w.snapshot(),copy=World.fromSnapshot(state);
 assert.notEqual(state.bags[0].positions,w.bags[0].soft.positions);w.advance(.05);copy.advance(.05);assert.deepEqual(copy.snapshot(),w.snapshot());
 copy.advance(0,[command(2,'drop',{point:copy.layout.mouth.center,at:copy.time})]);assert.equal(copy.caught,0);assert.equal(copy.heldId,b.id);
 copy.advance(0,[command(3,'cancel',{at:copy.time})]);assert.equal(copy.heldId,null);
});
test('all scheduled arrivals fit within the fixed 22-record pool under misses and long holds',()=>{
 for(const round of [1,8,30]){const w=started(60);w.round=round;w._beginRound(round);let max=0;for(let i=0;i<360;i++){if(i===2&&w.bags[0])w.advance(0,[command(2,'grab',{id:w.bags[0].id,point:[0,3,.8],at:w.time})]);w.advance(.1);max=Math.max(max,w.bags.length);assert.ok(w.bags.length<=22);}assert.ok(max>0);assert.equal(w.caught+w.missed,w.total);}
});
test('real game time is not slowed by bounded physics and restart changes generation',()=>{
 const w=started();w.advance(3);assert.equal(w.time,3);assert.equal(w.timeLeft,19);assert.ok(w.physicsSteps<=6);const before=JSON.stringify(w.tree);w.advance(0,[command(2,'restart',{seed:999,epoch:7,at:3})]);assert.equal(w.epoch,7);assert.equal(w.phase,'playing');assert.equal(w.round,1);assert.equal(w.caught,0);assert.equal(w.missed,0);assert.notEqual(JSON.stringify(w.tree),before);assert.equal(w.lastCommandSeq,2);
});
test('repeated missed drops reuse the same bag and cannot duplicate score or objects',()=>{
 const w=started(72);w._beginRound(30);let seq=2,max=0;
 for(let frame=0;frame<350;frame++){
  const bag=w.bags.find(b=>!b.resolved&&b.state!=='capturing');
  if(bag&&frame%3===0)w.advance(0,[command(seq++,'grab',{id:bag.id,point:bag.soft.center(),at:w.time}),command(seq++,'drop',{point:[0,3,.8],at:w.time})]);
  w.advance(.1);max=Math.max(max,w.bags.length);assert.equal(new Set(w.bags.map(b=>b.id)).size,w.bags.length);assert.ok(w.bags.length<=22);
 }
 assert.ok(max>0);assert.equal(w.caught,0);assert.equal(w.missed,22);assert.ok(w.schedule.every(item=>item.spawned&&item.resolved));
 const ids=w.events.map(event=>event.id);assert.equal(new Set(ids).size,ids.length);
});
test('release after the deadline cannot score and a missed bag is counted once',()=>{
 const w=started(99),bag=firstBag(w);w.advance(0,[command(2,'grab',{id:bag.id,point:bag.soft.center(),at:w.time})]);
 w.advance(23-w.time,[command(3,'drop',{point:w.layout.mouth.center,at:22.01})]);
 assert.equal(w.caught,0);assert.equal(w.missed,6);w.advance(10);assert.equal(w.missed,6);assert.equal(w.phase,'over');
});

test('capture retains the same deforming cloth and a supported physical receiver',()=>{
 const w=started(31),b=firstBag(w),soft=b.soft,id=b.id,receiverBefore=w.snapshot().collector.positions;
 collect(w,b,2);assert.equal(w.caught,1);assert.equal(b.soft,soft);
 // This fixture releases from outside the viewport; allow bounded physical ingress.
 for(let i=0;i<300&&!w.contents.some(c=>c.id===id);i++)w.advance(1/60);
 const stored=w.contents.find(c=>c.id===id);assert(stored);assert.equal(stored.soft,soft);
 const state=w.snapshot();assert.equal(state.collector.contents.length,1);
 assert.equal(state.collector.contents[0].id,id);assert.ok(state.collector.soft.positions);
 assert.notDeepEqual(state.collector.contents[0].positions,BAG_TEMPLATE.positions);
 assert.notDeepEqual(state.collector.positions,receiverBefore);
 const ys=[...stored.soft.positions].filter((_,i)=>i%3===1);
 assert.ok(Math.max(...ys)-Math.min(...ys)<.65,'the stored membrane physically crumples into a shallow pile');
 const restored=World.fromSnapshot(state);w.advance(1/60);restored.advance(1/60);assert.deepEqual(restored.snapshot(),w.snapshot());
});
test('a quick soft drag enters the receiver continuously before it is compressed',()=>{
 const w=new World({seed:31,aspect:16/9});w.advance(0,[command(1,'start',{at:0})]);const b=firstBag(w);
 b.soft.translateTo([2.5,3,.8]);b.soft.setVelocity([0,0,0]);const start=b.soft.center(),mouth=w.layout.mouth.center;let seq=2;
 w.advance(0,[command(seq++,'grab',{id:b.id,point:start,at:w.time})]);
 for(let i=1;i<=24;i++)w.advance(1/60,[command(seq++,'move',{point:start.map((v,a)=>v+(mouth[a]-v)*i/24),at:w.time+1/60})]);
 w.advance(0,[command(seq++,'drop',{point:mouth,at:w.time})]);
 let previous=b.soft.center(),largest=0;
 for(let i=0;i<150;i++){w.advance(1/60);const next=b.soft.center();largest=Math.max(largest,Math.hypot(...next.map((v,a)=>v-previous[a])));previous=next;}
 assert.ok(largest<.4,`capture jumps ${largest.toFixed(3)} world units in a frame`);
 assert.equal(w.caught,1);assert.ok(w.contents.some(v=>v.id===b.id));
});
test('local particle selection and captured contents survive an early next round',()=>{
 const w=started(54);let seq=2;
 for(let i=0;i<6;i++){
  while(!w.bags.some(b=>!b.resolved))w.advance(.05);
  const b=w.bags.find(b=>!b.resolved),index=BAG_TEMPLATE.bodyIndices[3];
  w.advance(0,[command(seq++,'grab',{id:b.id,particle:index,point:b.soft.center(),at:w.time})]);
  assert.equal(b.gripIndex,index);
  w.advance(0,[command(seq++,'drop',{point:w.layout.mouth.center,at:w.time})]);
 }
 assert.equal(w.phase,'between');w.advance(0,[command(seq++,'next',{at:w.time})]);
 assert.equal(w.round,2);assert.equal(w.contents.length,6);assert.equal(w.snapshot().collector.contents.length,6);
});
