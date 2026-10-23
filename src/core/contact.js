// Narrow phase for a thin triangle and a branch capsule. No scene/renderer state.
const EPS=1e-12;
const clamp01=v=>Math.max(0,Math.min(1,v));
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const at=(a,d,t)=>[a[0]+d[0]*t,a[1]+d[1]*t,a[2]+d[2]*t];

function closestSegments(a,b,c,d){
  const u=sub(b,a),v=sub(d,c),r=sub(a,c),uu=dot(u,u),vv=dot(v,v),vr=dot(v,r);
  let s=0,t=0;
  if(uu<=EPS){t=vv>EPS?clamp01(vr/vv):0;}
  else{
    const ur=dot(u,r);
    if(vv<=EPS)s=clamp01(-ur/uu);
    else{
      const uv=dot(u,v),den=uu*vv-uv*uv;
      s=den>EPS?clamp01((uv*vr-ur*vv)/den):0;
      t=(uv*s+vr)/vv;
      if(t<0){t=0;s=clamp01(-ur/uu);}
      else if(t>1){t=1;s=clamp01((uv-ur)/uu);}
    }
  }
  return {axisPoint:at(a,u,s),point:at(c,v,t),t};
}

function closestTriangle(p,a,b,c){
  const ab=sub(b,a),ac=sub(c,a),ap=sub(p,a),normal=cross(ab,ac);
  if(dot(normal,normal)<=EPS){
    const vertices=[a,b,c];let best=null;
    for(let i=0;i<3;i++){
      const hit=closestSegments(p,p,vertices[i],vertices[(i+1)%3]),delta=sub(p,hit.point),d2=dot(delta,delta);
      if(!best||d2<best.d2){const weights=[0,0,0];weights[i]=1-hit.t;weights[(i+1)%3]=hit.t;best={point:hit.point,weights,d2};}
    }
    return best;
  }
  const d1=dot(ab,ap),d2=dot(ac,ap);
  if(d1<=0&&d2<=0)return {point:[...a],weights:[1,0,0]};
  const bp=sub(p,b),d3=dot(ab,bp),d4=dot(ac,bp);
  if(d3>=0&&d4<=d3)return {point:[...b],weights:[0,1,0]};
  const vc=d1*d4-d3*d2;
  if(vc<=0&&d1>=0&&d3<=0){const t=d1/(d1-d3);return {point:at(a,ab,t),weights:[1-t,t,0]};}
  const cp=sub(p,c),d5=dot(ab,cp),d6=dot(ac,cp);
  if(d6>=0&&d5<=d6)return {point:[...c],weights:[0,0,1]};
  const vb=d5*d2-d1*d6;
  if(vb<=0&&d2>=0&&d6<=0){const t=d2/(d2-d6);return {point:at(a,ac,t),weights:[1-t,0,t]};}
  const va=d3*d6-d5*d4;
  if(va<=0&&d4-d3>=0&&d5-d6>=0){const t=(d4-d3)/((d4-d3)+(d5-d6));return {point:at(b,sub(c,b),t),weights:[0,1-t,t]};}
  const inverse=1/(va+vb+vc),v=vb*inverse,w=vc*inverse;
  return {point:[a[0]+ab[0]*v+ac[0]*w,a[1]+ab[1]*v+ac[1]*w,a[2]+ab[2]*v+ac[2]*w],weights:[1-v-w,v,w]};
}

/**
 * The capsule axis [a,b] has radius r. Returns the closest triangle material
 * point, axis point, outward contact normal, penetration and barycentric weights.
 * Face interiors are tested, so a branch need not touch a mesh vertex.
 */
export function capsuleTriangle(a,b,r,A,B,C){
  r=Math.max(0,r);
  for(let axis=0;axis<3;axis++){
    if(Math.max(a[axis],b[axis])+r<Math.min(A[axis],B[axis],C[axis])||Math.min(a[axis],b[axis])-r>Math.max(A[axis],B[axis],C[axis]))return null;
  }
  let best=null;
  const consider=(axisPoint,point,weights)=>{
    const delta=sub(point,axisPoint),d2=dot(delta,delta);
    if(!best||d2<best.d2)best={axisPoint,point,weights,delta,d2};
  };
  for(const endpoint of [a,b]){const hit=closestTriangle(endpoint,A,B,C);consider([...endpoint],hit.point,hit.weights);}
  const vertices=[A,B,C];
  for(let i=0;i<3;i++){
    const hit=closestSegments(a,b,vertices[i],vertices[(i+1)%3]),weights=[0,0,0];weights[i]=1-hit.t;weights[(i+1)%3]=hit.t;
    consider(hit.axisPoint,hit.point,weights);
  }
  const axis=sub(b,a),faceNormal=cross(sub(B,A),sub(C,A)),den=dot(axis,faceNormal);
  if(Math.abs(den)>EPS){
    const t=dot(sub(A,a),faceNormal)/den;
    if(t>=0&&t<=1){
      const axisPoint=at(a,axis,t),hit=closestTriangle(axisPoint,A,B,C),delta=sub(hit.point,axisPoint);
      if(dot(delta,delta)<EPS)consider(axisPoint,hit.point,hit.weights);
    }
  }
  if(best.d2>r*r)return null;
  const distance=Math.sqrt(best.d2);let normal;
  if(distance>1e-8)normal=best.delta.map(v=>v/distance);
  else{
    let n=faceNormal,l=Math.hypot(...n);
    if(l<1e-9){n=cross(axis,Math.abs(axis[2])<Math.abs(axis[0])?[0,0,1]:[1,0,0]);l=Math.hypot(...n);}
    if(l<1e-9){n=[0,0,1];l=1;}
    const midpoint=[(a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5],sign=dot(sub(midpoint,A),n)>0?-1:1;
    normal=n.map(v=>v/l*sign);
  }
  return {point:best.point,axisPoint:best.axisPoint,normal,depth:Math.max(0,r-distance),weights:best.weights};
}
