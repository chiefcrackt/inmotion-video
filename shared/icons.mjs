// T.IM Studio icon set. Line-art, redrawn as 24×24 SVG paths in the style of the
// supplied Option B (workspaces) and Option C (tools) references. Strokes use
// currentColor, so each icon takes the colour of its surrounding element.
// Icons carry no text; labels are always HTML. Add new icons here, not inline.

const PATHS = {
  // Workspaces
  'workspace-plan':
    '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  'workspace-graphics':
    '<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M3 9l2.5-5.5h15.5V9"/><path d="M8 3.5L10.5 9M14 3.5L16.5 9"/><path d="M10.5 12.5v4l3.5-2z"/>',
  'workspace-running':
    '<path d="M3 16.5c2.5.5 5 .5 8-1.5l2-3 3 1.5c2.5.5 4.5 2 5.5 4.5v1H3z"/><path d="M7 11.5l1.5 1.5M9.5 9.5L11 11"/>',
  'workspace-audio':
    '<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="3" y="14" width="4" height="6" rx="1.5"/><rect x="17" y="14" width="4" height="6" rx="1.5"/>',
  'workspace-publishing':
    '<path d="M4 10v4h3l8 4V6L7 10H4z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/><path d="M7 14l1.5 5h2.5l-1.2-4.2"/>',
  'workspace-library':
    '<rect x="7" y="3" width="14" height="12" rx="2"/><path d="M3 7v11a2 2 0 0 0 2 2h13"/><path d="M7 13l3.5-3.5 3 3 2-2 3.5 3.5"/>',

  // Tools
  idea: '<path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z"/>',
  title: '<path d="M4 7V4h16v3M12 4v16M9 20h6"/>',
  'text-motion': '<path d="M3 8h12M7 12h14M3 16h9"/>',
  'video-framer': '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M10 9.5v5l4-2.5z"/>',
  carousel:
    '<rect x="2" y="6" width="5" height="12" rx="1"/><rect x="9.5" y="4" width="5" height="16" rx="1"/><rect x="17" y="6" width="5" height="12" rx="1"/>',
  'tier-list': '<path d="M3 6h2M3 12h2M3 18h2M8 6h13M8 12h10M8 18h7"/>',
  motion: '<path d="M3 17c3-6 6-6 9 0s6 6 9 0"/><circle cx="12" cy="6" r="2.5"/>',
  stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18 6l1.5-1.5"/>',
  river: '<path d="M2 9c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0M2 15c2.5-2 4.5-2 7 0s4.5 2 7 0 4.5-2 6 0"/>',
  mountain: '<path d="M2 20l6.5-10 4 6 2.5-3.5L22 20H2z"/>',
  shoe: '<path d="M3 16.5c2.5.5 5 .5 8-1.5l2-3 3 1.5c2.5.5 4.5 2 5.5 4.5v1H3z"/><path d="M7 11.5l1.5 1.5M9.5 9.5L11 11"/>',
  clapper:
    '<rect x="3" y="9" width="18" height="11" rx="1.5"/><path d="M3 9l2.5-5.5h15.5V9"/><path d="M8 3.5L10.5 9M14 3.5L16.5 9"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  waveform: '<path d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"/>',
  note: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  cover:
    '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="9.5" r="1.5"/><path d="M3 17l5-4.5 4 3.5 3-2.5 6 5"/>',
  megaphone: '<path d="M4 10v4h3l8 4V6L7 10H4z"/><path d="M18 9.5a3.5 3.5 0 0 1 0 5"/><path d="M7 14l1.5 5h2.5l-1.2-4.2"/>',
  folder:
    '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',

  // Navigation and actions
  home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l5 5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  library: '<path d="M4 4h4v16H4zM10 4h4v16h-4z"/><path d="M16 6l4 1-3 13-4-1z"/>',
};

export const ICON_NAMES = Object.freeze(Object.keys(PATHS));

function escapeAttr(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

/** Returns the SVG markup for an icon. Decorative by default; pass a label to expose it. */
export function iconSvg(name, { label } = {}) {
  const body = PATHS[name];
  if (!body) throw new Error('Unknown icon: ' + name);
  const access = label
    ? ` role="img" aria-label="${escapeAttr(label)}"`
    : ' aria-hidden="true" focusable="false"';
  return (
    '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"' +
    access +
    '>' +
    body +
    '</svg>'
  );
}
