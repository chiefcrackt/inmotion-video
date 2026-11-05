// One record per video. Replaces the separate idea and project records that
// Idea Vault and Content Planner each kept. Pure data code: no DOM, no storage.
//
// Stages are the Content Planner pipeline. Idea Vault statuses map onto them:
//   Inbox      -> Idea       (captured, not yet planned)
//   Developing -> Outline    (being planned)
//   Published  -> Published
// Archiving is a flag, not a stage, so an archived video keeps its stage.

export const STAGES = [
  'Idea',
  'Outline',
  'Film',
  'Edit',
  'Scheduled',
  'Published',
];

export const PLATFORMS = ['YouTube', 'TikTok', 'Reels', 'Shorts', 'Other'];

export const SHOT_KINDS = ['Talking point', 'B-roll', 'Gear', 'Location'];
export const SHOT_STATUSES = ['pending', 'captured', 'retake', 'skipped'];

const IDEA_STATUS_TO_STAGE = {
  Inbox: 'Idea',
  Developing: 'Outline',
  Published: 'Published',
};

const PROJECT_PREFIX = 'idea:';

export function stageFromIdeaStatus(status) {
  return IDEA_STATUS_TO_STAGE[status] || 'Idea';
}

export function isStage(value) {
  return STAGES.includes(value);
}

// Ordered list of stages a video moves through; used for "next stage" buttons.
export function nextStage(stage) {
  const i = STAGES.indexOf(stage);
  return i >= 0 && i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

export function previousStage(stage) {
  const i = STAGES.indexOf(stage);
  return i > 0 ? STAGES[i - 1] : null;
}

// Production checklist (Script, Shot list, Filmed, ...) progress.
export function stepProgress(video) {
  const steps = Array.isArray(video?.steps) ? video.steps : [];
  return { done: steps.filter((s) => s.done).length, total: steps.length };
}

// Shot-list progress: captured or prepared shots over all shots.
export function shotProgress(video) {
  const shots = Array.isArray(video?.shots) ? video.shots : [];
  return {
    done: shots.filter((s) => s.status === 'captured').length,
    total: shots.length,
  };
}

// A video is overdue when its due day has passed and it is not published
// or archived. Dates are YYYY-MM-DD strings compared as text.
export function isOverdue(video, today) {
  return (
    !!video?.dueDate &&
    video.dueDate < today &&
    video.stage !== 'Published' &&
    video.archived !== true
  );
}

// Filters the library. Empty or missing options match everything.
export function filterVideos(videos, options = {}) {
  const query = String(options.query || '')
    .trim()
    .toLowerCase();
  return videos.filter((v) => {
    if (!options.includeArchived && v.archived) return false;
    if (options.stage && v.stage !== options.stage) return false;
    if (options.platform && v.platform !== options.platform) return false;
    if (query) {
      const haystack = [v.title, v.notes, v.outline, v.category]
        .join(' ')
        .toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    return true;
  });
}

// Groups videos by stage for the board view, in pipeline order.
export function groupByStage(videos) {
  const groups = Object.fromEntries(STAGES.map((s) => [s, []]));
  for (const v of videos) if (groups[v.stage]) groups[v.stage].push(v);
  return groups;
}

// A due date is a real calendar day (YYYY-MM-DD). Impossible dates are dropped.
export function validDay(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
  const d = new Date(value + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value
    ? ''
    : value;
}

function newestOf(...values) {
  return Math.max(0, ...values.map((n) => (Number.isFinite(n) ? n : 0)));
}

function cleanText(value, max = 100000) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function cleanSteps(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x.text === 'string' && x.text.trim())
    .map((x) => ({ text: x.text.trim().slice(0, 120), done: x.done === true }));
}

// Snapshot references: which tool saved the work, and its name. Text only.
function cleanAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a.id === 'string' && typeof a.tool === 'string')
    .map((a) => ({
      id: a.id.slice(0, 100),
      tool: a.tool.slice(0, 100),
      name: cleanText(a.name, 200),
    }));
}

function cleanShots(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x.text === 'string')
    .map((x) => ({
      id: String(x.id || ''),
      kind: SHOT_KINDS.includes(x.kind) ? x.kind : 'Talking point',
      text: cleanText(x.text, 500),
      notes: cleanText(x.notes, 2000),
      status: SHOT_STATUSES.includes(x.status) ? x.status : 'pending',
      source: cleanText(x.source, 600),
    }));
}

