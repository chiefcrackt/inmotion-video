export const defaults={fit:'cover',zoom:1,x:50,y:50,rotation:0,flip:false,frame:48,overlay:87};
export function photoSettings(slide){return {...defaults,...slide.photoSettings};}
export function photoGeometry(width,height,boxWidth,boxHeight,p){const rotated=p.rotation%180!==0,w=rotated?height:width,h=rotated?width:height;const scale=(p.fit==='contain'?Math.min(boxWidth/w,boxHeight/h):Math.max(boxWidth/w,boxHeight/h))*p.zoom;return {scale,x:boxWidth/2+(p.x-50)/100*Math.abs(w*scale-boxWidth),y:boxHeight/2+(p.y-50)/100*Math.abs(h*scale-boxHeight)};}
