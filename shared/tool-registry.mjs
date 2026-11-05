// Single source of truth for the T.IM Studio dashboard: workspaces and tools.
// The homepage, search, category filters, navigation and counts are all derived
// from this file. Do not hardcode tool lists or counts anywhere else.
//
// Each tool has ONE canonical href. A tool may appear in several workspaces,
// but its page is never duplicated.

export const WORKSPACES = Object.freeze([
  { id: 'plan', number: '01', name: 'Plan & Organize', blurb: 'Develop ideas, manage outlines and track production.', icon: 'workspace-plan' },
  { id: 'graphics', number: '02', name: 'Graphics & Video', blurb: 'Titles, motion graphics, overlays and video assets.', icon: 'workspace-graphics' },
  { id: 'running', number: '03', name: 'Running Studio', blurb: 'Running content, route graphics and stats.', icon: 'workspace-running' },
  { id: 'audio', number: '04', name: 'Audio Studio', blurb: 'Music, sound effects and audio elements.', icon: 'workspace-audio' },
  { id: 'publishing', number: '05', name: 'Publishing Studio', blurb: 'Thumbnails, promo graphics and social posts.', icon: 'workspace-publishing' },
  { id: 'library', number: '06', name: 'Asset Library', blurb: 'Reusable icons, graphics, animations and downloads.', icon: 'workspace-library' },
]);

