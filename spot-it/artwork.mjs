// Original T.im prototype. Every component shares a transparent 960 × 540 stage.
export const duration = 5.2;
export const pieces = {
  trail:
    '<path d="M70 365C160 365 160 220 266 220" fill="none" stroke="#2e9bad" stroke-width="8" stroke-linecap="round"/>',
  target: '<circle cx="290" cy="220" r="9" fill="#e8c96a"/>',
  leader:
    '<path d="M290 220L395 130H470" fill="none" stroke="#e8c96a" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
  card: '<path d="M470 78H844L872 130 844 182H470Z" fill="#0e1a2e" stroke="#e8c96a" stroke-width="5"/><path d="M486 94v72M816 157h22l15-27-15-27h-22l15 27Z" fill="none" stroke="#2e9bad" stroke-width="7"/>',
  marker:
    '<path d="M-19-18H6L24 0 6 18H-19L-3 0Z" fill="#e8c96a" stroke="#0e1a2e" stroke-width="3"/><path d="M-30-11-19 0-30 11" fill="none" stroke="#2e9bad" stroke-width="6" stroke-linecap="round"/>',
};
const clamp = (x) => Math.max(0, Math.min(1, x));
const smooth = (x) => {
  x = clamp(x);
  return x * x * (3 - 2 * x);
};
const back = (x) => {
  x = clamp(x) - 1;
  return 1 + 2.70158 * x * x * x + 1.70158 * x * x;
};
export function frame(t, label = '') {
  const exit = 1 - smooth((t - 4.35) / 0.55),
    run = smooth((t - 0.15) / 0.65),
    land = back((t - 0.8) / 0.45);
  const reveal = smooth((t - 1.5) / 0.5),
    card = smooth((t - 1.9) / 0.4),
    resolve = smooth((t - 0.85) / 0.35);
  const markerX = 70 + 220 * run,
    markerY = 365 - 145 * run - 48 * Math.sin(Math.PI * run);
  const markerScale =
    t < 0.8 ? 1 : 1 - 0.2 * Math.sin(Math.PI * clamp((t - 0.8) / 0.45));
  const escape = (s) =>
    s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;');
  return `<g opacity="${exit}">
    <g opacity="${smooth((t - 0.15) / 0.2) * (1 - smooth((t - 0.95) / 0.6))}" stroke-dasharray="360" stroke-dashoffset="${360 * (1 - run)}">${pieces.trail}</g>
    <g opacity="${resolve}" transform="translate(290 220) scale(${Math.max(0, land)}) translate(-290 -220)">${pieces.target}</g>
    <g opacity="${0.8 * Math.sin(Math.PI * clamp((t - 0.9) / 0.65))}" fill="none" stroke="#2e9bad" stroke-width="3"><circle cx="290" cy="220" r="${12 + 38 * clamp((t - 0.9) / 0.65)}"/></g>
    <g stroke-dasharray="214" stroke-dashoffset="${214 * (1 - reveal)}" opacity="${t >= 1.5 ? 1 : 0}">${pieces.leader}</g>
    <g opacity="${card}" transform="translate(470 130) scale(${card} 1) translate(-470 -130)">${pieces.card}</g>
    <g transform="translate(${markerX} ${markerY}) rotate(${t < 0.8 ? -25 * Math.sin(Math.PI * run) : 0}) scale(${markerScale * (1 - 0.75 * resolve)})" opacity="${smooth((t - 0.1) / 0.1) * (1 - resolve)}">${pieces.marker}</g>
    ${label ? `<text x="515" y="142" font-family="Arial,sans-serif" font-size="30" font-weight="700" fill="#f6f4ef" opacity="${smooth((t - 2.2) / 0.35)}">${escape(label.slice(0, 18))}</text>` : ''}
  </g>`;
}
export const svg = (body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540" viewBox="0 0 960 540">${body}</svg>`;
