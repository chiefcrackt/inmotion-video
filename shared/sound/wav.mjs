export function encodeWav(buffer) {
  const channels=Math.min(2,buffer.numberOfChannels), frames=buffer.length;
  const out=new ArrayBuffer(44+frames*channels*2),v=new DataView(out);
  const str=(at,s)=>{for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));};
  str(0,'RIFF');v.setUint32(4,out.byteLength-8,true);str(8,'WAVE');str(12,'fmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,channels,true);v.setUint32(24,buffer.sampleRate,true);v.setUint32(28,buffer.sampleRate*channels*2,true);v.setUint16(32,channels*2,true);v.setUint16(34,16,true);str(36,'data');v.setUint32(40,frames*channels*2,true);
  const data=Array.from({length:channels},(_,c)=>buffer.getChannelData(c));let at=44;
  for(let i=0;i<frames;i++)for(let c=0;c<channels;c++){const n=Math.max(-1,Math.min(1,data[c][i]||0));v.setInt16(at,Math.round(n*(n<0?32768:32767)),true);at+=2;}
  return out;
}
export function download(data,name,type='application/octet-stream') {const b=data instanceof Blob?data:new Blob([data],{type});const url=URL.createObjectURL(b),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