// quick: true places the tool in Quick Launch. quickLabel overrides its short label.
export const TOOLS = Object.freeze([
  {
    id: 'transcribe-video',
    name: 'Transcribe Video',
    href: 'transcribe-video/',
    description: 'Computer only — requires the local Windows launcher. Transcribe recordings, edit text and export subtitles and word timings. Not available on phones or tablets.',
    workspaces: ['audio', 'plan', 'publishing'],
    keywords: ['transcription', 'transcript', 'captions', 'subtitles', 'speech', 'whisper', 'local', 'srt', 'vtt'],
    icon: 'idea',
  },
  {
    id: 'clean-voice',
    name: 'Clean Voice',
    href: 'clean-voice/',
    description: 'Computer only — requires the local Windows launcher. Remove background noise, isolate your voice from music and even out the volume on your NVIDIA GPU. Not available on phones or tablets.',
    workspaces: ['audio'],
    keywords: ['noise', 'denoise', 'noise reduction', 'voice', 'enhance', 'clean', 'audio', 'isolate', 'local', 'gpu', 'loudness'],
    icon: 'waveform',
  },
  {
    id: 'brand-assets',
    name: 'Brand Assets',
    href: 'brand-assets/',
    description: 'Editable Keep Moving and Find Your Flow stories, plus a YouTube banner. Animate waves and words, add sound, export PNG or video.',
    workspaces: ['graphics', 'publishing', 'library'],
    keywords: ['brand', 'waves', 'story', 'banner', 'keep moving', 'find your flow', 'templates', 'sound'],
    icon: 'title',
  },
  {
    id: 'content-planner',
    featured: true,
    quick: true,
    quickLabel: 'Plan videos',
    name: 'Content Planner',
    href: 'content-planner/',
    description: 'Move videos from idea to published, with outlines, footage and thumbnails together.',
    workspaces: ['plan', 'publishing'],
    keywords: ['board', 'schedule', 'projects', 'production', 'outline'],
    icon: 'idea',
  },
  {
    id: 'teleprompter',
    name: 'Teleprompter',
    href: 'teleprompter/',
    description: 'Paste a script and scroll it at a steady pace on an iPad, with mirror mode and a reading line.',
    workspaces: ['plan'],
    keywords: ['teleprompter', 'script', 'prompter', 'read', 'ipad', 'scroll', 'speech', 'mirror'],
    icon: 'idea',
  },
  {
    id: 'before-after',
    name: 'Before & After',
    href: 'before-after/',
    description: 'Two photos in one frame: export a still, or an animated wipe from before to after.',
    workspaces: ['graphics', 'publishing'],
    keywords: ['before', 'after', 'compare', 'wipe', 'transformation', 'progress', 'split', 'reveal'],
    icon: 'cover',
  },
  {
    id: 'shoot-planner',
    name: 'Shoot Planner',
    href: 'shoot-planner/',
    description: 'Talking points, B-roll, gear and locations, with a phone-friendly filming mode.',
    workspaces: ['plan'],
    keywords: ['filming', 'shoot', 'checklist', 'gear', 'locations', 'b-roll'],
    icon: 'idea',
  },
  {
    id: 'idea-vault',
    name: 'Idea Vault',
    href: 'idea-vault/',
    description: 'Capture ideas, plan videos, track production and keep outlines.',
    workspaces: ['plan'],
    keywords: ['ideas', 'planning', 'outline', 'production', 'notes', 'youtube'],
    icon: 'idea',
    quick: true,
    quickLabel: 'New Idea',
  },
  {
    id: 'title-maker',
    name: 'Title Maker',
    href: 'title-maker/',
    description: 'Title cards, lower thirds, word tags and chapter cards, with sound.',
    workspaces: ['graphics'],
    keywords: ['title', 'lower third', 'chapter', 'typography', 'intro'],
    icon: 'title',
    quick: true,
  },
  {
    id: 'text-motion',
    name: 'Text Motion',
    href: 'text-motion/',
    description: 'Animate words with four simple entrances. Set colours, pick a format, export.',
    workspaces: ['graphics'],
    keywords: ['text', 'animation', 'motion', 'words', 'video'],
    icon: 'text-motion',
  },
  {
    id: 'video-framer',
    name: 'Video Framer',
    href: 'video-framer/',
    description: 'Branded frames both ways: vertical clips in 16:9, or 16:9 clips in 9:16.',
    workspaces: ['graphics'],
    keywords: ['frame', 'vertical', 'tiktok', 'youtube', 'shorts', 'reels', 'capcut', '9:16', '16:9'],
    icon: 'video-framer',
  },
  {
    id: 'carousel-maker',
    name: 'Carousel Post Maker',
    href: 'carousel-maker/',
    description: 'Consistent photo, text, stats and comparison slides, reorderable and numbered.',
    workspaces: ['graphics', 'publishing'],
    keywords: ['carousel', 'slides', 'instagram', 'post', 'stats', 'photos'],
    icon: 'carousel',
  },
  {
    id: 'tier-list',
    name: 'Tier List Maker',
    href: 'tier-list/',
    description: 'Rank what you have tried, as a carousel or a video with sound.',
    workspaces: ['graphics', 'publishing'],
    keywords: ['ranking', 'tier', 'list', 'rank'],
    icon: 'tier-list',
  },
  {
    id: 'start-line',
    name: 'Start Line Recorder',
    href: 'start-line/',
    description: 'The runner walks to the line, hears the countdown and takes off. Pick sound and scene.',
    workspaces: ['running', 'graphics'],
    keywords: ['start', 'countdown', 'race', 'runner', 'stopwatch', 'recorder'],
    icon: 'stopwatch',
  },
  {
    id: 'river-run',
    name: 'River Run Recorder',
    href: 'river-run/',
    description: 'The runner jogs along the river under a gold sun. Pick length, pace and jumps.',
    workspaces: ['running', 'graphics'],
    keywords: ['river', 'run', 'runner', 'recorder', 'scene'],
    icon: 'river',
  },
  {
    id: 'mile-marker',
    name: 'Mile Marker Maker',
    href: 'mile-marker/',
    description: 'A trail sign for any distance, with a ding that climbs as the miles go up.',
    workspaces: ['running', 'graphics'],
    keywords: ['mile', 'marker', 'trail', 'distance', 'sign'],
    icon: 'mountain',
  },
  {
    id: 'activity-studio',
    name: 'Activity Studio',
    href: 'activity-studio/',
    description: 'Turn FIT, GPX and TCX exports into running graphics, performance cards and GPS routes.',
    workspaces: ['running'],
    keywords: ['strava', 'garmin', 'fit', 'gpx', 'tcx', 'route', 'stats', 'activity', 'run stats'],
    icon: 'shoe',
    quick: true,
    quickLabel: 'Activity',
  },
  {
    id: 'special-post',
    name: 'Special Post Maker',
    href: 'special-post/',
    description: 'Birthdays, congrats and good luck: runners break the tape, the name lands, confetti drops.',
    workspaces: ['graphics'],
    keywords: ['birthday', 'congrats', 'celebrate', 'confetti', 'post'],
    icon: 'clapper',
  },
  {
    id: 'celebrate',
    name: 'Celebration Maker',
    href: 'celebrate/',
    description: 'A name card, a cake that blows out its candles, a race bib, or a finisher medal.',
    workspaces: ['graphics'],
    keywords: ['celebration', 'cake', 'medal', 'finisher', 'bib', 'star'],
    icon: 'star',
  },
  {
    id: 'sound-forge',
    name: 'Sound Forge',
    href: 'sound-forge/',
    description: 'Layered sound effects from 35 original presets. Synthesize, import samples, export WAV.',
    workspaces: ['audio'],
    keywords: ['sound', 'effects', 'sfx', 'wav', 'synth', 'audio'],
    icon: 'waveform',
    quick: true,
    quickLabel: 'Sound',
  },
  {
    id: 'beat-bed',
    name: 'Beat Bed',
    href: 'beat-bed/',
    description: 'A music bed in 14 styles. Lay it out in sections, mix the parts, save a WAV.',
    workspaces: ['audio'],
    keywords: ['music', 'beat', 'bed', 'track', 'groove', 'wav'],
    icon: 'note',
  },
  {
    id: 'cover-maker',
    name: 'Cover Maker',
    href: 'cover-maker/',
    description: 'YouTube thumbnails, Reel covers and Instagram highlight covers, saved as PNG.',
    workspaces: ['publishing'],
    keywords: ['thumbnail', 'cover', 'youtube', 'reels', 'highlights', 'png'],
    icon: 'cover',
    quick: true,
    quickLabel: 'Cover',
  },
  {
    id: 'promo-maker',
    name: 'Promo Maker',
    href: 'promo-maker/',
    description: 'An “Out now” clip with your thumbnail and title, for Stories, Reels and TikTok.',
    workspaces: ['publishing'],
    keywords: ['promo', 'release', 'out now', 'stories', 'reels', 'tiktok', 'announcement'],
    icon: 'megaphone',
    quick: true,
    quickLabel: 'Promo',
  },
  {
    id: 'downloads',
    name: 'Animation Downloads',
    href: 'downloads/',
    description: 'Finished trailer pack: River Run, Portal, The Loop and The Drop, with sound, ready for CapCut.',
    workspaces: ['library'],
    keywords: ['download', 'animation', 'trailer', 'capcut', 'ready-made', 'pack', 'templates'],
    icon: 'folder',
  },
  {
    id: 'motion-stats',
    name: 'Motion + Stats Kit',
    href: 'motion-stats/',
    description: '24 modular graphics with 68 movable layers: blank stat panels, arrows, routes and celebrations. PNGs, SVGs and animated examples.',
    workspaces: ['library'],
    keywords: ['assets', 'motion', 'stats', 'panels', 'arrows', 'confetti', 'layers', 'svg', 'png', 'overlays', 'download'],
    icon: 'grid',
  },
  {
    id: 'asset-studio',
    name: 'Asset Animator',
    href: 'asset-studio/',
    description: 'Arrange library graphics and text on a transparent canvas. Export standalone PNGs or animations to overlay in your own editor.',
    workspaces: ['graphics', 'library'],
    keywords: ['assets', 'animator', 'standalone', 'transparent', 'png', 'webm', 'overlay', 'layers', 'motion'],
    icon: 'star',
  },
  {
    id: 'weird-motion',
    name: 'Weird Motion Toys',
    href: 'weird-motion/',
    description: 'Portals, elastic grabbers, orbit swarms, a geometric critter, magnetic assembly, an inspection drone, a delivery bot, a shy star, a dumpling chef four cooking characters, a water flask, a running gel and an aid station tent. Two original actions each, with standalone overlays and editable callouts.',
    workspaces: ['library', 'graphics'],
    keywords: ['assets', 'weird', 'portal', 'critter', 'animation', 'transparent', 'overlays'],
    icon: 'star',
  },
  {
    id: 'product-spotlight',
    name: 'Product Spotlight Kit',
    href: 'product-spotlight/',
    description: '18 editable product labels, feature callouts and experience cards for your TikTok demos and affiliate videos.',
    workspaces: ['library'],
    keywords: ['product', 'spotlight', 'affiliate', 'tiktok', 'demo', 'features', 'callouts', 'templates', 'overlays'],
    icon: 'megaphone',
  },
  {
    id: 'icon-pack',
    name: 'Running + Creator Icons',
    href: 'icon-pack/',
    description: '24 bold navy, gold and teal icons for video overlays and social posts. Transparent PNGs and editable SVGs.',
    workspaces: ['library'],
    keywords: ['icons', 'icon pack', 'png', 'svg', 'overlay', 'running', 'creator', 'download', 'camera', 'route'],
    icon: 'grid',
  },
]);

