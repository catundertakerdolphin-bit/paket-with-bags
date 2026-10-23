import {World} from './core/world.js';
let world,epoch=0;
function transfers(value,result=[],seen=new Set()){
  if(!value||typeof value!=='object')return result;
  if(ArrayBuffer.isView(value)){if(!seen.has(value.buffer)){seen.add(value.buffer);result.push(value.buffer);}return result;}
  for(const item of Object.values(value))transfers(item,result,seen);return result;
}
self.onmessage=event=>{
  const message=event.data;
  try{
    const start=performance.now();
    if(message.type==='init'){epoch=message.epoch;world=message.snapshot?World.fromSnapshot(message.snapshot):new World(message.options);world.epoch=epoch;}
    else if(message.type==='step'&&message.epoch===epoch&&world)world.advance(message.dt,message.commands);
    else return;
    const state=world.snapshot();self.postMessage({type:'state',epoch,state,ms:performance.now()-start},transfers(state));
  }catch(error){self.postMessage({type:'error',epoch:message.epoch,message:error.message||String(error)});}
};
