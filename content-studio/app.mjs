// Content Studio page: capture, Next up, videos by stage and the video dialog.
// Everything shown comes from the cloud-synced stores (see store.mjs). Nothing
// renders until the first cloud sync has finished for the signed-in account.

import {
  STAGES,
  PLATFORMS,
  SHOT_KINDS,
  SHOT_STATUSES,
  filterVideos,
  groupByStage,
  shotProgress,
  isOverdue,
  nextStage,
} from './video-model.mjs?v=b4fc61b1';
import {
  loadVideos,
  snapshotOf,
  captureIdea,
  setStage,
  setPublishDate,
  setFilmDate,
  setDetails,
  setArchived,
  generateShots,
  addShot,
  updateShot,
  removeShot,
  attachSnapshot,
  detachSnapshot,
  ensureVideoProject,
  exportBackup,
  importBackup,
  dueDatesCsv,
} from './store.mjs?v=58c69001';
import { TOOLS, getTool } from '../shared/tool-registry.mjs?v=8038af06';
import { localDay } from '../idea-vault/vault-core.mjs?v=079d4676';
import { IDEA_KEY, PLANNER_KEY } from '../shared/pipeline-link.mjs?v=4d6d1145';

const $ = (id) => document.getElementById(id);

// Tools that are part of this page or not useful for a single video.
const NOT_FOR_VIDEOS = new Set([
  'content-planner',
  'shoot-planner',
  'idea-vault',
  'downloads',
  'content-studio',
]);

let ready = false;
let lastSnapshot = null;
let videos = [];
let conflictCount = 0;
let savedRows = [];
let openId = null;
let activeTab = 'outline';
let pendingOpen = null;
let filming = null;

// ---- small DOM helpers ------------------------------------------------------

function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'className') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children))
    if (child !== null && child !== undefined && child !== false)
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  return node;
}

function setStatus(message) {
  $('status').textContent = message || '';
}

