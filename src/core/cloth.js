const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function makeTemplate() {
 const positions=[],indices=[],bodyIndices=[],handleTips=[];
 const perimeter=[[-.33,.13],[0,.15],[.33,.13],[.37,0],[.33,-.13],[0,-.15],[-.33,-.13],[-.37,0]];
 const levels=[-.44,-.18,.1,.32];
 for(let row=0;row<4;row++)for(let j=0;j<8;j++) {positions.push(perimeter[j][0]*(row===0?.86:1),levels[row],perimeter[j][1]*(row===0?.8:1));bodyIndices.push(bodyIndices.length);}
 for(let row=0;row<3;row++)for(let j=0;j<8;j++){const a=row*8+j,b=row*8+(j+1)%8,c=a+8,d=b+8;indices.push(a,b,c,b,d,c);}
 const bottom=positions.length/3;positions.push(0,-.445,0);bodyIndices.push(bottom);
 for(let j=0;j<8;j++)indices.push(bottom,(j+1)%8,j);
 const arch=[[-.26,.31],[-.27,.48],[-.18,.65],[0,.715],[.18,.65],[.27,.48],[.26,.31]];
 for(let side=0;side<2;side++) {
  const start=positions.length/3,z=side===0?.137:-.137;
  for(let j=0;j<arch.length;j++) {
   const prev=arch[Math.max(0,j-1)],next=arch[Math.min(arch.length-1,j+1)],dx=next[0]-prev[0],dy=next[1]-prev[1],length=Math.hypot(dx,dy),nx=-dy/length*.024,ny=dx/length*.024;
   positions.push(arch[j][0]+nx,arch[j][1]+ny,z,arch[j][0]-nx,arch[j][1]-ny,z);
   if(j){const a=start+(j-1)*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
  }
  const left=side===0?24:30,right=side===0?26:28;
  indices.push(left,start,start+1,right,start+12,start+13);
  handleTips.push(start+6);
 }
 let bodyY=0;for(const i of bodyIndices)bodyY+=positions[i*3+1];bodyY/=bodyIndices.length;
 for(let i=1;i<positions.length;i+=3)positions[i]-=bodyY;
 return Object.freeze({positions:new Float32Array(positions),indices:new Uint16Array(indices),handleTips:Object.freeze(handleTips),bodyIndices:Object.freeze(bodyIndices),particleCount:positions.length/3});
}
export const BAG_TEMPLATE=makeTemplate();

function buildConstraints(scale) {
 const constraints=[],keys=new Set(),p=BAG_TEMPLATE.positions;
 const add=(a,b,stiffness=1)=>{
  const key=`${Math.min(a,b)}:${Math.max(a,b)}`;if(keys.has(key))return;keys.add(key);
  const ai=a*3,bi=b*3;constraints.push({a,b,length:Math.hypot(p[ai]-p[bi],p[ai+1]-p[bi+1],p[ai+2]-p[bi+2])*scale,stiffness});
 };
 for(let i=0;i<BAG_TEMPLATE.indices.length;i+=3){const t=BAG_TEMPLATE.indices;add(t[i],t[i+1]);add(t[i+1],t[i+2]);add(t[i+2],t[i]);}
 // Long sparse links stand in for membrane bending, rather than costly self-contact.
 for(let row=0;row<4;row++)for(let j=0;j<8;j++)add(row*8+j,row*8+(j+2)%8,.18);
 for(let row=0;row<2;row++)for(let j=0;j<8;j++)add(row*8+j,(row+2)*8+j,.12);
 for(let row=0;row<4;row++)for(const [a,b]of[[0,6],[1,5],[2,4]])add(row*8+a,row*8+b,.055);
 for(const start of [33,47])for(let j=0;j<5;j++){add(start+j*2,start+(j+2)*2,.16);add(start+j*2+1,start+(j+2)*2+1,.16);}
 return constraints;
}

/** Fixed-budget 3D position-based cloth. One mesh has only 61 moving particles. */
export class SoftBag {
 constructor({id,position=[0,0,0],scale=1,seed=1}={}) {
  this.id=id;this.seed=seed;this.scale=scale;this.elapsed=0;
  this.positions=Float32Array.from(BAG_TEMPLATE.positions,v=>v*scale);this.previous=this.positions.slice();
  this.constraints=buildConstraints(scale);this.translateTo(position);
 }
 center() {
  const center=[0,0,0],p=this.positions;
  for(const i of BAG_TEMPLATE.bodyIndices)for(let axis=0;axis<3;axis++)center[axis]+=p[i*3+axis];
  return center.map(v=>v/BAG_TEMPLATE.bodyIndices.length);
 }
 translateTo(point) {
  const center=this.center();for(let i=0;i<this.positions.length;i++){const d=point[i%3]-center[i%3];this.positions[i]+=d;this.previous[i]+=d;}return this;
 }
 step(dt,{wind=0,time=this.elapsed,anchors=[null,null],grip=null,capsules=[]}={}) {
  if(!(dt>0)||!Number.isFinite(dt))return;
  const span=Math.min(dt,1/30),steps=Math.max(1,Math.ceil(span/(1/120))),h=span/steps;
  for(let i=0;i<steps;i++)this.#step(h,wind,time+i*h,anchors,grip,capsules);
  this.elapsed=time+span;
 }
 #step(h,wind,time,anchors,grip,capsules) {
  const p=this.positions,old=this.previous,count=BAG_TEMPLATE.particleCount,pinned=new Int8Array(count);
  for(let handle=0;handle<2;handle++)if(anchors?.[handle])pinned[BAG_TEMPLATE.handleTips[handle]]=1;
  const speed=Math.abs(wind),phase=(Number(this.seed)||1)*.67,damping=Math.exp(-2.2*h),maxMove=5*h;
  for(let i=0;i<count;i++) {
   if(pinned[i])continue;const n=i*3;
   const flutter=Math.sin(time*7.3+phase+i*.67)*.32+Math.sin(time*11.1+i*.17)*.13;
   const forces=[wind*(.4+flutter*.13),-.82,Math.sin(time*2.2+phase)*(.12+speed*.035)+flutter*(.2+speed*.055)];
   for(let axis=0;axis<3;axis++){const j=n+axis,position=p[j],velocity=clamp((position-old[j])*damping,-maxMove,maxMove);old[j]=position;p[j]=position+velocity+forces[axis]*h*h;}
  }
  for(let pass=0;pass<5;pass++) {
   for(const c of this.constraints){const a=c.a*3,b=c.b*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2],length=Math.hypot(dx,dy,dz);if(length<1e-9)continue;
    const wa=pinned[c.a]?0:1,wb=pinned[c.b]?0:1,total=wa+wb;if(!total)continue;
    const correction=(length-c.length)/length*c.stiffness/total;
    for(let axis=0;axis<3;axis++){const delta=axis===0?dx:axis===1?dy:dz;p[a+axis]+=delta*correction*wa;p[b+axis]-=delta*correction*wb;}
   }
   this.#anchors(anchors);
   if(grip?.point){const center=this.center(),alpha=1-Math.exp(-28*h);for(let i=0;i<p.length;i++){if(pinned[Math.floor(i/3)])continue;const delta=(grip.point[i%3]-center[i%3])*alpha/5;p[i]+=delta;old[i]+=delta*.5;}}
  }
  if(capsules.length)this.#contact(capsules,pinned);
  this.#anchors(anchors);
 }
 #anchors(anchors) {
  for(let handle=0;handle<2;handle++)if(anchors?.[handle]){const i=BAG_TEMPLATE.handleTips[handle]*3;for(let axis=0;axis<3;axis++)this.positions[i+axis]=this.previous[i+axis]=anchors[handle][axis];}
 }
 #contact(capsules,pinned) {
  const p=this.positions,old=this.previous,skin=.009*this.scale;
  for(let i=0;i<BAG_TEMPLATE.particleCount;i++){
   if(pinned[i])continue;const j=i*3;
   for(const capsule of capsules){const a=capsule.a,b=capsule.b,radius=capsule.radius+skin;
    if(p[j]<Math.min(a[0],b[0])-radius||p[j]>Math.max(a[0],b[0])+radius||p[j+1]<Math.min(a[1],b[1])-radius||p[j+1]>Math.max(a[1],b[1])+radius||p[j+2]<Math.min(a[2],b[2])-radius||p[j+2]>Math.max(a[2],b[2])+radius)continue;
    const dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],length2=dx*dx+dy*dy+dz*dz;
    const t=length2?clamp(((p[j]-a[0])*dx+(p[j+1]-a[1])*dy+(p[j+2]-a[2])*dz)/length2,0,1):0;
    let nx=p[j]-a[0]-dx*t,ny=p[j+1]-a[1]-dy*t,nz=p[j+2]-a[2]-dz*t;const distance=Math.hypot(nx,ny,nz);
    if(distance>=radius)continue;let amount;if(distance<1e-7){nx=0;ny=0;nz=1;amount=radius;}else amount=radius/distance-1;
    for(let axis=0;axis<3;axis++){const shift=(axis===0?nx:axis===1?ny:nz)*amount;p[j+axis]+=shift;old[j+axis]+=shift*.8;}
   }
  }
 }
 snapshot(){return {id:this.id,seed:this.seed,scale:this.scale,elapsed:this.elapsed,positions:this.positions.slice(),previous:this.previous.slice()};}
 static fromSnapshot(state){const bag=new SoftBag({id:state.id,seed:state.seed,scale:state.scale});bag.positions=new Float32Array(state.positions);bag.previous=new Float32Array(state.previous);bag.elapsed=state.elapsed||0;return bag;}
}
