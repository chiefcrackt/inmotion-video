import { PLANNER_KEY, reconcileLinked } from '../shared/pipeline-link.mjs';
import {
  WORKSPACE_FILE,
  isWorkspace,
  hasIdentity,
  rev,
  touch,
  baseOf,
  sameVersion,
  newRevision,
  workspaceListQuery,
  pickWorkspaceFile,
  mergeIdeas,
  useCopyAsOriginal,
  discardCopy,
  isGoogleDoc,
  folderIdFrom,
  planImport,
  validDueDate,
  localDay,
  defaultChecklist,
  normalizeChecklist,
  checklistProgress,
  isOverdue,
  dueDateCsv,
} from './vault-core.mjs';
import {
  documentRequestUrl,
  classifyDocsResponse,
  networkErrorMessage,
  documentToModel,
  DRIVE_FILE_SCOPE,
} from './docs-core.mjs';
import { renderDocument } from './docs-view.mjs';
import { createSyncController, SyncError } from './sync-controller.mjs';

// Storage keys. Changing KEY would strand existing user data, so it stays fixed.
const KEY = 'tim-idea-vault-v1'; // ideas, version 1 (unchanged)
const SYNC_KEY = 'tim-idea-vault-sync-v1'; // { pending, lastSyncedAt, base }
const BACKUP_KEY = 'tim-idea-vault-backups-v1'; // rolling safety copies, newest first
const UNREADABLE_KEY = 'tim-idea-vault-unreadable-v1'; // raw copy of unreadable local data
const FOLDER_KEY = 'tim-idea-vault-import-folder';
const DRIVE = 'https://www.googleapis.com/drive/v3/';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/';
const APPDATA_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const METADATA_SCOPE =
  'https://www.googleapis.com/auth/drive.metadata.readonly';

const $ = (id) => document.getElementById(id);
const now = () => new Date().toISOString();
let items = [],
  selected = null,
  token = null,
  remote = null,
  importing = false;

// Read-only Google Docs viewer state. Document content stays in memory only.
let docsToken = null,
  docsTokenExpiresAt = 0,
  docRequest = 0,
  pickerReady = null;
const docCache = new Map(); // idea id -> { model, loadedAt }
let draftChecklist = []; // steps being edited in the open idea; saved only by Save changes
const MAX_CHECKLIST_STEPS = 50;

// Sync timing. Tokens are in memory only; lastCheckAt is when Drive was last read.
let tokenExpiresAt = 0,
  lastCheckAt = 0;
const AUTO_CHECK_MS = window.TIM_IDEA_VAULT_CONFIG?.autoCheckMs ?? 30000; // minimum gap between focus-triggered cloud checks

function notify(s) {
  $('message').textContent = s;
}
const SYNC_LABEL = {
  local: 'Saved locally',
  syncing: 'Syncing',
  synced: 'Synced',
  attention: 'Needs attention',
};
// One status line for the whole app: Saved locally / Syncing / Synced / Needs attention.
function setCloudStatus(kind, detail = '') {
  const el = $('cloudstatus');
  el.dataset.state = kind;
  el.textContent = SYNC_LABEL[kind] + (detail ? ' · ' + detail : '');
}
function isConnected() {
  return readSync().connected === true;
}
function timeNow() {
  return new Date().toLocaleTimeString();
}
function renderSyncState(s = syncer.getStatus()) {
  if (!isConnected()) {
    setCloudStatus('local', 'not connected to Google Drive');
    return;
  }
  switch (s.state) {
    case 'syncing':
      setCloudStatus('syncing');
      return;
    case 'queued':
      setCloudStatus('local', 'uploading shortly');
      return;
    case 'retrying':
      setCloudStatus('local', 'retrying upload');
      return;
    case 'offline':
      setCloudStatus('local', 'offline, will sync when back online');
      return;
    case 'needs-attention':
      setCloudStatus('attention', s.reason);
      return;
  }
  if (hasPendingChanges()) setCloudStatus('local', 'uploads automatically');
  else setCloudStatus('synced', 'checked ' + timeNow());
}

// ---- Durable local state -------------------------------------------------

function readSync() {
  try {
    return JSON.parse(localStorage.getItem(SYNC_KEY)) || {};
  } catch {
    return {};
  }
}
function writeSync(patch) {
  localStorage.setItem(SYNC_KEY, JSON.stringify({ ...readSync(), ...patch }));
}
// Pending survives reloads. A missing record with local ideas means "not known
// to be in the cloud", so treat it as pending rather than assume it is synced.
function hasPendingChanges() {
  const flag = readSync().pending;
  return typeof flag === 'boolean' ? flag : items.length > 0;
}

