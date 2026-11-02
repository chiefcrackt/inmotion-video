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
  { id: 'library', number: '06', name: 'Asset Library', blurb: 'Ready-made animations, templates and downloads.', icon: 'workspace-library' },
]);

// quick: true places the tool in Quick Launch. quickLabel overrides its short label.
export const TOOLS = Object.freeze([
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
    description: 'Capture ideas, plan videos, track production and link your Google Docs outlines.',
    workspaces: ['plan'],
    keywords: ['ideas', 'planning', 'outline', 'google drive', 'production', 'notes', 'youtube'],
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
]);

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
