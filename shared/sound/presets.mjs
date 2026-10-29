import {preset,CATEGORIES} from './model.mjs';
// All factory sounds are synthesized; no licensed or third-party samples.
const recipes=[
 ['Cyber Glitch',0,'square',780,120,.48,24,180,1800,.35],['Signal Corruption',0,'noise',240,180,.85,38,500,3200,.6],['Digital Stutter',0,'sawtooth',460,920,.65,16,80,6000,.2],['Data Transmission',0,'sine',1800,2600,1.1,30,900,9000,.05],['Retro Computer',0,'square',220,880,.38,8,0,4500,.1],
 ['Heavy Impact',1,'sine',180,35,.7,0,0,1400,.3],['Sub Bass Hit',1,'sine',85,28,1,0,0,600,.1],['Metallic Slam',1,'triangle',1200,180,.55,0,800,6500,.5],['Cinematic Boom',1,'sine',110,32,1.8,0,25,2400,.25],['Punch Transient',1,'noise',300,100,.15,0,0,9000,.65],
 ['Fast Whoosh',2,'noise',220,1800,.35,0,0,6500,.05],['Reverse Sweep',2,'noise',100,900,1.2,0,0,4200,.1],['Speed Ramp',2,'sawtooth',65,1400,.8,0,60,5000,.2],['Air Swipe',2,'noise',200,800,.55,0,0,14000,0],['Laser Pass',2,'sine',2800,80,.4,0,120,9000,.15],
 ['Mechanical Lock',3,'square',340,80,.22,12,160,2200,.35],['Hydraulic Release',3,'noise',400,60,1,0,0,3000,.25],['Servo Movement',3,'sawtooth',110,440,.85,18,240,1800,.15],['Gear Ratchet',3,'triangle',600,140,.6,45,170,3800,.4],['Power Switch',3,'square',90,240,.18,0,400,1700,.5],
 ['Data Confirm',4,'sine',880,1320,.3,0,0,12000,0],['UI Click',4,'noise',1000,800,.035,0,0,14000,.1],['Warning Alert',4,'square',660,660,.9,6,120,2800,.1],['Scanner Pulse',4,'sine',1400,400,.65,10,70,5000,.05],['Soft Notification',4,'triangle',523,1046,.65,0,0,7500,0],
 ['Dark Riser',5,'sawtooth',40,320,3.5,0,25,2000,.2],['Suspense Drone',5,'triangle',55,58,5,0,7,900,.1],['Electronic Hum',5,'sine',60,60,4,0,12,1200,.15],['Deep Space',5,'noise',50,120,4.5,0,0,700,.1],['Tension Pulse',5,'sawtooth',82,110,3,4,35,1600,.2]
];
export const FACTORY=recipes.map(([name,c,source,frequency,endFrequency,duration,pulse,modDepth,lowpass,distortion],i)=>{
 const atmosphere=c===5,whoosh=c===2,impact=c===1;
 const main={name:'Body',source:source==='noise'&&(whoosh||atmosphere||c===3)?'filtered-noise':source,frequency,endFrequency,duration,pulse,modDepth,modRate:15+i*3,lowpass,distortion,volume:.45,attack:atmosphere?.6:whoosh?duration*.5:.002,decay:impact?.08:.15,sustain:impact?.08:.65,release:atmosphere?1:.15,fadeIn:whoosh?duration*.65:.002,fadeOut:whoosh?.04:.08,reverb:atmosphere?.35:impact?.2:.06,reverbTime:atmosphere?2:1,reverse:name==='Reverse Sweep'};
 const accent={name:impact?'Transient':'Accent',source:impact?'noise':'sine',frequency:frequency*1.5,endFrequency:Math.max(25,endFrequency*.75),duration:impact?.07:duration*.65,start:impact?0:duration*.18,volume:impact?.28:.12,pan:i%2?.25:-.25,lowpass:impact?8000:4000,highpass:impact?1000:20,attack:.002,sustain:.15,release:.15,delay:c===0||c===4?.28:0,delayTime:.09+i*.003};
 return preset({version:1,id:`factory-${i}`,name,category:CATEGORIES[c],seed:1001+i*733,layers:[main,accent]});
});