// Keep the last three copies of local data before any destructive step.
// Throws if storage is full; callers must abort rather than proceed unprotected.
function snapshot(reason, ideas) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem(BACKUP_KEY)) || [];
  } catch {
    list = [];
  }
  if (!Array.isArray(list)) list = [];
  list.unshift({ savedAt: now(), reason, version: 1, ideas });
  localStorage.setItem(BACKUP_KEY, JSON.stringify(list.slice(0, 3)));
}

// Every change is saved on this device at once. Once connected, it also queues a
// debounced upload; the scheduler makes sure only one upload runs at a time.
function persist() {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, ideas: items }));
  writeSync({ pending: true });
  render();
  if (isConnected()) syncer.requestSync();
  renderSyncState();
}

function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if (isWorkspace(data)) {
      items = data.ideas;
      return;
    }
  } catch {
    /* fall through to rescue */
  }
  // Unreadable local data: keep an untouched copy so the next save cannot erase it.
  if (!localStorage.getItem(UNREADABLE_KEY))
    localStorage.setItem(UNREADABLE_KEY, raw);
  notify(
    'Saved local data could not be read. A raw copy was kept; export a backup and check it.',
  );
}

// ---- Rendering and editing -----------------------------------------------

function txt(parent, tag, value, cls) {
  const n = document.createElement(tag);
  n.textContent = value;
  if (cls) n.className = cls;
  parent.append(n);
  return n;
}

// "2026-11-14" -> "Nov 14, 2026", read as a calendar day (no time zone shift).
function formatDueDate(day) {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function render() {
  const today = localDay();
  const q = $('search').value.toLowerCase(),
    f = $('filter').value;
  const visible = items.filter(
    (i) =>
      !i.archived &&
      (!f || i.status === f) &&
      [i.title, i.notes, i.category, i.platform]
        .join(' ')
        .toLowerCase()
        .includes(q),
  );
  $('stats').textContent =
    items.filter((x) => !x.archived).length +
    ' active · ' +
    items.filter((x) => x.sourceId).length +
    ' linked Drive outlines';
  $('results').replaceChildren();
  for (const i of visible.sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  )) {
    const card = txt($('results'), 'article', '', 'card');
    txt(card, 'span', i.conflictOf ? 'Conflict copy' : i.status, 'pill');
    txt(card, 'h3', i.title);
    txt(card, 'small', i.platform + ' · ' + (i.category || 'General'));
    if (i.sourceId) txt(card, 'small', 'Linked Google Doc');
    const due = validDueDate(i.dueDate);
    if (due) {
      const overdue = isOverdue(i, today);
      const label = txt(
        card,
        'small',
        (overdue ? 'Overdue · ' : 'Due ') + formatDueDate(due),
        'due' + (overdue ? ' overdue' : ''),
      );
      label.dataset.due = due;
    }
    const progress = checklistProgress(i);
    if (progress.total)
      txt(card, 'small', progress.done + '/' + progress.total + ' done');
    const button = txt(card, 'button', 'Open workspace');
    button.onclick = () => open(i.id);
  }
  if (!visible.length)
    txt($('results'), 'p', 'No ideas match these filters.', 'muted');
}

function open(id) {
  selected = id;
  const i = items.find((x) => x.id === id);
  if (!i) return;
  $('e-title').value = i.title;
  $('e-notes').value = i.notes || '';
  $('e-platform').value = i.platform || 'YouTube';
  $('e-category').value = i.category || '';
  $('e-status').value = i.status || 'Inbox';
  $('e-priority').value = i.priority || 'Normal';
  $('e-due').value = validDueDate(i.dueDate);
  draftChecklist = normalizeChecklist(i.checklist);
  renderChecklist();
  $('doclink').hidden = !i.docUrl;
  if (i.docUrl) $('doclink').href = i.docUrl;
  $('resolve').hidden = !i.conflictOf;
  showDocSection(i);
  $('editor').classList.add('open');
  $('e-title').focus();
}

