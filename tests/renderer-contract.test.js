import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createGameCamera, renderResolution, nearestScreenBag, createTreeGeometry } from '../src/renderer.js';
import * as Renderer from '../src/renderer.js';

test('rendering stays within the same phone and desktop pixel budget', () => {
  for (const [width,height,dpr] of [[390,780,3],[1920,1080,2],[3840,2160,2],[1280,720,1]]) {
    const size=renderResolution(width,height,dpr);
    assert.ok(size.pixelRatio<=1.25);
    assert.ok(size.width*size.height<=1_000_001);
    assert.ok(size.width>0&&size.height>0);
  }
});

test('camera gives reversible screen projection on the drag plane', () => {
  for (const aspect of [.5,1,1.8]) {
    const camera=createGameCamera(aspect), point=new THREE.Vector3(-.8,1,.8);
    const screen=point.clone().project(camera);
    const raycaster=new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(screen.x,screen.y),camera);
    const hit=new THREE.Vector3();
    raycaster.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,0,1),-.8),hit);
    assert.ok(hit.distanceTo(point)<1e-8);
  }
});

test('small bags have a forgiving 48px screen target and resolves nearest visible center', () => {
  const bags=[{id:'far',center:[0,0,0],screen:{x:50,y:50,visible:true},radius:8},{id:'near',center:[1,0,0],screen:{x:76,y:50,visible:true},radius:8}];
  assert.equal(nearestScreenBag(bags,30,50)?.id,'far');
  assert.equal(nearestScreenBag(bags,73,50)?.id,'near');
  assert.equal(nearestScreenBag(bags,100,100),null);
  assert.equal(nearestScreenBag([{...bags[0],screen:{x:50,y:50,visible:false}}],50,50),null);
});

// Outward normals keep an opaque tapered branch visible from outside.
test('branch tubes are genuinely three dimensional and wound outward', () => {
  const geometry=createTreeGeometry({paths:[{points:[[0,0,0],[0,1,0]],radii:[.1,.08]}]});
  const p=geometry.attributes.position.array,ix=geometry.index.array;
  assert.ok([...p].some((value,index)=>index%3===2&&Math.abs(value)>.01));
  for(let i=0;i<ix.length;i+=3){
    const a=new THREE.Vector3().fromArray(p,ix[i]*3),b=new THREE.Vector3().fromArray(p,ix[i+1]*3),c=new THREE.Vector3().fromArray(p,ix[i+2]*3);
    const normal=new THREE.Vector3().crossVectors(b.clone().sub(a),c.clone().sub(a));
    const outward=a.clone().add(b).add(c);outward.y=0;
    assert.ok(normal.dot(outward)>0,'the visible surface normal faces away from branch center');
  }
  geometry.dispose();
});

test('local grip chooses the actual deformed surface particle and respects a hit face',()=>{
  assert.equal(typeof Renderer.nearestBagParticle,'function');
  const positions=new Float32Array([8,1,0, 0,1,0, .1,1,0, 2,2,1]);
  assert.equal(Renderer.nearestBagParticle(positions,[.09,1,0]),2);
  assert.equal(Renderer.nearestBagParticle(positions,[.09,1,0],[0,1,3]),1);
});