// Preview-only dashboard grouping. Original tool IDs/hrefs remain canonical for
// projects, exports, saved setups and the current homepage.
export const DASHBOARD_GROUPS = Object.freeze([
  { id: 'content-studio', name: 'Content Studio', href: 'content-studio/', description: 'Capture ideas, plan videos and take your checklist filming.', members: ['content-planner', 'idea-vault', 'shoot-planner'], modes: ['projects', 'ideas', null] },
  { id: 'text-and-titles', name: 'Text & Titles', href: 'text-and-titles/', description: 'Animate words or create title cards, lower thirds and chapters with sound.', members: ['text-motion', 'title-maker'], modes: ['text', 'titles'] },
  { id: 'celebration-studio', name: 'Celebration Studio', href: 'celebration-studio/', description: 'Celebrate with runners, name cards, cakes, race bibs and medals.', members: ['special-post', 'celebrate'], modes: ['runners', 'cards'] },
  { id: 'publishing-studio', name: 'Publishing Studio', href: 'publishing-studio/', description: 'Make covers, announce a video or customize a brand template.', members: ['cover-maker', 'promo-maker', 'brand-assets'], modes: ['covers', 'promos', 'brand'] },
  { id: 'runner-animator', name: 'Runner Animator', href: 'runner-animator/', description: 'Count down to a race start or build a running scene.', members: ['start-line', 'river-run'], modes: ['start', 'run'] },
  { id: 'social-post-studio', name: 'Social Post Studio', href: 'social-post-studio/', description: 'Create a carousel, rank your favorites or show a before-and-after.', members: ['carousel-maker', 'tier-list', 'before-after'], modes: ['carousel', 'rankings', 'compare'] },
  { id: 'asset-library', name: 'Asset Animator & Library', href: 'asset-studio/', description: 'Browse the shared graphic packs and compose transparent overlays.', members: ['asset-studio', 'weird-motion', 'product-spotlight', 'icon-pack', 'motion-stats'] },
]);