// The checklist in the editor. Changes stay in draftChecklist until Save changes.
function renderChecklist() {
  const list = $('e-checklist');
  list.replaceChildren();
  draftChecklist.forEach((step, n) => {
    const row = document.createElement('li');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = step.done;
    box.setAttribute('aria-label', 'Done: ' + step.text);
    box.onchange = () => {
      step.done = box.checked;
    };
    const text = document.createElement('input');
    text.type = 'text';
    text.maxLength = 120;
    text.value = step.text;
    text.setAttribute('aria-label', 'Step text');
    text.onchange = () => {
      const value = text.value.trim();
      if (value) step.text = value;
      else draftChecklist.splice(n, 1);
      renderChecklist();
    };
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', 'Remove step: ' + step.text);
    remove.onclick = () => {
      draftChecklist.splice(n, 1);
      renderChecklist();
    };
    row.append(box, text, remove);
    list.append(row);
  });
  $('e-checklist-empty').hidden = draftChecklist.length > 0;
  $('e-step-defaults').hidden = draftChecklist.length > 0;
}

function addStep() {
  const input = $('e-step-new');
  const text = input.value.trim();
  if (!text) return;
  if (draftChecklist.length >= MAX_CHECKLIST_STEPS)
    return notify(
      'A checklist can have up to ' + MAX_CHECKLIST_STEPS + ' steps.',
    );
  draftChecklist.push({ text: text.slice(0, 120), done: false });
  input.value = '';
  renderChecklist();
  input.focus();
}

$('e-step-add').onclick = addStep;
$('e-step-new').onkeydown = (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addStep();
  }
};
$('e-step-defaults').onclick = () => {
  draftChecklist = defaultChecklist();
  renderChecklist();
};

function close() {
  docRequest++; // ignore any document load still running
  setDocBusy(false);
  $('editor').classList.remove('open');
  selected = null;
}

$('capture').onsubmit = (e) => {
  e.preventDefault();
  const d = new FormData(e.target);
  items.push({
    id: crypto.randomUUID(),
    title: String(d.get('title')).trim(),
    notes: String(d.get('notes')),
    platform: d.get('platform'),
    category: 'General',
    kind: 'project',
    status: 'Inbox',
    priority: 'Normal',
    dueDate: '',
    checklist: defaultChecklist(),
    createdAt: now(),
    updatedAt: now(),
    revision: newRevision(),
    archived: false,
  });
  persist();
  e.target.reset();
  notify(
    'Idea saved on this device. Press Sync now to back it up to Google Drive.',
  );
};

$('save').onclick = () => {
  const i = items.find((x) => x.id === selected);
  if (!i) return;
  if (!$('e-title').value.trim()) return notify('Title is required');
  Object.assign(i, {
    title: $('e-title').value.trim(),
    notes: $('e-notes').value,
    platform: $('e-platform').value,
    category: $('e-category').value,
    status: $('e-status').value,
    priority: $('e-priority').value,
    dueDate: validDueDate($('e-due').value),
    checklist: normalizeChecklist(draftChecklist),
  });
  touch(i, now());
  persist();
  close();
  notify('Saved on this device');
};

$('archive').onclick = () => {
  const i = items.find((x) => x.id === selected);
  if (
    !i ||
    !confirm('Archive this idea? The original Google Doc will not be changed.')
  )
    return;
  i.archived = true;
  touch(i, now());
  persist();
  close();
};

// Conflict resolution. Both actions archive the copy, so nothing is deleted.
$('resolve-use').onclick = () => {
  try {
    useCopyAsOriginal(items, selected, now());
    persist();
    close();
    notify(
      'Original replaced with the conflict copy. Press Sync now to upload.',
    );
  } catch (e) {
    notify(e.message);
  }
};
$('resolve-discard').onclick = () => {
  try {
    discardCopy(items, selected, now());
    persist();
    close();
    notify('Conflict copy archived. The original was kept.');
  } catch (e) {
    notify(e.message);
  }
};

$('close').onclick = close;
$('editor').onclick = (e) => {
  if (e.target === $('editor')) close();
};
$('search').oninput = render;
$('filter').onchange = render;

$('export-due').onclick = () => {
  const blob = new Blob([dueDateCsv(items)], {
    type: 'text/csv;charset=utf-8',
  });
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = 'tim-idea-vault-due-dates.csv';
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
  notify('Due dates exported as a spreadsheet file.');
};

$('export').onclick = () => {
  const blob = new Blob(
    [JSON.stringify({ version: 1, ideas: items }, null, 2)],
    { type: 'application/json' },
  );
  const u = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = u;
  a.download = 'tim-idea-vault-backup.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
};

