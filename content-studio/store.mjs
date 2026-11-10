// Data layer for Content Studio. It reads and writes the two stores that the
// cloud sync already keeps in step: ideas (Idea Vault) and video projects
// (Content Planner). Each video is one idea, one project, or both, joined by
// the "idea:<id>" project id. Writes keep the two sides in step so the link
// rules in shared/pipeline-link.mjs never have to choose between them.
//
// Browser storage only through the `storage` argument (defaults to
// localStorage), so the same functions run in unit tests.

import {
  IDEA_KEY,
  PROJECT_PREFIX,
  STATUS_FOR_STAGE,
} from '../shared/pipeline-link.mjs?v=4d6d1145';
import {
  isWorkspace,
  touch,
  newRevision,
  defaultChecklist,
  normalizeChecklist,
  mergeIdeas,
  dueDateCsv,
} from '../idea-vault/vault-core.mjs?v=079d4676';
import { newProject, addOutline, validateBackup } from '../content-planner/model.mjs?v=9edeb93b';
import { KEY as PLANNER_KEY } from '../shared/project-store.mjs?v=07de6878';
import { mergeProjects } from '../shared/project-sync.mjs?v=c640d9a8';
import {
  migrate,
  isStage,
  validDay,
  SHOT_KINDS,
  SHOT_STATUSES,
  PLATFORMS,
} from './video-model.mjs?v=b4fc61b1';

export const BACKUP_FORMAT = 'tim-content-studio';

const nowIso = () => new Date().toISOString();

function readIdeaList(storage) {
  const raw = storage.getItem(IDEA_KEY);
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (!isWorkspace(data)) throw Error('Ideas data could not be read.');
  return data.ideas;
}

function readProjectList(storage) {
  const raw = storage.getItem(PLANNER_KEY);
  if (raw === null) return [];
  const data = JSON.parse(raw);
  if (!data || data.version !== 1 || !Array.isArray(data.projects))
    throw Error('Video projects could not be read.');
  return validateBackup(data);
}

function writeIdeas(storage, ideas) {
  storage.setItem(IDEA_KEY, JSON.stringify({ version: 1, ideas }));
}

function writeProjects(storage, projects) {
  storage.setItem(PLANNER_KEY, JSON.stringify({ version: 1, projects }));
}

// Projects are stamped with a revision and a device clock on every change, so
// the sync can tell which side is newer. Stamp the same way here.
function stampProject(project, device = 'content-studio') {
  project.clock = { ...(project.clock || {}) };
  project.clock[device] = (project.clock[device] || 0) + 1;
  project.revision = newRevision();
  project.updated = Date.now();
  return project;
}

// Loads every video. Conflict copies are reported and not shown.
export function loadVideos(storage = localStorage) {
  const ideas = readIdeaList(storage);
  const result = migrate({ ideas, projects: readProjectList(storage) });
  const ideaIds = new Set(ideas.map((i) => i && i.id));
  return {
    ...result,
    videos: result.videos.map((v) => ({ ...v, hasIdea: ideaIds.has(v.id) })),
  };
}

// Makes sure a video has a project, so a tool opened for it can attach its work.
export function ensureVideoProject(videoId, storage = localStorage) {
  editVideo(
    videoId,
    (ctx) => {
      ensureProject(ctx, ctx.idea?.title || ctx.project?.title);
    },
    storage,
  );
}

// Lets the UI show what changed when the cloud sync writes these stores.
export function snapshotOf(storage = localStorage) {
  return (storage.getItem(IDEA_KEY) || '') + '\n' + (storage.getItem(PLANNER_KEY) || '');
}

function findIdea(ideas, id) {
  return ideas.find((i) => i && i.id === id && !i.conflictOf) || null;
}

function findProject(projects, videoId) {
  return (
    projects.find((p) => p && !p.deleted && p.id === PROJECT_PREFIX + videoId) ||
    projects.find((p) => p && !p.deleted && p.id === videoId) ||
    null
  );
}

