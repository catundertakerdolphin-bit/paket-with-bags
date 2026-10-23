// One physics request at a time; render/input remain independent of its speed.
export class SimulationRunner {
  constructor({WorldClass,seed=1,aspect=1,clock=()=>performance.now(),workerFactory=null,onState=()=>{}}) {
    Object.assign(this,{WorldClass,seed,aspect,clock,onState});
    this.workerFactory=workerFactory||(()=>new Worker(new URL('./worker.js',import.meta.url),{type:'module',name:'paket-wind-physics'}));
    this.epoch=0;this.disposed=false;this.paused=false;this.initialize(false);
  }
  initialize(autoStart) {
    clearTimeout(this.watchdog);this.worker?.terminate();this.epoch++;
    this.queue=[];this.pending=new Map();this.sequence=0;this.time=0;this.lastSentTime=0;this.lastFrame=this.clock();
    this.ready=false;this.inflight=true;this.failed=false;this.world=null;this.ms=0;
    this.state=new this.WorldClass({seed:this.seed,aspect:this.aspect,epoch:this.epoch}).snapshot();this.onState(this.state);
    try {
      const worker=this.worker=this.workerFactory();
      worker.onmessage=event=>this.receive(event.data);
      worker.onerror=event=>{event.preventDefault?.();if(worker===this.worker)this.fallback();};
      worker.postMessage({type:'init',epoch:this.epoch,options:{seed:this.seed,aspect:this.aspect,epoch:this.epoch}});
      this.watchdog=setTimeout(()=>{if(!this.ready)this.fallback();},4500);
    } catch {this.fallback();}
    if(autoStart)this.send('start');
  }
  send(type,payload={}) {
    if(this.disposed)return;
    this.tick(this.clock());
    const command={...payload,type,seq:++this.sequence,at:this.time};
    const last=this.queue.at(-1);
    if(type==='move'&&last?.type==='move'){this.queue.pop();this.pending.delete(last.seq);}
    this.queue.push(command);this.pending.set(command.seq,command);return command.seq;
  }
  frame(now=this.clock()) {
    if(this.disposed)return;
    this.tick(now);
    if(this.paused)return;
    if(!this.ready||this.inflight)return;
    const span=Math.max(0,this.time-this.lastSentTime),commands=this.queue.splice(0);this.lastSentTime=this.time;
    if(this.failed){const start=this.clock();this.world.advance(span,commands);this.ms=this.clock()-start;this.accept(this.world.snapshot());return;}
    this.inflight=true;
    try{this.worker.postMessage({type:'step',epoch:this.epoch,dt:span,commands});}catch{this.fallback();}
  }
  receive(message) {
    if(this.disposed||message.epoch!==this.epoch||this.failed)return;
    if(message.type==='error'){this.fallback();return;}
    if(message.type!=='state')return;
    clearTimeout(this.watchdog);this.ready=true;this.inflight=false;this.ms=message.ms||0;this.accept(message.state);
  }
  accept(state) {
    if(!state)return;this.state=state;
    const ack=state.lastCommandSeq||0;for(const seq of this.pending.keys())if(seq<=ack)this.pending.delete(seq);
    this.onState(state);
  }
  fallback() {
    if(this.failed||this.disposed)return;
    clearTimeout(this.watchdog);this.failed=true;this.worker?.terminate();this.worker=null;
    this.world=this.WorldClass.fromSnapshot(this.state);this.ready=true;this.inflight=false;
    this.queue=[...this.pending.values()].sort((a,b)=>a.seq-b.seq);this.lastSentTime=this.state.time||0;
  }
  tick(now) {
    const current=Math.max(now,this.lastFrame),dt=(current-this.lastFrame)/1000;this.lastFrame=current;
    if(!this.paused)this.time+=dt;
  }
  pause(value) {this.tick(this.clock());this.paused=!!value;}
  resize(aspect) {this.aspect=aspect;this.send('resize',{aspect});}
  restart(seed=this.seed) {this.seed=seed;this.initialize(true);}
  dispose() {this.disposed=true;clearTimeout(this.watchdog);this.worker?.terminate();this.pending.clear();this.queue.length=0;}
}
