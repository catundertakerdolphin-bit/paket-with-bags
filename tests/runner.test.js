import test from 'node:test';
import assert from 'node:assert/strict';
import { SimulationRunner } from '../src/runner.js';
import { World } from '../src/core/world.js';

class TestWorld {
  constructor({seed=1,epoch=1}={}) { Object.assign(this,{seed,epoch,time:0,lastCommandSeq:0,value:0,phase:'ready'}); }
  advance(dt,commands=[]) { this.time+=dt;for(const c of commands){if(c.seq<=this.lastCommandSeq)continue;this.lastCommandSeq=c.seq;if(c.type==='start')this.phase='playing';if(c.type==='drop')this.value++;} }
  snapshot(){return {seed:this.seed,epoch:this.epoch,time:this.time,lastCommandSeq:this.lastCommandSeq,value:this.value,phase:this.phase};}
  static fromSnapshot(s){return Object.assign(new TestWorld(s),s);}
}
function setup(){let now=0;const workers=[];const runner=new SimulationRunner({WorldClass:TestWorld,seed:9,clock:()=>now,workerFactory:()=>{const worker={sent:[],postMessage(m){this.sent.push(m);},terminate(){this.terminated=true;}};workers.push(worker);return worker;}});return{runner,workers,at(t){now=t;runner.frame(t);},ready(state=runner.state){workers.at(-1).onmessage({data:{type:'state',epoch:runner.epoch,state,ms:1}});},setTime(t){now=t;}};}

test('one job in flight, coalesced moves retain grab/drop ordering and elapsed time',()=>{
 const s=setup(),r=s.runner,w=s.workers[0];try{
  s.ready();r.send('start');r.send('grab',{id:'a',point:[1,2,.8]});s.at(20);assert.equal(w.sent.length,2);
  r.send('move',{point:[2,2,.8]});r.send('move',{point:[3,2,.8]});r.send('drop',{point:[3,1,.8]});
  for(const t of [30,40,60])s.at(t);assert.equal(w.sent.length,2);
  s.ready({...r.state,time:.02,lastCommandSeq:2});s.at(70);
  const step=w.sent.at(-1);assert(Math.abs(step.dt-.05)<1e-9);assert.deepEqual(step.commands.map(c=>c.type),['move','drop']);assert.equal(step.commands[0].point[0],3);
 }finally{r.dispose();}
});
test('visibility pause does not spend hidden seconds',()=>{
 const s=setup(),r=s.runner;try{s.ready();s.at(20);s.ready({...r.state,time:.02});r.pause(true);s.at(1020);s.setTime(1020);r.pause(false);s.at(1030);assert(Math.abs(s.workers[0].sent.at(-1).dt-.01)<1e-9);}finally{r.dispose();}
});
test('restart rejects old generation responses and starts one fresh worker',()=>{
 const s=setup(),r=s.runner,old=s.workers[0];try{s.ready();r.restart(17);assert(old.terminated);assert.equal(s.workers.length,2);old.onmessage({data:{type:'state',epoch:1,state:{...r.state,value:999},ms:0}});assert.equal(r.state.value,0);assert.equal(r.state.seed,17);s.ready();s.at(20);assert.equal(s.workers[1].sent.at(-1).commands[0].type,'start');}finally{r.dispose();}
});
test('failed worker restores confirmed state and replays unacknowledged input once',()=>{
 const s=setup(),r=s.runner;try{s.ready();r.send('start');s.at(20);s.ready({...r.state,time:.02,lastCommandSeq:1,phase:'playing'});r.send('drop',{point:[0,1,.8]});s.at(40);s.workers[0].onerror({preventDefault(){}});s.at(60);assert(r.failed);assert.equal(r.state.value,1);s.at(80);assert.equal(r.state.value,1);assert(Math.abs(r.state.time-.08)<1e-9);}finally{r.dispose();}
});

test('a drop after the real deadline cannot score during a render stall',()=>{
 let now=0;
 const r=new SimulationRunner({WorldClass:World,seed:9,clock:()=>now,workerFactory:()=>{throw new Error('force fallback');}});
 try{
  r.send('start');r.frame(now);
  now=1500;r.frame(now);
  const bag=r.state.bags[0];assert(bag);
  r.send('grab',{id:bag.id,point:bag.center});r.frame(now);
  now=21900;r.frame(now);assert.equal(r.state.phase,'playing');assert(r.state.heldId);
  now=22500;r.send('drop',{point:r.state.layout.mouth.center});
  now=22600;r.frame(now);
  assert.equal(r.state.caught,0);assert.equal(r.state.phase,'over');
 }finally{r.dispose();}
});
