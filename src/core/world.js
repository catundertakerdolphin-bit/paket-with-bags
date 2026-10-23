import {generateTree,hookAt,treeCapsules,treeSway} from './tree.js';
import {BAG_TEMPLATE,SoftBag} from './cloth.js';
import {roundConfig,makeLayout,acceptsDrop} from './rules.js';

const STEP=1/60,MAX_STEPS=6;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const clone=value=>structuredClone(value);
const validPoint=p=>Array.isArray(p)&&p.length>=3&&p.every(Number.isFinite);
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const seedFor=(seed,round)=>(Number(seed)^Math.imul(round,0x45d9f3b))>>>0;
const vertex=(p,i)=>Array.from(p.subarray(i*3,i*3+3));
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));

export class World {
 constructor({seed=1,aspect=1,epoch=1}={}){
  this.epoch=epoch;this.seed=seed;this.layout=makeLayout(aspect);this.phase='ready';this.round=1;this.time=0;
  this.caught=0;this.missed=0;this.roundCaught=0;this.roundMissed=0;this.bags=[];this.contents=[];this.heldId=null;this.target=null;
  this.lastCommandSeq=0;this.eventSerial=0;this.events=[];this.pendingCommands=[];this.physicsTime=0;this.physicsSteps=0;this.accumulator=0;this.collectorFill=0;this.collectorJolt=0;
  this._makeCollector();this._beginRound(1);this.phase='ready';
 }
 _beginRound(round){
  for(const bag of this.bags)if(bag.state==='capturing')this._store(bag);
  this.round=round;this.roundStart=this.time;this.roundCaught=0;this.roundMissed=0;this.plan=roundConfig(round,this.seed);this.total=this.plan.total;this.wind=this.plan.wind;this.timeLeft=this.plan.duration;
  this.tree=generateTree(seedFor(this.seed,round),{width:this.layout.treeWidth,height:5.15,originX:this.layout.treeX});
  this.schedule=this.plan.schedule.map(item=>({...item,id:`${this.epoch}:${round}:${item.index}`,spawned:false,resolved:false,arrivalAt:this.roundStart+item.arrivalAt,attachAt:this.roundStart+item.attachAt,hookId:this.tree.hooks[item.hookIndex%this.tree.hooks.length].id}));
  this.bags=[];this.heldId=null;this.target=null;this.accumulator=0;this.phase='playing';this.betweenUntil=null;
 }
 _event(kind,bag,point){
  this.events.push({id:`${this.epoch}:${this.round}:${++this.eventSerial}`,kind,bagId:bag?.id??null,point:[...(point??bag?.soft.center()??this.layout.mouth.center)],round:this.round,time:this.time});
  if(this.events.length>64)this.events.splice(0,this.events.length-64);
 }
 // Hooks describe seeded flight lanes only. A lane is never a cloth constraint.
 _hookCenter(item,time=this.time){const pair=hookAt(this.tree,item.hookId,time,this.wind);return [(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2-.18,(pair[0][2]+pair[1][2])/2];}
 _spawn(item){
  const point=this._hookCenter(item),missLane=item.index%5===4;
  const start=[this.layout.viewWidth*.5+.55,Math.min(5.45,point[1]+.65),point[2]+(missLane?1.4:(item.index%3-1)*.04)];
  const soft=new SoftBag({id:item.id,position:start,scale:.72,seed:seedFor(this.seed,item.index+this.round*101)});
  soft.setVelocity([-Math.min(5.8,4.6+this.wind*.12),.18,0]);
  this.bags.push({id:item.id,index:item.index,soft,state:'incoming',colorIndex:item.colorIndex,handles:0,remaining:1,resolved:false,arrivalAt:item.arrivalAt,attachAt:item.attachAt,lifetime:item.lifetime,hookId:item.hookId,start,grip:null,gripIndex:null,gripOffset:null,pins:[],snagAt:null,snagged:false,captureAt:null,releasedAt:null});
  item.spawned=true;
 }
 _resolve(bag,kind){
  if(bag.resolved)return;bag.resolved=true;const item=this.schedule.find(s=>s.id===bag.id);if(item)item.resolved=true;
  if(kind==='collected'){this.caught++;this.roundCaught++;this.collectorFill=Math.min(8,this.collectorFill+1);this._impactCollector();}
  else{this.missed++;this.roundMissed++;}
  this._event(kind,bag);if(this.heldId===bag.id){this.heldId=null;this.target=null;}
 }
 _checkRound(){
  if(this.phase!=='playing'||this.roundCaught+this.roundMissed<this.total)return;
  if(this.roundCaught>=this.plan.quota){this.phase='between';this.betweenUntil=this.time+2;}
  else this.phase='over';
  this.timeLeft=Math.max(0,this.roundStart+this.plan.duration-this.time);this._event('round');
 }
 _expire(){
  if(this.phase!=='playing')return;
  for(const item of this.schedule){
   if(item.resolved)continue;
   const bag=this.bags.find(b=>b.id===item.id);
   if(bag)this._resolve(bag,'missed');
   else{item.resolved=true;this.missed++;this.roundMissed++;this._event('missed',null,this._hookCenter(item));}
  }
  this.heldId=null;this.target=null;this.timeLeft=0;this.bags=this.bags.filter(b=>b.state==='capturing');this._checkRound();
 }
 _lifecycle(){
  if(this.phase!=='playing')return;
  this.timeLeft=Math.max(0,this.roundStart+this.plan.duration-this.time);
  for(const item of this.schedule)if(!item.spawned&&!item.resolved&&this.time>=item.arrivalAt)this._spawn(item);
  for(const bag of this.bags){
   if(bag.resolved||bag.state==='held')continue;
   if(bag.state==='tethered'){
    const remaining=clamp(1-(this.time-bag.snagAt)/bag.lifetime,0,1);
    const keep=remaining<=0?0:remaining<=.35?1:bag.pins.length;
    if(keep<bag.pins.length){bag.pins=bag.pins.slice(0,keep);this._event('unhooked',bag);}
    bag.handles=bag.pins.length;bag.remaining=remaining;
    if(!bag.pins.length){bag.state='loose';bag.releasedAt=this.time;}
   }
   if(bag.state==='incoming'||bag.state==='loose'){
    const p=bag.soft.center(),xLimit=this.layout.viewWidth*.62+.9;
    if(p[0]<-xLimit||p[1]<-.9||p[1]>7.8||Math.abs(p[2])>5)this._resolve(bag,'missed');
   }
  }
  this._finishCaptures();
  this._checkRound();
 }
 _simulate(span){
  this.accumulator=Math.min(.1,this.accumulator+Math.max(0,span));
  const steps=Math.min(this._stepBudget,Math.floor((this.accumulator+1e-10)/STEP));
  this.accumulator-=steps*STEP;this._stepBudget-=steps;this.physicsSteps+=steps;
  if(!this._stepBudget)this.accumulator=0;
  if(!steps)return;
  const capsules=treeCapsules(this.tree,this.time,this.wind);
  for(let step=0;step<steps;step++){
   this.physicsTime+=STEP;
   for(const bag of this.bags){
    if(bag.state==='capturing'){this._settleBag(bag);continue;}
    const pins=bag.pins.map(pin=>({index:pin.index,point:this._pinPoint(pin)}));
    const grip=bag.state==='held'?{index:bag.gripIndex,point:bag.grip.map((v,i)=>v+bag.gripOffset[i])}:null;
    bag.soft.step(STEP,{wind:bag.state==='held'?-this.wind*.3:-this.wind,time:this.physicsTime,pins,grip,capsules});
    if(bag.state==='tethered')this._contactTension(bag);
    if(!grip&&!bag.pins.length&&!bag.snagged&&!bag.resolved)this._trySnag(bag);
   }
   for(const bag of this.contents)if(bag.entryTime==null||bag.settleLeft>0)this._settleBag(bag);
   this.collectorSoft.step(STEP,{wind:-this.wind*.09,time:this.physicsTime,pins:this.collectorSupports,containment:{center:this.layout.mouth.center,halfWidth:Infinity,halfDepth:Infinity,floor:.085,ceiling:Infinity}});
   this.collectorJolt=Math.max(0,this.collectorJolt-STEP*2.7);
  }
  this._finishCaptures();
 }
 _advanceTo(to,deferDeadline=false){
  to=Math.max(this.time,to);
  while(this.time<to-1e-10){
   if(this.phase==='between'&&this.betweenUntil<=to){const span=this.betweenUntil-this.time;this.time=this.betweenUntil;this._simulate(span);this._beginRound(this.round+1);continue;}
   const deadline=this.roundStart+this.plan.duration;
   if(this.phase==='playing'&&(to>deadline+1e-10||(!deferDeadline&&to>=deadline))){const span=Math.max(0,deadline-this.time);this.time=deadline;this._lifecycle();this._simulate(span);this._expire();continue;}
   const span=to-this.time;this.time=to;this._lifecycle();this._simulate(span);
  }
 }
 _command(command){
  const {type}=command;
  if(type==='resize'){
   const before=this.layout.mouth.center;this.layout=makeLayout(command.aspect);const after=this.layout.mouth.center;
   for(const b of this.contents)b.soft.translateTo(b.soft.center().map((v,i)=>v+after[i]-before[i]));
   for(const b of this.bags)if(b.state==='tethered'){b.pins=[];b.handles=0;b.state='loose';b.releasedAt=this.time;}
   this.tree=generateTree(seedFor(this.seed,this.round),{width:this.layout.treeWidth,height:5.15,originX:this.layout.treeX});this._makeCollector();return;
  }
  if(type==='restart'){
   this.seed=command.seed??((Number(this.seed)+0x9e3779b9)>>>0);this.epoch=command.epoch??this.epoch+1;this.caught=0;this.missed=0;this.events=[];this.eventSerial=0;this.collectorFill=0;this.collectorJolt=0;this.contents=[];this.bags=[];this._makeCollector();this._beginRound(1);return;
  }
  if(type==='start'&&this.phase==='ready'){this._beginRound(1);return;}
  if(type==='next'&&this.phase==='between'){this._beginRound(this.round+1);return;}
  if(this.phase!=='playing')return;
  const deadline=this.roundStart+this.plan.duration;
  if(type==='grab'&&this.time<deadline&&!this.heldId&&validPoint(command.point)){
   const bag=this.bags.find(b=>b.id===command.id&&!b.resolved&&b.state!=='capturing');if(!bag)return;
   const center=bag.soft.center();let index=command.particle;
   if(!Number.isInteger(index)||index<0||index>=BAG_TEMPLATE.particleCount)index=BAG_TEMPLATE.bodyIndices.reduce((best,i)=>distance(vertex(bag.soft.positions,i),center)<distance(vertex(bag.soft.positions,best),center)?i:best,BAG_TEMPLATE.bodyIndices[0]);
   bag.state='held';bag.pins=[];bag.handles=0;bag.grip=[...command.point];bag.gripIndex=index;bag.gripOffset=vertex(bag.soft.positions,index).map((v,i)=>v-center[i]);this.heldId=bag.id;this.target=[...command.point];this._event('grab',bag);return;
  }
  const held=this.bags.find(b=>b.id===this.heldId);
  if(!held)return;
  if(type==='move'&&validPoint(command.point)){held.grip=[...command.point];this.target=[...command.point];return;}
  if(type==='drop'||type==='cancel'){
   if(type==='drop'&&validPoint(command.point)&&this.time<=deadline+1e-9&&acceptsDrop(command.point,this.layout)){
    held.state='capturing';held.captureAt=this.time;held.captureProgress=0;held.entryTime=null;held.settleLeft=1.8;held.pileIndex=this.caught%8;held.captureGripStart=vertex(held.soft.positions,held.gripIndex);held.grip=null;this._resolve(held,'collected');this._checkRound();
   }else{held.state='loose';held.handles=0;held.pins=[];held.grip=null;held.releasedAt=this.time;this.heldId=null;this.target=null;}
  }
 }
 advance(dt,commands=[]){
  const end=this.time+Math.max(0,Number.isFinite(dt)?dt:0);this.physicsSteps=0;this._stepBudget=MAX_STEPS;
  this.pendingCommands.push(...commands.filter(c=>c&&Number.isFinite(c.seq)&&c.seq>this.lastCommandSeq).map(c=>({...c,at:Number.isFinite(c.at)?c.at:this.time})));
  this.pendingCommands.sort((a,b)=>a.at-b.at||a.seq-b.seq);
  while(this.pendingCommands.length&&this.pendingCommands[0].at<=end+1e-9){
   const at=clamp(this.pendingCommands[0].at,this.time,end);this._advanceTo(at,true);
   while(this.pendingCommands.length&&this.pendingCommands[0].at<=at+1e-9){const c=this.pendingCommands.shift();if(c.seq<=this.lastCommandSeq)continue;this._command(c);this.lastCommandSeq=c.seq;}
   if(this.phase==='playing'&&this.time>=this.roundStart+this.plan.duration)this._expire();
  }
  this._advanceTo(end);this._lifecycle();
  if(this.phase==='playing'&&this.time>=this.roundStart+this.plan.duration)this._expire();
  return this;
 }
 _makeCollector(){
  const {mouth,collectorScale:scale}=this.layout,p=BAG_TEMPLATE.positions;
  const ys=BAG_TEMPLATE.bodyIndices.map(i=>p[i*3+1]),top=Math.max(...ys),bottom=Math.min(...ys);
  const zs=BAG_TEMPLATE.bodyIndices.map(i=>p[i*3+2]),depth=Math.max(...zs)-Math.min(...zs);
  const sy=(mouth.center[1]-.1)/((top-bottom)*scale),sz=mouth.depth/(depth*scale);
  this.collectorSoft=new SoftBag({id:'collector',position:[mouth.center[0],.1-bottom*scale*sy,mouth.center[2]],scale,shape:[1,sy,sz],seed:this.seed});
  const rim=BAG_TEMPLATE.rimIndices||BAG_TEMPLATE.bodyIndices.filter(i=>p[i*3+1]>top-.001);
  this.collectorSupports=[...rim,...BAG_TEMPLATE.handleTips].map(index=>({index,point:vertex(this.collectorSoft.positions,index)}));
 }
 _impactCollector(){
  this.collectorJolt=1;const p=this.collectorSoft.positions,old=this.collectorSoft.previous;
  for(const index of BAG_TEMPLATE.bodyIndices){const i=index*3;old[i]-=(p[i]-this.layout.mouth.center[0])*.018;old[i+1]+=.006;old[i+2]-=(p[i+2]-this.layout.mouth.center[2])*.018;}
  for(const b of this.contents)b.settleLeft=Math.max(b.settleLeft||0,.8);
 }
 _pinPoint(pin){const a=treeSway(this.tree,this.time,this.wind),c=Math.cos(a),s=Math.sin(a),p=pin.local;return[this.tree.origin[0]+p[0]*c-p[1]*s,p[0]*s+p[1]*c,p[2]];}
 _trySnag(bag){
  const contacts=bag.soft.contacts||[];if(!contacts.length)return;
  const first=contacts[0],other=contacts.find(c=>c.index!==first.index&&distance(c.point,first.point)>.07&&distance(c.point,first.point)<.34);
  const a=treeSway(this.tree,this.time,this.wind),c=Math.cos(a),s=Math.sin(a);
  bag.pins=[first,...(other?[other]:[])].map(hit=>{const x=hit.point[0]-this.tree.origin[0],y=hit.point[1];return{index:hit.index,local:[x*c+y*s,-x*s+y*c,hit.point[2]],point:[...hit.point]};});
  bag.state='tethered';bag.handles=bag.pins.length;bag.snagAt=this.time;bag.snagged=true;bag.tensionTime=0;bag.remaining=1;this._event('snagged',bag);
 }
 _contactTension(bag){
  const indices=new Set(bag.pins.map(pin=>pin.index)),p=bag.soft.positions;let extension=0;
  for(const edge of bag.soft.edges)if(indices.has(edge.a)||indices.has(edge.b))extension=Math.max(extension,distance(vertex(p,edge.a),vertex(p,edge.b))/Math.max(edge.length,1e-6)-1);
  bag.tensionTime=extension>.4?(bag.tensionTime||0)+STEP:Math.max(0,(bag.tensionTime||0)-STEP*2);
  if(bag.tensionTime<.1||this.time-bag.snagAt<.12)return;
  bag.pins.pop();bag.handles=bag.pins.length;bag.tensionTime=0;this._event('unhooked',bag);
  if(!bag.pins.length){bag.state='loose';bag.releasedAt=this.time;}
 }
 _settleBag(bag){
  const {mouth}=this.layout,index=bag.pileIndex||0,angle=index*2.399;
  bag.captureProgress=(bag.captureProgress||0)+STEP;
  const floor=.13+Math.floor(index/3)*.1,center=[mouth.center[0]+Math.cos(angle)*mouth.width*.15,floor+.14,mouth.center[2]+Math.sin(angle)*mouth.depth*.12];
  const actual=bag.soft.center(),entrance=[center[0],mouth.center[1]+.12,center[2]];
  if(bag.entryTime==null&&Math.abs(actual[0]-center[0])<mouth.width*.13&&Math.abs(actual[2]-center[2])<mouth.depth*.2&&actual[1]<mouth.center[1]+.2)bag.entryTime=0;
  if(bag.entryTime!=null){bag.entryTime+=STEP;bag.settleLeft=Math.max(0,bag.settleLeft-STEP);}
  const progress=clamp((bag.entryTime||0)/.9,0,1);
  const target=bag.entryTime==null?lerp(bag.captureGripStart||actual,entrance,clamp(bag.captureProgress/.45,0,1)):lerp(entrance,[center[0],center[1]+.15,center[2]],clamp(bag.entryTime/.7,0,1));
  const grip=bag.entryTime==null||bag.entryTime<.7?{index:bag.gripIndex??BAG_TEMPLATE.bodyIndices[0],point:target}:null;
  const containment=bag.entryTime==null?null:{center:lerp(mouth.center,center,progress),halfWidth:mouth.width*(.55-.3*progress),halfDepth:mouth.depth*(.55-.25*progress),floor,ceiling:floor+.28+(1-progress)*(mouth.center[1]+.5-floor)};
  bag.soft.step(STEP,{wind:-this.wind*.025,time:this.physicsTime,grip,containment});
 }
 _store(bag){
  if(this.contents.some(b=>b.id===bag.id))return;
  bag.state='stored';bag.settleLeft=Math.max(1.8,bag.settleLeft||0);this.contents.push(bag);if(this.contents.length>8)this.contents.shift();
 }
 _finishCaptures(){
  for(const b of this.bags)if(b.state==='capturing'&&b.entryTime>1.25)this._store(b);
  this.bags=this.bags.filter(b=>b.state!=='stored'&&!(b.resolved&&b.state!=='capturing'));
 }
 _bagSnapshot({soft,...bag}){return{...clone(bag),...soft.snapshot(),center:soft.center()};}
 _collector(){const soft=this.collectorSoft.snapshot();return{positions:soft.positions,soft,supports:clone(this.collectorSupports),fill:this.collectorFill,jolt:this.collectorJolt,contents:this.contents.map(b=>this._bagSnapshot(b))};}
 snapshot(){
  return {epoch:this.epoch,seed:this.seed,phase:this.phase,round:this.round,time:this.time,timeLeft:this.timeLeft,wind:this.wind,total:this.total,plan:clone(this.plan),caught:this.caught,missed:this.missed,roundCaught:this.roundCaught,roundMissed:this.roundMissed,tree:clone(this.tree),layout:clone(this.layout),bags:this.bags.map(b=>this._bagSnapshot(b)),collector:this._collector(),schedule:clone(this.schedule),lastCommandSeq:this.lastCommandSeq,events:clone(this.events),heldId:this.heldId,target:clone(this.target),roundStart:this.roundStart,betweenUntil:this.betweenUntil,eventSerial:this.eventSerial,physicsTime:this.physicsTime,physicsSteps:this.physicsSteps,accumulator:this.accumulator,pendingCommands:clone(this.pendingCommands)};
 }
 static fromSnapshot(state){
  const world=Object.create(World.prototype);
  for(const key of ['epoch','seed','phase','round','time','timeLeft','wind','total','caught','missed','roundCaught','roundMissed','lastCommandSeq','heldId','roundStart','betweenUntil','eventSerial','physicsTime','physicsSteps','accumulator'])world[key]=state[key];
  for(const key of ['plan','tree','layout','schedule','events','target','pendingCommands'])world[key]=clone(state[key]);
  world.collectorFill=state.collector.fill;world.collectorJolt=state.collector.jolt;
  const restore=source=>{const {positions,previous,center,...rest}=source;return {...clone(rest),soft:SoftBag.fromSnapshot(source)};};
  world.bags=state.bags.map(restore);world.contents=(state.collector.contents||[]).map(restore);
  if(state.collector.soft){world.collectorSoft=SoftBag.fromSnapshot(state.collector.soft);world.collectorSupports=clone(state.collector.supports);}else world._makeCollector();
  return world;
 }
}
