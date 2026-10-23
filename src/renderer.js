import * as THREE from 'three';
import { BAG_TEMPLATE } from './core/cloth.js';
import { treeSway } from './core/tree.js';
import { acceptsDrop } from './core/rules.js';

const PAPER = 0xffffff;
const PALETTE = [0xe48a87,0x8cbdb7,0xd3b25d,0xa6a0c7,0x9db4c8,0xbac46b,0xcb9eae];
const Z_PLANE = new THREE.Plane(new THREE.Vector3(0,0,1),-.8);
const vector = new THREE.Vector3();

export function renderResolution(width,height,dpr=1,quality=1) {
  width=Math.max(1,width);height=Math.max(1,height);
  const pixelRatio=Math.min(1.25,Math.max(.45,dpr),Math.sqrt(1_000_000/(width*height)))*Math.max(.6,Math.min(1,quality));
  return {pixelRatio,width:Math.max(1,Math.floor(width*pixelRatio)),height:Math.max(1,Math.floor(height*pixelRatio))};
}

export function createGameCamera(aspect=1) {
  const camera=new THREE.PerspectiveCamera(40,Math.max(.1,aspect),.1,50);
  camera.position.set(0,3,10);camera.lookAt(0,3,0);camera.updateMatrixWorld();
  return camera;
}

export function nearestScreenBag(bags,x,y) {
  let closest=null,best=Infinity;
  for(const bag of bags) {
    if(!bag.screen.visible)continue;
    const distance=Math.hypot(bag.screen.x-x,bag.screen.y-y),radius=Math.max(24,bag.radius||0);
    if(distance<=radius&&distance<best){closest={id:bag.id,center:[...bag.center]};best=distance;}
  }
  return closest;
}

/** Use the deformed surface, including a restricted ray-hit face when present. */
export function nearestBagParticle(positions,point,indices=null) {
  const candidates=indices||BAG_TEMPLATE.bodyIndices;let nearest=-1,best=Infinity;
  for(const index of candidates){
    const i=index*3;if(i+2>=positions.length)continue;
    const distance=(positions[i]-point[0])**2+(positions[i+1]-point[1])**2+(positions[i+2]-point[2])**2;
    if(distance<best){best=distance;nearest=index;}
  }
  return nearest;
}