export function dashboardEntries() {
  const grouped = new Set(DASHBOARD_GROUPS.flatMap((group) => group.members));
  return [
    ...DASHBOARD_GROUPS.map((group) => {
      const originals = group.members.map((id) => getTool(id));
      return {
        ...group,
        originals,
        workspaces: [...new Set(originals.flatMap((tool) => tool.workspaces))],
      };
    }),
    ...TOOLS.filter((tool) => !grouped.has(tool.id)).map((tool) => ({ ...tool, originals: [tool] })),
  ];
}

export function searchDashboard(query = '', { workspace = 'all' } = {}) {
  const normalized = String(query).trim().toLowerCase().replace(/\s+/g, ' ');
  const words = normalized.split(' ').filter(Boolean);
  const candidates = dashboardEntries().filter((entry) => workspace === 'all' || entry.workspaces.includes(workspace));
  const exact = normalized ? candidates.filter((entry) =>
    entry.name.toLowerCase() === normalized || entry.originals.some((tool) => tool.name.toLowerCase() === normalized),
  ) : [];
  return (exact.length ? exact : candidates).filter((entry) => {
    const text = [entry.name, entry.description, ...entry.originals.map(haystack)].join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  });
}

const workspaceById = new Map(WORKSPACES.map((w) => [w.id, w]));
const toolById = new Map(TOOLS.map((t) => [t.id, t]));