function fillSelect(select, values, current, labelOf = (v) => v) {
  select.replaceChildren(
    ...values.map((v) => el('option', { value: v, selected: v === current }, labelOf(v))),
  );
}

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = el('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- data -------------------------------------------------------------------

function currentVideo() {
  return videos.find((v) => v.id === openId) || null;
}

// Runs one change. A function may return a message to show on success.
function act(fn) {
  try {
    const message = fn();
    setStatus(typeof message === 'string' ? message : '');
  } catch (error) {
    setStatus(error.message);
  }
  lastSnapshot = null;
  refresh();
  // The page's own change always shows, even while focus is in the dialog.
  if (openId && currentVideo()) renderDetail();
}

function refresh() {
  if (!ready) return;
  const snapshot = snapshotOf();
  if (snapshot === lastSnapshot) return;
  lastSnapshot = snapshot;
  try {
    const result = loadVideos();
    videos = result.videos;
    conflictCount = result.report.conflictCopies.length;
  } catch (error) {
    setStatus(error.message);
    return;
  }
  renderConflicts();
  renderBoard();
  if (openId && !currentVideo()) closeDetail();
  if (openId && !dialogHasFocus()) renderDetail();
  if (pendingOpen && videos.some((v) => v.id === pendingOpen)) {
    const id = pendingOpen;
    pendingOpen = null;
    openDetail(id);
  }
}

function dialogHasFocus() {
  const dialog = $('detail');
  return dialog.open && dialog.contains(document.activeElement) && document.activeElement !== dialog;
}

// ---- board ------------------------------------------------------------------

function renderConflicts() {
  const note = $('conflicts');
  note.hidden = conflictCount === 0;
  note.textContent =
    conflictCount === 1
      ? '1 conflict copy from another device is hidden. It is kept in your data but not shown.'
      : conflictCount + ' conflict copies from another device are hidden. They are kept in your data but not shown.';
}

function renderPlatformFilter() {
  const select = $('platform-filter');
  if (select.options.length > 1) return;
  for (const platform of PLATFORMS)
    select.append(el('option', { value: platform }, platform));
}

// Dates are stored as YYYY-MM-DD. Show them as "Fri, Nov 14".
function shortDate(day) {
  const d = new Date(day + 'T12:00:00Z');
  return Number.isNaN(d.getTime())
    ? day
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const shotsLeft = (v) => v.shots.filter((s) => s.status === 'pending' || s.status === 'retake').length;
const publishDay = (v) => v.dueDate || v.publishDate || '';
const beforeEdit = (v) => STAGES.indexOf(v.stage) <= STAGES.indexOf('Film');

// What to do next for one video, or null when nothing is scheduled or waiting.
// Filming comes first until the video reaches Edit; after that, publishing.
function nextFor(v, today) {
  if (v.archived || v.stage === 'Published') return null;
  const left = shotsLeft(v);
  const publish = publishDay(v);
  if (beforeEdit(v) && (v.filmDate || (v.stage === 'Film' && left))) {
    const parts = [v.filmDate ? 'Film ' + shortDate(v.filmDate) : 'Ready to film'];
    if (left) parts.push(left + (left === 1 ? ' shot' : ' shots') + ' to go');
    if (publish) parts.push('publish ' + shortDate(publish));
    return { video: v, day: v.filmDate || publish || '9999', tab: 'shoot', text: parts.join(' · '), late: false };
  }
  if (publish)
    return {
      video: v,
      day: publish,
      tab: 'outline',
      text: (isOverdue(v, today) ? 'Overdue · publish ' : 'Publish ') + shortDate(publish),
      late: isOverdue(v, today),
    };
  return null;
}

function renderNextUp() {
  const today = localDay();
  const rows = videos
    .map((v) => nextFor(v, today))
    .filter(Boolean)
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, 5);
  $('next-up-list').replaceChildren(
    ...rows.map((row) =>
      el('li', {}, [
        el(
          'button',
          { type: 'button', className: 'next', onclick: () => openDetail(row.video.id, row.tab) },
          [
            el('strong', {}, row.video.title),
            el('span', { className: row.late ? 'overdue' : 'meta' }, row.text),
          ],
        ),
      ]),
    ),
  );
  if (!rows.length)
    $('next-up-list').append(
      el('li', { className: 'empty' }, 'Give a video a film or publish date and it shows up here.'),
    );
}

function renderBoard() {
  renderNextUp();
  const list = filterVideos(videos, {
    query: $('query').value,
    platform: $('platform-filter').value,
    includeArchived: $('show-archived').checked,
  });
  const groups = groupByStage(list);
  const today = localDay();
  $('board').replaceChildren(
    ...STAGES.map((stage) => {
      const items = groups[stage];
      return el('section', { className: 'column' + (items.length ? '' : ' empty-stage'), 'aria-label': stage }, [
        el('h3', {}, stage + ' · ' + items.length),
        el(
          'ul',
          { className: 'cards' },
          items.length
            ? items.map((v) => el('li', {}, cardFor(v, today)))
            : [el('li', { className: 'empty' }, 'Nothing here')],
        ),
      ]);
    }),
  );
  // On a phone only stages with videos are listed, so say when there are none.
  const filtered = $('query').value || $('platform-filter').value;
  $('board').append(
    el(
      'p',
      { className: 'none-yet' + (list.length ? ' has-videos' : '') },
      filtered ? 'No videos match this search.' : 'No videos yet. Capture an idea above to start one.',
    ),
  );
}

function cardFor(v, today) {
  const shots = shotProgress(v);
  const publish = publishDay(v);
  const date =
    v.filmDate && beforeEdit(v)
      ? 'Film ' + shortDate(v.filmDate)
      : publish
        ? 'Publish ' + shortDate(publish)
        : '';
  return el(
    'button',
    {
      type: 'button',
      className: 'card' + (v.archived ? ' archived' : ''),
      onclick: () => openDetail(v.id),
    },
    [
      el('strong', {}, v.title),
      el('span', { className: 'meta' }, [v.platform, date ? ' · ' + date : '']),
      shots.total ? el('span', { className: 'progress' }, shots.done + '/' + shots.total + ' shots captured') : null,
      isOverdue(v, today) ? el('span', { className: 'overdue' }, 'Overdue') : null,
      v.archived ? el('span', { className: 'badge' }, 'Archived') : null,
    ],
  );
}

// ---- detail dialog -----------------------------------------------------------

function setUrlFor(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('videoProject', id);
  else url.searchParams.delete('videoProject');
  history.replaceState(null, '', url.href);
}

function openDetail(id, tab) {
  openId = id;
  if (tab) activeTab = tab;
  setUrlFor(id);
  renderDetail();
  const dialog = $('detail');
  if (!dialog.open) dialog.showModal();
}

function closeDetail() {
  openId = null;
  setUrlFor(null);
  const dialog = $('detail');
  if (dialog.open) dialog.close();
}

function setTab(name) {
  activeTab = name;
  for (const tab of document.querySelectorAll('[role="tab"]')) {
    const selected = tab.dataset.tab === name;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
  }
  for (const panel of document.querySelectorAll('[role="tabpanel"]'))
    panel.hidden = panel.id !== 'panel-' + name;
}

function renderDetail() {
  const v = currentVideo();
  if (!v) return;
  setTab(activeTab);
  $('detail-title').textContent = v.title;
  $('d-title').value = v.title;
  fillSelect($('d-stage'), STAGES, v.stage);
  fillSelect($('d-platform'), PLATFORMS, v.platform);
  $('d-category').value = v.category;
  $('d-film').value = v.filmDate || '';
  $('d-publish').value = v.dueDate || v.publishDate || '';
  $('d-notes').value = v.notes;
  $('d-outline').value = v.outline;
  $('d-outline-url').value = v.outlineUrl;
  $('d-published-url').value = v.publishedUrl;
  $('d-archive').textContent = v.archived ? 'Restore' : 'Archive';
  $('d-archive').disabled = !v.hasIdea;
  const next = nextStage(v.stage);
  $('d-advance').hidden = !next;
  $('d-advance').textContent = next ? 'Move to ' + next : '';
  renderShots(v);
  renderTools(v);
  renderFilming();
  refreshSaved();
}

function renderShots(v) {
  const progress = shotProgress(v);
  $('d-shot-progress').textContent = progress.done + ' of ' + progress.total + ' captured';
  fillSelect($('d-shot-kind'), SHOT_KINDS, SHOT_KINDS[0]);
  $('d-shots').replaceChildren(
    ...v.shots.map((shot) =>
      el('li', { className: 'shot' }, [
        el('span', { className: 'kind' }, shot.kind),
        el('span', { className: 'text' }, shot.text),
        el(
          'select',
          {
            'aria-label': 'Status of ' + shot.text,
            onchange: (event) => act(() => updateShot(v.id, shot.id, { status: event.target.value })),
          },
          SHOT_STATUSES.map((s) => el('option', { value: s, selected: s === shot.status }, s)),
        ),
        el('button', { type: 'button', onclick: () => act(() => removeShot(v.id, shot.id)) }, 'Remove'),
        el('input', {
          'aria-label': 'Notes for ' + shot.text,
          placeholder: 'Take notes',
          value: shot.notes,
          maxlength: 2000,
          onchange: (event) => act(() => updateShot(v.id, shot.id, { notes: event.target.value })),
        }),
      ]),
    ),
  );
  if (!v.shots.length)
    $('d-shots').append(el('li', { className: 'empty' }, 'No shots yet. Add shots from the outline, or type one below.'));
}

function renderTools(v) {
  $('d-tools').replaceChildren(
    ...TOOLS.filter((t) => !NOT_FOR_VIDEOS.has(t.id)).map((tool) =>
      el('li', {}, [
        el(
          'a',
          {
            href: '../' + tool.href + '?videoProject=' + encodeURIComponent(v.id),
            onclick: () => {
              try {
                ensureVideoProject(v.id);
              } catch {}
            },
          },
          tool.name,
        ),
      ]),
    ),
  );
}

function renderAttachments(v) {
  const saved = new Map(savedRows.map((r) => [r.id, r]));
  $('d-attachments').replaceChildren(
    ...v.attachments.map((a) => {
      const tool = getTool(a.tool);
      const available = tool && saved.has(a.id);
      return el('li', { className: 'attachment' }, [
        available
          ? el(
              'a',
              {
                href:
                  '../' + tool.href + '?videoProject=' + encodeURIComponent(v.id) + '&snapshot=' + encodeURIComponent(a.id),
              },
              (a.name || 'Saved work') + ' · ' + tool.name,
            )
          : el('span', {}, (a.name || 'Saved work') + (tool ? ' · ' + tool.name : '') + ' (not in this browser)'),
        el('button', { type: 'button', onclick: () => act(() => detachSnapshot(v.id, a.id)) }, 'Remove'),
      ]);
    }),
  );
  if (!v.attachments.length) $('d-attachments').append(el('li', { className: 'empty' }, 'Nothing attached yet.'));
}

function renderSavedOptions(v) {
  const attached = new Set(v.attachments.map((a) => a.id));
  const options = savedRows.filter((r) => !attached.has(r.id) && getTool(r.tool));
  $('d-saved').replaceChildren(
    el('option', { value: '' }, options.length ? 'Choose saved work' : 'No saved work to attach'),
    ...options.map((r) => el('option', { value: r.id }, r.name + ' · ' + getTool(r.tool).name)),
  );
  $('d-attach-form').querySelector('button').disabled = !options.length;
}

// Saved tool work lives in this browser's IndexedDB, not the cloud.
function loadSavedRows() {
  return new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve([]);
    const request = indexedDB.open('tim-tool-projects', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('projects', { keyPath: 'id' });
    request.onerror = () => resolve([]);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('projects', 'readonly');
      const query = tx.objectStore('projects').getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(query.result || []);
      };
      tx.onerror = () => resolve([]);
    };
  });
}