function plasticMaterial(color,receiver=false) {
  const material=new THREE.MeshPhongMaterial({color,transparent:true,opacity:receiver ? .25 : .4,side:THREE.DoubleSide,depthWrite:false,shininess:receiver ? 136 : 118,specular:0xffffff});
  material.forceSinglePass=true;
  material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vPlasticUv;').replace('#include <begin_vertex>','#include <begin_vertex>\nvPlasticUv=uv;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying vec2 vPlasticUv;').replace('#include <color_fragment>',`#include <color_fragment>
      float wrinkle=sin(vPlasticUv.y*97.0+vPlasticUv.x*31.0+sin(vPlasticUv.x*19.0))*sin(vPlasticUv.x*61.0-vPlasticUv.y*23.0);
      float foldL=exp(-105.0*abs(vPlasticUv.x-.12-.035*sin(vPlasticUv.y*12.0)));
      float foldR=exp(-105.0*abs(vPlasticUv.x-.88+.035*sin(vPlasticUv.y*11.0)));
      diffuseColor.rgb*=.97+.03*wrinkle;
      diffuseColor.rgb+=vec3((foldL+foldR)*.055);
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      vec3 filmFace=normalize(cross(dFdx(vViewPosition),dFdy(vViewPosition)));
      if(dot(filmFace,normal)<0.0)filmFace=-filmFace;
      normal=normalize(mix(normal,filmFace,.27)+vec3(wrinkle*.065,sin(vPlasticUv.x*83.0+vPlasticUv.y*43.0)*.035,0.0));
      float filmEdge=pow(1.0-clamp(abs(dot(normal,normalize(vViewPosition))),0.0,1.0),2.4);
      diffuseColor.a=clamp(opacity*(.63+filmEdge*.82)+abs(wrinkle)*.035,.05,.74);
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.9,.94,.95),filmEdge*.18);
    `);
  };
  material.customProgramCacheKey=()=> 'thin-plastic-2';
  return material;
}

function makeBagGeometry() {
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(BAG_TEMPLATE.positions),3).setUsage(THREE.DynamicDrawUsage));
  geometry.setIndex(new THREE.BufferAttribute(new Uint16Array(BAG_TEMPLATE.indices),1));
  const bounds={minX:Infinity,maxX:-Infinity,minY:Infinity,maxY:-Infinity};
  for(let i=0;i<BAG_TEMPLATE.positions.length;i+=3){const x=BAG_TEMPLATE.positions[i],y=BAG_TEMPLATE.positions[i+1];bounds.minX=Math.min(bounds.minX,x);bounds.maxX=Math.max(bounds.maxX,x);bounds.minY=Math.min(bounds.minY,y);bounds.maxY=Math.max(bounds.maxY,y);}
  const uv=new Float32Array(BAG_TEMPLATE.positions.length/3*2);
  for(let i=0;i<BAG_TEMPLATE.positions.length/3;i++){uv[i*2]=(BAG_TEMPLATE.positions[i*3]-bounds.minX)/(bounds.maxX-bounds.minX);uv[i*2+1]=(BAG_TEMPLATE.positions[i*3+1]-bounds.minY)/(bounds.maxY-bounds.minY);}
  geometry.setAttribute('uv',new THREE.BufferAttribute(uv,2));geometry.computeVertexNormals();
  return geometry;
}

function boundaryEdges() {
  const edges=new Map(),indices=BAG_TEMPLATE.indices;
  for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){
    const a=indices[i+j],b=indices[i+(j+1)%3],key=a<b?`${a}:${b}`:`${b}:${a}`;
    const existing=edges.get(key);if(existing)existing.count++;else edges.set(key,{a,b,count:1});
  }
  return [...edges.values()].filter(edge=>edge.count===1).flatMap(edge=>[edge.a,edge.b]);
}
const BAG_EDGES=boundaryEdges();

function makeBagVisual(material) {
  const group=new THREE.Group(),geometry=makeBagGeometry(),mesh=new THREE.Mesh(geometry,material);
  mesh.frustumCulled=false;group.add(mesh);
  const seamGeometry=new THREE.BufferGeometry();
  seamGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(BAG_EDGES.length*3),3).setUsage(THREE.DynamicDrawUsage));
  const seamMaterial=new THREE.LineBasicMaterial({color:material.color.clone().multiplyScalar(.7),transparent:true,opacity:.27,depthWrite:false});
  const seams=new THREE.LineSegments(seamGeometry,seamMaterial);seams.frustumCulled=false;group.add(seams);
  return {group,mesh,geometry,seams,seamGeometry,seamMaterial,lastPositions:null};
}

function setBagPose(visual,positions,center) {
  if(!positions||positions.length!==BAG_TEMPLATE.positions.length)return;
  const destination=visual.geometry.attributes.position.array;
  visual.group.position.fromArray(center);
  for(let i=0;i<positions.length;i+=3){destination[i]=positions[i]-center[0];destination[i+1]=positions[i+1]-center[1];destination[i+2]=positions[i+2]-center[2];}
  visual.geometry.attributes.position.needsUpdate=true;visual.geometry.computeVertexNormals();visual.geometry.computeBoundingSphere();
  const edges=visual.seamGeometry.attributes.position.array;
  for(let i=0;i<BAG_EDGES.length;i++){const offset=BAG_EDGES[i]*3;edges[i*3]=destination[offset];edges[i*3+1]=destination[offset+1];edges[i*3+2]=destination[offset+2];}
  visual.seamGeometry.attributes.position.needsUpdate=true;visual.lastPositions=positions;
}

export function createTreeGeometry(tree) {
  const positions=[],colors=[],indices=[];
  const bark=new THREE.Color(0x93684c),light=new THREE.Color();
  for(const path of tree.paths) {
    const points=path.points.map(point=>new THREE.Vector3(...point)),rings=points.length,sides=6;
    const base=positions.length/3;
    for(let i=0;i<rings;i++) {
      const tangent=points[Math.min(i+1,rings-1)].clone().sub(points[Math.max(0,i-1)]).normalize();
      const reference=Math.abs(tangent.z)>.85?new THREE.Vector3(1,0,0):new THREE.Vector3(0,0,1);
      const normal=new THREE.Vector3().crossVectors(tangent,reference).normalize(),binormal=new THREE.Vector3().crossVectors(tangent,normal).normalize();
      const radius=path.radii[i]??path.radii[path.radii.length-1]??.02;
      for(let side=0;side<sides;side++) {
        const angle=side/sides*Math.PI*2,point=points[i].clone().addScaledVector(normal,Math.cos(angle)*radius).addScaledVector(binormal,Math.sin(angle)*radius);
        positions.push(point.x,point.y,point.z);light.copy(bark).multiplyScalar(.95+.075*Math.cos(angle+.4)+.035*Math.sin(i*1.7));colors.push(light.r,light.g,light.b);
        if(i<rings-1){const a=base+i*sides+side,b=base+i*sides+(side+1)%sides,c=a+sides,d=b+sides;indices.push(a,b,c,b,d,c);}
      }
    }
  }
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();return geometry;
}

function softShadowTexture() {
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;
  const context=canvas.getContext('2d'),gradient=context.createRadialGradient(48,48,2,48,48,47);
  gradient.addColorStop(0,'rgba(81,76,61,.22)');gradient.addColorStop(.4,'rgba(81,76,61,.09)');gradient.addColorStop(1,'rgba(81,76,61,0)');context.fillStyle=gradient;context.fillRect(0,0,96,96);
  return new THREE.CanvasTexture(canvas);
}

export class GameRenderer {
  constructor(canvas) {
    this.canvas=canvas;this.width=1;this.height=1;this.quality=1;this.visualTime=0;this.frameAverage=1/60;this.lastResize=0;this.lastShadow=0;this.dirty=true;this.screenBags=[];this.bags=new Map();this.content=new Map();this.state=null;this.treeKey=null;
    this.renderer=new THREE.WebGLRenderer({canvas,antialias:true,alpha:false});
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.04;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(PAPER);this.camera=createGameCamera();
    this.scene.add(new THREE.HemisphereLight(0xf8fbff,0xd8d5d0,1.05));
    const key=new THREE.DirectionalLight(0xfff3e5,2.7);key.position.set(-4.5,7,6);key.castShadow=true;key.shadow.mapSize.set(512,512);key.shadow.camera.left=-6;key.shadow.camera.right=6;key.shadow.camera.top=7;key.shadow.camera.bottom=-2;key.shadow.normalBias=.025;key.shadow.bias=-.0003;key.shadow.radius=3;this.scene.add(key);this.key=key;
    const fill=new THREE.DirectionalLight(0xe5efff,.55);fill.position.set(4,4,-4);this.scene.add(fill);
    this.ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),new THREE.ShadowMaterial({color:0x615b54,opacity:.13}));this.ground.rotation.x=-Math.PI/2;this.ground.position.y=-.025;this.ground.receiveShadow=true;this.scene.add(this.ground);
    this.treeMaterial=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.91,metalness:0,flatShading:true});
    this.treeGroup=new THREE.Group();this.scene.add(this.treeGroup);
    this.materials=PALETTE.map(color=>plasticMaterial(color));this.collectorMaterial=plasticMaterial(0xe4e9e8,true);
    this.collector=makeBagVisual(this.collectorMaterial);this.collector.seamMaterial.opacity=.2;this.collector.group.visible=false;this.scene.add(this.collector.group);
    this.shadowTexture=softShadowTexture();this.contacts=[];
    for(let i=0;i<2;i++){const plane=new THREE.Mesh(new THREE.PlaneGeometry(1,1),new THREE.MeshBasicMaterial({map:this.shadowTexture,transparent:true,depthWrite:false}));plane.rotation.x=-Math.PI/2;plane.position.y=.002;plane.renderOrder=1;this.scene.add(plane);this.contacts.push(plane);}
    const rimGeometry=new THREE.BufferGeometry();rimGeometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(40*3),3));
    this.mouthRim=new THREE.LineLoop(rimGeometry,new THREE.LineBasicMaterial({color:0x89988b,transparent:true,opacity:.22,depthTest:false}));this.mouthRim.renderOrder=12;this.scene.add(this.mouthRim);
    this.raycaster=new THREE.Raycaster();this.pointer=new THREE.Vector2();
    const rect=canvas.getBoundingClientRect();this.resize(rect.width||window.innerWidth,rect.height||window.innerHeight);
  }

  resize(width,height) {
    this.width=Math.max(1,width);this.height=Math.max(1,height);this.camera.aspect=this.width/this.height;this.camera.updateProjectionMatrix();this.camera.updateMatrixWorld();
    const size=renderResolution(this.width,this.height,globalThis.devicePixelRatio||1,this.quality);this.renderer.setPixelRatio(size.pixelRatio);this.renderer.setSize(this.width,this.height,false);this.dirty=true;
  }

  update(state,dt=1/60,interaction={}) {
    if(!state)return;this.visualTime+=Math.min(.1,Math.max(0,dt));
    this.frameAverage=this.frameAverage*.96+Math.min(.1,dt)*.04;
    if(this.frameAverage>.034&&this.visualTime-this.lastResize>2&&this.quality>.62){this.quality=Math.max(.6,this.quality-.1);this.lastResize=this.visualTime;this.resize(this.width,this.height);}
    const newPose=this.state!==state;this.state=state;this.interaction=interaction;
    const tree=state.tree,treeKey=tree?`${state.epoch}:${state.round}:${tree.seed}:${tree.height}:${state.layout?.treeWidth}:${tree.origin.join(",")}`:null;
    if(treeKey!==this.treeKey) {
      while(this.treeGroup.children.length){const mesh=this.treeGroup.children[0];mesh.geometry.dispose();mesh.removeFromParent();}
      if(tree?.paths?.length){const mesh=new THREE.Mesh(createTreeGeometry(tree),this.treeMaterial);mesh.castShadow=true;mesh.receiveShadow=true;this.treeGroup.add(mesh);this.contacts[0].position.set(tree.origin[0],.004,tree.origin[2]||0);this.contacts[0].scale.set(.95,.55,1);}
      this.treeKey=treeKey;this.renderer.shadowMap.needsUpdate=true;
    }
    if(tree){this.treeGroup.position.fromArray(tree.origin);this.treeGroup.rotation.z=treeSway(tree,state.phase==='playing'?state.time:this.visualTime*.45,state.wind||1.5);}
    const active=new Set();this.screenBags=[];
    for(const bag of state.bags||[]) {
      if(!bag.positions||!['incoming','tethered','loose','held','capturing'].includes(bag.state))continue;
      active.add(bag.id);let visual=this.bags.get(bag.id);
      if(!visual){visual=makeBagVisual(this.materials[(bag.colorIndex||0)%this.materials.length]);this.bags.set(bag.id,visual);this.scene.add(visual.group);}
      visual.group.visible=true;visual.mesh.userData.bag=bag;
      const center=bag.center||[0,2,0];if(newPose||visual.lastPositions!==bag.positions)setBagPose(visual,bag.positions,center);
      const screen=this.project(center),edge=this.project([center[0]+.35,center[1],center[2]]);
      if(bag.state!=='capturing')this.screenBags.push({id:bag.id,center,screen,radius:Math.min(54,Math.abs(edge.x-screen.x))});
    }
    for(const [id,visual] of this.bags)if(!active.has(id)){this.releaseBag(visual);this.bags.delete(id);}
    const collector=state.collector,layout=state.layout;
    if(collector?.positions&&layout) {
      this.collector.group.visible=true;
      if(newPose||this.collector.lastPositions!==collector.positions)setBagPose(this.collector,collector.positions,layout.mouth.center);
      this.contacts[1].position.set(layout.mouth.center[0],.005,layout.mouth.center[2]);this.contacts[1].scale.set(layout.mouth.width*1.45,layout.mouth.depth*1.2,1);
      const mouth=layout.mouth,positions=this.mouthRim.geometry.attributes.position.array;
      for(let i=0;i<40;i++){const angle=i/40*Math.PI*2;positions[i*3]=mouth.center[0]+Math.cos(angle)*mouth.width*.5;positions[i*3+1]=mouth.center[1]+.008;positions[i*3+2]=mouth.center[2]+Math.sin(angle)*mouth.depth*.5;}
      this.mouthRim.geometry.attributes.position.needsUpdate=true;
      const ready=interaction.heldId&&interaction.target&&acceptsDrop(interaction.target,layout);
      this.mouthRim.material.color.setHex(ready?0x7f9b52:0x89988b);this.mouthRim.material.opacity=ready ? .9 : .22;
      this.updateContent(collector,layout);
    }
    if(this.visualTime-this.lastShadow>.08){this.renderer.shadowMap.needsUpdate=true;this.lastShadow=this.visualTime;}
    this.dirty=true;
  }

  updateContent(collector,layout) {
    const active=new Set();
    // These are the same simulated membranes that entered the receiver. No
    // replacement template or per-instance squash can erase their folds.
    for(const bag of (collector.contents||[]).slice(-8)){
      if(!bag.positions||this.bags.has(bag.id))continue;
      active.add(bag.id);let visual=this.content.get(bag.id);
      if(!visual){visual=makeBagVisual(this.materials[(bag.colorIndex||0)%this.materials.length]);this.content.set(bag.id,visual);this.scene.add(visual.group);}
      visual.group.visible=true;visual.mesh.userData.bag=null;
      if(visual.lastPositions!==bag.positions)setBagPose(visual,bag.positions,bag.center||layout.mouth.center);
    }
    for(const[id,visual]of this.content)if(!active.has(id)){this.releaseBag(visual);this.content.delete(id);}
  }

  project(point) {
    vector.fromArray(point).project(this.camera);
    return {x:(vector.x*.5+.5)*this.width,y:(-.5*vector.y+.5)*this.height,visible:vector.z>-1&&vector.z<1&&Math.abs(vector.x)<1.08&&Math.abs(vector.y)<1.08};
  }

  pointerPoint(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect();this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);this.raycaster.ray.intersectPlane(Z_PLANE,vector);return vector.toArray();
  }

  pick(clientX,clientY) {
    const rect=this.canvas.getBoundingClientRect();
    this.pointer.set((clientX-rect.left)/rect.width*2-1,-(clientY-rect.top)/rect.height*2+1);this.raycaster.setFromCamera(this.pointer,this.camera);
    const meshes=[...this.bags.values()].map(visual=>visual.mesh).filter(mesh=>mesh.userData.bag?.state!=='capturing');
    const hit=this.raycaster.intersectObjects(meshes,false)[0];
    if(hit){const bag=hit.object.userData.bag,face=hit.face;return {id:bag.id,center:[...bag.center],particle:nearestBagParticle(bag.positions,hit.point.toArray(),face?[face.a,face.b,face.c]:null)};}
    const fallback=nearestScreenBag(this.screenBags,clientX-rect.left,clientY-rect.top);
    if(fallback){const bag=this.bags.get(fallback.id)?.mesh.userData.bag;fallback.particle=nearestBagParticle(bag.positions,bag.center);}
    return fallback;
  }

  render() {if(!this.dirty)return;this.renderer.render(this.scene,this.camera);this.dirty=false;}
  getStats() {const info=this.renderer.info;return {triangles:info.render.triangles,drawCalls:info.render.calls,geometries:info.memory.geometries,textures:info.memory.textures,visibleBags:this.screenBags.length,content:this.content.size,pixelRatio:this.renderer.getPixelRatio(),pixels:this.renderer.domElement.width*this.renderer.domElement.height};}
  releaseBag(visual) {visual.group.removeFromParent();visual.geometry.dispose();visual.seamGeometry.dispose();visual.seamMaterial.dispose();}
  dispose() {for(const visual of this.bags.values())this.releaseBag(visual);for(const visual of this.content.values())this.releaseBag(visual);this.releaseBag(this.collector);for(const mesh of this.treeGroup.children)mesh.geometry.dispose();this.treeMaterial.dispose();for(const material of this.materials)material.dispose();this.collectorMaterial.dispose();for(const plane of this.contacts){plane.geometry.dispose();plane.material.dispose();}this.shadowTexture.dispose();this.ground.geometry.dispose();this.ground.material.dispose();this.mouthRim.geometry.dispose();this.mouthRim.material.dispose();this.renderer.dispose();}
}