export function getWorkspace(id) {
  return workspaceById.get(id) || null;
}

export function getTool(id) {
  return toolById.get(id) || null;
}

export function toolsInWorkspace(workspaceId) {
  return TOOLS.filter((t) => t.workspaces.includes(workspaceId));
}

export function workspaceCounts() {
  return Object.fromEntries(WORKSPACES.map((w) => [w.id, toolsInWorkspace(w.id).length]));
}

export function quickLaunch() {
  return TOOLS.filter((t) => t.quick).map((t) => ({ tool: t, label: t.quickLabel || t.name }));
}

export function featuredTool() {
  return TOOLS.find((t) => t.featured) || null;
}

// Naming for every page except the homepage. The shared Studio bar
// (shared/studio-bar.mjs) and each page's <title> both use these, and
// tests/studio-bar.test.mjs checks that they agree.
export const STUDIO_NAME = 'T.IM Studio';

// Pages that are not tools or studio groups, keyed by directory.
const OTHER_PAGES = Object.freeze({ 'dashboard-preview/': 'Dashboard preview' });

/** Display name for a page directory such as 'title-maker/', or null. */
export function pageName(dir) {
  const tool = TOOLS.find((t) => t.href === dir);
  if (tool) return tool.name;
  const group = DASHBOARD_GROUPS.find((g) => g.href === dir);
  if (group) return group.id === 'content-studio' ? group.name : group.name + ' preview';
  return OTHER_PAGES[dir] || null;
}

/** The <title> every page uses: "Tool name · T.IM Studio". */
export function pageTitle(name) {
  return `${name} · ${STUDIO_NAME}`;
}

/** Every directory that should carry the Studio bar. */
export function studioPages() {
  const dirs = new Set([
    ...TOOLS.map((t) => t.href),
    ...DASHBOARD_GROUPS.map((g) => g.href),
    ...Object.keys(OTHER_PAGES),
  ]);
  return [...dirs].map((dir) => ({ dir, name: pageName(dir) }));
}

// Plain-text haystack used by search. Every word of the query must appear in it.
function haystack(tool) {
  const workspaceNames = tool.workspaces.map((id) => workspaceById.get(id)?.name || '');
  return [tool.name, tool.description, ...tool.keywords, ...workspaceNames].join(' ').toLowerCase();
}

/**
 * Filters tools by a free-text query and an optional workspace id.
 * Every whitespace-separated word of the query must match (name, description,
 * keywords or workspace name), case-insensitively.
 */
export function searchTools(query = '', { workspace = 'all' } = {}) {
  const words = String(query).trim().toLowerCase().split(/\s+/).filter(Boolean);
  const pool = workspace === 'all' ? TOOLS : toolsInWorkspace(workspace);
  return pool.filter((tool) => {
    const text = haystack(tool);
    return words.every((word) => text.includes(word));
  });
}
