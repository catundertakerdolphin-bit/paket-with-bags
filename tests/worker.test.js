import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';

function bridge(){
 const url=new URL('../src/worker.js',import.meta.url).href;
 const source=`const {parentPort}=require('node:worker_threads');const q=[];global.self={postMessage:(m,t)=>parentPort.postMessage(m,t)};parentPort.on('message',m=>self.onmessage?self.onmessage({data:m}):q.push(m));import(${JSON.stringify(url)}).then(()=>{for(const m of q)self.onmessage({data:m});});`;
 const worker=new Worker(source,{eval:true});let pending=null,error=null;
 worker.on('message',message=>{const p=pending;pending=null;p?.resolve(message);});worker.on('error',e=>{error=e;pending?.reject(e);pending=null;});
 return {worker,send(message){if(error)return Promise.reject(error);return new Promise((resolve,reject)=>{pending={resolve,reject};worker.postMessage(message);});}};
}
test('the actual module worker returns a 3D world and preserves input/snapshot generations',{timeout:25000},async()=>{
 const b=bridge();try{
  const init=await b.send({type:'init',epoch:7,options:{seed:123,aspect:1.5,epoch:7}});
  assert.equal(init.type,'state');assert.equal(init.epoch,7);assert.equal(init.state.phase,'ready');assert(init.state.tree.paths.length>4);assert(init.state.collector.positions.length>0);
  let reply=await b.send({type:'step',epoch:7,dt:1/60,commands:[{seq:1,at:0,type:'start'}]});assert.equal(reply.state.phase,'playing');assert.equal(reply.state.lastCommandSeq,1);
  for(let i=0;i<90;i++)reply=await b.send({type:'step',epoch:7,dt:1/60,commands:[]});
  assert(reply.state.bags.length>0);assert(reply.state.bags.some(x=>ArrayBuffer.isView(x.positions)));
  assert(reply.state.bags.every(x=>x.positions.every(Number.isFinite)));assert(reply.ms>=0);
  const restored=await b.send({type:'init',epoch:8,snapshot:{...reply.state,epoch:8}});assert.equal(restored.epoch,8);assert.equal(restored.state.caught,reply.state.caught);assert.equal(restored.state.bags.length,reply.state.bags.length);
 }finally{await b.worker.terminate();}
});
