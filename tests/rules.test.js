import test from 'node:test';
import assert from 'node:assert/strict';
import {roundConfig,makeLayout,acceptsDrop} from '../src/core/rules.js';

test('first 100 rounds have exact quotas and a fair finite rescue order',()=>{
 for(let round=1;round<=100;round++){
  const c=roundConfig(round,91);
  assert.equal(c.quota,Math.ceil(c.total*.6));
  assert.ok(c.total<=22&&c.duration>=22&&c.duration<=34);
  let rescue=0;
  for(const item of c.schedule){
   rescue=Math.max(rescue,item.attachAt)+1.35;
   assert.ok(item.lifetime>=c.lifetime[0]-1e-9);
   assert.ok(item.lifetime<=c.lifetime[1]+1e-9);
   assert.ok(rescue+.25<=item.attachAt+item.lifetime+1e-9,`round ${round}`);
   assert.ok(item.attachAt+item.lifetime<=c.duration-2+1e-9);
  }
 }
});
test('approved first eight round counts and timers are preserved',()=>{
 assert.deepEqual(Array.from({length:8},(_,i)=>roundConfig(i+1,1).total),[6,8,10,12,14,15,16,18]);
 assert.deepEqual(Array.from({length:8},(_,i)=>roundConfig(i+1,1).duration),[22,22,26,26,28,28,30,32]);
 assert.deepEqual(roundConfig(1,23),roundConfig(1,23));
 assert.notDeepEqual(roundConfig(1,23).schedule,roundConfig(1,24).schedule);
});
test('mouth accepts a forgiving finite 3D target volume across layouts',()=>{
 for(const aspect of [.5,1,2]){
  const l=makeLayout(aspect),p=l.mouth.center;
  assert.ok(acceptsDrop(p,l));
  assert.ok(acceptsDrop([p[0]+l.mouth.width*.4,p[1]+.3,p[2]+.25],l));
  assert.ok(!acceptsDrop([p[0]+l.mouth.width,p[1],p[2]],l));
  assert.ok(!acceptsDrop([p[0],p[1],p[2]+3],l));
  assert.ok(!acceptsDrop([NaN,p[1],p[2]],l));
  assert.ok(l.mouth.width/l.viewWidth*390>=88 || aspect>1);
 }
});
