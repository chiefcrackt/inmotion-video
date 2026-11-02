// Original T.im motion graphics. Layer coordinates use each asset's full canvas.
export const colors = { navy: '#0e1a2e', gold: '#e8c96a', teal: '#2e9bad', paper: '#f6f4ef' };
const layer = (id, body, motion = 'none', origin = null) => ({ id, body, motion, origin });
const asset = (id, name, category, width, height, layers, hint) => ({ id, name, category, width, height, layers, hint });
export const assets = [
  asset('stat-card', 'Stat card', 'panels', 480, 240, [
    layer('panel', '<rect x="24" y="24" width="432" height="192" rx="24" fill="N" stroke="G" stroke-width="8"/>', 'slide'),
    layer('accent', '<path d="M44 70V44h66m326 126v26h-66" stroke="T" stroke-width="12"/>', 'pulse'),
    layer('divider', '<path d="M64 158h352" stroke="G" stroke-width="4"/>'),
  ], 'Add a value above the divider and its label below. Slide in the panel, then reveal the text.'),
  asset('stat-pill', 'Stat pill', 'panels', 480, 160, [
    layer('panel', '<rect x="20" y="24" width="440" height="112" rx="56" fill="N" stroke="G" stroke-width="8"/>', 'slide'),
    layer('accent', '<circle cx="76" cy="80" r="25" fill="T"/>', 'pulse', [76,80]),
    layer('divider', '<path d="M126 51v58" stroke="G" stroke-width="4"/>'),
  ], 'Put a metric icon on the accent disc and your value in the blank field.'),
  asset('lower-third', 'Lower third', 'panels', 640, 200, [
    layer('panel', '<path d="M24 38h560l32 62-32 62H24z" fill="N" stroke="G" stroke-width="8"/>', 'slide'),
    layer('accent', '<path d="M24 38h20v124H24z" fill="T"/><path d="M64 144h480" stroke="T" stroke-width="6"/>'),
    layer('tag', '<path d="M548 60h22l20 40-20 40h-22l20-40z" fill="G"/>', 'nudge'),
  ], 'Add a name or chapter title above the teal rule. Keep type inside the navy area.'),
  asset('split-card', 'Compare card', 'panels', 480, 260, [
    layer('left', '<rect x="20" y="24" width="212" height="212" rx="20" fill="N" stroke="G" stroke-width="7"/>', 'slide'),
    layer('right', '<rect x="248" y="24" width="212" height="212" rx="20" fill="N" stroke="T" stroke-width="7"/>', 'rise'),
    layer('accents', '<path d="M52 188h148m80 0h148" stroke="G" stroke-width="5"/>'),
  ], 'Reveal a before and after, target and actual, or two race splits independently.'),
  asset('result-badge', 'Result badge', 'panels', 320, 320, [
    layer('ribbons', '<path d="M86 174l-23 113 51-21 36 35 22-113m62-14l23 113-51-21-36 35-22-113" fill="T" stroke="N" stroke-width="7"/>', 'rise'),
    layer('disc', '<circle cx="160" cy="136" r="108" fill="N" stroke="G" stroke-width="9"/>', 'pulse', [160,136]),
    layer('inner-ring', '<circle cx="160" cy="136" r="88" stroke="T" stroke-width="4" stroke-dasharray="8 10"/>', 'turn', [160,136]),
  ], 'Place a finish time or milestone in the empty centre. Ribbons and rings are separate.'),
  asset('progress-bar', 'Progress bar', 'panels', 640, 120, [
    layer('track', '<rect x="20" y="30" width="600" height="60" rx="30" fill="N" stroke="G" stroke-width="6"/>'),
    layer('fill', '<rect x="32" y="42" width="356" height="36" rx="18" fill="T"/>', 'reveal', [32,60]),
    layer('marker', '<circle cx="388" cy="60" r="23" fill="G" stroke="N" stroke-width="5"/>', 'pulse', [388,60]),
  ], 'Scale or mask the fill from its left anchor. Move the marker to match your actual progress.'),

  asset('arrow-straight', 'Direction arrow', 'pointers', 320, 160, [
    layer('shaft', '<path d="M28 63h168v34H28z" fill="T" stroke="N" stroke-width="7"/>', 'nudge'),
    layer('head', '<path d="M180 23l104 57-104 57z" fill="G" stroke="N" stroke-width="8"/>', 'nudge'),
  ], 'Move the shaft and head together for a nudge; rotate the full group to point anywhere.'),
  asset('arrow-curve', 'Curved arrow', 'pointers', 320, 240, [
    layer('curve', '<path d="M36 202V124q0-66 83-66h89" stroke="N" stroke-width="29"/><path d="M36 202V124q0-66 83-66h89" stroke="T" stroke-width="16"/>', 'fade'),
    layer('head', '<path d="M204 22l83 36-83 47z" fill="G" stroke="N" stroke-width="8"/>', 'nudge'),
  ], 'Reveal the curve before the arrowhead to guide attention toward a detail.'),
  asset('chevrons', 'Triple chevron', 'pointers', 320, 160, [
    ...[0,1,2].map(i => layer('chevron-'+(i+1), `<path d="M${24+i*92} 28l55 52-55 52h32l55-52-55-52z" fill="${i===1?'T':'G'}" stroke="N" stroke-width="6"/>`, 'nudge')),
  ], 'Stagger the three layers for forward motion, or use as a chapter transition.'),
  asset('route-pin', 'Route pin', 'pointers', 240, 320, [
    layer('halo', '<ellipse cx="120" cy="276" rx="72" ry="19" stroke="T" stroke-width="7"/>', 'pulse', [120,276]),
    layer('pin', '<path d="M120 26a76 76 0 0 0-76 76c0 66 76 157 76 157s76-91 76-157a76 76 0 0 0-76-76z" fill="G" stroke="N" stroke-width="9"/>', 'rise'),
    layer('centre', '<circle cx="120" cy="105" r="29" fill="T" stroke="N" stroke-width="7"/>', 'rise'),
  ], 'Pin and centre move together; keep the ground halo fixed and pulse its scale.'),
  asset('route-trail', 'Route trail', 'pointers', 480, 280, [
    layer('trail', '<path d="M48 224h119q74 0 74-65t72-65h112" stroke="T" stroke-width="15" stroke-dasharray="16 20"/>', 'dash'),
    layer('start', '<circle cx="48" cy="224" r="22" fill="G" stroke="N" stroke-width="7"/>'),
    layer('finish', '<circle cx="425" cy="94" r="24" fill="G" stroke="N" stroke-width="7"/><circle cx="425" cy="94" r="8" fill="N"/>', 'pulse', [425,94]),
  ], 'Animate the dashed route or reveal it with a mask. Endpoints stay on separate layers.'),
  asset('locator', 'Location pulse', 'pointers', 240, 240, [
    layer('outer-ring', '<circle cx="120" cy="120" r="91" stroke="T" stroke-width="7"/>', 'pulse'),
    layer('inner-ring', '<circle cx="120" cy="120" r="56" stroke="G" stroke-width="7"/>', 'pulse'),
    layer('dot', '<circle cx="120" cy="120" r="21" fill="G" stroke="N" stroke-width="6"/>'),
  ], 'Pulse both rings around the fixed centre dot, with a short delay between them.'),

  asset('speed-lines', 'Speed streaks', 'motion', 480, 240, [
    layer('top', '<path d="M28 52h284m32 0h50" stroke="G" stroke-width="18"/>', 'nudge'),
    layer('middle', '<path d="M84 120h348" stroke="T" stroke-width="23"/>', 'nudge'),
    layer('bottom', '<path d="M28 188h53m35 0h226" stroke="G" stroke-width="16"/>', 'nudge'),
  ], 'Offset and stagger the streaks behind a runner, product or moving title.'),
  asset('dust-puff', 'Dust puff', 'motion', 400, 240, [
    layer('cloud', '<path d="M57 191a41 41 0 0 1-1-82 53 53 0 0 1 94-29 61 61 0 0 1 112 18 47 47 0 0 1 76 71 34 34 0 0 1-28 22z" fill="G" stroke="N" stroke-width="8"/>', 'pulse', [198,176]),
    layer('flecks', '<circle cx="37" cy="52" r="11" fill="T"/><circle cx="345" cy="49" r="15" fill="T"/><circle cx="373" cy="112" r="8" fill="G"/>', 'rise'),
    layer('ground', '<path d="M87 214h230" stroke="T" stroke-width="8"/>'),
  ], 'Scale the cloud from its base and fade it out after a footstep or landing.'),
  asset('impact-burst', 'Impact burst', 'motion', 320, 320, [
    layer('burst', '<path d="M160 22l23 73 64-48-23 78 74 35-74 26 36 71-76-34-24 75-25-75-72 33 31-71-72-25 73-29-31-76 70 40z" fill="G" stroke="N" stroke-width="8"/>', 'pulse'),
    layer('centre', '<path d="M160 100l15 39 40 21-40 16-15 43-15-43-40-16 40-21z" fill="T"/>', 'turn'),
  ], 'Pop the outer burst first, then rotate or scale the centre for a beat hit.'),
  asset('sparkle', 'Sparkle cluster', 'motion', 320, 320, [
    layer('large', '<path d="M143 30l24 83 83 24-83 24-24 83-24-83-83-24 83-24z" fill="G" stroke="N" stroke-width="7"/>', 'pulse', [143,137]),
    layer('small-top', '<path d="M261 30l9 26 26 9-26 9-9 26-9-26-26-9 26-9z" fill="T"/>', 'pulse', [261,65]),
    layer('small-bottom', '<path d="M68 220l10 28 28 10-28 10-10 28-10-28-28-10 28-10z" fill="T"/>', 'pulse', [68,258]),
  ], 'Stagger the sparkle sizes for gear highlights, achievements or a clean reveal.'),
  asset('confetti', 'Confetti shower', 'motion', 480, 480, [
    layer('gold-pieces', '<path d="M48 74l28-11 19 43-28 11zm280-34l27 15-23 41-27-15zM190 179l29-6 10 46-29 6zM51 329l29 11-17 43-29-11zm280 19l28-14 21 41-28 14z" fill="G"/>', 'fall'),
    layer('teal-pieces', '<path d="M148 48l25 17-26 38-25-17zm239 121l29-7 11 46-29 7zM114 218l26-16 24 40-26 16zm98 139l29 10-15 44-29-10z" fill="T"/>', 'rise'),
    layer('streamers', '<path d="M53 171q36-31 48 6m175-40q39 10 17 46m72 82q49-6 36 33m-241 59q-36-15-24-42" stroke="G" stroke-width="10"/>', 'nudge'),
  ], 'Move the colour groups at different speeds and rotate them for a celebration.'),
  asset('finish-tape', 'Finish tape', 'motion', 640, 240, [
    layer('left-post', '<path d="M39 29v182" stroke="T" stroke-width="18"/><circle cx="39" cy="28" r="13" fill="G"/>'),
    layer('right-post', '<path d="M601 29v182" stroke="T" stroke-width="18"/><circle cx="601" cy="28" r="13" fill="G"/>'),
    layer('left-tape', '<path d="M39 69l270 20-29 25 29 28L39 121z" fill="G" stroke="N" stroke-width="6"/>', 'left'),
    layer('right-tape', '<path d="M601 69L331 89l29 25-29 28 270-21z" fill="G" stroke="N" stroke-width="6"/>', 'nudge'),
  ], 'Separate the torn tape halves outward while keeping both posts fixed.'),

  asset('underline', 'Highlight underline', 'callouts', 480, 120, [
    layer('main-stroke', '<path d="M30 63q207-34 420-11" stroke="G" stroke-width="19"/>', 'reveal', [30,60]),
    layer('echo', '<path d="M76 90q153-17 303-12" stroke="T" stroke-width="8"/>', 'reveal', [76,90]),
  ], 'Reveal from the left beneath a title, result or product name.'),
  asset('brackets', 'Focus brackets', 'callouts', 480, 240, [
    layer('left', '<path d="M96 26H30v188h66" stroke="G" stroke-width="13"/>', 'left'),
    layer('right', '<path d="M384 26h66v188h-66" stroke="G" stroke-width="13"/>', 'nudge'),
    layer('accents', '<path d="M58 80v80m364-80v80" stroke="T" stroke-width="7"/>', 'pulse'),
  ], 'Frame footage or a metric. Move the two bracket halves inward to focus attention.'),
  asset('speech-bubble', 'Speech bubble', 'callouts', 480, 280, [
    layer('panel', '<path d="M28 26h424v174H174l-68 56v-56H28z" fill="N" stroke="G" stroke-width="8"/>', 'rise'),
    layer('accent', '<path d="M51 63V48h54m326 114v16h-53" stroke="T" stroke-width="8"/>', 'pulse'),
  ], 'Add a short quote or training note. Keep text above the pointer tail.'),
  asset('chapter-tab', 'Chapter tab', 'callouts', 480, 180, [
    layer('panel', '<path d="M24 28h396l36 62-36 62H24z" fill="N" stroke="G" stroke-width="7"/>', 'slide'),
    layer('number-field', '<path d="M24 28h98v124H24z" fill="T" stroke="N" stroke-width="4"/>'),
    layer('accent', '<path d="M153 125h228" stroke="G" stroke-width="5"/>', 'reveal', [153,125]),
  ], 'Put a chapter number in the teal block and a title in the blank navy field.'),
  asset('radial-ring', 'Radial progress ring', 'callouts', 320, 320, [
    layer('track', '<circle cx="160" cy="160" r="117" stroke="N" stroke-width="26"/>'),
    layer('progress', '<path d="M160 43a117 117 0 1 1-117 117" stroke="G" stroke-width="17"/>', 'turn'),
    layer('ticks', '<path d="M160 18v13m129 129h13M160 289v13M18 160h13" stroke="T" stroke-width="8"/>', 'pulse'),
  ], 'Rotate for a loading loop, or trim the progress stroke to show a real percentage.'),
  asset('podium', 'Milestone podium', 'callouts', 480, 320, [
    layer('base', '<path d="M32 178h128v104H32zm128-84h160v188H160zm160 119h128v69H320z" fill="N" stroke="G" stroke-width="7"/>', 'rise'),
    layer('accents', '<path d="M52 199h88m40-84h120m40 118h88" stroke="T" stroke-width="9"/>'),
    layer('star', '<path d="M240 20l11 21 24 4-18 17 4 24-21-11-21 11 4-24-18-17 24-4z" fill="G" stroke="N" stroke-width="4"/>', 'pulse', [240,54]),
  ], 'Add rankings or milestone numbers to the blank steps; pop the star after the reveal.'),
];
export const animationCSS = `
@keyframes pulse{0%,100%{transform:scale(.9);opacity:.65}50%{transform:scale(1);opacity:1}}
@keyframes nudge{0%,100%{transform:translateX(-6px)}50%{transform:translateX(6px)}}
@keyframes left{0%,100%{transform:translateX(6px)}50%{transform:translateX(-6px)}}
@keyframes slide{0%,100%{transform:translateX(-8px);opacity:.65}50%{transform:translateX(0);opacity:1}}
@keyframes rise{0%,100%{transform:translateY(7px);opacity:.65}50%{transform:translateY(0);opacity:1}}
@keyframes fall{0%,100%{transform:translateY(-7px)}50%{transform:translateY(7px)}}
@keyframes turn{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}
@keyframes reveal{0%,100%{transform:scaleX(.65)}50%{transform:scaleX(1)}}
@keyframes fade{0%,100%{opacity:.4}50%{opacity:1}}
@keyframes dash{to{stroke-dashoffset:-72}}
${['pulse','nudge','left','slide','rise','fall','turn','reveal','fade','dash'].map(m => `.m-${m}{animation:${m} ${m==='turn'?3:2.4}s ease-in-out infinite${m==='turn'?' alternate':''};transform-box:view-box}`).join('\n')}
@media(prefers-reduced-motion:reduce){g{animation:none!important}}`;
function paint(body) { return body.replace(/([="'])([NGTP])(?=["'])/g, (_, lead, c) => lead + ({ N:colors.navy,G:colors.gold,T:colors.teal,P:colors.paper })[c]); }
export function svg(item, { layerId = null, animated = false } = {}) {
  const selected = layerId ? item.layers.filter(l => l.id === layerId) : item.layers;
  if (!selected.length) throw new Error('Unknown layer: ' + layerId);
  const groups = selected.map((l,i) => `<g id="${l.id}" class="m-${l.motion}" style="transform-origin:${(l.origin || [item.width/2,item.height/2]).map(n=>n+'px').join(' ')};animation-delay:-${i*.3}s">${paint(l.body)}</g>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${item.width*2}" height="${item.height*2}" viewBox="0 0 ${item.width} ${item.height}" fill="none" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${item.name}"><title>${item.name}</title>${animated?'<style>'+animationCSS+'</style>':''}${groups}</svg>\n`;
}