// Additive import: never replaces or deletes existing ideas.
$('importfile').onchange = async (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  if (f.size > 5e6) return notify('Import must be under 5 MB');
  try {
    const d = JSON.parse(await f.text());
    if (!isWorkspace(d)) throw Error('Unsupported backup');
    let count = 0;
    for (const x of d.ideas) {
      if (!hasIdentity(x) || typeof x.title !== 'string' || !x.title.trim())
        continue;
      if (
        items.some(
          (i) => i.id === x.id || (x.sourceId && i.sourceId === x.sourceId),
        )
      )
        continue;
      items.push({
        ...x,
        notes: String(x.notes || ''),
        updatedAt: x.updatedAt || now(),
        revision: rev(x) || newRevision(),
      });
      count++;
    }
    if (count) persist();
    notify(
      'Imported ' + count + ' new ideas without replacing existing records',
    );
  } catch (err) {
    notify('Import failed: ' + err.message);
  }
  e.target.value = '';
};

// ---- Google Drive appData sync -------------------------------------------

function httpError(label, status, body = '') {
  const error = new Error(
    label + ' (' + status + ')' + (body ? ': ' + body.slice(0, 120) : ''),
  );
  error.status = status;
  return error;
}

// Resolves the full token response (access_token, expires_in).
// prompt '' lets Google skip the consent screen when access already exists.
function requestGrant(scope, prompt = 'consent') {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: window.TIM_IDEA_VAULT_CONFIG.googleClientId,
      scope,
      callback: (response) =>
        response.error ? reject(Error(response.error)) : resolve(response),
      error_callback: (e) =>
        reject(Error(e?.type || 'Google authorization cancelled')),
    });
    client.requestAccessToken({ prompt });
  });
}

function requestToken(scope) {
  return requestGrant(scope).then((r) => r.access_token);
}

async function driveJson(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) },
  });
  if (!r.ok) throw httpError('Google Drive', r.status, await r.text());
  return r.status === 204 ? null : r.json();
}

async function listWorkspaceFiles() {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    q: workspaceListQuery(WORKSPACE_FILE),
    fields: 'files(id,name,version)',
    pageSize: '100',
  });
  const r = await driveJson(DRIVE + 'files?' + params);
  return r.files || [];
}

async function downloadWorkspace(id) {
  const r = await fetch(
    DRIVE + 'files/' + encodeURIComponent(id) + '?alt=media',
    {
      headers: { Authorization: 'Bearer ' + token },
    },
  );
  if (!r.ok) throw httpError('Cannot download cloud file', r.status);
  const d = await r.json();
  if (!isWorkspace(d))
    throw Error('Cloud file has an unsupported format. Nothing was changed.');
  return d;
}

// Merge the cloud copy into local data using per-idea revisions and the
// device's base. A safety snapshot is written first; if it cannot be saved the
// merge is aborted, so local data is never replaced unprotected.
async function reconcileWith(latest) {
  const cloud = await downloadWorkspace(latest.id);
  const base = readSync().base || {};
  const result = mergeIdeas(items, cloud.ideas, base, () =>
    crypto.randomUUID(),
  );
  if (result.changed) {
    snapshot('before cloud merge', items);
    items = result.ideas;
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ideas: items }));
  }
  remote = latest;
  writeSync({
    pending: result.needsUpload,
    base: { ...base, ...result.synced },
  });
  return result;
}

function conflictNote(result) {
  const n = result.conflicts.length;
  if (!n) return '';
  return (
    ' ' +
    n +
    (n === 1 ? ' edit conflicted' : ' edits conflicted') +
    ': both versions were kept (see "Conflict copy" cards). Open each one and choose which to keep.'
  );
}

async function createWorkspace(payload) {
  const boundary =
    'tim_boundary_' + Date.now() + '_' + Math.random().toString(36).slice(2);
  const body =
    '--' +
    boundary +
    '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify({
      name: WORKSPACE_FILE,
      parents: ['appDataFolder'],
      mimeType: 'application/json',
    }) +
    '\r\n--' +
    boundary +
    '\r\nContent-Type: application/json\r\n\r\n' +
    payload +
    '\r\n--' +
    boundary +
    '--';
  const r = await fetch(
    UPLOAD + 'files?uploadType=multipart&fields=id,name,version',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'multipart/related; boundary=' + boundary,
      },
      body,
    },
  );
  if (!r.ok) throw httpError('Cloud creation failed', r.status);
  return r.json();
}

