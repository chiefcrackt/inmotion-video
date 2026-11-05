// Pure data-integrity logic for the Idea Vault. No DOM, no fetch, no storage:
// everything here is deterministic so it can be unit tested in Node.
//
// Concurrency model (per idea):
//  - Every local edit bumps `revision`.
//  - Each device remembers the revision it last synced per idea: `base`.
//  - Only one side changed since base  -> take that side. No data is lost.
//  - Both sides changed (or the base is unknown and copies differ) -> the
//    local copy stays, and the cloud copy is kept as a conflict copy
//    (`conflictOf`). Neither edit is discarded; the user resolves it.
//  - updatedAt is informational only. Clock skew never decides a conflict.
//
// Non-negotiable rules:
//  - Never silently discard an idea. Unparseable entries pass through merges.
//  - Repeated merges must not create duplicate conflict copies.

export const WORKSPACE_VERSION = 1;

export function isWorkspace(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    Array.isArray(value.ideas) &&
    value.version === WORKSPACE_VERSION
  );
}

export function hasIdentity(idea) {
  return (
    !!idea &&
    typeof idea === 'object' &&
    typeof idea.id === 'string' &&
    idea.id.length > 0
  );
}

// A revision is an opaque unique token, one per edit. Counters would collide
// across devices (two devices can both reach "2" independently), so revisions
// are only ever compared for equality. Legacy ideas without one read as null.
export function newRevision() {
  return globalThis.crypto.randomUUID();
}

export function rev(idea) {
  return typeof idea?.revision === 'string' && idea.revision
    ? idea.revision
    : null;
}

// Drive returns `version` as a string. Compare as strings so a number and a
// string for the same revision are treated as equal (no false conflicts).
export function sameVersion(a, b) {
  return (
    a !== undefined &&
    a !== null &&
    b !== undefined &&
    b !== null &&
    String(a) === String(b)
  );
}

// Deterministic JSON (sorted keys), so equal content compares equal.
export function stableStringify(value) {
  if (Array.isArray(value))
    return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stableStringify(value[k]))
        .join(',') +
      '}'
    );
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function sameContent(a, b) {
  return stableStringify(a) === stableStringify(b);
}

export function touch(idea, timestamp) {
  idea.revision = newRevision();
  idea.updatedAt = timestamp;
  return idea;
}

// The base map that matches an upload of `ideas`: every idea at its revision.
export function baseOf(ideas) {
  const base = {};
  for (const idea of ideas || [])
    if (hasIdentity(idea)) base[idea.id] = rev(idea);
  return base;
}

function canonical(ideas) {
  return JSON.stringify(
    [...ideas].sort((a, b) => {
      const ka = String(a?.id ?? ''),
        kb = String(b?.id ?? '');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    }),
  );
}

const defaultId = () => globalThis.crypto.randomUUID();
const copyKey = (idea) => idea.conflictOf + '\u0000' + idea.conflictRevision;

/**
 * Merge a cloud workspace into local data using per-idea revisions.
 *
 * @param local   local ideas (not mutated)
 * @param cloud   cloud ideas (not mutated)
 * @param base    { [id]: revision } last synced per idea on this device
 * @param makeId  id generator for conflict copies
 *
 * Returns:
 *   ideas        merged list
 *   changed      merge altered the local list
 *   needsUpload  merged list differs from the cloud list
 *   conflicts    [{ id, copyId }] new conflict copies created by this merge
 *   synced       { [id]: revision } ideas whose merged copy equals the cloud copy
 */
