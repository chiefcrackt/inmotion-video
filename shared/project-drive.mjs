import {
  readProjects,
  saveProjects,
  updateProject,
  applyMerged,
  deviceId,
} from './project-store.mjs';
import { mergeProjects, stable, stamp } from './project-sync.mjs';
import { validateBackup } from '../content-planner/model.mjs';
import {
  createSyncController,
  SyncError,
} from '../idea-vault/sync-controller.mjs';
const API = 'https://www.googleapis.com/drive/v3/',
  UPLOAD = 'https://www.googleapis.com/upload/drive/v3/',
  PREF = 'tim-content-drive-v1';
const SCOPE =
  'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/drive.appdata';
let studio;
try {
  if (window.parent && window.parent !== window)
    studio = window.parent.TimContentDriveSession;
} catch {
  /* cross-origin host */
}
const session = studio || {};
let readyPromise,
  controller,
  lastCheck = 0;
const emitLocal = () => window.dispatchEvent(new Event('tim-drive-state'));
studio?.addEventListener('change', emitLocal);
window.addEventListener('pagehide', (event) => {
  if (!event.persisted) studio?.removeEventListener('change', emitLocal);
});
const emit = () =>
  studio ? studio.dispatchEvent(new Event('change')) : emitLocal();
export const sharesStudioDrive = !!studio;
export function usesSupabaseWorkspace() {
  return (
    sharesStudioDrive ||
    !!localStorage.getItem('tim-content-studio-supabase-owner')
  );
}
export function studioAccess() {
  return studio && studio.token && Date.now() < studio.expires
    ? { token: studio.token, account: studio.connectedAccount }
    : null;
}
export function invalidateStudioAccess(accessToken) {
  if (studio && studio.token === accessToken) {
    studio.token = '';
    emit();
  }
}
function ideaAccount() {
  try {
    return JSON.parse(localStorage.getItem('tim-idea-vault-sync-v1') || '{}')
      ?.account;
  } catch {
    return null;
  }
}
export function preferences() {
  try {
    return JSON.parse(localStorage.getItem(PREF) || '{}');
  } catch {
    return {};
  }
}
function setPrefs(value) {
  localStorage.setItem(PREF, JSON.stringify({ ...preferences(), ...value }));
  emit();
}
export function state() {
  return {
    ...preferences(),
    authorized: !!session.token && Date.now() < session.expires,
    sync: controller?.getStatus(),
  };
}
function script(src, test) {
  if (test()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    const timer = setTimeout(
      () => reject(Error('Google connection took too long. Try again.')),
      15000,
    );
    s.src = src;
    s.onload = () => {
      clearTimeout(timer);
      test() ? resolve() : reject(Error('Google connection did not load.'));
    };
    s.onerror = () => {
      clearTimeout(timer);
      reject(Error('Google connection could not load. Check your connection.'));
    };
    document.head.append(s);
  });
}
export function ready() {
  if (!readyPromise)
    readyPromise = (async () => {
      await script(
        new URL('../idea-vault/config.js', import.meta.url).href,
        () => !!window.TIM_IDEA_VAULT_CONFIG,
      );
      await script(
        'https://accounts.google.com/gsi/client',
        () => !!window.google?.accounts?.oauth2,
      );
    })().catch((e) => {
      readyPromise = null;
      throw e;
    });
  return readyPromise;
}
export async function connect({ interactive = true } = {}) {
  if (session.token && Date.now() < session.expires) return;
  if (session.authorizing) return session.authorizing;
  if (studio && !interactive) return;
  const attempt = (async () => {
    await ready();
    const pref = preferences();
    const grant = await new Promise((resolve, reject) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: window.TIM_IDEA_VAULT_CONFIG.googleClientId,
        scope: SCOPE,
        hint: pref.email || undefined,
        callback: (r) => (r.error ? reject(Error(r.error)) : resolve(r)),
        error_callback: () =>
          reject(
            new SyncError(
              'auth',
              'Tap Reconnect Drive to continue. Your plans and folder choices are remembered.',
            ),
          ),
      });
      client.requestAccessToken({ prompt: pref.connected ? '' : 'consent' });
    });
    if (!grant.access_token)
      throw new SyncError('auth', 'Google did not grant Drive access.');
    if (
      google.accounts.oauth2.hasGrantedAllScopes &&
      !google.accounts.oauth2.hasGrantedAllScopes(grant, ...SCOPE.split(' '))
    )
      throw new SyncError(
        'auth',
        'Allow project files and app data to enable Drive exports and sync.',
      );
    try {
      const response = await fetch(
        API + 'about?fields=user(emailAddress,permissionId,displayName)',
        { headers: { Authorization: 'Bearer ' + grant.access_token } },
      );
      if (!response.ok) throw Error('Could not verify your Google account.');
      const { user } = await response.json();
      if (!user?.permissionId)
        throw Error('Could not verify your Google account.');
      if (pref.account && pref.account !== user.permissionId)
        throw Error(
          'Choose ' +
            pref.email +
            ' to keep using its project folders. Disconnect first to use another account.',
        );
      if (session.authorizing !== attempt)
        throw new SyncError('auth', 'Drive connection was cancelled.');
      if (studio && ideaAccount() && ideaAccount() !== user.permissionId)
        throw new SyncError(
          'auth',
          'Choose the Google account already linked to Idea Vault.',
        );
      session.connectedAccount = user.permissionId;
      session.expires =
        Date.now() + ((Number(grant.expires_in) || 3600) - 60) * 1000;
      session.token = grant.access_token;
      setPrefs({
        connected: true,
        account: user.permissionId,
        email: user.emailAddress || '',
        name: user.displayName || '',
      });
    } catch (e) {
      if (session.authorizing === attempt) session.token = '';
      throw e;
    }
  })();
  session.authorizing = attempt;
  try {
    return await attempt;
  } finally {
    if (session.authorizing === attempt) session.authorizing = null;
    emit();
  }
}
export function disconnect() {
  session.authorizing = null;
  session.token = '';
  session.expires = 0;
  session.connectedAccount = '';
  controller?.dispose();
  controller = null;
  localStorage.removeItem(PREF);
  emit();
}
function requireToken() {
  if (!session.token || Date.now() >= session.expires)
    throw new SyncError(
      'auth',
      'Tap Reconnect Drive. Your account and folders are remembered.',
    );
}
async function request(url, options = {}) {
  requireToken();
  const accessToken = session.token;
  const r = await fetch(url.startsWith('https:') ? url : API + url, {
    ...options,
    headers: { Authorization: 'Bearer ' + accessToken, ...options.headers },
  });
  if (session.token !== accessToken)
    throw new SyncError(
      'auth',
      'Drive connection changed. Try again when connected.',
    );
  if (!r.ok && r.status !== 308) {
    if (r.status === 401) {
      if (session.token === accessToken) session.token = '';
      emit();
      throw new SyncError(
        'auth',
        'Google access expired. Tap Reconnect Drive.',
      );
    }
    const e = new Error(
      'Google Drive request failed (' +
        r.status +
        '). Your local work is kept.',
    );
    e.status = r.status;
    throw e;
  }
  return r;
}
async function json(url, options) {
  const r = await request(url, options);
  return r.status === 204 ? null : r.json();
}
const quote = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
async function list(q, space = 'drive') {
  const files = [];
  let pageToken = '';
  do {
    const p = new URLSearchParams({
      q,
      spaces: space,
      pageSize: '100',
      fields:
        'nextPageToken,files(id,name,mimeType,trashed,parents,appProperties,webViewLink)',
      ...(pageToken ? { pageToken } : {}),
    });
    const r = await json('files?' + p);
    files.push(...(r.files || []));
    pageToken = r.nextPageToken || '';
    if (files.length > 3000)
      throw Error('Too many project files to sync. Nothing was removed.');
  } while (pageToken);
  return files;
}
async function metadata(id) {
  return json(
    'files/' +
      encodeURIComponent(id) +
      '?fields=id,name,mimeType,trashed,parents,webViewLink,capabilities(canAddChildren)',
  );
}
async function folderValid(id) {
  const f = await metadata(id);
  if (
    f.trashed ||
    f.mimeType !== 'application/vnd.google-apps.folder' ||
    f.capabilities?.canAddChildren === false
  )
    throw Error(
      'The remembered Drive folder is unavailable or read-only. Choose another folder.',
    );
  return f;
}
async function createFolder(name, parent, properties) {
  return json('files?fields=id,name,webViewLink', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parent ? { parents: [parent] } : {}),
      appProperties: properties,
    }),
  });
}
function rootFolder() {
  return serial('studio-root', findRootFolder);
}
async function findRootFolder() {
  const pref = preferences();
  if (pref.root?.id) return folderValid(pref.root.id);
  const found = await list(
    "trashed = false and appProperties has { key='timStudioRoot' and value='v1' }",
  );
  if (found.length > 1)
    throw Error(
      'More than one studio folder exists. Choose the folder you want to use.',
    );
  const f =
    found[0] ||
    (await createFolder('T.IM Studio', null, { timStudioRoot: 'v1' }));
  setPrefs({ root: { id: f.id, name: f.name, changedAt: Date.now() } });
  return f;
}
export async function chooseRoot() {
  await connect();
  await script('https://apis.google.com/js/api.js', () => !!window.gapi?.load);
  await new Promise((resolve, reject) =>
    gapi.load('picker', {
      callback: resolve,
      onerror: () => reject(Error('Folder picker could not load.')),
    }),
  );
  const config = window.TIM_IDEA_VAULT_CONFIG;
  if (!config.pickerApiKey || !config.cloudProjectNumber)
    throw Error('Google Picker configuration is missing.');
  const folder = await new Promise((resolve, reject) => {
    const view = new google.picker.DocsView(google.picker.ViewId.FOLDERS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(true);
    const picker = new google.picker.PickerBuilder()
      .addView(view)
      .setOAuthToken(session.token)
      .setDeveloperKey(config.pickerApiKey)
      .setAppId(config.cloudProjectNumber)
      .setOrigin(window.location.origin)
      .setTitle('Choose the parent folder for new video projects')
      .setCallback((data) => {
        if (data.action === google.picker.Action.PICKED) resolve(data.docs[0]);
        else if (data.action === google.picker.Action.CANCEL)
          reject(Error('Folder choice cancelled.'));
      })
      .build();
    picker.setVisible(true);
  });
  const f = await folderValid(folder.id);
  setPrefs({ root: { id: f.id, name: f.name, changedAt: Date.now() } });
  await syncNow();
  return f;
}
const locks = new Map();
function serial(key, fn) {
  const before = locks.get(key) || Promise.resolve();
  const next = before
    .catch(() => {})
    .then(() =>
      navigator.locks ? navigator.locks.request('tim-drive:' + key, fn) : fn(),
    );
  locks.set(key, next);
  return next.finally(() => {
    if (locks.get(key) === next) locks.delete(key);
  });
}
export function ensureFolder(projectId) {
  return serial('folder:' + projectId, async () => {
    requireToken();
    const p = readProjects().find((p) => p.id === projectId && !p.deleted);
    if (!p) throw Error('Video project not found.');
    if (p.driveFolder?.id && p.driveFolder.account === session.connectedAccount)
      return folderValid(p.driveFolder.id);
    const root = await rootFolder();
    const found = await list(
      "trashed = false and mimeType = 'application/vnd.google-apps.folder' and '" +
        quote(root.id) +
        "' in parents and appProperties has { key='timVideoProject' and value='" +
        quote(projectId) +
        "' }",
    );
    if (found.length > 1)
      throw Error(
        'Multiple folders belong to this video. Resolve the duplicates in Drive before exporting.',
      );
    const f =
      found[0] ||
      (await createFolder(p.title || 'Untitled video', root.id, {
        timVideoProject: projectId,
      }));
    updateProject(projectId, (p) => {
      p.driveFolder = {
        id: f.id,
        name: f.name,
        account: session.connectedAccount,
      };
    });
    return f;
  });
}
// Each device owns its own cloud snapshot. Concurrent devices never overwrite one another.
async function syncRun() {
  if (!navigator.onLine)
    throw new SyncError('offline', 'Offline. Plans are saved locally.');
  try {
    requireToken();
    const files = await list(
      "trashed = false and appProperties has { key='timContentWorkspace' and value='v1' }",
      'appDataFolder',
    );
    const remote = [];
    let inheritedRoot;
    for (const file of files) {
      const doc = await json(
        'files/' + encodeURIComponent(file.id) + '?alt=media',
      );
      if (doc.version !== 1 || !Array.isArray(doc.projects))
        throw Error('A cloud project file has an unsupported format.');
      remote.push(validateBackup(doc));
      if (
        doc.root?.id &&
        (!inheritedRoot ||
          (doc.root.changedAt || 0) > (inheritedRoot.changedAt || 0))
      )
        inheritedRoot = doc.root;
    }
    if (
      inheritedRoot &&
      (!preferences().root ||
        (inheritedRoot.changedAt || 0) > (preferences().root.changedAt || 0))
    )
      setPrefs({ root: inheritedRoot });
    const local = readProjects();
    stamp(local, local, deviceId());
    const merged = mergeProjects(local, ...remote);
    applyMerged(merged);
    const device = deviceId(),
      own = files.filter((f) => f.appProperties?.device === device);
    if (own.length > 1)
      throw Error(
        'Duplicate device sync files found. Export a backup before resolving them.',
      );
    const payload = JSON.stringify({
      version: 1,
      projects: merged,
      root: preferences().root || null,
      device,
    });
    if (!own[0]) {
      await uploadSmall(
        {
          name: 'tim-content-' + device + '.json',
          parents: ['appDataFolder'],
          mimeType: 'application/json',
          appProperties: { timContentWorkspace: 'v1', device },
        },
        new Blob([payload], { type: 'application/json' }),
      );
    } else {
      const before = await json(
        'files/' + encodeURIComponent(own[0].id) + '?alt=media',
      );
      if (stable(before) !== stable(JSON.parse(payload)))
        await request(
          UPLOAD +
            'files/' +
            encodeURIComponent(own[0].id) +
            '?uploadType=media',
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
          },
        );
    }
    lastCheck = Date.now();
    setPrefs({ lastSynced: new Date().toISOString() });
    return { message: 'Projects synced with Google Drive.' };
  } catch (e) {
    if (e instanceof SyncError) throw e;
    throw new SyncError(
      e instanceof TypeError || e.status === 429 || e.status >= 500
        ? 'transient'
        : 'fatal',
      e.message,
    );
  }
}
export function startSync() {
  if (controller) return controller;
  controller = createSyncController({
    run: async () => {
      if (usesSupabaseWorkspace())
        return { message: 'Workspace sync uses Supabase.' };
      return navigator.locks
        ? await navigator.locks.request('tim-content-drive-sync', syncRun)
        : await syncRun();
    },
    delayMs: window.TIM_IDEA_VAULT_CONFIG?.autoSyncDelayMs ?? 4000,
    onState: emit,
  });
  return controller;
}
export async function syncNow() {
  return startSync().requestSync({ manual: true });
}
window.addEventListener('tim-projects-changed', () => {
  if ((!studio || controller) && preferences().connected)
    startSync().requestSync();
});
window.addEventListener('online', () => controller?.notifyOnline());
document.addEventListener('visibilitychange', () => {
  if (
    !document.hidden &&
    (!studio || controller) &&
    preferences().connected &&
    Date.now() - lastCheck > 30000
  )
    startSync().requestSync({ immediate: true });
});
export async function resume() {
  if (usesSupabaseWorkspace() || !preferences().connected) return;
  await connect({ interactive: false });
  if (!state().authorized) return;
  startSync().requestSync({ immediate: true });
}
async function uploadSmall(meta, blob) {
  const boundary = 'tim_' + crypto.randomUUID();
  const body = new Blob([
    '--' +
      boundary +
      '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
    JSON.stringify(meta),
    '\r\n--' +
      boundary +
      '\r\nContent-Type: ' +
      (blob.type || 'application/octet-stream') +
      '\r\n\r\n',
    blob,
    '\r\n--' + boundary + '--',
  ]);
  return json(
    UPLOAD + 'files?uploadType=multipart&fields=id,name,webViewLink',
    {
      method: 'POST',
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
      body,
    },
  );
}
export async function uploadAsset(
  projectId,
  blob,
  name,
  { replace = false, onProgress = () => {}, tool = '' } = {},
) {
  requireToken();
  return serial('upload:' + projectId, async () => {
    const folder = await ensureFolder(projectId);
    const p = readProjects().find((p) => p.id === projectId);
    const prior = replace
      ? (p.driveAssets || [])
          .slice()
          .reverse()
          .find(
            (a) => a.name === name && a.account === session.connectedAccount,
          )
      : null;
    const meta = {
      name,
      mimeType: blob.type || 'application/octet-stream',
      ...(prior ? {} : { parents: [folder.id] }),
      appProperties: { timVideoProject: projectId, timTool: tool },
    };
    const path =
      UPLOAD +
      'files' +
      (prior ? '/' + encodeURIComponent(prior.id) : '') +
      '?uploadType=resumable&fields=id,name,webViewLink';
    const start = await request(path, {
      method: prior ? 'PATCH' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': meta.mimeType,
      },
      body: JSON.stringify(meta),
    });
    const session = start.headers.get('Location');
    if (!session || new URL(session).origin !== 'https://www.googleapis.com')
      throw Error('Drive did not return a valid upload session.');
    const chunkSize = 8 * 1024 * 1024;
    let offset = 0,
      result,
      failures = 0,
      stalls = 0;
    while (!result) {
      const end = Math.min(offset + chunkSize, blob.size);
      let response;
      try {
        response = await request(session, {
          method: 'PUT',
          headers: {
            'Content-Type': meta.mimeType,
            'Content-Range': blob.size
              ? 'bytes ' + offset + '-' + (end - 1) + '/' + blob.size
              : 'bytes */0',
          },
          body: blob.slice(offset, end),
        });
        failures = 0;
      } catch (e) {
        if (
          e instanceof SyncError ||
          (!(e instanceof TypeError) &&
            e.status !== 429 &&
            !(e.status >= 500)) ||
          ++failures > 3
        )
          throw e;
        await new Promise((r) => setTimeout(r, 500 * failures));
        response = await request(session, {
          method: 'PUT',
          headers: { 'Content-Range': 'bytes */' + blob.size },
          body: new Blob([]),
        });
      }
      if (response.status === 308) {
        const range = response.headers.get('Range');
        const accepted = range ? Number(range.split('-')[1]) + 1 : 0;
        if (accepted < offset || accepted > blob.size)
          throw Error('Invalid upload progress from Drive.');
        if (accepted > offset) stalls = 0;
        else if (++stalls > 3)
          throw Error('Upload stalled. Retry or download the asset.');
        offset = accepted;
        if (offset === blob.size)
          throw Error(
            'Drive has not finalized the upload. Retry or download the asset.',
          );
      } else {
        result = await response.json();
        offset = blob.size;
      }
      onProgress(blob.size ? Math.round((offset / blob.size) * 100) : 100);
    }

    const verified = await json(
      'files/' +
        encodeURIComponent(result.id) +
        '?fields=id,name,webViewLink,parents,size',
    );
    if (!verified.parents?.includes(folder.id))
      throw Error('Uploaded asset folder could not be verified.');
    const asset = {
      id: verified.id,
      name: verified.name,
      url: verified.webViewLink || '',
      mimeType: meta.mimeType,
      account: session.connectedAccount,
      tool,
      updated: Date.now(),
    };
    updateProject(projectId, (p) => {
      p.driveAssets = (p.driveAssets || []).filter((a) => a.id !== asset.id);
      p.driveAssets.push(asset);
      if (tool === 'cover-maker' && safeWeb(asset.url))
        p.thumbnailUrl = asset.url;
    });
    startSync().requestSync();
    return asset;
  });
}
function safeWeb(url) {
  try {
    return new URL(url).protocol === 'https:';
  } catch {
    return false;
  }
}
export const folderLink = (id) =>
  'https://drive.google.com/drive/folders/' + encodeURIComponent(id);

window.addEventListener('storage', (e) => {
  if (
    e.key === 'tim-content-planner-v1' &&
    (!studio || controller) &&
    preferences().connected
  )
    startSync().requestSync();
});
export async function downloadSetup(id) {
  requireToken();
  const f = await json(
    'files/' + encodeURIComponent(id) + '?fields=id,mimeType,size',
  );
  if (Number(f.size) > 35 * 1024 * 1024)
    throw Error('Editable setup is too large.');
  return json('files/' + encodeURIComponent(id) + '?alt=media');
}
