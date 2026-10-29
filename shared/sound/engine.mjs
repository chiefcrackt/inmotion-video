import {preset,random,activeLayers,duration,clamp} from './model.mjs';
export function audioContext() {const C=globalThis.AudioContext||globalThis.webkitAudioContext;if(!C)throw Error('Web Audio is unavailable in this browser.');return new C();}
function offline(ch,n,sr) {const C=globalThis.OfflineAudioContext||globalThis.webkitOfflineAudioContext;if(!C)throw Error('Offline audio rendering is unavailable in this browser.');return new C(ch,n,sr);}
function amplitude(l,t){
  const a=Math.min(l.attack,l.duration*.4),dec=Math.min(l.decay,l.duration*.4),rel=Math.min(l.release,l.duration*.5);
  const env=l.source==='sample'?1:(t<a?t/Math.max(a,.00001):t<a+dec?1-(1-l.sustain)*(t-a)/dec:l.sustain)*Math.min(1,(l.duration-t)/rel);
  const fade=Math.min(1,l.fadeIn?t/l.fadeIn:1,l.fadeOut?(l.duration-t)/l.fadeOut:1);
  const gate=l.source!=='sample'&&l.pulse?(.25+.75*(Math.sin(t*l.pulse*2*Math.PI)>0)):1;
  return env*fade*gate;
}
export function dryData(l,sr,seed,sample) {
  const n=Math.ceil(l.duration*sr),channels=l.source==='sample'?Math.min(2,sample.numberOfChannels):1;
  const result=Array.from({length:channels},()=>new Float32Array(n)),rng=random(seed);let phase=0;
  const rate=2**(l.pitch/12);
  for(let i=0;i<n;i++){
    const t=i/sr,u=t/l.duration,f=l.frequency*(l.endFrequency/l.frequency)**u;
    phase+=(f*rate+l.modDepth*Math.sin(2*Math.PI*l.modRate*t))/sr;
    const x=((phase%1)+1)%1,noise=rng()*2-1;
    let val=l.source.includes('noise')?noise:l.source==='sine'?Math.sin(phase*2*Math.PI):l.source==='square'?(x<.5?1:-1):l.source==='triangle'?1-4*Math.abs(x-.5):2*x-1;
    const envelope=amplitude(l,t);
    for(let c=0;c<channels;c++){
      if(l.source==='sample') {const data=sample.getChannelData(c),pos=(l.trim+t*rate)*sample.sampleRate,j=Math.floor(pos);val=j>=0&&j<data.length?data[j]*(1-(pos-j))+(data[j+1]||0)*(pos-j):0;}
      result[c][l.reverse?n-1-i:i]=val*envelope;
    }
  }
  return result;
}
async function renderLayer(l,p,sr,length,resolve) {
  let sample;if(l.source==='sample'){sample=await resolve(l.assetId);if(!sample)throw Error(`Missing sample “${l.assetName||l.name}”. Select this layer and relink its audio file.`);}
  const ctx=offline(2,length,sr);let src,output;
  if(['sine','triangle','sawtooth','square'].includes(l.source)&&!l.reverse){
    src=ctx.createOscillator();src.type=l.source;
    const rate=2**(l.pitch/12);
    src.frequency.setValueAtTime(l.frequency*rate,l.start);
    src.frequency.exponentialRampToValueAtTime(l.endFrequency*rate,l.start+l.duration);
    if(l.modRate&&l.modDepth){const mod=ctx.createOscillator(),depth=ctx.createGain();mod.frequency.value=l.modRate;depth.gain.value=l.modDepth;mod.connect(depth);depth.connect(src.frequency);mod.start(l.start);mod.stop(l.start+l.duration);}
    output=ctx.createGain();const env=Float32Array.from({length:Math.max(2,Math.ceil(l.duration*sr))},(_,i)=>amplitude(l,i/sr));
    output.gain.setValueCurveAtTime(env,l.start,l.duration);src.connect(output);
  }else{
    const raw=dryData(l,sr,(p.seed+Math.imul(p.layers.indexOf(l)+1,997))>>>0,sample),b=ctx.createBuffer(raw.length,raw[0].length,sr);raw.forEach((d,c)=>b.copyToChannel(d,c));
    src=ctx.createBufferSource();src.buffer=b;output=src;
  }
  const hp=ctx.createBiquadFilter();hp.type='highpass';hp.frequency.value=Math.min(l.highpass,sr*.45);hp.Q.value=l.resonance;
  const lp=ctx.createBiquadFilter();lp.type='lowpass';lp.frequency.value=Math.min(l.lowpass,sr*.45);lp.Q.value=l.resonance;
  if(l.source==='filtered-noise'){
    const band=ctx.createBiquadFilter();band.type='bandpass';band.Q.value=l.resonance;
    const rate=2**(l.pitch/12);band.frequency.setValueAtTime(Math.min(sr*.45,l.frequency*rate),l.start);band.frequency.exponentialRampToValueAtTime(Math.min(sr*.45,l.endFrequency*rate),l.start+l.duration);
    output.connect(band);band.connect(hp);
  }else output.connect(hp);
  hp.connect(lp);let node=lp;
  if(l.distortion){const sh=ctx.createWaveShaper(),curve=new Float32Array(4096),k=1+l.distortion*35;for(let i=0;i<curve.length;i++){const x=i*2/(curve.length-1)-1;curve[i]=Math.tanh(x*k)/Math.tanh(k);}sh.curve=curve;sh.oversample='2x';node.connect(sh);node=sh;}
  const gain=ctx.createGain();gain.gain.value=l.volume;node.connect(gain);
  const pan=ctx.createStereoPanner();pan.pan.value=l.pan;gain.connect(pan);pan.connect(ctx.destination);
  if(l.reverb){const con=ctx.createConvolver(),imp=ctx.createBuffer(2,Math.ceil(sr*l.reverbTime),sr),r=random(p.seed+17);for(let c=0;c<2;c++){const d=imp.getChannelData(c);for(let i=0;i<d.length;i++)d[i]=(r()*2-1)*(1-i/d.length)**2;}con.buffer=imp;const wet=ctx.createGain();wet.gain.value=l.reverb*.7;pan.connect(con);con.connect(wet);wet.connect(ctx.destination);}
  if(l.delay){for(let i=1;i<=8;i++){const d=ctx.createDelay(8);d.delayTime.value=l.delayTime*i;const g=ctx.createGain();g.gain.value=(l.delay*.75)**i;pan.connect(d);d.connect(g);g.connect(ctx.destination);}}
  src.start(l.start);if(['sine','triangle','sawtooth','square'].includes(l.source)&&!l.reverse)src.stop(l.start+l.duration);return ctx.startRendering();
}
export function protect(channels,normalize=false,stemPeak=0) {let peak=0;for(const data of channels)for(const v of data)peak=Math.max(peak,Math.abs(v));const gain=peak?Math.min(normalize?.95/peak:1,.98/Math.max(peak,stemPeak)):1;for(const data of channels)for(let i=0;i<data.length;i++)data[i]*=gain;return {peak,gain};}
export async function render(input,{sampleRate=48000,normalize=false,resolveAsset=async()=>null,onProgress=()=>{}}={}) {
  const p=preset(input),sr=sampleRate===44100?44100:48000,n=Math.ceil(duration(p)*sr),ctx=offline(2,1,sr),mix=ctx.createBuffer(2,n,sr),stems=[];
  const active=activeLayers(p);
  for(let j=0;j<active.length;j++){const {l,i}=active[j];onProgress(j/Math.max(1,active.length));const buffer=await renderLayer(l,p,sr,n,resolveAsset);stems.push({index:i,name:l.name,buffer});for(let c=0;c<2;c++){const m=mix.getChannelData(c),d=buffer.getChannelData(c);for(let k=0;k<n;k++)m[k]+=d[k];}}
  let stemPeak=0;for(const {buffer} of stems)for(let c=0;c<2;c++)for(const v of buffer.getChannelData(c))stemPeak=Math.max(stemPeak,Math.abs(v));
  const stats=protect([mix.getChannelData(0),mix.getChannelData(1)],normalize,stemPeak);
  // One common gain preserves the relationship between the mix and exported stems.
  for(const {buffer} of stems)for(let c=0;c<2;c++){const d=buffer.getChannelData(c);for(let i=0;i<d.length;i++)d[i]*=stats.gain;}
  onProgress(1);return {buffer:mix,stems,...stats};
}
export function playBuffer(ctx,buffer,{destination=ctx.destination,when=ctx.currentTime,offset=0}={}) {const node=ctx.createBufferSource();node.buffer=buffer;node.connect(destination);node.onended=()=>node.disconnect();node.start(Math.max(ctx.currentTime,when),clamp(offset,0,buffer.duration));return node;}
