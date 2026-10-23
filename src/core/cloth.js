import {capsuleTriangle} from './contact.js';
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const at=(p,i)=>[p[i*3],p[i*3+1],p[i*3+2]];

function makeTemplate(){
 const positions=[],indices=[],bodyIndices=[],handleTips=[],rimIndices=[];
 const perimeter=[[-.34,.13],[-.19,.17],[0,.18],[.19,.17],[.34,.13],[.38,.025],[.34,-.13],[.19,-.17],[0,-.18],[-.19,-.17],[-.34,-.13],[-.38,-.025]];
 const rimHeight=[.96,.52,.28,.52,.96,1.03,.94,.50,.26,.50,.94,1.03],rows=7,sides=perimeter.length;
 const levels=[-.49,-.35,-.17,.025,.21];
 for(let row=0;row<rows;row++){
  const t=row/(rows-1),width=.86+.14*Math.sin(t*Math.PI/2),depth=.68+.32*Math.sin(t*Math.PI/2);
  for(let j=0;j<sides;j++){
   const id=positions.length/3,y=row<5?levels[row]:.21+(rimHeight[j]-.21)*(row-4)/2;
   positions.push(perimeter[j][0]*width,y,perimeter[j][1]*depth);
   if(y<=.30)bodyIndices.push(id);if(row===rows-1)rimIndices.push(id);
  }
 }
 for(let row=0;row<rows-1;row++)for(let j=0;j<sides;j++){
  const a=row*sides+j,b=row*sides+(j+1)%sides,c=a+sides,d=b+sides;
  if((row+j)%2)indices.push(a,b,d,a,d,c);else indices.push(a,b,c,b,d,c);
 }
 const bottom=positions.length/3;positions.push(0,-.50,0);bodyIndices.push(bottom);
 for(let j=0;j<sides;j++)indices.push(bottom,(j+1)%sides,j);
 // Side bands are continuations of the same shell, not attached arched ribbons.
 handleTips.push((rows-1)*sides+11,(rows-1)*sides+5);
 const yaw=.34,c=Math.cos(yaw),s=Math.sin(yaw);let maxX=0;
 for(let i=0;i<positions.length;i+=3){const x=positions[i],z=positions[i+2];positions[i]=x*c+z*s;positions[i+2]=-x*s+z*c;maxX=Math.max(maxX,Math.abs(positions[i]));}
 for(let i=0;i<positions.length;i+=3)positions[i]*=.37/maxX;
 let centerY=0;for(const i of bodyIndices)centerY+=positions[i*3+1];centerY/=bodyIndices.length;
 for(let i=1;i<positions.length;i+=3)positions[i]-=centerY;
 return Object.freeze({positions:new Float32Array(positions),indices:new Uint16Array(indices),bodyIndices:Object.freeze(bodyIndices),handleTips:Object.freeze(handleTips),rimIndices:Object.freeze(rimIndices),particleCount:positions.length/3});
}
export const BAG_TEMPLATE=makeTemplate();