async function refreshSaved() {
  const id = openId;
  savedRows = await loadSavedRows();
  const v = currentVideo();
  if (!v || openId !== id) return;
  renderAttachments(v);
  renderSavedOptions(v);
}

function renderFilming() {
  const box = $('d-filming');
  if (!filming) {
    box.hidden = true;
    return;
  }
  const v = currentVideo();
  const shot = v && filming.ids[filming.index] && v.shots.find((s) => s.id === filming.ids[filming.index]);
  if (!v || !shot) {
    filming = null;
    box.hidden = true;
    setStatus('All pending shots are done.');
    return;
  }
  box.hidden = false;
  $('d-film-count').textContent = 'Shot ' + (filming.index + 1) + ' of ' + filming.ids.length;
  $('d-film-now').textContent = shot.kind + ': ' + shot.text;
  $('d-film-notes').value = shot.notes;
}

// ---- actions ----------------------------------------------------------------

function wire() {
  $('query').addEventListener('input', () => renderBoard());
  $('platform-filter').addEventListener('change', () => renderBoard());
  $('show-archived').addEventListener('change', () => renderBoard());

  $('capture').addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    act(() => {
      captureIdea({
        title: data.get('title'),
        notes: data.get('notes'),
        platform: data.get('platform'),
      });
      form.reset();
      form.querySelector('input[name="title"]').focus();
      return 'Idea added.';
    });
  });

  $('export-backup').addEventListener('click', () => {
    try {
      download('content-studio-backup-' + localDay() + '.json', exportBackup(), 'application/json');
      setStatus('Backup downloaded.');
    } catch (error) {
      setStatus(error.message);
    }
  });
  $('import-backup').addEventListener('change', async (event) => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    try {
      const counts = importBackup(await file.text());
      setStatus('Imported ' + counts.ideas + ' ideas and ' + counts.projects + ' projects. Existing videos were merged.');
      lastSnapshot = null;
      refresh();
    } catch (error) {
      setStatus('Import failed: ' + error.message);
    }
  });
  $('export-due').addEventListener('click', () => {
    try {
      download('due-dates.csv', dueDatesCsv(), 'text/csv');
    } catch (error) {
      setStatus(error.message);
    }
  });

  for (const tab of document.querySelectorAll('[role="tab"]'))
    tab.addEventListener('click', () => setTab(tab.dataset.tab));

  $('detail-close').addEventListener('click', () => closeDetail());
  $('detail').addEventListener('close', () => {
    openId = null;
    setUrlFor(null);
    filming = null;
  });

  const field = (id, handler) =>
    $(id).addEventListener('change', (event) => {
      const v = currentVideo();
      if (v) act(() => handler(v.id, event.target.value));
    });
  field('d-title', (id, value) => setDetails(id, { title: value }));
  field('d-stage', (id, value) => setStage(id, value));
  field('d-platform', (id, value) => setDetails(id, { platform: value }));
  field('d-category', (id, value) => setDetails(id, { category: value }));
  field('d-film', (id, value) => setFilmDate(id, value));
  field('d-publish', (id, value) => setPublishDate(id, value));
  field('d-notes', (id, value) => setDetails(id, { notes: value }));
  field('d-outline', (id, value) => setDetails(id, { outline: value }));
  field('d-outline-url', (id, value) => setDetails(id, { outlineUrl: value }));
  field('d-published-url', (id, value) => setDetails(id, { publishedUrl: value }));

  $('d-archive').addEventListener('click', () => {
    const v = currentVideo();
    if (v) act(() => setArchived(v.id, !v.archived));
  });

  $('d-advance').addEventListener('click', () => {
    const v = currentVideo();
    const next = v && nextStage(v.stage);
    if (next) act(() => (setStage(v.id, next), 'Moved to ' + next + '.'));
  });

  $('d-generate').addEventListener('click', () => {
    const v = currentVideo();
    if (!v) return;
    act(() => {
      const added = generateShots(v.id);
      return added ? 'Added ' + added + ' shots from the outline.' : 'No new lines in the outline to add.';
    });
  });

  $('d-shot-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const v = currentVideo();
    const text = $('d-shot-text').value.trim();
    if (!v) return;
    act(() => {
      addShot(v.id, { kind: $('d-shot-kind').value, text });
      $('d-shot-text').value = '';
    });
  });

  $('d-film-start').addEventListener('click', () => {
    const v = currentVideo();
    if (!v) return;
    // Shots marked Retake come round again with the ones not yet filmed.
    const pending = v.shots.filter((s) => s.status === 'pending' || s.status === 'retake').map((s) => s.id);
    if (!pending.length) {
      setStatus('No shots left to film.');
      return;
    }
    filming = { ids: pending, index: 0 };
    setStatus('');
    renderFilming();
  });
  for (const button of document.querySelectorAll('[data-result]'))
    button.addEventListener('click', () => {
      const v = currentVideo();
      if (!v || !filming) return;
      const shotId = filming.ids[filming.index];
      const status = button.dataset.result;
      act(() => {
        updateShot(v.id, shotId, { status, notes: $('d-film-notes').value });
      });
      if (filming) {
        filming.index++;
        renderFilming();
      }
    });
  $('d-film-exit').addEventListener('click', () => {
    filming = null;
    renderFilming();
  });

  $('d-attach-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const v = currentVideo();
    const row = savedRows.find((r) => r.id === $('d-saved').value);
    if (!v) return;
    if (!row) {
      setStatus('Choose saved work first.');
      return;
    }
    act(() => attachSnapshot(v.id, { id: row.id, tool: row.tool, name: row.name }));
  });
}

