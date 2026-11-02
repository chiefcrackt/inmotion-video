// Overlay artwork uses a 128-unit grid, 7-unit outlines and the T.im palette.
// These are filled production assets; shared/icons.mjs remains the UI icon set.
export const palette = { navy: '#0e1a2e', gold: '#e8c96a', teal: '#2e9bad', paper: '#f6f4ef' };
const paths = [
  ['running-shoe', 'Running shoe', 'running', '<path fill="G" d="M17 52l18 9 14-16 19 24 28 10q15 6 15 20H17z"/><path fill="T" d="M17 88h94v15H17z"/><path d="M43 60l14-4m-6 14l14-4m-6 14l14-4"/><path d="M18 37h17M14 23h27" stroke="T"/>'],
  ['route', 'Route', 'running', '<path d="M29 94h48q23 0 23-21T77 52H51q-20 0-20-20" stroke="T" stroke-width="11"/><circle cx="29" cy="95" r="11" fill="G"/><path fill="G" d="M31 12a18 18 0 0 0-18 18c0 14 18 29 18 29s18-15 18-29a18 18 0 0 0-18-18z"/><circle cx="31" cy="30" r="5" fill="N" stroke="none"/><path fill="G" d="M86 14h25v24H86z"/><path d="M86 14v40"/>'],
  ['stopwatch', 'Stopwatch', 'running', '<path d="M53 15h22M64 15v15M93 34l10-10"/><circle cx="64" cy="73" r="39" fill="G"/><path d="M64 46v27l18 11"/><path d="M31 73h5m56 0h5M64 100v5" stroke="T"/>'],
  ['pace', 'Pace', 'running', '<path fill="G" d="M20 94a47 47 0 1 1 88 0z"/><path d="M64 80l26-28" stroke-width="9"/><circle cx="64" cy="80" r="8" fill="T"/><path d="M30 73h7m4-26l5 5m18-16v7m27 30h7"/><path d="M38 109h52" stroke="T"/>'],
  ['elevation', 'Elevation', 'running', '<path fill="G" d="M12 105l38-67 19 33 14-21 33 55z"/><path fill="T" d="M50 38L34 66h16l9-12z"/><path d="M83 31V12m-10 9l10-10 10 10" stroke="T"/><path d="M20 112h89"/>'],
  ['distance', 'Distance', 'running', '<path fill="G" d="M16 46h96v38H16z"/><path d="M32 46v17m16-17v10m16-10v17m16-17v10m16-10v17"/><path d="M21 25h86M21 25l10-9M21 25l10 9m76-9l-10-9m10 9l-10 9" stroke="T"/><path d="M40 103h48" stroke="T"/>'],
  ['heart-rate', 'Heart rate', 'running', '<path fill="G" d="M64 105L21 65C-2 39 34 8 56 31l8 9 8-9c23-23 58 8 35 34z"/><path d="M16 65h24l12-20 16 39 12-19h32" stroke="T" stroke-width="8"/>'],
  ['finish-flag', 'Finish flag', 'running', '<path d="M25 16v96"/><path fill="G" d="M26 21h80v55H26z"/><path fill="N" stroke="none" d="M26 21h20v18H26zm40 0h20v18H66zM46 39h20v19H46zm40 0h20v19H86zM26 58h20v18H26zm40 0h20v18H66z"/><path d="M15 112h43" stroke="T"/>'],
  ['medal', 'Medal', 'running', '<path fill="T" d="M29 14h23l21 40-20 12z"/><path fill="G" d="M78 14h23L77 66 57 54z"/><circle cx="64" cy="80" r="32" fill="G"/><path fill="T" d="M64 60l6 12 13 2-10 9 3 13-12-6-12 6 3-13-10-9 13-2z" stroke-width="4"/>'],
  ['hydration', 'Hydration', 'running', '<path fill="G" d="M47 15h34v17H47z"/><path fill="G" d="M43 32h42l10 17v58H33V49z"/><path fill="T" d="M33 60h62v34H33z"/><path fill="G" d="M64 65s-11 12-11 18a11 11 0 0 0 22 0c0-6-11-18-11-18z" stroke-width="4"/>'],
  ['energy-gel', 'Energy gel', 'running', '<path fill="T" d="M41 15h46v17H41z"/><path fill="G" d="M41 32h46l9 64-10 15H42L32 96z"/><path fill="T" d="M67 47L47 77h17l-4 20 23-32H66z" stroke-width="4"/>'],
  ['calendar', 'Training calendar', 'running', '<rect x="20" y="28" width="88" height="81" rx="9" fill="G"/><path fill="T" d="M20 37q0-9 9-9h70q9 0 9 9v16H20z"/><path d="M43 17v22m42-22v22"/><path d="M42 79l14 14 29-28" stroke-width="9"/>'],
  ['camera', 'Camera', 'creator', '<path fill="G" d="M15 42h25l9-15h30l9 15h25v63H15z"/><circle cx="64" cy="73" r="24" fill="T"/><circle cx="64" cy="73" r="11" fill="N" stroke="none"/><path d="M99 54h1" stroke-width="8"/>'],
  ['video-camera', 'Video camera', 'creator', '<rect x="14" y="35" width="70" height="67" rx="10" fill="G"/><path fill="T" d="M84 57l29-17v57L84 80z"/><path d="M30 54h20"/><circle cx="63" cy="83" r="6" fill="T" stroke="none"/>'],
  ['record', 'Record', 'creator', '<rect x="17" y="17" width="94" height="94" rx="23" fill="G"/><circle cx="64" cy="64" r="27" fill="T"/><circle cx="64" cy="64" r="13" fill="N" stroke="none"/>'],
  ['play', 'Play', 'creator', '<circle cx="64" cy="64" r="47" fill="G"/><path fill="T" d="M52 39v50l36-25z"/>'],
  ['audio-wave', 'Audio wave', 'creator', '<path d="M16 55v18m19-33v48m19-65v82m20-67v52m19-41v30m19-20v10" stroke="N" stroke-width="13"/><path d="M16 55v18m19-33v48m19-65v82" stroke="G" stroke-width="7"/><path d="M74 38v52m19-41v30m19-20v10" stroke="T" stroke-width="7"/>'],
  ['microphone', 'Microphone', 'creator', '<rect x="46" y="14" width="36" height="64" rx="18" fill="G"/><path d="M31 57v7a33 33 0 0 0 66 0v-7M64 97v16m-18 0h36" stroke="T"/><path d="M47 40h11m13 0h10M47 53h11m13 0h10" stroke-width="5"/>'],
  ['headphones', 'Headphones', 'creator', '<path d="M24 74V58a40 40 0 0 1 80 0v16" stroke="G" stroke-width="12"/><rect x="16" y="65" width="25" height="40" rx="8" fill="T"/><rect x="87" y="65" width="25" height="40" rx="8" fill="T"/><path d="M28 77v16m72-16v16" stroke="G" stroke-width="5"/>'],
  ['clapperboard', 'Clapperboard', 'creator', '<path fill="G" d="M17 50h94v59H17z"/><path fill="T" d="M17 50l-4-23 93-15 4 23z"/><path d="M34 24l12 20m16-25l12 20m15-24l12 20"/><path fill="T" d="M53 65v29l22-15z" stroke-width="4"/>'],
  ['scissors', 'Cut / scissors', 'creator', '<circle cx="33" cy="91" r="16" fill="G"/><circle cx="95" cy="91" r="16" fill="G"/><path d="M44 78l59-60M84 78L25 18" stroke="T" stroke-width="10"/><circle cx="64" cy="58" r="7" fill="G"/>'],
  ['captions', 'Captions', 'creator', '<path fill="G" d="M17 23h94v69H68l-24 19V92H17z"/><path d="M56 48a13 13 0 1 0 0 21m35-21a13 13 0 1 0 0 21" stroke="T" stroke-width="8"/>'],
  ['timeline', 'Timeline', 'creator', '<path d="M17 27h94M17 20v14m19-14v8m19-8v8m19-8v8m19-8v8m18-8v14"/><rect x="17" y="45" width="57" height="21" rx="4" fill="G"/><rect x="45" y="79" width="66" height="21" rx="4" fill="T"/><path d="M84 35v74" stroke="G"/><path fill="G" d="M75 33h18l-9 12z" stroke-width="3"/>'],
  ['upload', 'Publish / upload', 'creator', '<path fill="G" d="M64 15l30 30H76v34H52V45H34z"/><path fill="T" d="M19 77h20v16h50V77h20v34H19z"/>'],
];
export const icons = Object.freeze(paths.map(([id, name, category, body]) => ({ id, name, category, body })));
export function svg(icon) {
  const body = icon.body.replace(/([="'])([NGT])(?=["'])/g, (_, lead, color) => lead + ({ N: palette.navy, G: palette.gold, T: palette.teal })[color]);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 128 128" fill="none" stroke="${palette.navy}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="${icon.name}"><title>${icon.name.replaceAll('&', '&amp;')}</title>${body}</svg>\n`;
}
