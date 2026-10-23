import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../src/core/world.js';
import {acceptsDrop} from '../src/core/rules.js';
const command=(seq,type,rest={})=>({seq,type,...rest});
function started(seed=11){const w=new World({seed});w.advance(0,[command(1,'start',{at:0})]);return w;}
function run(w,seconds,step=.1){for(let t=0;t<seconds-1e-9;t+=step)w.advance(Math.min(step,seconds-t));return w.snapshot();}
function firstBag(w){for(let i=0;i<30&&!w.bags.length;i++)w.advance(.1);return w.bags[0];}
function collect(w,bag,seq){const p=w.layout.mouth.center;w.advance(0,[command(seq,'grab',{id:bag.id,point:bag.soft.center(),at:w.time}),command(seq+1,'drop',{point:p,at:w.time})]);}

test('ready world has a real tree and receiver and no automatic win',()=>{
 const w=new World({seed:12});let s=w.snapshot();assert.equal(s.phase,'ready');assert.equal(s.bags.length,0);assert.ok(s.tree.hooks.length>=8);assert.ok(s.collector.positions.length>0);assert.equal(s.timeLeft,22);
 w.advance(30);assert.equal(w.phase,'ready');w.advance(0,[command(1,'start',{at:w.time})]);run(w,23);s=w.snapshot();assert.equal(s.phase,'over');assert.equal(s.caught,0);assert.equal(s.missed,6);assert.equal(s.roundMissed,6);
});
test('real incoming cloth attaches then loses exactly one and both handles',()=>{
 const w=started();w.advance(1.1);let b=w.bags[0];assert.equal(b.state,'tethered');assert.equal(b.handles,2);
 const item=w.schedule[0];run(w,item.attachAt+item.lifetime*.66-w.time);b=w.bags.find(v=>v.id===item.id);assert.equal(b.handles,1);assert.ok(b.remaining<.35);
 run(w,item.attachAt+item.lifetime+.02-w.time);b=w.bags.find(v=>v.id===item.id);assert.equal(b.handles,0);assert.equal(b.state,'loose');assert.ok(b.soft.positions.every(Number.isFinite));
});
test('held bag is wind safe, shared mouth accepts exactly once, and free release is recapturable',()=>{
 const w=started();let b=firstBag(w),seq=2;w.advance(0,[command(seq++,'grab',{id:b.id,point:b.soft.center(),at:w.time})]);run(w,10);assert.equal(b.state,'held');assert.equal(w.missed,0);
 w.advance(0,[command(seq++,'drop',{point:[0,3,.8],at:w.time})]);assert.equal(b.state,'loose');assert.equal(w.caught,0);
 const p=w.layout.mouth.center;assert.ok(acceptsDrop(p,w.layout));w.advance(0,[command(seq++,'grab',{id:b.id,point:b.soft.center(),at:w.time}),command(seq++,'move',{point:p,at:w.time}),command(seq++,'drop',{point:p,at:w.time})]);assert.equal(w.caught,1);assert.equal(w.roundCaught,1);
 w.advance(0,[command(seq++,'drop',{point:p,at:w.time})]);assert.equal(w.caught,1);
});
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