// ---- cloud gating -------------------------------------------------------------

// Signed out, the sync panel sits at the top: it is the only thing to do. Once
// synced it moves to the end of the page and folds away.
function placeSyncPanel(signedIn) {
  const panel = $('studio-sync');
  if (signedIn) {
    $('app').append(panel);
    panel.open = false;
  } else {
    $('waiting').before(panel);
    panel.open = true;
  }
}

window.addEventListener('tim-cloud-synced', () => {
  if (!ready) {
    ready = true;
    $('waiting').hidden = true;
    $('app').hidden = false;
    placeSyncPanel(true);
  }
  lastSnapshot = null;
  refresh();
});

window.addEventListener('tim-cloud-signed-out', () => {
  ready = false;
  lastSnapshot = null;
  videos = [];
  savedRows = [];
  closeDetail();
  filming = null;
  $('board').replaceChildren();
  $('conflicts').hidden = true;
  $('app').hidden = true;
  $('waiting').hidden = false;
  placeSyncPanel(false);
  setStatus('');
});

window.addEventListener('storage', (event) => {
  if (event.key === null || event.key === IDEA_KEY || event.key === PLANNER_KEY) refresh();
});

wire();
renderPlatformFilter();
{
  const params = new URLSearchParams(location.search);
  const requested =
    params.get('videoProject') || params.get('project') || params.get('idea') || (location.hash || '').slice(1);
  // Project ids (idea:<id>) and idea ids both open the same video.
  pendingOpen = requested ? requested.replace(/^idea:/, '') : null;
}