// Runs one edit against a video. `fn` receives { idea, project, ideas, projects }.
// Only records that actually changed are touched (idea: new revision and time;
// project: new revision and clock), so an unchanged save causes no sync traffic.
export function editVideo(videoId, fn, storage = localStorage) {
  const ideas = readIdeaList(storage);
  const projects = readProjectList(storage);
  const idea = findIdea(ideas, videoId);
  const project = findProject(projects, videoId);
  if (!idea && !project) throw Error('This video is no longer available.');
  const ideaBefore = new Map(ideas.map((i) => [i, JSON.stringify(i)]));
  const projectBefore = new Map(projects.map((p) => [p, JSON.stringify(p)]));
  fn({ idea, project, ideas, projects });
  let ideasChanged = false;
  for (const i of ideas) {
    if (!ideaBefore.has(i) || ideaBefore.get(i) !== JSON.stringify(i)) {
      if (ideaBefore.has(i)) touch(i, nowIso());
      ideasChanged = true;
    }
  }
  let projectsChanged = false;
  for (const p of projects) {
    if (!projectBefore.has(p) || projectBefore.get(p) !== JSON.stringify(p)) {
      stampProject(p);
      projectsChanged = true;
    }
  }
  if (ideasChanged) writeIdeas(storage, ideas);
  if (projectsChanged) writeProjects(storage, projects);
  return { idea, project };
}

// Creates a project for an idea the first time something project-only is set.
// The new project joins `projects` so editVideo saves it with the edit.
function ensureProject({ idea, project, projects }, videoTitle) {
  if (project) return project;
  const created = newProject(videoTitle || 'Untitled video');
  created.id = idea ? PROJECT_PREFIX + idea.id : created.id;
  if (idea) created.outline = idea.notes || '';
  created.stage = 'Idea';
  projects.push(created);
  return created;
}

// Capture: a new idea with the same shape Idea Vault creates.
export function captureIdea({ title, notes = '', platform = 'Other' }, storage = localStorage) {
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw Error('Give the idea a title.');
  const ideas = readIdeaList(storage);
  const stamp = nowIso();
  const idea = {
    id: crypto.randomUUID(),
    title: cleanTitle.slice(0, 200),
    notes: String(notes).slice(0, 20000),
    platform: PLATFORMS.includes(platform) ? platform : 'Other',
    category: 'General',
    kind: 'project',
    status: 'Inbox',
    priority: 'Normal',
    dueDate: '',
    checklist: defaultChecklist(),
    createdAt: stamp,
    updatedAt: stamp,
    revision: newRevision(),
    archived: false,
  };
  ideas.push(idea);
  writeIdeas(storage, ideas);
  return idea;
}

export function setStage(videoId, stage, storage = localStorage) {
  if (!isStage(stage)) throw Error('Unknown stage.');
  return editVideo(
    videoId,
    (ctx) => {
      if (ctx.idea) ctx.idea.status = STATUS_FOR_STAGE[stage];
      // An idea still in Idea needs no project yet.
      if (!ctx.project && stage === 'Idea') return;
      const p = ctx.project || ensureProject(ctx, ctx.idea?.title);
      p.stage = stage;
    },
    storage,
  );
}

// One publish date is shared by the idea (due date) and the project (publish date).
export function setPublishDate(videoId, date, storage = localStorage) {
  const value = validDay(date);
  if (date && !value) throw Error('Use a real date, such as 2026-11-30.');
  return editVideo(
    videoId,
    (ctx) => {
      if (ctx.idea) ctx.idea.dueDate = value;
      if (ctx.project) ctx.project.publishDate = value;
      else if (ctx.idea && value) ensureProject(ctx, ctx.idea.title).publishDate = value;
    },
    storage,
  );
}

export function setFilmDate(videoId, date, storage = localStorage) {
  const value = validDay(date);
  if (date && !value) throw Error('Use a real date, such as 2026-11-10.');
  return editVideo(
    videoId,
    (ctx) => {
      if (ctx.project) ctx.project.filmDate = value;
      else if (ctx.idea && value) ensureProject(ctx, ctx.idea.title).filmDate = value;
    },
    storage,
  );
}

export function setDetails(videoId, fields, storage = localStorage) {
  const title = String(fields.title ?? '').trim().slice(0, 200);
  if (fields.title !== undefined && !title) throw Error('A video needs a title.');
  return editVideo(
    videoId,
    (ctx) => {
      if (ctx.idea) {
        if (title) ctx.idea.title = title;
        if (fields.notes !== undefined) ctx.idea.notes = String(fields.notes).slice(0, 20000);
        if (fields.platform !== undefined)
          ctx.idea.platform = PLATFORMS.includes(fields.platform) ? fields.platform : 'Other';
        if (fields.category !== undefined)
          ctx.idea.category = String(fields.category).slice(0, 100);
      }
      if (title) {
        if (ctx.project) ctx.project.title = title;
      }
      if (fields.outline !== undefined || fields.outlineUrl !== undefined || fields.publishedUrl !== undefined) {
        const p = ctx.project || ensureProject(ctx, title || ctx.idea?.title);
        if (fields.outline !== undefined) p.outline = String(fields.outline).slice(0, 100000);
        if (fields.outlineUrl !== undefined) p.outlineUrl = safeLink(fields.outlineUrl);
        if (fields.publishedUrl !== undefined) p.publishedUrl = safeLink(fields.publishedUrl);
      }
    },
    storage,
  );
}

