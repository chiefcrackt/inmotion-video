export const STAGES = [
  'Idea',
  'Outline',
  'Film',
  'Edit',
  'Scheduled',
  'Published',
];
export const KINDS = ['Talking point', 'B-roll', 'Gear', 'Location'];
export const KEY = 'tim-content-planner-v1';
export function newProject(title = 'Untitled video') {
  return {
    id: crypto.randomUUID(),
    title,
    stage: 'Idea',
    outline: '',
    outlineUrl: '',
    footageUrl: '',
    thumbnailUrl: '',
    publishedUrl: '',
    filmDate: '',
    publishDate: '',
    items: [],
    attachments: [],
    driveAssets: [],
    deleted: false,
    revision: '',
    clock: {},
    updated: Date.now(),
  };
}
export function addOutline(p) {
  const known = new Set(p.items.map((i) => i.source).filter(Boolean));
  let added = 0;
  for (const line of p.outline.split(/\r?\n/)) {
    const raw = line
      .trim()
      .replace(/^[-*]\s+|^\d+[.)]\s+/, '')
      .trim();
    if (!raw || /^#/.test(raw)) continue;
    const m = raw.match(/^(B-roll|Gear|Location|Talking point):\s*(.*)$/i),
      kind = m
        ? KINDS.find((k) => k.toLowerCase() === m[1].toLowerCase())
        : 'Talking point',
      text = m ? m[2].trim() : raw,
      source = kind + ':' + text;
    if (!text || known.has(source)) continue;
    p.items.push({
      id: crypto.randomUUID(),
      kind,
      text,
      source,
      status: 'pending',
      notes: '',
    });
    known.add(source);
    added++;
  }
  return added;
}
export function safeUrl(value) {
  try {
    const u = new URL(value);
    return ['http:', 'https:'].includes(u.protocol) ? u.href : '';
  } catch {
    return '';
  }
}
export function validateBackup(doc) {
  if (
    doc?.version !== 1 ||
    !Array.isArray(doc.projects) ||
    doc.projects.length > 1000
  )
    throw Error('Choose a Content Planner version 1 backup.');
  const ids = new Set();
  return doc.projects.map((p) => {
    if (
      !p ||
      typeof p.id !== 'string' ||
      !p.id ||
      ids.has(p.id) ||
      !STAGES.includes(p.stage) ||
      !Array.isArray(p.items) ||
      p.items.length > 5000 ||
      !Array.isArray(p.attachments)
    )
      throw Error('Invalid video project.');
    ids.add(p.id);
    const out = {
      id: p.id,
      stage: p.stage,
      updated: Number.isFinite(p.updated) ? p.updated : 0,
      items: [],
      attachments: [],
    };
    for (const key of [
      'title',
      'outline',
      'outlineUrl',
      'footageUrl',
      'thumbnailUrl',
      'publishedUrl',
      'filmDate',
      'publishDate',
    ]) {
      if (typeof p[key] !== 'string' || p[key].length > 100000)
        throw Error('Invalid project field.');
      out[key] = p[key];
    }
    const itemIds = new Set();
    out.items = p.items.map((i) => {
      if (
        !i ||
        typeof i.id !== 'string' ||
        itemIds.has(i.id) ||
        !KINDS.includes(i.kind) ||
        !['pending', 'captured', 'retake', 'skipped'].includes(i.status) ||
        typeof i.text !== 'string' ||
        typeof i.notes !== 'string'
      )
        throw Error('Invalid checklist item.');
      itemIds.add(i.id);
      return {
        id: i.id,
        kind: i.kind,
        text: i.text,
        notes: i.notes,
        status: i.status,
        source: typeof i.source === 'string' ? i.source : '',
      };
    });
    out.attachments = p.attachments
      .filter(
        (a) =>
          a &&
          typeof a.id === 'string' &&
          typeof a.tool === 'string' &&
          typeof a.name === 'string',
      )
      .map((a) => ({ id: a.id, tool: a.tool, name: a.name }));
    out.deleted = p.deleted === true;
    out.revision = typeof p.revision === 'string' ? p.revision : '';
    out.clock = Object.fromEntries(
      Object.entries(p.clock || {}).filter(
        ([k, v]) => k !== '__proto__' && Number.isSafeInteger(v) && v >= 0,
      ),
    );
    if (typeof p.conflictOf === 'string') out.conflictOf = p.conflictOf;
    if (
      p.driveFolder &&
      typeof p.driveFolder.id === 'string' &&
      typeof p.driveFolder.account === 'string'
    )
      out.driveFolder = {
        id: p.driveFolder.id,
        account: p.driveFolder.account,
        name: String(p.driveFolder.name || ''),
      };
    out.driveAssets = (Array.isArray(p.driveAssets) ? p.driveAssets : [])
      .filter(
        (a) =>
          a &&
          typeof a.id === 'string' &&
          typeof a.name === 'string' &&
          typeof a.account === 'string',
      )
      .map((a) => ({
        id: a.id,
        name: a.name,
        account: a.account,
        url: safeUrl(a.url),
        mimeType: String(a.mimeType || ''),
        tool: String(a.tool || ''),
        updated: Number(a.updated) || 0,
      }));
    return out;
  });
}