export function mergeIdeas(local, cloud, base = {}, makeId = defaultId) {
  const localList = Array.isArray(local) ? local : [];
  const cloudList = Array.isArray(cloud) ? cloud : [];

  const cloudById = new Map();
  for (const c of cloudList) {
    if (hasIdentity(c) && !cloudById.has(c.id)) cloudById.set(c.id, c);
  }
  const localIds = new Set(localList.filter(hasIdentity).map((l) => l.id));

  const out = [];
  const synced = {};
  const conflicts = [];
  const copies = new Set(
    [...localList, ...cloudList].filter((x) => x?.conflictOf).map(copyKey),
  );

  for (const l of localList) {
    if (!hasIdentity(l)) {
      out.push(l);
      continue;
    }
    const c = cloudById.get(l.id);
    if (!c) {
      out.push(l);
      continue;
    }
    if (sameContent(l, c)) {
      out.push(l);
      if (rev(l) === rev(c)) synced[l.id] = rev(c);
      continue;
    }
    const b = base[l.id];
    const localChanged = b === undefined || rev(l) !== b;
    const cloudChanged = b === undefined || rev(c) !== b;
    if (cloudChanged && !localChanged) {
      out.push(c);
      synced[c.id] = rev(c);
      continue;
    }
    if (localChanged && !cloudChanged) {
      out.push(l);
      continue;
    }
    // Both changed, or the base cannot tell: keep local, keep cloud as a copy.
    out.push(l);
    const probe = { conflictOf: l.id, conflictRevision: rev(c) };
    if (!copies.has(copyKey(probe))) {
      const copy = {
        ...c,
        id: makeId(),
        conflictOf: l.id,
        conflictRevision: rev(c),
      };
      copies.add(copyKey(probe));
      out.push(copy);
      conflicts.push({ id: l.id, copyId: copy.id });
    }
  }

  // Cloud-only ideas are added. A repeated cloud id (corruption) is kept as a
  // conflict copy of the first occurrence, so no entry is ever dropped.
  const seenCloud = new Set();
  for (const c of cloudList) {
    if (!hasIdentity(c)) {
      out.push(c);
      continue;
    }
    if (seenCloud.has(c.id)) {
      const probe = { conflictOf: c.id, conflictRevision: rev(c) };
      if (!copies.has(copyKey(probe))) {
        const copy = {
          ...c,
          id: makeId(),
          conflictOf: c.id,
          conflictRevision: rev(c),
        };
        copies.add(copyKey(probe));
        out.push(copy);
        conflicts.push({ id: c.id, copyId: copy.id });
      }
      continue;
    }
    seenCloud.add(c.id);
    if (localIds.has(c.id)) continue; // handled in the local pass above
    out.push(c);
    synced[c.id] = rev(c);
  }

  // Legacy duplicate imports of one Google Doc under different ids.
  // Identical copies collapse to one. Different copies are both kept, the later
  // one marked as a conflict copy, so no edit is dropped.
  const bySource = new Map();
  const result = [];
  for (const idea of out) {
    if (!hasIdentity(idea) || idea.conflictOf || !idea.sourceId) {
      result.push(idea);
      continue;
    }
    const first = bySource.get(idea.sourceId);
    if (!first) {
      bySource.set(idea.sourceId, idea);
      result.push(idea);
      continue;
    }
    if (sameContent({ ...first, id: null }, { ...idea, id: null })) continue;
    const probe = { conflictOf: first.id, conflictRevision: rev(idea) };
    if (copies.has(copyKey(probe))) continue;
    copies.add(copyKey(probe));
    const marked = {
      ...idea,
      conflictOf: first.id,
      conflictRevision: rev(idea),
    };
    result.push(marked);
    conflicts.push({ id: first.id, copyId: marked.id });
  }

  return {
    ideas: result,
    changed: canonical(result) !== canonical(localList),
    needsUpload: canonical(result) !== canonical(cloudList),
    conflicts,
    synced,
  };
}

// Resolve a conflict by making the conflict copy's content the original.
// The copy is archived, not deleted, so its history remains.
export function useCopyAsOriginal(ideas, copyId, timestamp) {
  const copy = ideas.find((x) => x.id === copyId);
  if (!copy || !copy.conflictOf)
    throw new Error('That is not a conflict copy.');
  const original = ideas.find((x) => x.id === copy.conflictOf);
  if (!original)
    throw new Error('The original idea is missing. Nothing was changed.');
  const {
    id,
    conflictOf,
    conflictRevision,
    archived,
    revision,
    updatedAt,
    ...content
  } = copy;
  Object.assign(original, content, { archived: false });
  touch(original, timestamp);
  copy.archived = true;
  touch(copy, timestamp);
  return ideas;
}

