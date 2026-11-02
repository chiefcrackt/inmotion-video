// Pure data-integrity logic for the Idea Vault. No DOM, no fetch, no storage:
// everything here is deterministic so it can be unit tested in Node.
//
// Guiding rules:
//  - Never silently discard an idea. Unparseable entries pass through merges.
//  - Last-writer-wins is decided per idea by updatedAt, not per whole file.
//  - Ties keep the local copy, so the device that is looking at the data is
//    never overwritten by an equal-age copy.

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

function timeOf(idea) {
  const parsed = Date.parse(idea?.updatedAt || '');
  return Number.isFinite(parsed) ? parsed : 0;
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

/**
 * Merge a cloud workspace into the local list, per idea.
 *
 * - Local-only ideas are kept (and will be uploaded by the next sync).
 * - Cloud-only ideas are added.
 * - Same id: the copy with the newer updatedAt wins; ties keep the local copy.
 * - Same sourceId (the same Google Doc imported on two devices under two
 *   ids): exactly one survives, chosen by the same rule.
 * - Entries without a string id are passed through unchanged, so they are
 *   never dropped by an upload.
 *
 * Returns { ideas, changed, needsUpload }:
 *   changed     - the local list differs from the input local list
 *   needsUpload - the merged list differs from the cloud list
 */
export function mergeIdeas(local, cloud) {
  const localList = Array.isArray(local) ? local : [];
  const cloudList = Array.isArray(cloud) ? cloud : [];

  const order = []; // ordered result slots
  const byId = new Map(); // id -> index in order

  const place = (idea) => {
    if (!hasIdentity(idea)) {
      order.push({ opaque: true, idea });
      return;
    }
    if (byId.has(idea.id)) {
      const index = byId.get(idea.id);
      if (timeOf(idea) > timeOf(order[index].idea)) order[index].idea = idea;
      return;
    }
    byId.set(idea.id, order.length);
    order.push({ opaque: false, idea });
  };

  for (const idea of localList) place(idea);
  for (const idea of cloudList) place(idea);

  // Collapse duplicate sourceIds. Keep the newest; on a tie keep the earlier
  // slot, which is the local copy because local ideas are placed first.
  const bySource = new Map();
  for (let i = 0; i < order.length; i++) {
    const slot = order[i];
    if (slot.opaque || !slot.idea.sourceId) continue;
    const key = slot.idea.sourceId;
    if (!bySource.has(key)) {
      bySource.set(key, i);
    } else {
      const kept = bySource.get(key);
      if (timeOf(slot.idea) > timeOf(order[kept].idea)) {
        order[kept].dropped = true;
        bySource.set(key, i);
      } else {
        slot.dropped = true;
      }
    }
  }

  const ideas = order.filter((slot) => !slot.dropped).map((slot) => slot.idea);
  return {
    ideas,
    changed: canonical(ideas) !== canonical(localList),
    needsUpload: canonical(ideas) !== canonical(cloudList),
  };
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
      archived: false,
    });
  }
  return { additions, existingCount, invalid };
}
