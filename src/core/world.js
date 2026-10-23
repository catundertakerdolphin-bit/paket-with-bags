import {generateTree,hookAt,treeCapsules} from './tree.js';
import {BAG_TEMPLATE,SoftBag} from './cloth.js';
import {roundConfig,makeLayout,acceptsDrop} from './rules.js';

const STEP=1/60,MAX_STEPS=6;
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const clone=value=>structuredClone(value);
const validPoint=p=>Array.isArray(p)&&p.length>=3&&p.every(Number.isFinite);
const lerp=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
const seedFor=(seed,round)=>(Number(seed)^Math.imul(round,0x45d9f3b))>>>0;
const TIP_Y=(BAG_TEMPLATE.positions[BAG_TEMPLATE.handleTips[0]*3+1]+BAG_TEMPLATE.positions[BAG_TEMPLATE.handleTips[1]*3+1])/2;

export class World {
 constructor({seed=1,aspect=1,epoch=1}={}){
  this.epoch=epoch;this.seed=seed;this.layout=makeLayout(aspect);this.phase='ready';this.round=1;this.time=0;
  this.caught=0;this.missed=0;this.roundCaught=0;this.roundMissed=0;this.bags=[];this.heldId=null;this.target=null;
  this.lastCommandSeq=0;this.eventSerial=0;this.events=[];this.pendingCommands=[];this.physicsTime=0;this.physicsSteps=0;this.accumulator=0;this.collectorFill=0;this.collectorJolt=0;
  this._beginRound(1);this.phase='ready';
 }
 _beginRound(round){
  this.round=round;this.roundStart=this.time;this.roundCaught=0;this.roundMissed=0;this.plan=roundConfig(round,this.seed);this.total=this.plan.total;this.wind=this.plan.wind;this.timeLeft=this.plan.duration;
  this.tree=generateTree(seedFor(this.seed,round),{width:this.layout.treeWidth,height:5.15,originX:this.layout.treeX});
  this.schedule=this.plan.schedule.map(item=>({...item,id:`${this.epoch}:${round}:${item.index}`,spawned:false,resolved:false,arrivalAt:this.roundStart+item.arrivalAt,attachAt:this.roundStart+item.attachAt,hookId:this.tree.hooks[item.hookIndex%this.tree.hooks.length].id}));
  this.bags=[];this.heldId=null;this.target=null;this.accumulator=0;this.phase='playing';this.betweenUntil=null;
 }
 _event(kind,bag,point){
  this.events.push({id:`${this.epoch}:${this.round}:${++this.eventSerial}`,kind,bagId:bag?.id??null,point:[...(point??bag?.soft.center()??this.layout.mouth.center)],round:this.round,time:this.time});
  if(this.events.length>64)this.events.splice(0,this.events.length-64);
 }
 _hookCenter(item,time=this.time){const pair=hookAt(this.tree,item.hookId,time,this.wind);return [(pair[0][0]+pair[1][0])/2,(pair[0][1]+pair[1][1])/2-TIP_Y*.72,(pair[0][2]+pair[1][2])/2];}
 _spawn(item){
  const point=this._hookCenter(item),start=[this.layout.viewWidth*.55+.65,point[1]+.2,point[2]];
  const soft=new SoftBag({id:item.id,position:start,scale:.72,seed:seedFor(this.seed,item.index+this.round*101)});
  this.bags.push({id:item.id,index:item.index,soft,state:'incoming',colorIndex:item.colorIndex,handles:0,remaining:1,resolved:false,arrivalAt:item.arrivalAt,attachAt:item.attachAt,lifetime:item.lifetime,hookId:item.hookId,start,grip:null,captureAt:null,releasedAt:null});
  item.spawned=true;
 }
 _resolve(bag,kind){
  if(bag.resolved)return;bag.resolved=true;const item=this.schedule.find(s=>s.id===bag.id);if(item)item.resolved=true;
  if(kind==='collected'){this.caught++;this.roundCaught++;this.collectorFill=Math.min(8,this.collectorFill+1);this.collectorJolt=1;}
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
   if(bag.state==='incoming'&&this.time>=bag.attachAt){bag.state='tethered';bag.handles=2;bag.soft.translateTo(this._hookCenter(bag));}
   if(bag.state==='tethered'){
    const remaining=clamp(1-(this.time-bag.attachAt)/bag.lifetime,0,1),handles=remaining<=0?0:remaining<=.35?1:2;
    if(handles<bag.handles)this._event('unhooked',bag);
    bag.handles=handles;bag.remaining=remaining;
    if(!handles){bag.state='loose';bag.releasedAt=this.time;}
   }
   if(bag.state==='loose'){
    const p=bag.soft.center(),xLimit=this.layout.viewWidth*.62+.9;
    if(Math.abs(p[0])>xLimit||p[1]<-1.1||p[1]>this.layout.viewHeight*.5+5)this._resolve(bag,'missed');
   }
  }
  this.bags=this.bags.filter(b=>!(b.resolved&&b.state!=='capturing')&&!(b.state==='capturing'&&this.time-b.captureAt>.55));
  this._checkRound();
 }
 _simulate(span){
  this.accumulator=Math.min(.1,this.accumulator+Math.max(0,span));
  const steps=Math.min(this._stepBudget,Math.floor((this.accumulator+1e-10)/STEP));
  this.accumulator-=steps*STEP;this._stepBudget-=steps;this.physicsSteps+=steps;
  if(!this._stepBudget)this.accumulator=0;
  if(!steps)return;
  const capsules=this.phase==='playing'?treeCapsules(this.tree,this.time,this.wind):[];
  for(let step=0;step<steps;step++){
   this.physicsTime+=STEP;
   for(const bag of this.bags){
    const anchors=[null,null];let grip=null;
    if(bag.state==='incoming'){
     const progress=clamp((this.time-bag.arrivalAt)/Math.max(.001,bag.attachAt-bag.arrivalAt),0,1);
     bag.soft.translateTo(lerp(bag.start,this._hookCenter(bag),1-(1-progress)**2));
    }else if(bag.state==='tethered'){
     const pair=hookAt(this.tree,bag.hookId,this.time,this.wind);anchors[0]=pair[0];if(bag.handles>1)anchors[1]=pair[1];
    }else if(bag.state==='held')grip={point:[...bag.grip]};
    else if(bag.state==='capturing'){
     const mouth=this.layout.mouth.center,target=[mouth[0],mouth[1]-.36,mouth[2]];grip={point:target};
    }
    bag.soft.step(STEP,{wind:bag.state==='held'?-this.wind*.25:-this.wind,time:this.physicsTime,anchors,grip,capsules:bag.state==='tethered'?capsules:[]});
   }
   this.collectorJolt=Math.max(0,this.collectorJolt-STEP*2.7);
  }
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
   this.layout=makeLayout(command.aspect);this.tree=generateTree(seedFor(this.seed,this.round),{width:this.layout.treeWidth,height:5.15,originX:this.layout.treeX});return;
  }
  if(type==='restart'){
   this.seed=command.seed??((Number(this.seed)+0x9e3779b9)>>>0);this.epoch=command.epoch??this.epoch+1;this.caught=0;this.missed=0;this.events=[];this.eventSerial=0;this.collectorFill=0;this.collectorJolt=0;this._beginRound(1);return;
  }
  if(type==='start'&&this.phase==='ready'){this._beginRound(1);return;}
  if(type==='next'&&this.phase==='between'){this._beginRound(this.round+1);return;}
  if(this.phase!=='playing')return;
  const deadline=this.roundStart+this.plan.duration;
  if(type==='grab'&&this.time<deadline&&!this.heldId&&validPoint(command.point)){
   const bag=this.bags.find(b=>b.id===command.id&&!b.resolved&&b.state!=='capturing');if(!bag)return;
   bag.state='held';bag.handles=0;bag.grip=[...command.point];this.heldId=bag.id;this.target=[...command.point];this._event('grab',bag);return;
  }
  const held=this.bags.find(b=>b.id===this.heldId);
  if(!held)return;
  if(type==='move'&&validPoint(command.point)){held.grip=[...command.point];this.target=[...command.point];return;}
  if(type==='drop'||type==='cancel'){
   if(type==='drop'&&validPoint(command.point)&&this.time<=deadline+1e-9&&acceptsDrop(command.point,this.layout)){
    held.state='capturing';held.captureAt=this.time;held.soft.translateTo(command.point);held.grip=null;this._resolve(held,'collected');this._checkRound();
   }else{held.state='loose';held.handles=0;held.grip=null;held.releasedAt=this.time;this.heldId=null;this.target=null;}
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
 _collector(){
  const {mouth,collectorScale:scale}=this.layout,p=BAG_TEMPLATE.positions,out=new Float32Array(p.length),body=BAG_TEMPLATE.bodyIndices;
  let top=-Infinity,bottom=Infinity;for(const i of body){top=Math.max(top,p[i*3+1]);bottom=Math.min(bottom,p[i*3+1]);}
  const vertical=(mouth.center[1]-.1)/(top-bottom),jolt=this.collectorJolt;
  for(let i=0;i<p.length;i+=3){
   const height=(p[i+1]-bottom)/(top-bottom),sway=Math.sin(this.time*2.3+height*2)*.012*height;
   out[i]=mouth.center[0]+p[i]*scale+sway;
   out[i+1]=.1+(p[i+1]-bottom)*vertical-Math.sin(clamp(height,0,1)*Math.PI)*jolt*.055;
   out[i+2]=mouth.center[2]+p[i+2]*scale+Math.sin(this.time*2.8+i)*.009*height;
  }
  return {positions:out,fill:this.collectorFill,jolt};
 }
 snapshot(){
  return {epoch:this.epoch,seed:this.seed,phase:this.phase,round:this.round,time:this.time,timeLeft:this.timeLeft,wind:this.wind,total:this.total,plan:clone(this.plan),caught:this.caught,missed:this.missed,roundCaught:this.roundCaught,roundMissed:this.roundMissed,tree:clone(this.tree),layout:clone(this.layout),bags:this.bags.map(({soft,...bag})=>({...clone(bag),...soft.snapshot(),center:soft.center()})),collector:this._collector(),schedule:clone(this.schedule),lastCommandSeq:this.lastCommandSeq,events:clone(this.events),heldId:this.heldId,target:clone(this.target),roundStart:this.roundStart,betweenUntil:this.betweenUntil,eventSerial:this.eventSerial,physicsTime:this.physicsTime,physicsSteps:this.physicsSteps,accumulator:this.accumulator,pendingCommands:clone(this.pendingCommands)};
 }
 static fromSnapshot(state){
  const world=Object.create(World.prototype);
  for(const key of ['epoch','seed','phase','round','time','timeLeft','wind','total','caught','missed','roundCaught','roundMissed','lastCommandSeq','heldId','roundStart','betweenUntil','eventSerial','physicsTime','physicsSteps','accumulator'])world[key]=state[key];
  for(const key of ['plan','tree','layout','schedule','events','target','pendingCommands'])world[key]=clone(state[key]);
  world.collectorFill=state.collector.fill;world.collectorJolt=state.collector.jolt;
  world.bags=state.bags.map(source=>{const {positions,previous,center,...rest}=source;return {...clone(rest),soft:SoftBag.fromSnapshot(source)};});
  return world;
 }
}