async function updateWorkspace(id, payload) {
  const r = await fetch(
    UPLOAD +
      'files/' +
      encodeURIComponent(id) +
      '?uploadType=media&fields=id,name,version',
    {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: payload,
    },
  );
  if (!r.ok) throw httpError('Cloud save failed', r.status);
  return r.json();
}

// Google Drive token. Held in memory only and refreshed silently when possible.
// If Google needs a user action, this throws SyncError('auth'); the status then
// asks for a tap on Sync now instead of opening a popup from background code.
function tokenValid() {
  return !!token && Date.now() < tokenExpiresAt;
}

async function acquireDriveToken(prompt) {
  let grant;
  try {
    grant = await requestGrant(APPDATA_SCOPE, prompt);
  } catch {
    throw new SyncError(
      'auth',
      'Google sign-in needed. Press Sync now to reconnect. Edits are saved on this device.',
    );
  }
  token = grant.access_token;
  tokenExpiresAt =
    Date.now() + ((Number(grant.expires_in) || 3600) - 60) * 1000;
  return token;
}

async function ensureDriveToken() {
  return tokenValid() ? token : acquireDriveToken('');
}

async function connect() {
  const clientId = window.TIM_IDEA_VAULT_CONFIG?.googleClientId;
  if (!clientId) {
    notify(
      'Google Cloud setup needed: configure public OAuth client ID in idea-vault/config.js. See IMPLEMENTATION.md.',
    );
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    notify('Google sign-in has not loaded. Try again.');
    return;
  }
  try {
    await acquireDriveToken('consent');
    writeSync({ connected: true });
    const latest = pickWorkspaceFile(await listWorkspaceFiles());
    lastCheckAt = Date.now();
    if (latest) {
      const result = await reconcileWith(latest);
      notify(
        'Connected. Existing ideas were merged; nothing was deleted.' +
          conflictNote(result),
      );
      if (result.needsUpload) syncer.requestSync({ immediate: true });
    } else {
      remote = null;
      writeSync({ pending: items.length > 0 });
      notify('Connected. No cloud copy exists yet.');
      if (items.length) syncer.requestSync({ immediate: true });
    }
    render();
    renderSyncState();
  } catch (e) {
    notify(e.message);
    renderSyncState();
  }
}

// One complete sync: check Drive, merge any newer cloud copy, and upload only
// when there are local changes (or no cloud copy yet). Throws on failure; the
// controller decides whether to retry. Never runs concurrently (see syncer).
async function syncOnce() {
  const latest = pickWorkspaceFile(await listWorkspaceFiles());
  lastCheckAt = Date.now();
  let result = null;
  if (latest && (!remote || !sameVersion(latest.version, remote.version))) {
    result = await reconcileWith(latest);
  }
  const note = result ? conflictNote(result) : '';
  if (latest && !hasPendingChanges()) {
    render();
    return {
      uploaded: false,
      message:
        (result?.changed
          ? 'Merged changes from another device. '
          : 'Already up to date. Nothing uploaded. ') + note,
    };
  }
  const payload = JSON.stringify({ version: 1, ideas: items });
  remote = latest
    ? await updateWorkspace(latest.id, payload)
    : await createWorkspace(payload);
  // Another tab may have written a planner edit while the upload was in flight.
  // Only the uploaded snapshot is synced; leave newer local data pending.
  writeSync({
    pending: localStorage.getItem(KEY) !== payload,
    lastSyncedAt: now(),
    base: baseOf(JSON.parse(payload).ideas),
  });
  render();
  return {
    uploaded: true,
    message:
      (result?.changed
        ? 'Merged changes from another device, then synced. '
        : 'Cloud sync complete. ') + note,
  };
}

// Maps any failure to a SyncError kind so the controller knows what to do next.
function classifySyncError(e) {
  if (e instanceof SyncError) return e;
  if (e?.status === 401) {
    token = null; // the next attempt gets a fresh token
    return new SyncError(
      'auth',
      'Google sign-in expired. Press Sync now to reconnect. Edits are saved on this device.',
    );
  }
  if (e instanceof TypeError) {
    return navigator.onLine
      ? new SyncError('transient', 'Could not reach Google Drive.')
      : new SyncError('offline', 'Offline.');
  }
  if (e?.status === 429 || e?.status >= 500) {
    return new SyncError('transient', e.message);
  }
  return new SyncError('fatal', e?.message || 'Sync failed.');
}

