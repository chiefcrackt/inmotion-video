import {Decoder,Stream} from '@garmin/fitsdk';
import {parseXML,fromFIT} from './parsers.mjs';
// XML uses the same DOM API in a worker through a bundled standards-based parser.
import {DOMParser} from '@xmldom/xmldom';
self.onmessage=({data:{buffer,format}})=>{
  try {
    let activity;
    if(format==='fit') {
      const decoder=new Decoder(Stream.fromArrayBuffer(buffer));
      if(!decoder.isFIT()||!decoder.checkIntegrity())throw Error('FIT integrity check failed. The file may be incomplete or corrupt.');
      const {messages,errors}=decoder.read();if(errors.length)throw Error('FIT decoding failed: '+errors.map(e=>e.message||e).join('; '));
      activity=fromFIT(messages);
    } else activity=parseXML(new TextDecoder().decode(buffer),format,DOMParser);
    self.postMessage({activity});
  }catch(e){self.postMessage({error:e.message||'Unable to read this activity.'});}
};
