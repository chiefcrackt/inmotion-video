import {listPresets,assetResolver} from './storage.mjs';
import {render,playBuffer} from './engine.mjs';
// Adapter for existing T.im MediaRecorder graphs. The caller supplies its audio
// context and destination so rendered sounds reach both speakers and recording.
export function createSoundPicker({container,getContext,getDestination,onStatus=()=>{}}){
 const label=document.createElement('label');label.textContent='Shared SOUND FORGE preset';
 const select=document.createElement('select'),refresh=document.createElement('button'),status=document.createElement('p'),offset=document.createElement('input');
 select.style.cssText='width:100%;padding:10px;background:#0E1A2E;color:#F6F4EF;border:1px solid #25395C;border-radius:7px';
 refresh.textContent='Refresh saved sounds';refresh.type='button';refresh.className='btn';status.className='note';
 const timing=document.createElement('label');timing.textContent='Sound start offset (seconds)';offset.type='number';offset.min='0';offset.max='20';offset.step='.05';offset.value='0';timing.append(offset);
 label.append(select);container.append(label,timing,refresh,status);let presets=[],buffer=null,selection=0,disposed=false;
 const say=s=>{status.textContent=s;onStatus(s);};
 async function reload(){try{presets=await listPresets();select.replaceChildren(new Option('Use this tool’s original sound',''));for(const p of presets)select.append(new Option(p.name,p.id));buffer=null;say('Saved sounds use this browser’s shared library. Open SOUND FORGE to create one.');}catch(e){say(e.message);}}
 select.onchange=async()=>{const token=++selection;buffer=null;if(!select.value){say('Original sound selected.');return;}try{const ctx=getContext();await ctx.resume();say('Rendering saved sound… Original sound remains active until ready.');const p=presets.find(p=>p.id===select.value),r=await render(p,{sampleRate:ctx.sampleRate,resolveAsset:assetResolver(ctx)});if(token!==selection||disposed)return;buffer=r.buffer;say(`Ready · ${buffer.duration.toFixed(2)} seconds. Keep the sound and offset within your video length; longer tails are cut by the video’s end.`);}catch(e){if(token===selection)say(e.message);}};
 refresh.onclick=reload;reload();
 return {play(when){if(!buffer)return false;playBuffer(getContext(),buffer,{destination:getDestination(),when:when+Math.max(0,Math.min(20,+offset.value||0))});return true;},dispose(){disposed=true;selection++;container.replaceChildren();}};
}