async function runSync() {
  if (!navigator.onLine) throw new SyncError('offline', 'Offline.');
  try {
    await ensureDriveToken();
    return await syncOnce();
  } catch (e) {
    throw classifySyncError(e);
  }
}

// Sync scheduler: debounced auto-upload, one run at a time, backoff on failure.
const syncer = createSyncController({
  run: runSync,
  delayMs: window.TIM_IDEA_VAULT_CONFIG?.autoSyncDelayMs ?? 4000,
  onState: () => renderSyncState(),
});

// "Sync now" is a user tap, so it may open the Google sign-in popup.
async function sync() {
  if (!token && !isConnected()) return connect();
  try {
    await ensureDriveToken();
  } catch (e) {
    notify(e.message);
    renderSyncState();
    return;
  }
  const outcome = await syncer.requestSync({ manual: true });
  notify(
    outcome && 'message' in outcome
      ? outcome.message
      : outcome?.reason ||
          'Sync did not finish. Edits are saved on this device.',
  );
}

// ---- Read-only Google Docs viewer ----------------------------------------
// Access uses drive.file: the user confirms the document in Google Picker,
// which grants this app access to that one file. The only request made is a
// GET to the Docs API. Nothing in this section writes to Google or to ideas.

const PICKER_NOT_CONFIGURED =
  'Document reading needs Google Picker setup. See docs/idea-vault/IMPLEMENTATION.md.';

class DocsError extends Error {}

function setDocStatus(s) {
  $('doc-status').textContent = s;
}
function setDocBusy(busy) {
  $('doc-refresh').disabled = busy;
  $('doc-viewer').setAttribute('aria-busy', String(busy));
}
function showDocPlaceholder(s) {
  const v = $('doc-viewer');
  v.replaceChildren();
  txt(v, 'p', s, 'muted');
}

function showDocSection(i) {
  docRequest++; // cancel any load still running for another idea
  setDocBusy(false);
  $('doc-section').hidden = !i.sourceId;
  setDocStatus('');
  const cached = docCache.get(i.id);
  if (cached) {
    renderDocument($('doc-viewer'), cached.model);
    setDocStatus(
      'Showing the version loaded at ' +
        cached.loadedAt.toLocaleTimeString() +
        '.',
    );
  } else {
    showDocPlaceholder(
      'The document is not loaded yet. Nothing in it will be changed.',
    );
  }
  $('doc-refresh').textContent = cached ? 'Refresh document' : 'Show document';
  // Opening the workspace refreshes the document. It never opens a popup or the
  // Picker: if Google can renew access silently, the document loads; otherwise the
  // "Show document" button stays as the one manual step.
  if (!i.sourceId) return;
  if (docsTokenValid()) {
    loadDocument(i, { auto: true });
    return;
  }
  silentDocsToken().then((ok) => {
    if (ok && selected === i.id) loadDocument(i, { auto: true });
  });
}

function docsTokenValid() {
  return Boolean(docsToken) && Date.now() < docsTokenExpiresAt;
}

// Asks Google for a drive.file token without any prompt. Resolves false when the
// browser cannot do it silently (no Google session, blocked third-party cookies).
async function silentDocsToken() {
  if (docsTokenValid()) return true;
  if (!window.google?.accounts?.oauth2) return false;
  try {
    const grant = await requestGrant(DRIVE_FILE_SCOPE, '');
    docsToken = grant.access_token;
    docsTokenExpiresAt =
      Date.now() + ((Number(grant.expires_in) || 3600) - 60) * 1000;
    return true;
  } catch {
    return false;
  }
}

function loadPicker() {
  if (!pickerReady) {
    pickerReady = new Promise((resolve, reject) => {
      if (!window.gapi?.load)
        return reject(
          Error(
            'Google Picker has not loaded. Check your connection and try again.',
          ),
        );
      window.gapi.load('picker', {
        callback: resolve,
        onerror: () =>
          reject(Error('Google Picker could not load. Try again.')),
      });
    }).catch((e) => {
      pickerReady = null;
      throw e;
    });
  }
  return pickerReady;
}

