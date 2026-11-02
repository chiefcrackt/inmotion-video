import {
  WORKSPACE_FILE,
  isWorkspace,
  hasIdentity,
  sameVersion,
  workspaceListQuery,
  pickWorkspaceFile,
  mergeIdeas,
  isGoogleDoc,
  folderIdFrom,
  planImport,
} from './vault-core.mjs';

// Storage keys. Changing KEY would strand existing user data, so it stays fixed.
const KEY = 'tim-idea-vault-v1'; // ideas, version 1 (unchanged)
const SYNC_KEY = 'tim-idea-vault-sync-v1'; // { pending, lastSyncedAt }
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
  tokenClient = null,
  importing = false;

function notify(s) {
  $('message').textContent = s;
}
function setCloudStatus(s) {
  $('cloudstatus').textContent = s;
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

function persist() {
  localStorage.setItem(KEY, JSON.stringify({ version: 1, ideas: items }));
  writeSync({ pending: true });
  setCloudStatus('Local changes pending cloud sync');
  render();
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

// ---- Rendering and editing (unchanged behavior) --------------------------

function txt(parent, tag, value, cls) {
  const n = document.createElement(tag);
  n.textContent = value;
  if (cls) n.className = cls;
  parent.append(n);
  return n;
}

function render() {
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
    txt(card, 'span', i.status, 'pill');
    txt(card, 'h3', i.title);
    txt(card, 'small', i.platform + ' · ' + (i.category || 'General'));
    if (i.sourceId) txt(card, 'small', 'Linked Google Doc');
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
  $('doclink').hidden = !i.docUrl;
  if (i.docUrl) $('doclink').href = i.docUrl;
  $('editor').classList.add('open');
  $('e-title').focus();
}

function close() {
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
    createdAt: now(),
    updatedAt: now(),
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
    updatedAt: now(),
  });
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
  i.updatedAt = now();
  persist();
  close();
};

$('close').onclick = close;
$('editor').onclick = (e) => {
  if (e.target === $('editor')) close();
};
$('search').oninput = render;
$('filter').onchange = render;

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

function requestToken(scope) {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: window.TIM_IDEA_VAULT_CONFIG.googleClientId,
      scope,
      callback: (response) =>
        response.error
          ? reject(Error(response.error))
          : resolve(response.access_token),
      error_callback: (e) =>
        reject(Error(e?.type || 'Google authorization cancelled')),
    });
    client.requestAccessToken({ prompt: 'consent' });
  });
}

async function driveJson(url, options = {}) {
  const r = await fetch(url, {
    ...options,
    headers: { Authorization: 'Bearer ' + token, ...(options.headers || {}) },
  });
  if (!r.ok)
    throw Error(
      'Google Drive ' + r.status + ': ' + (await r.text()).slice(0, 180),
    );
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
  if (!r.ok) throw Error('Cannot download cloud file: ' + r.status);
  const d = await r.json();
  if (!isWorkspace(d))
    throw Error('Cloud file has an unsupported format. Nothing was changed.');
  return d;
}

// Merge the cloud copy into local data. A safety snapshot is written first, and
// if that fails the merge is aborted, so local data is never replaced unprotected.
async function reconcileWith(latest) {
  const cloud = await downloadWorkspace(latest.id);
  const result = mergeIdeas(items, cloud.ideas);
  if (result.changed) {
    snapshot('before cloud merge', items);
    items = result.ideas;
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ideas: items }));
  }
  remote = latest;
  writeSync({ pending: result.needsUpload });
  return result;
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
  if (!r.ok) throw Error('Cloud creation failed: ' + r.status);
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
  if (!r.ok) throw Error('Cloud save failed: ' + r.status);
  return r.json();
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
    token = await requestToken(APPDATA_SCOPE);
    const latest = pickWorkspaceFile(await listWorkspaceFiles());
    if (latest) {
      const result = await reconcileWith(latest);
      setCloudStatus(
        result.needsUpload
          ? 'Connected · cloud copy merged · press Sync now to upload'
          : 'Connected to Google Drive · up to date',
      );
      notify(
        'Connected. Existing ideas were merged per idea; nothing was deleted.',
      );
    } else {
      remote = null;
      writeSync({ pending: items.length > 0 });
      setCloudStatus(
        items.length
          ? 'Connected · no cloud copy yet · press Sync now to create it'
          : 'Connected to Google Drive · no cloud copy yet',
      );
      notify('Connected. No cloud copy exists yet.');
    }
    render();
  } catch (e) {
    notify(e.message);
    setCloudStatus('Cloud connection failed · local data kept');
  }
}

async function sync() {
  if (!token) return connect();
  try {
    const latest = pickWorkspaceFile(await listWorkspaceFiles());
    let mergedFromCloud = false;
    // Reconcile whenever the cloud version is not the one we last saw. This covers
    // a change made on another device and a copy created while this page was open.
    if (latest && (!remote || !sameVersion(latest.version, remote.version))) {
      mergedFromCloud = (await reconcileWith(latest)).changed;
    }
    const payload = JSON.stringify({ version: 1, ideas: items });
    remote = latest
      ? await updateWorkspace(latest.id, payload)
      : await createWorkspace(payload);
    writeSync({ pending: false, lastSyncedAt: now() });
    setCloudStatus(
      'Synced to Google Drive at ' + new Date().toLocaleTimeString(),
    );
    notify(
      mergedFromCloud
        ? 'Merged changes from another device, then synced.'
        : 'Cloud sync complete',
    );
  } catch (e) {
    notify(e.message);
    setCloudStatus(
      hasPendingChanges()
        ? 'Cloud sync failed · local changes kept, not uploaded'
        : 'Cloud sync failed · local data kept',
    );
  }
}

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

load();
setCloudStatus(
  hasPendingChanges()
    ? 'Local changes pending cloud sync'
    : 'Local draft mode · Google Drive not connected',
);
render();
