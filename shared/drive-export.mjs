import * as drive from './project-drive.mjs';
import { readProjects } from './project-store.mjs';
import { mountDriveControls } from './drive-controls.mjs';
const idFromUrl = new URLSearchParams(location.search).get('videoProject'),
  tool = location.pathname.split('/').filter(Boolean).at(-1) || '';
let pref = {};
try {
  pref = JSON.parse(localStorage.getItem('tim-drive-export-v1') || '{}');
} catch {}
const host = document.createElement('details');
host.open = !!idFromUrl || !!pref.project;
const summary = document.createElement('summary');
summary.textContent = 'Project & Google Drive';
host.append(summary);
host.className = 'tim-drive-export';
host.setAttribute('aria-label', 'Project export destination');
const css = document.createElement('link');
css.rel = 'stylesheet';
css.href = new URL('drive-export.css', import.meta.url).href;
document.head.append(css);
const title = document.createElement('strong');
title.textContent = 'Video project';
const select = document.createElement('select');
select.id = 'drive-export-project';
select.setAttribute('aria-label', 'Video project for exports');
const destination = document.createElement('select');
destination.id = 'drive-export-destination';
destination.setAttribute('aria-label', 'Export destination');
destination.add(new Option('Download to this device', 'local'));
destination.add(new Option('Save to Google Drive', 'drive'));
const versions = document.createElement('select');
versions.id = 'drive-export-version';
versions.setAttribute('aria-label', 'Repeated export behavior');
versions.add(new Option('Save another version', 'new'));
versions.add(new Option('Update last matching asset', 'replace'));
const info = document.createElement('p');
info.textContent = 'Choose a video to keep its exports together.';
const jobs = document.createElement('div');
jobs.id = 'drive-export-jobs';
jobs.setAttribute('aria-live', 'polite');
const setup = document.createElement('button');
setup.type = 'button';
setup.textContent = 'Save editable setup to Drive';
setup.id = 'drive-save-setup';
host.append(title, select, destination, versions, info, setup);
mountDriveControls(host);
host.append(jobs);
(
  document.querySelector('.controls, #controls') ||
  document.querySelector('main aside') ||
  document.querySelector('aside') ||
  document.querySelector('main') ||
  document.querySelector('.wrap') ||
  document.body
).prepend(host);
function refresh() {
  let rows = [];
  try {
    rows = readProjects().filter((p) => !p.deleted);
  } catch {
    info.textContent = 'Project storage is unavailable.';
  }
  const selected = select.value || idFromUrl || pref.project || '';
  select.replaceChildren(new Option('No video project', ''));
  for (const p of rows)
    select.add(
      new Option(p.title + (p.conflictOf ? ' (conflict copy)' : ''), p.id),
    );
  select.value = rows.some((p) => p.id === selected) ? selected : '';
  destination.value = pref.destinations?.[select.value] || 'local';
  versions.value = pref.version || 'new';
  versions.hidden = destination.value !== 'drive';
  setup.hidden = !select.value || !window.TimProjectSnapshot;
}
function remember() {
  pref = {
    ...pref,
    project: select.value,
    version: versions.value,
    destinations: { ...pref.destinations, [select.value]: destination.value },
  };
  try {
    localStorage.setItem('tim-drive-export-v1', JSON.stringify(pref));
  } catch {}
  versions.hidden = destination.value !== 'drive';
  setup.hidden = !select.value || !window.TimProjectSnapshot;
}
select.onchange = () => {
  destination.value = pref.destinations?.[select.value] || 'local';
  remember();
};
destination.onchange = () => {
  if (destination.value === 'drive' && !select.value) {
    destination.value = 'local';
    info.textContent = 'Choose a video project before exporting to Drive.';
  }
  remember();
};
versions.onchange = remember;
function localDownload(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
let queued = Promise.resolve();
function enqueue(blob, name, projectId, replace) {
  const row = document.createElement('div');
  row.className = 'tim-drive-job';
  const status = document.createElement('p');
  status.textContent = 'Waiting to upload ' + name;
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Retry upload';
  retry.hidden = true;
  const download = document.createElement('button');
  download.type = 'button';
  download.textContent = 'Download instead';
  const reconnect = document.createElement('button');
  reconnect.type = 'button';
  reconnect.textContent = 'Reconnect and retry';
  reconnect.hidden = true;
  row.append(status, retry, reconnect, download);
  jobs.append(row);
  download.onclick = () => localDownload(blob, name);
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    retry.hidden = true;
    reconnect.hidden = true;
    try {
      const asset = await drive.uploadAsset(projectId, blob, name, {
        replace,
        tool,
        onProgress: (p) =>
          (status.textContent = 'Uploading ' + name + ' · ' + p + '%'),
      });
      status.textContent = 'Saved ' + asset.name + ' to Google Drive.';
      if (asset.url) {
        const a = document.createElement('a');
        a.href = asset.url;
        a.textContent = 'Open asset';
        a.target = '_blank';
        a.rel = 'noopener';
        row.append(a);
      }
      download.remove();
      blob = null;
    } catch (e) {
      status.textContent =
        e.message +
        ' The generated asset is kept here until you leave this page.';
      retry.hidden = false;
      reconnect.hidden = false;
    } finally {
      running = false;
    }
  };
  retry.onclick = () => {
    queued = queued.catch(() => {}).then(run);
  };
  reconnect.onclick = async () => {
    try {
      await drive.connect();
      retry.onclick();
    } catch (e) {
      status.textContent = e.message;
    }
  };
  queued = queued.catch(() => {}).then(run);
}
window.TimDriveExport = {
  route(blob, name) {
    if (destination.value !== 'drive' || !select.value) return false;
    enqueue(blob, name, select.value, versions.value === 'replace');
    return true;
  },
};
setup.onclick = () => {
  const doc = window.TimProjectSnapshot?.();
  if (!doc) return;
  enqueue(
    new Blob([JSON.stringify(doc)], { type: 'application/json' }),
    (doc.tool || tool) +
      '-' +
      String(doc.name || 'setup').replace(/[^a-z0-9_-]/gi, '_') +
      '.project.json',
    select.value,
    versions.value === 'replace',
  );
};
window.addEventListener('tim-projects-merged', refresh);
window.addEventListener('tim-projects-changed', refresh);
window.addEventListener('tim-project-snapshot-ready', refresh);
window.addEventListener('storage', (e) => {
  if (e.key === 'tim-content-planner-v1') refresh();
});
refresh();
