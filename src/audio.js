export class PaperAudio {
  constructor(){this.enabled=false;this.context=null;this.last=0;}
  activate(){if(!this.enabled)return;try{this.context??=new(window.AudioContext||window.webkitAudioContext)();if(this.context.state==='suspended')this.context.resume().catch(()=>{});}catch{this.enabled=false;}}
  toggle(){this.enabled=!this.enabled;this.activate();return this.enabled;}
  play(kind='grab'){
    if(!this.enabled||!this.context)return;const now=this.context.currentTime;if(now-this.last<.07)return;this.last=now;
    const seconds=kind==='collected'?.23:.11,count=Math.floor(this.context.sampleRate*seconds),buffer=this.context.createBuffer(1,count,this.context.sampleRate),data=buffer.getChannelData(0);
    for(let i=0;i<count;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/count,2)*(.65+.35*Math.sin(i*.047));
    const source=this.context.createBufferSource(),filter=this.context.createBiquadFilter(),gain=this.context.createGain();source.buffer=buffer;filter.type='bandpass';filter.frequency.value=kind==='collected'?1800:2900;filter.Q.value=.35;gain.gain.value=.035;source.connect(filter);filter.connect(gain);gain.connect(this.context.destination);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
  }
  dispose(){this.context?.close().catch(()=>{});}
}