// Opens the Picker listing the user's documents, so the linked document can be
// chosen even when the Picker cannot preselect it. Resolves only when the user
// picks the linked document; rejects if they close the Picker or pick another one.
async function grantDocumentAccess(docId, accessToken) {
  const { pickerApiKey, cloudProjectNumber } =
    window.TIM_IDEA_VAULT_CONFIG || {};
  if (!pickerApiKey || !cloudProjectNumber)
    throw new DocsError(PICKER_NOT_CONFIGURED);
  await loadPicker();
  await new Promise((resolve, reject) => {
    const picker = new google.picker.PickerBuilder()
      .addView(new google.picker.DocsView(google.picker.ViewId.DOCUMENTS))
      .setOAuthToken(accessToken)
      .setDeveloperKey(pickerApiKey)
      .setAppId(cloudProjectNumber)
      .setTitle('Choose the linked Google Doc to allow reading')
      .setCallback((data) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const picked = (data[google.picker.Response.DOCUMENTS] || [])[0];
          if (picked?.id === docId) resolve();
          else
            reject(
              new DocsError(
                'That is not the document linked to this idea. Choose the linked document, or press Refresh document to try again.',
              ),
            );
        } else if (action === google.picker.Action.CANCEL)
          reject(
            new DocsError(
              'Document access was not granted. Press Refresh document to try again.',
            ),
          );
      })
      .build();
    picker.setVisible(true);
  });
}

// Reuses the drive.file token in memory until shortly before it expires.
async function docsAccessToken() {
  if (docsToken && Date.now() < docsTokenExpiresAt) return docsToken;
  const grant = await requestGrant(DRIVE_FILE_SCOPE, '');
  docsToken = grant.access_token;
  docsTokenExpiresAt =
    Date.now() + ((Number(grant.expires_in) || 3600) - 60) * 1000;
  return docsToken;
}

async function requestDocument(docId, accessToken) {
  const url = documentRequestUrl(docId);
  try {
    return await fetch(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + accessToken },
    });
  } catch {
    // fetch rejects only when the network request itself fails.
    throw new DocsError(networkErrorMessage());
  }
}

async function readDocumentJson(response) {
  try {
    return await response.json();
  } catch {
    throw new DocsError(
      'Google Docs returned content this viewer could not read.',
    );
  }
}

async function loadDocument(i, { auto = false } = {}) {
  const request = ++docRequest;
  const current = () => request === docRequest && selected === i.id;
  const cached = docCache.get(i.id);
  setDocBusy(true);
  setDocStatus(cached ? 'Refreshing…' : 'Loading document…');
  try {
    const accessToken = await docsAccessToken();
    let response = await requestDocument(i.sourceId, accessToken);
    let outcome = classifyDocsResponse(response.status);

    if (outcome.kind === 'expired') {
      docsToken = null; // force a fresh sign-in on the next attempt
      throw new DocsError(outcome.message);
    }
    if (outcome.kind === 'forbidden' || outcome.kind === 'notfound') {
      if (auto) {
        throw new DocsError(
          'Press Refresh document to allow reading this document.',
        );
      }
      // The file has not been granted to this app yet: ask via Picker, then retry once.
      await grantDocumentAccess(i.sourceId, accessToken);
      if (!current()) return;
      response = await requestDocument(i.sourceId, accessToken);
      outcome = classifyDocsResponse(response.status);
    }
    if (outcome.kind !== 'ok') throw new DocsError(outcome.message);

    const model = documentToModel(await readDocumentJson(response));
    if (!current()) return;
    const loadedAt = new Date();
    docCache.set(i.id, { model, loadedAt });
    renderDocument($('doc-viewer'), model);
    $('doc-refresh').textContent = 'Refresh document';
    setDocStatus(
      'Loaded ' + loadedAt.toLocaleTimeString() + '. Read-only copy.',
    );
  } catch (e) {
    if (!current()) return;
    const message =
      e instanceof DocsError
        ? e.message
        : e.message || 'Could not load the document. Try again.';
    if (docCache.has(i.id)) {
      // Keep the last good content on screen and say why it is not current.
      setDocStatus(
        message +
          ' Showing the version loaded at ' +
          docCache.get(i.id).loadedAt.toLocaleTimeString() +
          '.',
      );
    } else {
      setDocStatus(message);
    }
  } finally {
    if (current()) setDocBusy(false);
  }
}

$('doc-refresh').onclick = () => {
  const i = items.find((x) => x.id === selected);
  if (i?.sourceId) loadDocument(i);
};