function hingeGeometry(p,h,g){
 const a=h.a*3,b=h.b*3,c=h.c*3,d=h.d*3,ex=p[b]-p[a],ey=p[b+1]-p[a+1],ez=p[b+2]-p[a+2],l2=ex*ex+ey*ey+ez*ez,l=Math.sqrt(l2);
 if(l<1e-8){g.fill(0);return 0;}
 const cx=p[c]-p[a],cy=p[c+1]-p[a+1],cz=p[c+2]-p[a+2],dx=p[d]-p[a],dy=p[d+1]-p[a+1],dz=p[d+2]-p[a+2];
 const ux=ey*cz-ez*cy,uy=ez*cx-ex*cz,uz=ex*cy-ey*cx,vx=dy*ez-dz*ey,vy=dz*ex-dx*ez,vz=dx*ey-dy*ex,un=ux*ux+uy*uy+uz*uz,vn=vx*vx+vy*vy+vz*vz;
 if(un<1e-14||vn<1e-14){g.fill(0);return 0;}
 const s=(cx*ex+cy*ey+cz*ez)/l2,t=(dx*ex+dy*ey+dz*ez)/l2;
 g[6]=-l*ux/un;g[7]=-l*uy/un;g[8]=-l*uz/un;g[9]=-l*vx/vn;g[10]=-l*vy/vn;g[11]=-l*vz/vn;
 for(let j=0;j<3;j++){g[j]=-(1-s)*g[6+j]-(1-t)*g[9+j];g[3+j]=-s*g[6+j]-t*g[9+j];}
 return Math.atan2(((uy*vz-uz*vy)*ex+(uz*vx-ux*vz)*ey+(ux*vy-uy*vx)*ez)/l,ux*vx+uy*vy+uz*vz);
}
function topology(rest){
 const edges=[],areas=[],hinges=[],edgeMap=new Map(),adjacency=Array.from({length:BAG_TEMPLATE.particleCount},()=>new Set()),g=new Float64Array(12),ix=BAG_TEMPLATE.indices;
 for(let t=0;t<ix.length;t+=3){
  const a=ix[t],b=ix[t+1],c=ix[t+2],A=a*3,B=b*3,C=c*3;
  const ux=rest[B]-rest[A],uy=rest[B+1]-rest[A+1],uz=rest[B+2]-rest[A+2],vx=rest[C]-rest[A],vy=rest[C+1]-rest[A+1],vz=rest[C+2]-rest[A+2];
  areas.push({a,b,c,area:Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)*.5});
  for(const [u,v,opposite]of[[a,b,c],[b,c,a],[c,a,b]]){
   adjacency[u].add(v);adjacency[v].add(u);const key=u<v?u+':'+v:v+':'+u,existing=edgeMap.get(key);
   if(existing){const h={a:existing.a,b:existing.b,c:existing.opposite,d:opposite,lambda:0};h.angle=hingeGeometry(rest,h,g);h.complianceScale=g.reduce((sum,v)=>sum+v*v,0);hinges.push(h);}
   else{const U=u*3,V=v*3,e={a:u,b:v,opposite,length:Math.hypot(rest[V]-rest[U],rest[V+1]-rest[U+1],rest[V+2]-rest[U+2])};edgeMap.set(key,e);edges.push(e);}
  }
 }
 return {edges,areas,hinges,adjacency:adjacency.map(s=>[...s])};
}

