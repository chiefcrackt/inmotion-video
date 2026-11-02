// Two-way link between an Idea Vault idea and its Content Planner project.
//
// A promoted idea is stored as a project with the id "idea:<ideaId>". The two
// records keep their own copies of the same facts (stage/status and publish/due
// date), so each side is reconciled against the other:
//  - The side changed most recently wins, judged by timestamps (project.updated
//    vs idea.updatedAt). Ties mean the link is already in step.
//  - Idea Vault statuses are richer than planner stages (Filmed and Editing both
//    map to Edit). When the planner stage already matches an idea's status, the
//    status is kept, so the vault never loses detail the planner cannot show.
//  - Deleted projects, archived ideas and conflict copies are never touched.
// Pure functions only: no DOM, no storage. Callers persist the results.

import { newRevision } from '../idea-vault/vault-core.mjs';

export const IDEA_KEY = 'tim-idea-vault-v1';
export const PLANNER_KEY = 'tim-content-planner-v1';
export const PROJECT_PREFIX = 'idea:';

export const STAGE_FOR_STATUS = Object.freeze({
  Inbox: 'Idea',
  Developing: 'Outline',
  'Ready to Film': 'Film',
  Filmed: 'Edit',
  Editing: 'Edit',
  Scheduled: 'Scheduled',
  Published: 'Published',
});

export const STATUS_FOR_STAGE = Object.freeze({
  Idea: 'Inbox',
  Outline: 'Developing',
  Film: 'Ready to Film',
  Edit: 'Editing',
  Scheduled: 'Scheduled',
  Published: 'Published',
});

// Milliseconds for a stored timestamp. Projects store numbers, ideas store ISO strings.
export function msOf(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

// The status an idea should have for a planner stage, keeping a status that already matches.
export function statusForStage(stage, currentStatus) {
  if (STAGE_FOR_STATUS[currentStatus] === stage) return currentStatus;
  return STATUS_FOR_STAGE[stage] || currentStatus;
}

// Reconciles every linked pair in place. Returns true when anything changed.
export function reconcileLinked(projects, ideas, nowIso = new Date().toISOString()) {
  if (!Array.isArray(projects) || !Array.isArray(ideas)) return false;
  const ideaById = new Map(ideas.filter((i) => i && typeof i.id === 'string').map((i) => [i.id, i]));
  let changed = false;

  for (const p of projects) {
    if (!p || typeof p.id !== 'string' || !p.id.startsWith(PROJECT_PREFIX) || p.deleted) continue;
    const idea = ideaById.get(p.id.slice(PROJECT_PREFIX.length));
    if (!idea || idea.archived || idea.conflictOf) continue;

    const projectMs = msOf(p.updated);
    const ideaMs = msOf(idea.updatedAt);
    if (projectMs === ideaMs) continue;

    const ideaDue = typeof idea.dueDate === 'string' ? idea.dueDate : '';
    const projectDue = typeof p.publishDate === 'string' ? p.publishDate : '';

    if (ideaMs > projectMs) {
      // Idea Vault changed last: copy its stage and date into the project.
      const stage = STAGE_FOR_STATUS[idea.status];
      let dirty = false;
      if (stage && stage !== p.stage) {
        p.stage = stage;
        dirty = true;
      }
      if (ideaDue !== projectDue) {
        p.publishDate = ideaDue;
        dirty = true;
      }
      if (dirty) {
        p.updated = ideaMs;
        changed = true;
      }
    } else {
      // The planner changed last: copy its stage and date into the idea.
      const status = statusForStage(p.stage, idea.status);
      if (status !== idea.status || projectDue !== ideaDue) {
        idea.status = status;
        idea.dueDate = projectDue;
        idea.revision = newRevision();
        idea.updatedAt = new Date(projectMs).toISOString();
        changed = true;
      }
    }
  }
  return changed;
}