// ---- Additive Google Docs import -----------------------------------------

async function listFolderDocs(id, accessToken) {
  const headers = { Authorization: 'Bearer ' + accessToken };
  const base = DRIVE + 'files';
  const fields =
    'nextPageToken,files(id,name,mimeType,webViewLink,createdTime,modifiedTime,trashed)';
  let page = '',
    files = [];
  do {
    const params = new URLSearchParams({
      q: "'" + id + "' in parents and trashed = false",
      fields,
      pageSize: '100',
      orderBy: 'name',
    });
    if (page) params.set('pageToken', page);
    const response = await fetch(base + '?' + params, { headers });
    if (!response.ok)
      throw Error(
        'Google Drive folder lookup failed (' +
          response.status +
          '). Check permissions and folder ID.',
      );
    const data = await response.json();
    files.push(...(data.files || []));
    page = data.nextPageToken || '';
    if (files.length > 1000)
      throw Error('Folder has more than 1,000 files. Import a smaller folder.');
  } while (page);
  return files.filter(isGoogleDoc);
}

async function importFromDrive() {
  if (importing) return;
  let id;
  try {
    id = folderIdFrom($('folder-input').value);
  } catch (error) {
    notify(error.message);
    return;
  }
  if (!window.google?.accounts?.oauth2) {
    notify('Google authentication has not loaded. Try again.');
    return;
  }
  if (!window.TIM_IDEA_VAULT_CONFIG?.googleClientId) {
    notify('Google OAuth client ID is not configured.');
    return;
  }
  importing = true;
  $('import-drive').disabled = true;
  $('import-drive').textContent = 'Connecting…';
  localStorage.setItem(FOLDER_KEY, id);
  try {
    // Metadata-only read. Document bodies are never requested.
    const accessToken = await requestToken(METADATA_SCOPE);
    $('import-drive').textContent = 'Reading folder…';
    const docs = await listFolderDocs(id, accessToken);
    const plan = planImport(items, docs, () => crypto.randomUUID(), now());
    if (plan.additions.length) {
      items.push(...plan.additions);
      persist();
    }
    notify(
      'Found ' +
        docs.length +
        ' Google Docs: ' +
        plan.additions.length +
        ' imported, ' +
        plan.existingCount +
        ' already linked. Originals unchanged. ' +
        (plan.additions.length ? 'Tap Sync now to back up the new cards.' : ''),
    );
  } catch (error) {
    notify('Import failed: ' + error.message);
  } finally {
    importing = false;
    $('import-drive').disabled = false;
    $('import-drive').textContent = 'Import / Refresh from Drive';
  }
}

$('folder-input').value = localStorage.getItem(FOLDER_KEY) || '';
$('import-drive').onclick = importFromDrive;
$('connect').onclick = connect;
$('sync').onclick = sync;

// Coming back to the tab checks the cloud, so edits from another device show up.
// Checks are skipped if one ran very recently and nothing is waiting to upload.
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !isConnected()) return;
  if (hasPendingChanges() || Date.now() - lastCheckAt > AUTO_CHECK_MS) {
    syncer.requestSync({ immediate: true });
  }
});
window.addEventListener('online', () => syncer.notifyOnline());

// Projects saved by Content Planner on this device, for keeping promoted ideas in step.
function plannerProjects() {
  try {
    const d = JSON.parse(localStorage.getItem(PLANNER_KEY) || 'null');
    return d?.version === 1 && Array.isArray(d.projects) ? d.projects : [];
  } catch {
    return [];
  }
}
load();
if (reconcileLinked(plannerProjects(), items, now())) persist();
window.addEventListener('storage', (e) => {
  if (e.key !== KEY && e.key !== PLANNER_KEY) return;
  if (e.key === KEY) load();
  if (reconcileLinked(plannerProjects(), items, now())) persist();
  else {
    render();
    // Content Planner already reconciled this edit; it still needs an upload.
    if (e.key === KEY && hasPendingChanges() && isConnected())
      syncer.requestSync();
    renderSyncState();
  }
});
render();
renderSyncState();
// Opening Idea Vault checks the cloud and uploads anything left unsynced.
if (isConnected()) syncer.requestSync({ immediate: true });

// Leave draft edits in place until the user saves or closes the idea editor.
window.TimPlanningEditor = Object.freeze({
  isBusy: () => $('editor').classList.contains('open'),
});

