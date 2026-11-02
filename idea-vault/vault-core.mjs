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

export const WORKSPACE_FILE = 'tim-idea-vault-v1.json';
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

export function workspaceListQuery(name = WORKSPACE_FILE) {
  const escaped = String(name).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  return `name = '${escaped}'`;
}

// Returns the single workspace file, null when none exists, and throws when
// duplicates exist. Duplicates are never auto-picked: choosing one would
// silently hide the other's data.
export function pickWorkspaceFile(files, name = WORKSPACE_FILE) {
  const matches = (files || []).filter((file) => file && file.name === name);
  if (matches.length > 1) {
    throw new Error(
      'Multiple Idea Vault cloud files were found. Nothing was changed. Export a backup before resolving the duplicates.',
    );
  }
  return matches[0] || null;
}

// Record a local edit: bump the revision and the informational timestamp.
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

export function isGoogleDoc(file) {
  return file?.mimeType === 'application/vnd.google-apps.document';
}

export function folderIdFrom(input) {
  const value = String(input || '').trim();
  const match = value.match(
    /https:\/\/drive\.google\.com\/drive\/folders\/([a-zA-Z0-9_-]{15,})/,
  );
  if (match) return match[1];
  if (/^[a-zA-Z0-9_-]{15,}$/.test(value)) return value;
  throw new Error(
    'Paste a Google Drive folder URL (drive.google.com/drive/folders/…) or folder ID.',
  );
}

export function inferCategory(name) {
  if (/gear|flask|shoe|review|product/i.test(name)) return 'Gear';
  if (/race|ultra|run|2026|2027|DNF|oil creek/i.test(name)) return 'Running';
  if (/vlog|week|personal|life/i.test(name)) return 'Lifestyle';
  return 'General';
}

export function inferPlatform(name) {
  return /tiktok/i.test(name) ? 'TikTok' : 'YouTube';
}

export function isReference(name) {
  return /segment idea bank|intro and outro questions/i.test(name);
}

/**
 * Plan an additive Drive import. Never removes or edits existing ideas.
 * Dedupes against existing ideas (including archived ones, so an archived
 * idea is never resurrected), against docUrl, and within the batch itself
 * (Drive pagination can repeat a file if the folder changes mid-scan).
 */
export function planImport(existing, docs, makeId, timestamp) {
  const knownSources = new Set();
  for (const idea of existing || []) {
    if (idea?.sourceId) knownSources.add(idea.sourceId);
    const match =
      idea?.docUrl && String(idea.docUrl).match(/\/d\/([a-zA-Z0-9_-]+)\//);
    if (match) knownSources.add(match[1]);
  }

  const additions = [];
  let existingCount = 0;
  let invalid = 0;
  for (const doc of docs || []) {
    if (
      !doc ||
      typeof doc.id !== 'string' ||
      !/^[a-zA-Z0-9_-]+$/.test(doc.id)
    ) {
      invalid++;
      continue;
    }
    if (knownSources.has(doc.id)) {
      existingCount++;
      continue;
    }
    knownSources.add(doc.id);
    const reference = isReference(doc.name);
    additions.push({
      id: makeId(),
      sourceId: doc.id,
      title: doc.name,
      notes: '',
      platform: reference ? 'Reference' : inferPlatform(doc.name),
      category: reference ? 'Reference' : inferCategory(doc.name),
      kind: reference ? 'reference' : 'project',
      status: reference ? 'Inbox' : 'Developing',
      priority: 'Normal',
      docUrl:
        doc.webViewLink ||
        'https://docs.google.com/document/d/' + doc.id + '/edit',
      createdAt: doc.createdTime || timestamp,
      updatedAt: timestamp,
      revision: makeId(),
      archived: false,
    });
  }
  return { additions, existingCount, invalid };
}