// Resolve a conflict by keeping the original and archiving the copy.
export function discardCopy(ideas, copyId, timestamp) {
  const copy = ideas.find((x) => x.id === copyId);
  if (!copy || !copy.conflictOf)
    throw new Error('That is not a conflict copy.');
  copy.archived = true;
  touch(copy, timestamp);
  return ideas;
}

// ---- Due dates and checklists ----------------------------------------------
// A due date is a calendar day (YYYY-MM-DD), not an instant: it means the same
// day on every device. Anything that is not a real day is dropped.

export const DEFAULT_CHECKLIST_STEPS = [
  'Script',
  'Shot list',
  'Filmed',
  'Edited',
  'Posted',
];
const CHECKLIST_TEXT_MAX = 120;

export function validDueDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return '';
  const d = new Date(value + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value
    ? ''
    : value;
}

// The local calendar day as YYYY-MM-DD, for comparing with due dates.
export function localDay(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    date.getFullYear() +
    '-' +
    pad(date.getMonth() + 1) +
    '-' +
    pad(date.getDate())
  );
}

export function defaultChecklist() {
  return DEFAULT_CHECKLIST_STEPS.map((text) => ({ text, done: false }));
}

// Keeps only usable steps: a non-empty text and a boolean done flag.
export function normalizeChecklist(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((x) => x && typeof x.text === 'string' && x.text.trim())
    .map((x) => ({
      text: x.text.trim().slice(0, CHECKLIST_TEXT_MAX),
      done: x.done === true,
    }));
}

export function checklistProgress(idea) {
  const list = normalizeChecklist(idea?.checklist);
  return { done: list.filter((x) => x.done).length, total: list.length };
}

// Overdue: the due day has passed and the idea is not published or archived.
export function isOverdue(idea, today) {
  const due = validDueDate(idea?.dueDate);
  return (
    !!due &&
    due < today &&
    idea?.status !== 'Published' &&
    idea?.archived !== true
  );
}

// ---- Export ----------------------------------------------------------------

const CSV_FORMULA_START = /^[=+\-@\t\r]/;

// One CSV cell. Text that a spreadsheet would run as a formula gets a leading
// apostrophe, so an idea title cannot execute code when the file is opened.
export function csvCell(value) {
  let s = value === undefined || value === null ? '' : String(value);
  if (CSV_FORMULA_START.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Due-date rows: earliest due first, undated ideas last, then by title.
// Archived ideas and conflict copies are left out.
export function dueDateRows(ideas) {
  return (ideas || [])
    .filter((i) => hasIdentity(i) && !i.archived && !i.conflictOf)
    .map((i) => ({
      title: i.title || '',
      dueDate: validDueDate(i.dueDate),
      status: i.status || 'Inbox',
      platform: i.platform || '',
      progress: checklistProgress(i),
    }))
    .sort((a, b) => {
      if (a.dueDate !== b.dueDate) {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }
      return a.title.localeCompare(b.title);
    });
}

// CSV text with a UTF-8 byte-order mark, so Excel reads accented titles correctly.
export function dueDateCsv(ideas) {
  const header = ['Title', 'Due date', 'Status', 'Platform', 'Checklist'];
  const lines = dueDateRows(ideas).map((r) => [
    r.title,
    r.dueDate,
    r.status,
    r.platform,
    r.progress.total ? r.progress.done + '/' + r.progress.total : '',
  ]);
  return (
    '﻿' +
    [header, ...lines].map((row) => row.map(csvCell).join(',')).join('\r\n') +
    '\r\n'
  );
}
