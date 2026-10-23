import './style.css';
import {World} from './core/world.js';
import {acceptsDrop} from './core/rules.js';
import {GameRenderer} from './renderer.js';
import {SimulationRunner} from './runner.js';
import {PaperAudio} from './audio.js';

const $=id=>document.getElementById(id),canvas=$('scene'),sound=new PaperAudio();
const debugEnabled=new URLSearchParams(location.search).has('debug');
let renderer,runner,drag=null,lastPhase=null,lastCaught=0,lastMissed=0,lastFrame=performance.now(),stopped=false;
let best=0;try{best=Number(localStorage.getItem('paket-with-bags-best'))||0;}catch{}
const seenEvents=new Set(),bars=new Map();let seenEpoch=null,samples=[],lastDebug=0;
const newSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0];
const setText=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=String(value);};
function showError(message){$('loading-note').hidden=true;$('error-message').textContent=message;$('error').hidden=false;$('intro').hidden=true;}
function popup(point,text,lost=false){
  if(!renderer)return;const p=renderer.project(point);if(!p.visible)return;
  const item=document.createElement('span');item.className='point-popup'+(lost?' lost':'');item.textContent=text;item.style.left=`${p.x}px`;item.style.top=`${p.y}px`;$('popups').append(item);setTimeout(()=>item.remove(),900);
}
function receive(state){
  if(seenEpoch!==state.epoch){seenEvents.clear();seenEpoch=state.epoch;lastPhase=null;lastCaught=0;lastMissed=0;for(const bar of bars.values())bar.remove();bars.clear();}
  if(drag&&state.lastCommandSeq>=drag.grabSeq&&(state.phase!=='playing'||state.heldId!==drag.id))clearDrag(false);
  if(state.caught!==lastCaught){$('score').classList.remove('bump');requestAnimationFrame(()=>$('score').classList.add('bump'));lastCaught=state.caught;}
  lastMissed=state.missed;
  for(const event of state.events||[]){
    if(seenEvents.has(event.id))continue;seenEvents.add(event.id);
    if(event.kind==='collected'){popup(event.point,'+1');sound.play('collected');}
    else if(event.kind==='unhooked')sound.play('grab');
    else if(event.kind==='grab')sound.play('grab');
  }
  if(seenEvents.size>160){seenEvents.clear();for(const event of state.events||[])seenEvents.add(event.id);}
  const phase=state.phase;
  $('intro').hidden=phase!=='ready';$('hud').hidden=phase==='ready';$('interlude').hidden=phase!=='between';$('result').hidden=phase!=='over';
  if(phase==='between'){setText('interlude-title',`Дерево ${state.round+1}`);setText('interlude-copy',`Собрано ${state.roundCaught} из ${state.total}. Ветер усиливается.`);}
  if(phase==='over'&&lastPhase!=='over'){
    best=Math.max(best,state.caught);try{localStorage.setItem('paket-with-bags-best',String(best));}catch{}
    setText('result-round',`Раунд ${state.round} · нужно было собрать ${state.plan.quota} из ${state.total}`);
    setText('result-caught',state.caught);setText('result-missed',state.missed);setText('best',`Лучший результат: ${best}`);
    setTimeout(()=>$('retry').focus({preventScroll:true}),200);
  }
  lastPhase=phase;
}
function syncHUD(state){
  const left=Math.max(0,state.timeLeft),minutes=Math.floor(left/60),seconds=Math.floor(left%60),tenth=Math.floor(left*10)%10;
  const timer=`${String(minutes).padStart(2,'0')}:${String(seconds).padStart(2,'0')}`;
  const html=timer+`<span class="timer-tenth">.${tenth}</span>`;if($('timer').innerHTML!==html)$('timer').innerHTML=html;
  $('timer').setAttribute('aria-label',`Осталось ${Math.ceil(left)} секунд`);
  $('timer-fill').style.transform=`scaleX(${Math.max(0,Math.min(1,left/state.plan.duration))})`;
  document.querySelector('.timer-corner').classList.toggle('urgent',left<5&&state.phase==='playing');
  setText('wind',(Math.round((state.wind+1e-8)*10)/10).toFixed(1).replace('.',','));setText('round-label',`Раунд ${state.round}`);
  setText('score',state.caught);setText('missed',state.missed);setText('quota',`Для следующего дерева: ${state.roundCaught} / ${state.plan.quota}`);
  const live=new Set();
  for(const bag of state.bags){
    if(bag.state!=='tethered')continue;live.add(bag.id);let bar=bars.get(bag.id);
    if(!bar){bar=document.createElement('div');bar.className='bag-bar';bar.dataset.bagId=bag.id;bar.append(document.createElement('i'));$('bag-bars').append(bar);bars.set(bag.id,bar);}
    const point=renderer.project([bag.center[0],bag.center[1]-.38,bag.center[2]]);
    bar.hidden=!point.visible;bar.style.left=`${point.x}px`;bar.style.top=`${point.y}px`;bar.classList.toggle('urgent',bag.remaining<.35);bar.firstChild.style.transform=`scaleX(${Math.max(0,bag.remaining)})`;
  }
  for(const[id,bar]of bars)if(!live.has(id)){bar.remove();bars.delete(id);}
  const mouth=state.layout.mouth,p=renderer.project([mouth.center[0],.03,mouth.center[2]]);
  $('collector-hint').style.left=`${p.x}px`;$('collector-hint').style.top=`${p.y+11}px`;
  const ready=drag&&acceptsDrop(drag.target,state.layout);$('collector-hint').classList.toggle('ready',!!ready);setText('collector-hint',ready?'отпусти':'отпусти сюда');
}
function clearDrag(cancel=true){
  if(!drag)return;const pointer=drag.pointerId;drag=null;canvas.classList.remove('dragging');if(cancel)runner.send('cancel');
  try{if(canvas.hasPointerCapture(pointer))canvas.releasePointerCapture(pointer);}catch{}
}
function targetAt(event){const point=renderer.pointerPoint(event.clientX,event.clientY);return[point[0]+drag.offset[0],point[1]+drag.offset[1],.8];}
function down(event){
  if(event.button!==0||event.isPrimary===false||drag||runner.state.phase!=='playing'||$('help-dialog').open)return;
  const pick=renderer.pick(event.clientX,event.clientY);if(!pick)return;
  event.preventDefault();sound.activate();const point=renderer.pointerPoint(event.clientX,event.clientY),target=[...pick.center];target[2]=.8;
  const seq=runner.send('grab',{id:pick.id,particle:pick.particle,point:target});drag={id:pick.id,pointerId:event.pointerId,offset:[pick.center[0]-point[0],pick.center[1]-point[1]],target,grabSeq:seq};
  canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');canvas.focus({preventScroll:true});
}
function move(event){
  if(drag&&drag.pointerId===event.pointerId){event.preventDefault();drag.target=targetAt(event);runner.send('move',{point:drag.target});}
  else if(!drag&&runner.state.phase==='playing')canvas.style.cursor=renderer.pick(event.clientX,event.clientY)?'grab':'default';
}
function up(event){
  if(!drag||drag.pointerId!==event.pointerId)return;
  event.preventDefault();if(event.type==='pointercancel'){clearDrag(true);return;}
  drag.target=targetAt(event);runner.send('drop',{point:drag.target});clearDrag(false);
}
function begin(){sound.activate();runner.send('start');canvas.focus({preventScroll:true});}
function restart(){clearDrag(false);runner.restart(newSeed());canvas.focus({preventScroll:true});}
function pause(){runner.pause(document.hidden||$('help-dialog').open);}
function resize(){clearDrag();const rect=canvas.getBoundingClientRect();renderer.resize(rect.width,rect.height);runner.resize(rect.width/rect.height);}
function frame(now){
  if(stopped)return;const dt=Math.min(.1,Math.max(0,(now-lastFrame)/1000));lastFrame=now;
  try{
    runner.frame(now);const state=runner.state;
    if(!document.hidden){
      renderer.update(state,dt,{heldId:drag?.id,target:drag?.target});renderer.render();syncHUD(state);
      if(runner.ready){$('start').disabled=false;setText('start','Начать');$('loading-note').hidden=true;}
      if(debugEnabled){
        samples.push(dt*1000);if(samples.length>120)samples.shift();
        if(now-lastDebug>500){const sorted=samples.slice().sort((a,b)=>a-b),stats=renderer.getStats();$('debug').hidden=false;$('debug').textContent=JSON.stringify({phase:state.phase,round:state.round,worker:!runner.failed,workerMs:+runner.ms.toFixed(2),frameP50:+(sorted[Math.floor(sorted.length*.5)]||0).toFixed(1),frameP95:+(sorted[Math.floor(sorted.length*.95)]||0).toFixed(1),caught:state.caught,missed:state.missed,timeLeft:+state.timeLeft.toFixed(1),...stats,bags:state.bags.map(b=>{const p=renderer.project(b.center);return{id:b.id,state:b.state,handles:b.handles,x:Math.round(p.x),y:Math.round(p.y)};}),mouth:renderer.project(state.layout.mouth.center)},null,1);lastDebug=now;}
      }
    }
  }catch(error){console.error(error);stopped=true;showError('Игра приостановилась. Нажмите «Попробовать снова», чтобы открыть новое дерево.');return;}
  requestAnimationFrame(frame);
}
$('reload').addEventListener('click',()=>location.reload());
try{
  renderer=new GameRenderer(canvas);const rect=canvas.getBoundingClientRect();
  runner=new SimulationRunner({WorldClass:World,seed:debugEnabled&&new URLSearchParams(location.search).has('seed')?Number(new URLSearchParams(location.search).get('seed'))>>>0:newSeed(),aspect:rect.width/rect.height,onState:receive});
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('pointercancel',up);
  canvas.addEventListener('lostpointercapture',()=>{if(drag)clearDrag(true);});canvas.addEventListener('contextmenu',event=>event.preventDefault());
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();runner.pause(true);showError('Браузер приостановил 3D. Нажмите «Попробовать снова».');});
  $('start').addEventListener('click',begin);$('retry').addEventListener('click',restart);$('continue').addEventListener('click',()=>runner.send('next'));
  $('sound').addEventListener('click',()=>{const enabled=sound.toggle();$('sound').setAttribute('aria-pressed',String(enabled));$('sound').setAttribute('aria-label',enabled?'Выключить звук':'Включить звук');$('sound-mark').setAttribute('d',enabled?'M16 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14':'m16 9 5 6m0-6-5 6');});
  $('help').addEventListener('click',()=>{clearDrag();$('help-dialog').showModal();pause();});
  for(const id of ['close-help','help-done'])$(id).addEventListener('click',()=>$('help-dialog').close());$('help-dialog').addEventListener('close',pause);
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearDrag();pause();});window.addEventListener('blur',()=>clearDrag());
  let resizeTimer;window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(resize,90);});
  document.addEventListener('keydown',event=>{
    if($('help-dialog').open)return;
    if(event.code==='KeyR'&&!event.metaKey&&!event.ctrlKey){event.preventDefault();restart();}
    else if(event.code==='Space'||event.code==='Enter'){if(event.target instanceof HTMLButtonElement)return;event.preventDefault();if(runner.state.phase==='ready')begin();else if(runner.state.phase==='between')runner.send('next');else if(runner.state.phase==='over')restart();}
    else if(event.code==='Escape')clearDrag();
  });
  window.addEventListener('pagehide',event=>{if(!event.persisted){stopped=true;runner.dispose();renderer.dispose();sound.dispose();}});
  requestAnimationFrame(frame);
}catch(error){console.error(error);showError('Для этой игры нужен браузер с WebGL 2 и включённым аппаратным ускорением. Попробуйте открыть её в Safari или Chrome.');}