/** Thin film: only local surface constraints retain material length, never a volume cage. */
export class SoftBag{
 constructor({id,position=[0,0,0],scale=1,seed=1,shape=[1,1,1]}={}){
  this.id=id;this.seed=seed;this.scale=scale;this.shape=[...shape];this.elapsed=0;this.previousStep=1/180;
  this.rest=Float32Array.from(BAG_TEMPLATE.positions,(v,i)=>v*scale*this.shape[i%3]);
  this.positions=this.rest.slice();this.previous=this.positions.slice();Object.assign(this,topology(this.rest));
  this.constraints=this.edges;this.contacts=[];this.weights=new Float64Array(BAG_TEMPLATE.particleCount);this.forces=new Float64Array(this.positions.length);this.gradient=new Float64Array(12);
  this.translateTo(position);
 }
 center(){const center=[0,0,0],p=this.positions;for(const i of BAG_TEMPLATE.bodyIndices)for(let a=0;a<3;a++)center[a]+=p[i*3+a];return center.map(v=>v/BAG_TEMPLATE.bodyIndices.length);}
 translateTo(point){const c=this.center();for(let i=0;i<this.positions.length;i++){const d=point[i%3]-c[i%3];this.positions[i]+=d;this.previous[i]+=d;}return this;}
 setVelocity(velocity){for(let i=0;i<this.positions.length;i++)this.previous[i]=this.positions[i]-velocity[i%3]*this.previousStep;return this;}
 impulse(point,delta,radius=.4){for(let i=0;i<BAG_TEMPLATE.particleCount;i++){const a=i*3,d=Math.hypot(this.positions[a]-point[0],this.positions[a+1]-point[1],this.positions[a+2]-point[2]),weight=Math.max(0,1-d/radius);for(let j=0;j<3;j++)this.previous[a+j]-=delta[j]*weight*this.previousStep;}return this;}
 step(dt,{wind=0,time=this.elapsed,anchors=[null,null],pins=[],grip=null,capsules=[],containment=null}={}){
  this.contacts=[];if(!(dt>0)||!Number.isFinite(dt))return;
  const span=Math.min(dt,1/30),steps=Math.max(1,Math.ceil(span/(1/180))),h=span/steps,allPins=[...pins];
  for(let i=0;i<2;i++)if(anchors?.[i])allPins.push({index:BAG_TEMPLATE.handleTips[i],point:anchors[i]});
  for(let i=0;i<steps;i++)this.#step(h,wind,time+i*h,allPins,grip,capsules,containment);
  const seen=new Set();this.contacts=this.contacts.filter(c=>{const k=c.index+':'+c.capsuleIndex;if(seen.has(k))return false;seen.add(k);c.point=at(this.positions,c.index);return true;}).slice(0,12);
  this.elapsed=time+span;
 }
 #step(h,wind,time,pins,grip,capsules,containment){
  const p=this.positions,old=this.previous,w=this.weights,f=this.forces,count=BAG_TEMPLATE.particleCount,speed=Math.abs(wind),air=Math.min(1,speed/.9),phase=(Number(this.seed)||1)*.67;
  w.fill(1);for(const pin of pins)if(pin.index>=0&&pin.index<count)w[pin.index]=0;
  const localGrip=Number.isInteger(grip?.index)&&grip.index>=0&&grip.index<count;
  let hand=null;
  if(localGrip){
   const before=at(p,grip.index),delta=grip.point.map((v,i)=>v-before[i]),distance=Math.hypot(...delta),fraction=Math.min(1,30*h/Math.max(distance,1e-9));
   hand={index:grip.index,point:before.map((v,i)=>v+delta[i]*fraction),previous:before};
   w[grip.index]=0;this.#grip(hand);
  }
  for(let i=0;i<count;i++){
   const j=i*3,spatial=this.rest[j]*7+this.rest[j+1]*4+this.rest[j+2]*11,flutter=Math.sin(time*3.3+phase+spatial)*.7+Math.sin(time*7.1+spatial*1.7)*.3;
   f[j]=wind*(.32+.075*Math.sin(time*5.2+phase+spatial*.7));
   f[j+1]=-.82+Math.sin(time*4.1+phase+spatial*.55)*(.05+Math.min(1.5,speed*.5))*air;
   f[j+2]=(Math.sin(time*2.2+phase)*(.12+speed*.035)+flutter*Math.min(6,.2+speed*2.5))*air;
  }
  for(const face of this.areas){
   const a=face.a*3,b=face.b*3,c=face.c*3,ux=p[b]-p[a],uy=p[b+1]-p[a+1],uz=p[b+2]-p[a+2],vx=p[c]-p[a],vy=p[c+1]-p[a+1],vz=p[c+2]-p[a+2];
   let nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const n=Math.hypot(nx,ny,nz);if(n<1e-10)continue;nx/=n;ny/=n;nz/=n;
   const gustZ=Math.sin(time*5.1+phase+(a+b+c)*.013)*(.45+speed*.08)*air,normalWind=nx*wind*.7+ny*.12*air+nz*gustZ,pressure=clamp(normalWind*Math.abs(normalWind)*n*.28,-3,3);
   for(const id of[face.a,face.b,face.c]){const j=id*3;f[j]+=nx*pressure;f[j+1]+=ny*pressure;f[j+2]+=nz*pressure;}
  }
  const damping=Math.exp(-.85*h),ratio=h/Math.max(1e-9,this.previousStep),maxMove=(localGrip?30:6)*h;
  for(let i=0;i<count;i++)if(w[i])for(let axis=0;axis<3;axis++){const j=i*3+axis,current=p[j],velocity=clamp((current-old[j])*ratio*damping,-maxMove,maxMove);old[j]=current;p[j]=current+velocity+f[j]*h*h;}
  this.previousStep=h;for(const hinge of this.hinges)hinge.lambda=0;
  for(let pass=0;pass<(localGrip?5:3);pass++){
   this.#edges(pass%2===1);if(pass===1)this.#areas();if(pass===2)this.#bends(h,!!containment);
   this.#pins(pins);if(hand)this.#grip(hand);if(containment)this.#contain(containment);
  }
  if(grip?.point&&!localGrip){const center=this.center(),alpha=1-Math.exp(-28*h);for(let i=0;i<p.length;i++)if(w[Math.floor(i/3)]){const delta=(grip.point[i%3]-center[i%3])*alpha;p[i]+=delta;old[i]+=delta*.5;}}
  if(capsules.length)this.#contact(capsules);this.#pins(pins);if(hand)this.#grip(hand);if(containment)this.#contain(containment);
 }
 #pins(pins){for(const pin of pins){if(pin.index<0||pin.index>=BAG_TEMPLATE.particleCount)continue;const a=pin.index*3;for(let d=0;d<3;d++)this.positions[a+d]=this.previous[a+d]=pin.point[d];}}
 #grip(hand){
  // Only the picked particle is kinematic. Its speed-limited target is advanced
  // once per substep; surrounding film follows through the local constraints.
  const a=hand.index*3;for(let d=0;d<3;d++){this.positions[a+d]=hand.point[d];this.previous[a+d]=hand.previous[d];}
 }
 #edges(reverse){
  const p=this.positions,w=this.weights;
  for(let i=reverse?this.edges.length-1:0;reverse?i>=0:i<this.edges.length;i+=reverse?-1:1){
   const e=this.edges[i],a=e.a*3,b=e.b*3,dx=p[b]-p[a],dy=p[b+1]-p[a+1],dz=p[b+2]-p[a+2],length=Math.hypot(dx,dy,dz),total=w[e.a]+w[e.b];if(length<1e-9||!total)continue;
   // A coarse film patch cannot resolve every tiny wrinkle. Compression yields;
   // tension stays stiff, so gusts buckle the sheet instead of moving a rigid cage.
   const target=length<e.length*.35?e.length*.35:e.length,stiffness=length>e.length?.98:length<e.length*.35?.3:.025;
   const correction=(length-target)/length/total*stiffness;
   for(let d=0;d<3;d++){const v=(d===0?dx:d===1?dy:dz)*correction;p[a+d]+=v*w[e.a];p[b+d]-=v*w[e.b];}
  }
 }
 #areas(){
  const p=this.positions,w=this.weights;
  for(const t of this.areas){
   const a=t.a*3,b=t.b*3,c=t.c*3,x=p[b]-p[a],y=p[b+1]-p[a+1],z=p[b+2]-p[a+2],u=p[c]-p[a],v=p[c+1]-p[a+1],s=p[c+2]-p[a+2];
   let nx=y*s-z*v,ny=z*u-x*s,nz=x*v-y*u,l=Math.hypot(nx,ny,nz);if(l<1e-10)continue;nx/=l;ny/=l;nz/=l;
   const bx=(v*nz-s*ny)*.5,by=(s*nx-u*nz)*.5,bz=(u*ny-v*nx)*.5,cx=(ny*z-nz*y)*.5,cy=(nz*x-nx*z)*.5,cz=(nx*y-ny*x)*.5,ax=-bx-cx,ay=-by-cy,az=-bz-cz;
   const den=w[t.a]*(ax*ax+ay*ay+az*az)+w[t.b]*(bx*bx+by*by+bz*bz)+w[t.c]*(cx*cx+cy*cy+cz*cz);if(den<1e-12)continue;
   const area=l*.5,target=area<t.area*.28?t.area*.28:area>t.area*1.1?t.area*1.1:area;
   const f=clamp(-(area-target)/den,-.4,.4)*.15;
   p[a]+=w[t.a]*f*ax;p[a+1]+=w[t.a]*f*ay;p[a+2]+=w[t.a]*f*az;p[b]+=w[t.b]*f*bx;p[b+1]+=w[t.b]*f*by;p[b+2]+=w[t.b]*f*bz;p[c]+=w[t.c]*f*cx;p[c+1]+=w[t.c]*f*cy;p[c+2]+=w[t.c]*f*cz;
  }
 }
 #bends(h,compressed){
  const p=this.positions,w=this.weights,g=this.gradient,compliance=compressed?.008:.004;
  for(const hinge of this.hinges){
   // Rest-gradient normalization keeps narrow neckline triangles as soft as the
   // broad film panels, instead of accidentally turning them into rigid ribs.
   const alpha=compliance*Math.max(1,hinge.complianceScale)/(h*h);
   const angle=hingeGeometry(p,hinge,g),C=wrap(angle-hinge.angle),ids=[hinge.a,hinge.b,hinge.c,hinge.d];let denom=alpha;
   for(let j=0;j<4;j++)denom+=w[ids[j]]*(g[j*3]**2+g[j*3+1]**2+g[j*3+2]**2);
   if(denom<1e-9)continue;const dl=clamp((-C-alpha*hinge.lambda)/denom,-.025,.025);hinge.lambda+=dl;
   for(let j=0;j<4;j++){const a=ids[j]*3,f=w[ids[j]]*dl;for(let d=0;d<3;d++)p[a+d]+=f*g[j*3+d];}
  }
 }
 #contain(box){
  const p=this.positions,old=this.previous,c=box.center||[0,0,0],min=[c[0]-box.halfWidth,box.floor,c[2]-box.halfDepth],max=[c[0]+box.halfWidth,box.ceiling,c[2]+box.halfDepth];
  for(let i=0;i<BAG_TEMPLATE.particleCount;i++)if(this.weights[i])for(let axis=0;axis<3;axis++){
   const a=i*3+axis,lower=Number.isFinite(min[axis])?min[axis]:-Infinity,upper=Number.isFinite(max[axis])?max[axis]:Infinity,next=clamp(p[a],lower,upper),delta=next-p[a];p[a]=next;old[a]+=delta*.78;
  }
 }
 #contact(capsules){
  const p=this.positions,old=this.previous,w=this.weights,skin=.008*this.scale;
  let minX=Infinity,minY=Infinity,minZ=Infinity,maxX=-Infinity,maxY=-Infinity,maxZ=-Infinity;
  for(let i=0;i<p.length;i+=3){minX=Math.min(minX,p[i]);maxX=Math.max(maxX,p[i]);minY=Math.min(minY,p[i+1]);maxY=Math.max(maxY,p[i+1]);minZ=Math.min(minZ,p[i+2]);maxZ=Math.max(maxZ,p[i+2]);}
  for(let ci=0;ci<capsules.length;ci++){
   const cap=capsules[ci],a=cap.a,b=cap.b,r=cap.radius+skin;
   if(Math.max(a[0],b[0])+r<minX||Math.min(a[0],b[0])-r>maxX||Math.max(a[1],b[1])+r<minY||Math.min(a[1],b[1])-r>maxY||Math.max(a[2],b[2])+r<minZ||Math.min(a[2],b[2])-r>maxZ)continue;
   const corrected=new Uint8Array(BAG_TEMPLATE.particleCount);
   for(let i=0;i<BAG_TEMPLATE.particleCount;i++){
    if(!w[i])continue;const j=i*3,dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2],l2=dx*dx+dy*dy+dz*dz,t=l2?clamp(((p[j]-a[0])*dx+(p[j+1]-a[1])*dy+(p[j+2]-a[2])*dz)/l2,0,1):0;
    let nx=p[j]-a[0]-dx*t,ny=p[j+1]-a[1]-dy*t,nz=p[j+2]-a[2]-dz*t,d=Math.hypot(nx,ny,nz);if(d>=r)continue;
    const depth=r-d;if(d<1e-8){nx=0;ny=0;nz=1;}else{nx/=d;ny/=d;nz/=d;}
    for(let axis=0;axis<3;axis++){const delta=(axis===0?nx:axis===1?ny:nz)*depth;p[j+axis]+=delta;old[j+axis]+=delta*.85;}
    corrected[i]=1;
    this.contacts.push({index:i,point:at(p,i),capsuleIndex:ci});
   }
   for(const face of this.areas){
    const ids=[face.a,face.b,face.c],hit=capsuleTriangle(a,b,r,at(p,ids[0]),at(p,ids[1]),at(p,ids[2]));if(!hit||hit.depth<=0)continue;
    let den=0;for(let k=0;k<3;k++)if(!corrected[ids[k]])den+=hit.weights[k]**2*w[ids[k]];if(den<1e-9)continue;
    let closest=ids[0],largest=-1;
    for(let k=0;k<3;k++){
     const i=ids[k],weight=hit.weights[k];if(w[i]&&weight>largest){largest=weight;closest=i;}
     const amount=corrected[i]?0:Math.min(r*1.3,hit.depth*weight/den)*w[i];
     for(let axis=0;axis<3;axis++){const delta=hit.normal[axis]*amount;p[i*3+axis]+=delta;old[i*3+axis]+=delta*.85;}
    }
    this.contacts.push({index:closest,point:at(p,closest),capsuleIndex:ci});
   }
  }
 }
 snapshot(){return{id:this.id,seed:this.seed,scale:this.scale,shape:[...this.shape],elapsed:this.elapsed,previousStep:this.previousStep,positions:this.positions.slice(),previous:this.previous.slice()};}
 static fromSnapshot(state){const bag=new SoftBag({id:state.id,seed:state.seed,scale:state.scale,shape:state.shape||[1,1,1]});bag.positions=new Float32Array(state.positions);bag.previous=new Float32Array(state.previous);bag.elapsed=state.elapsed||0;bag.previousStep=state.previousStep||1/180;return bag;}
}