// Builds a unified video from an idea and/or a planner project. Either may be
// missing. The project wins for pipeline fields (it is the newer, richer
// record); the idea supplies capture fields (notes, platform, due date, link).
export function videoFrom({ idea = null, project = null }) {
  const base = project || {};
  const src = idea || {};
  const id = idea ? idea.id : project.id;
  const stage = project?.stage
    ? isStage(project.stage)
      ? project.stage
      : 'Idea'
    : stageFromIdeaStatus(src.status);
  return {
    id: String(id),
    title: cleanText(base.title || src.title || 'Untitled video', 200),
    stage,
    platform: PLATFORMS.includes(src.platform) ? src.platform : 'Other',
    category: cleanText(src.category, 100),
    notes: cleanText(src.notes, 20000),
    outline: cleanText(base.outline),
    dueDate: validDay(src.dueDate),
    filmDate: cleanText(base.filmDate, 20),
    publishDate: cleanText(base.publishDate, 20),
    publishedUrl: cleanText(base.publishedUrl, 2000),
    outlineUrl: cleanText(base.outlineUrl, 2000),
    steps: cleanSteps(src.checklist),
    shots: cleanShots(base.items),
    attachments: cleanAttachments(base.attachments),
    archived: src.archived === true || base.archived === true,
    updatedAt: newestOf(src.updatedAt, src.updated, base.updated),
  };
}

// Fields that are never written to the unified record:
//  - sourceId, driveAssets, driveFolder, footageUrl, thumbnailUrl: Google Drive
//    references. Drive is being removed; footage and thumbnails stay on the
//    device only.
// sourceId is still read by the outline migration (see outlineMigrationList).
//
// Migrates the two old stores into one list.
//
// ideas:    Idea Vault records (see vault-core.mjs)
// projects: Content Planner records (see content-planner/model.mjs)
//
// Rules:
//  - Each live idea becomes one video. Its linked project (id "idea:<ideaId>")
//    is merged into it.
//  - Conflict copies (conflictOf set) are not imported. They are reported so
//    they can be resolved or deleted by hand later.
//  - Projects with no matching idea become their own videos.
//  - Deleted projects are skipped.
//
// Returns { videos, report } and never mutates its inputs.
export function migrate({ ideas = [], projects = [] } = {}) {
  const liveProjects = projects.filter((p) => p && !p.deleted);
  const projectByIdeaId = new Map();
  const usedProjectIds = new Set();
  for (const p of liveProjects) {
    if (typeof p.id === 'string' && p.id.startsWith(PROJECT_PREFIX)) {
      projectByIdeaId.set(p.id.slice(PROJECT_PREFIX.length), p);
    }
  }

  const videos = [];
  const report = {
    imported: 0,
    fromProjectsOnly: 0,
    conflictCopies: [],
    skippedInvalid: 0,
  };

  for (const idea of ideas) {
    if (!idea || typeof idea.id !== 'string' || !idea.id) {
      report.skippedInvalid++;
      continue;
    }
    if (idea.conflictOf) {
      report.conflictCopies.push({ id: idea.id, title: idea.title || '' });
      continue;
    }
    const project = projectByIdeaId.get(idea.id) || null;
    if (project) usedProjectIds.add(project.id);
    videos.push(videoFrom({ idea, project }));
    report.imported++;
  }

  for (const project of liveProjects) {
    if (usedProjectIds.has(project.id)) continue;
    if (typeof project.id !== 'string' || !project.id) {
      report.skippedInvalid++;
      continue;
    }
    if (project.conflictOf) {
      report.conflictCopies.push({ id: project.id, title: project.title || '' });
      continue;
    }
    videos.push(videoFrom({ project }));
    report.fromProjectsOnly++;
  }

  return { videos, report };
}

// Videos whose outline still lives in a Google Doc. Run this once, while the
// Drive connection still works, to copy each outline into the outline text
// field. After that the Drive link is no longer needed.
export function outlineMigrationList(ideas = []) {
  return ideas
    .filter((i) => i && i.sourceId && !i.archived && !i.conflictOf)
    .map((i) => ({ id: i.id, docId: i.sourceId, title: i.title || '' }));
}