function safeLink(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  try {
    const u = new URL(text);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}

export function setArchived(videoId, archived, storage = localStorage) {
  return editVideo(
    videoId,
    (ctx) => {
      if (!ctx.idea) throw Error('Only ideas can be archived.');
      ctx.idea.archived = archived === true;
    },
    storage,
  );
}

export function setSteps(videoId, steps, storage = localStorage) {
  return editVideo(
    videoId,
    (ctx) => {
      if (!ctx.idea) throw Error('Steps belong to an idea.');
      ctx.idea.checklist = normalizeChecklist(steps);
    },
    storage,
  );
}

export function generateShots(videoId, storage = localStorage) {
  let added = 0;
  editVideo(
    videoId,
    (ctx) => {
      const p = ctx.project || ensureProject(ctx, ctx.idea?.title);
      added = addOutline(p);
    },
    storage,
  );
  return added;
}

export function addShot(videoId, { kind, text, notes = '' }, storage = localStorage) {
  const clean = String(text || '').trim().slice(0, 500);
  if (!clean) throw Error('Write what the shot is.');
  const shotKind = SHOT_KINDS.includes(kind) ? kind : 'Talking point';
  return editVideo(
    videoId,
    (ctx) => {
      const p = ctx.project || ensureProject(ctx, ctx.idea?.title);
      p.items.push({
        id: crypto.randomUUID(),
        kind: shotKind,
        text: clean,
        notes: String(notes).slice(0, 2000),
        status: 'pending',
        source: shotKind + ':' + clean,
      });
    },
    storage,
  );
}

export function updateShot(videoId, shotId, patch, storage = localStorage) {
  return editVideo(
    videoId,
    (ctx) => {
      const p = ctx.project;
      const shot = p?.items.find((s) => s.id === shotId);
      if (!shot) throw Error('This shot is no longer available.');
      if (patch.status !== undefined && SHOT_STATUSES.includes(patch.status))
        shot.status = patch.status;
      if (patch.notes !== undefined) shot.notes = String(patch.notes).slice(0, 2000);
    },
    storage,
  );
}

export function removeShot(videoId, shotId, storage = localStorage) {
  return editVideo(
    videoId,
    (ctx) => {
      if (ctx.project) ctx.project.items = ctx.project.items.filter((s) => s.id !== shotId);
    },
    storage,
  );
}

export function attachSnapshot(videoId, snapshot, storage = localStorage) {
  return editVideo(
    videoId,
    (ctx) => {
      const p = ctx.project || ensureProject(ctx, ctx.idea?.title);
      if (p.attachments.some((a) => a.id === snapshot.id && a.tool === snapshot.tool)) return;
      p.attachments.push({
        id: String(snapshot.id).slice(0, 100),
        tool: String(snapshot.tool).slice(0, 100),
        name: String(snapshot.name || '').slice(0, 200),
      });
    },
    storage,
  );
}

export function detachSnapshot(videoId, snapshotId, storage = localStorage) {
  return editVideo(
    videoId,
    (ctx) => {
      if (ctx.project)
        ctx.project.attachments = ctx.project.attachments.filter((a) => a.id !== snapshotId);
    },
    storage,
  );
}

// Backup: both stores in one file. Older single-store backups import too.
export function exportBackup(storage = localStorage) {
  return JSON.stringify(
    {
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: nowIso(),
      ideas: readIdeaList(storage),
      projects: readProjectList(storage),
    },
    null,
    2,
  );
}

export function importBackup(text, storage = localStorage) {
  const data = JSON.parse(text);
  const importedIdeas = Array.isArray(data?.ideas) ? data.ideas : [];
  const importedProjects = Array.isArray(data?.projects) ? data.projects : [];
  if (!Array.isArray(data?.ideas) && !Array.isArray(data?.projects))
    throw Error('This file is not a Content Studio, Idea Vault or Content Planner backup.');
  const ideas = mergeIdeas(readIdeaList(storage), importedIdeas, {}).ideas;
  const projects = mergeProjects(
    readProjectList(storage),
    validateBackup({ version: 1, projects: importedProjects }),
  );
  writeIdeas(storage, ideas);
  writeProjects(storage, projects);
  return { ideas: importedIdeas.length, projects: importedProjects.length };
}

export function dueDatesCsv(storage = localStorage) {
  return dueDateCsv(readIdeaList(storage));
}
