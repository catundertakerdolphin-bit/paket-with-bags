import test from 'node:test';
import assert from 'node:assert/strict';
import {capsuleTriangle} from '../src/core/contact.js';

const A=[-1,-1,0],B=[1,-1,0],C=[0,1,0];
const length=p=>Math.hypot(...p);
const near=(actual,expected,tolerance=1e-9)=>assert.ok(Math.abs(actual-expected)<tolerance,`${actual} ≠ ${expected}`);

test('capsule through sparse triangle interior contacts even when every vertex is far away',()=>{
  const hit=capsuleTriangle([0,0,-1],[0,0,1],.06,A,B,C);
  assert.ok(hit);
  assert.ok(hit.weights.every(w=>w>0));
  near(hit.weights.reduce((sum,w)=>sum+w,0),1);
  near(length(hit.point),0);
  near(length(hit.normal),1);
  near(hit.depth,.06);
});

test('parallel branch receives a normal pointing from capsule axis toward cloth',()=>{
  const hit=capsuleTriangle([-.4,0,.04],[.4,0,.04],.1,A,B,C);
  assert.ok(hit);
  near(hit.depth,.06);
  near(hit.normal[2],-1);
  for(let axis=0;axis<3;axis++)near(hit.point[axis],A[axis]*hit.weights[0]+B[axis]*hit.weights[1]+C[axis]*hit.weights[2]);
});

test('branch grazing a triangle edge produces finite edge weights',()=>{
  const hit=capsuleTriangle([-.05,-.4,0],[-.05,.4,0],.1,[0,0,0],[1,0,0],[0,1,0]);
  assert.ok(hit);
  near(hit.depth,.05);
  near(hit.normal[0],1);
  assert.ok(hit.weights.some(w=>w===0));
  assert.ok(hit.weights.every(w=>w>=0&&w<=1));
});

test('separated branch and near-plane branch outside the face do not contact',()=>{
  assert.equal(capsuleTriangle([4,4,-1],[4,4,1],.1,A,B,C),null);
  assert.equal(capsuleTriangle([.9,.9,-.1],[.9,.9,.1],.02,A,B,C),null);
});

test('point capsules and collapsed triangles yield stable finite contact normals',()=>{
  for(const [a,b,tri] of [
    [[0,0,.04],[0,0,.04],[A,B,C]],
    [[0,0,0],[0,0,0],[[0,0,0],[0,0,0],[0,0,0]]],
    [[-.2,0,0],[.2,0,0],[[0,0,0],[0,0,0],[0,0,0]]]
  ]){
    const hit=capsuleTriangle(a,b,.1,...tri);
    assert.ok(hit);
    assert.ok([...hit.point,...hit.axisPoint,...hit.normal,...hit.weights,hit.depth].every(Number.isFinite));
    near(length(hit.normal),1);
    near(hit.weights.reduce((sum,w)=>sum+w,0),1);
  }
});
