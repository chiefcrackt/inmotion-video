import { saveProjects, readProjects } from '../shared/project-store.mjs';
import {
  STAGES,
  KINDS,
  KEY,
  newProject,
  addOutline,
  safeUrl,
  validateBackup,
} from './model.mjs';
import { TOOLS, getTool } from '../shared/tool-registry.mjs';
import {
  IDEA_KEY,
  STAGE_FOR_STATUS,
  reconcileLinked,
} from '../shared/pipeline-link.mjs';
const $ = (id) => document.getElementById(id),
  say = (t) => {
    $('status').textContent = t;
  };
const node = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
};
const button = (text, fn) => {
  const b = node('button', text);
  b.type = 'button';
  b.onclick = fn;
  return b;
};
let projects = [],
  current,
  tab = 'details',
  filmIds = [],
  filmIndex = 0,
  loadFailed = false,
  lastSaved = null,
  saving = false;
try {
  const data = localStorage.getItem(KEY);
  lastSaved = data;
  if (data) projects = validateBackup(JSON.parse(data));
} catch (e) {
  loadFailed = true;
  say(
    'Saved plans could not be read. Import a valid backup before making changes. ' +
      e.message,
  );
}
// Idea Vault ideas stored on this device. Null when missing or unreadable, so nothing is written over them.
function readIdeas() {
  try {
    const d = JSON.parse(localStorage.getItem(IDEA_KEY) || 'null');
    return d?.version === 1 && Array.isArray(d.ideas) ? d.ideas : null;
  } catch {
    return null;
  }
}
function writeIdeas(ideas) {
  // Mark pending before writing: the open vault receives the ideas storage event.
  const syncKey = 'tim-idea-vault-sync-v1';
  let sync = {};
  try {
    sync = JSON.parse(localStorage.getItem(syncKey) || '{}') || {};
  } catch {}
  localStorage.setItem(syncKey, JSON.stringify({ ...sync, pending: true }));
  localStorage.setItem(IDEA_KEY, JSON.stringify({ version: 1, ideas }));
}
function save() {
  if (loadFailed) {
    say(
      'Saved plans could not be read. Import a valid backup before making changes.',
    );
    return false;
  }
  try {
    if (localStorage.getItem(KEY) !== lastSaved) {
      say(
        'Another tab changed these plans. Export your work, then reload before saving.',
      );
      return false;
    }
    saving = true;
    try {
      // Keep promoted ideas in step with their projects before writing either side.
      const ideas = readIdeas();
      if (ideas && reconcileLinked(projects, ideas)) writeIdeas(ideas);
      lastSaved = saveProjects(projects, lastSaved);
    } finally {
      saving = false;
    }
    say('Saved in this browser.');
    return true;
  } catch {
    say('Could not save. Export a backup now to keep your changes.');
    return false;
  }
}
function touch() {
  current.updated = Date.now();
  save();
  renderBoard();
}
function renderNextUp() {
  const list = $('next-up-list');
  list.replaceChildren();
  const active = projects.filter((p) => !p.deleted && p.stage !== 'Published');
  const scheduled = active
    .filter((p) => p.publishDate)
    .sort((a, b) => a.publishDate.localeCompare(b.publishDate))
    .slice(0, 5);
  function add(project, view, detail) {
    const row = node('li');
    row.append(
      button(project.title, () => {
        tab = view;
        open(project.id);
      }),
      node('span', detail),
    );
    list.append(row);
  }
  for (const p of scheduled) add(p, 'details', 'Publish ' + p.publishDate);
  for (const p of active) {
    const next = p.items.find(
      (item) => item.status === 'pending' || item.status === 'retake',
    );
    if (p.stage === 'Film' || next)
      add(
        p,
        'shoot',
        [
          p.stage === 'Film' ? 'Ready to film' : 'Shoot checklist',
          p.filmDate,
          next &&
            (next.status === 'retake' ? 'Retake · ' : 'Next · ') +
              next.kind +
              ': ' +
              next.text,
        ]
          .filter(Boolean)
          .join(' · '),
      );
  }
  if (!list.children.length)
    list.append(
      node('li', 'Publish dates and upcoming shoot work will appear here.'),
    );
}
function renderBoard() {
  renderNextUp();
  $('board').replaceChildren();
  for (const stage of STAGES) {
    const col = node('div', undefined, 'column'),
      list = projects.filter(
        (p) =>
          !p.deleted &&
          p.stage === stage &&
          p.title.toLowerCase().includes($('search').value.toLowerCase()),
      );
    col.append(node('h2', stage + ' · ' + list.length));
    col.ondragover = (e) => e.preventDefault();
    col.ondrop = (e) => {
      e.preventDefault();
      const p = projects.find(
        (p) => p.id === e.dataTransfer.getData('text/plain'),
      );
      if (p) {
        p.stage = stage;
        p.updated = Date.now();
        save();
        renderBoard();
        if (current?.id === p.id) $('stage').value = stage;
      }
    };
    for (const p of list) {
      const b = button(p.title + (p.conflictOf ? ' (conflict copy)' : ''), () =>
        open(p.id),
      );
      b.className = 'card';
      b.draggable = true;
      b.ondragstart = (e) => e.dataTransfer.setData('text/plain', p.id);
      b.append(
        node(
          'small',
          p.publishDate ? 'Publish ' + p.publishDate : 'No publish date',
        ),
      );
      b.setAttribute('aria-pressed', String(current?.id === p.id));
      col.append(b);
    }
    if (!list.length) col.append(node('p', 'No videos here yet.'));
    $('board').append(col);
  }
}
const fields = [
  'title',
  'stage',
  'outline',
  'outlineUrl',
  'publishedUrl',
  'filmDate',
  'publishDate',
];
function open(id) {
  current = projects.find((p) => p.id === id && !p.deleted);
  if (!current) return;
  $('project').hidden = false;
  for (const key of fields) $(key).value = current[key];
  $('project-heading').textContent = current.title;
  history.replaceState(null, '', '#' + encodeURIComponent(current.id));
  renderBoard();
  showTab(tab);
  $('project').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
for (const s of STAGES) $('stage').add(new Option(s, s));
for (const key of fields)
  $(key).addEventListener('input', () => {
    if (!current) return;
    current[key] = $(key).value;
    touch();
    if (key === 'title') $('project-heading').textContent = current.title;
    if (key.endsWith('Url')) renderLinks();
  });
$('new').onclick = () => {
  if (loadFailed) return say('Import a valid backup first.');
  const p = newProject();
  projects.push(p);
  save();
  tab = 'details';
  open(p.id);
  $('title').focus();
  $('title').select();
};
$('close').onclick = () => {
  current = null;
  $('project').hidden = true;
  history.replaceState(null, '', location.pathname);
  renderBoard();
};
$('delete').onclick = () => {
  if (
    !confirm(
      'Delete this video and its checklist? Saved tool snapshots will remain.',
    )
  )
    return;
  current.deleted = true;
  save();
  $('close').click();
};
$('search').oninput = renderBoard;
function showTab(next) {
  tab = next;
  document
    .querySelectorAll('[data-tab]')
    .forEach((b) =>
      b.setAttribute('aria-pressed', String(b.dataset.tab === tab)),
    );
  for (const id of ['details', 'shoot', 'assets']) $(id).hidden = id !== tab;
  if (tab === 'shoot') renderItems();
  if (tab === 'assets') {
    renderLinks();
    renderAssets().catch((e) => say(e.message));
  }
}
document
  .querySelectorAll('[data-tab]')
  .forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
$('share-brief').onclick = async () => {
  if (!current) return;
  const lines = [
    current.title + ' — Shoot brief',
    current.filmDate && 'Film date: ' + current.filmDate,
    current.publishDate && 'Publish date: ' + current.publishDate,
    current.outlineUrl && 'Outline: ' + current.outlineUrl,
  ].filter(Boolean);
  for (const [index, item] of current.items.entries()) {
    lines.push(
      '',
      index + 1 + '. [' + item.status + '] ' + item.kind + ': ' + item.text,
    );
    if (item.notes) lines.push('   Notes: ' + item.notes);
  }
  if (!current.items.length) lines.push('', 'No checklist items yet.');
  const file = new File([lines.join('\n') + '\n'], 'shoot-brief.txt', {
    type: 'text/plain',
  });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: current.title + ' — Shoot brief',
      });
      return;
    }
  } catch (error) {
    if (error.name === 'AbortError') return;
  }
  const href = URL.createObjectURL(file);
  const link = node('a');
  link.href = href;
  link.download = file.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(href), 30000);
  say('Shoot brief downloaded.');
};
$('generate').onclick = () => {
  const count = addOutline(current);
  touch();
  renderItems();
  say(count + ' checklist items added. Existing items were kept.');
};
$('add-item').onsubmit = (e) => {
  e.preventDefault();
  const text = $('item-text').value.trim();
  if (!text) return;
  current.items.push({
    id: crypto.randomUUID(),
    kind: $('item-kind').value,
    text,
    status: 'pending',
    notes: '',
  });
  $('item-text').value = '';
  touch();
  renderItems();
};
const visibleItems = () =>
  current.items.filter(
    (i) =>
      $('filter').value === 'all' ||
      ($('filter').value === 'remaining'
        ? i.status !== 'captured'
        : i.kind === $('filter').value),
  );
function renderItems() {
  $('items').replaceChildren();
  $('progress').textContent =
    current.items.filter((i) => i.status === 'captured').length +
    ' / ' +
    current.items.length +
    ' captured or prepared';
  const list = visibleItems();
  if (!list.length)
    $('items').append(
      node(
        'p',
        'No items in this view. Add from your outline or create an item above.',
        'muted',
      ),
    );
  for (const item of list) {
    const row = node('div', undefined, 'item'),
      kind = node('select');
    kind.setAttribute('aria-label', 'Item type');
    KINDS.forEach((k) => kind.add(new Option(k, k)));
    kind.value = item.kind;
    kind.onchange = () => {
      item.kind = kind.value;
      touch();
      renderItems();
    };
    const text = node('input');
    text.value = item.text;
    text.setAttribute('aria-label', 'Checklist text');
    text.oninput = () => {
      item.text = text.value;
      touch();
    };
    const notes = node('textarea');
    notes.value = item.notes;
    notes.placeholder = 'Take / editing notes';
    notes.setAttribute('aria-label', 'Take / editing notes');
    notes.oninput = () => {
      item.notes = notes.value;
      touch();
    };
    const state = node('select');
    state.setAttribute('aria-label', 'Capture status');
    for (const s of ['pending', 'captured', 'retake', 'skipped'])
      state.add(new Option(s, s));
    state.value = item.status;
    state.onchange = () => {
      item.status = state.value;
      touch();
      renderItems();
    };
    const actions = node('div', undefined, 'toolbar');
    actions.append(state);
    for (const [label, delta] of [
      ['Move up', -1],
      ['Move down', 1],
    ]) {
      const index = current.items.indexOf(item),
        b = button(label, () => {
          const target = index + delta;
          [current.items[index], current.items[target]] = [
            current.items[target],
            current.items[index],
          ];
          touch();
          renderItems();
        });
      b.disabled = index + delta < 0 || index + delta >= current.items.length;
      actions.append(b);
    }
    actions.append(
      button('Remove', () => {
        if (!confirm('Remove this checklist item?')) return;
        current.items = current.items.filter((i) => i.id !== item.id);
        touch();
        renderItems();
      }),
    );
    row.append(kind, text, notes, actions);
    $('items').append(row);
  }
}
$('filter').onchange = renderItems;
function filmItem() {
  return current.items.find((i) => i.id === filmIds[filmIndex]);
}
function renderFilm() {
  const i = filmItem();
  $('film-count').textContent = filmIndex + 1 + ' of ' + filmIds.length;
  $('film-kind').textContent = i.kind;
  $('film-text').textContent = i.text;
  $('film-notes').value = i.notes;
  $('film-result').textContent = 'Status: ' + i.status;
  $('previous').disabled = filmIndex === 0;
  $('next').disabled = filmIndex === filmIds.length - 1;
}
$('film').onclick = () => {
  filmIds = visibleItems().map((i) => i.id);
  if (!filmIds.length)
    return say('Add a checklist item before entering filming mode.');
  filmIndex = 0;
  renderFilm();
  $('filming').showModal();
};
$('film-notes').oninput = () => {
  filmItem().notes = $('film-notes').value;
  touch();
};
$('previous').onclick = () => {
  if (filmIndex > 0) filmIndex--;
  renderFilm();
};
$('next').onclick = () => {
  if (filmIndex < filmIds.length - 1) filmIndex++;
  renderFilm();
};
document.querySelectorAll('[data-result]').forEach(
  (b) =>
    (b.onclick = () => {
      filmItem().status = b.dataset.result;
      touch();
      if (filmIndex < filmIds.length - 1) filmIndex++;
      renderFilm();
    }),
);
$('exit-film').onclick = () => $('filming').close();
$('filming').onclose = renderItems;
function link(text, url) {
  const a = node('a', text);
  a.href = url;
  return a;
}
function renderLinks() {
  $('asset-links').replaceChildren();
  for (const [key, label] of [
    ['outlineUrl', 'Open outline'],
    ['publishedUrl', 'Open published video'],
  ]) {
    const url = safeUrl(current[key]);
    if (url) {
      const a = link(label, url);
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      $('asset-links').append(a);
    }
  }
}
async function snapshots() {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open('tim-tool-projects', 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore('projects', { keyPath: 'id' });
    r.onerror = () => reject(Error('Saved tool work is unavailable.'));
    r.onsuccess = () => {
      const db = r.result,
        tx = db.transaction('projects', 'readonly'),
        q = tx.objectStore('projects').getAll();
      tx.oncomplete = () => {
        db.close();
        resolve(q.result);
      };
      tx.onerror = () => {
        db.close();
        reject(Error('Could not read saved tool work.'));
      };
    };
  });
}
async function renderAssets() {
  const id = current.id;
  $('tools').replaceChildren();
  for (const tool of TOOLS.filter(
    (t) =>
      !['content-planner', 'shoot-planner', 'downloads', 'idea-vault'].includes(
        t.id,
      ),
  ))
    $('tools').append(
      link(
        tool.name,
        '../' + tool.href + '?videoProject=' + encodeURIComponent(id),
      ),
    );
  const rows = await snapshots();
  if (current?.id !== id) return;
  $('snapshots').replaceChildren(new Option('Choose saved work', ''));
  for (const r of rows.filter((r) => getTool(r.tool)))
    $('snapshots').add(new Option(r.name + ' · ' + getTool(r.tool).name, r.id));
  $('attachments').replaceChildren();
  for (const a of current.attachments) {
    const row = node('div', undefined, 'attachment'),
      tool = getTool(a.tool),
      exists = rows.some((r) => r.id === a.id);
    if (tool && exists)
      row.append(
        link(
          a.name + ' · ' + tool.name,
          '../' +
            tool.href +
            '?videoProject=' +
            encodeURIComponent(id) +
            '&snapshot=' +
            encodeURIComponent(a.id),
        ),
      );
    else
      row.append(
        node('span', a.name + ' (snapshot unavailable in this browser)'),
      );
    row.append(
      button('Detach', () => {
        current.attachments = current.attachments.filter((v) => v.id !== a.id);
        touch();
        renderAssets().catch((e) => say(e.message));
      }),
    );
    $('attachments').append(row);
  }
  $('attach').onclick = () => {
    const r = rows.find((r) => r.id === $('snapshots').value);
    if (!r) return say('Choose saved work first.');
    if (!current.attachments.some((a) => a.id === r.id))
      current.attachments.push({ id: r.id, name: r.name, tool: r.tool });
    touch();
    renderAssets().catch((e) => say(e.message));
  };
}
$('export').onclick = () => {
  const data = loadFailed
    ? localStorage.getItem(KEY)
    : JSON.stringify({ version: 1, projects }, null, 2);
  const url = URL.createObjectURL(
      new Blob([data], { type: 'application/json' }),
    ),
    a = link('', url);
  a.download = 'tim-content-planner.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  say(
    'Backup exported. Tool snapshots and footage must be transferred separately.',
  );
};
$('import').onchange = async () => {
  const f = $('import').files[0];
  $('import').value = '';
  if (!f) return;
  try {
    if (f.size > 10 * 1024 * 1024) throw Error('Backup exceeds 10 MB.');
    const incoming = validateBackup(JSON.parse(await f.text()));
    if (
      !confirm(
        'Merge this backup? Matching video IDs will be replaced with imported versions.',
      )
    )
      return;
    const merged = new Map(projects.map((p) => [p.id, p]));
    incoming.forEach((p) => merged.set(p.id, p));
    projects = [...merged.values()];
    loadFailed = false;
    lastSaved = localStorage.getItem(KEY);
    save();
    renderBoard();
    if (current) open(current.id);
  } catch (e) {
    say(e.message);
  }
};
window.addEventListener('storage', (e) => {
  // A merge this page already reloaded (Content Studio cloud sync) is not a conflict.
  if (e.key === KEY && e.newValue !== lastSaved)
    say(
      'Plans changed in another tab. Export your work and reload before editing.',
    );
});
renderBoard();
if (location.hash) open(decodeURIComponent(location.hash.slice(1)));
if (new URLSearchParams(location.search).get('view') === 'shoot') {
  if (!current && projects.some((p) => !p.deleted))
    open(projects.find((p) => !p.deleted).id);
  if (current) showTab('shoot');
  else say('Create a video to start its shoot plan.');
}

// Read on refresh and on promotion: an open planner must not copy stale notes.
function refreshIdeaOptions() {
  const selected = $('ideas').value;
  const ideas = readIdeas();
  $('ideas').replaceChildren(new Option('Choose an idea in this browser', ''));
  for (const idea of (ideas || []).filter(
    (i) =>
      i &&
      typeof i.id === 'string' &&
      typeof i.title === 'string' &&
      !i.archived &&
      !i.conflictOf,
  ))
    $('ideas').add(new Option(idea.title, idea.id));
  if ([...$('ideas').options].some((option) => option.value === selected))
    $('ideas').value = selected;
  $('from-idea').disabled = ideas === null;
}
// Idea Vault is the source for captured ideas. Promoting an idea links it to a project, and the two stay in step.
function createFromIdea(ideaId) {
  if (loadFailed) return say('Import a valid backup first.');
  const ideas = readIdeas();
  const idea = ideas?.find((i) => i.id === ideaId);
  if (!idea || idea.archived || idea.conflictOf)
    return say('Choose an active Idea Vault entry first.');
  const existing = projects.find((p) => p.id === 'idea:' + idea.id);
  if (existing) {
    if (existing.deleted) {
      existing.deleted = false;
      save();
    }
    tab = 'details';
    open(existing.id);
    return existing.id;
  }
  const p = newProject(idea.title);
  p.id = 'idea:' + idea.id;
  p.outline = String(idea.notes || '');
  p.outlineUrl = safeUrl(idea.docUrl || '');
  p.publishDate = String(idea.dueDate || '');
  p.stage = STAGE_FOR_STATUS[idea.status] || 'Idea';
  projects.push(p);
  save();
  tab = 'details';
  open(p.id);
  return p.id;
}
$('from-idea').onclick = () => createFromIdea($('ideas').value);
refreshIdeaOptions();
window.addEventListener('storage', (e) => {
  if (e.key === IDEA_KEY || e.key === null) refreshIdeaOptions();
});
// Bring linked ideas up to date on open, and again whenever the Idea Vault changes in another tab.
if (!loadFailed && projects.length) {
  const ideas = readIdeas();
  if (ideas && reconcileLinked(projects, ideas)) {
    writeIdeas(ideas);
    save();
    renderBoard();
  }
}
window.addEventListener('storage', (e) => {
  if (e.key !== IDEA_KEY || loadFailed) return;
  const ideas = readIdeas();
  if (!ideas || !reconcileLinked(projects, ideas)) return;
  save();
  renderBoard();
  if (current) open(current.id);
});

$('planner-save-hint').textContent =
  'Plans sync to your Content Studio account when you are signed in.';
function refreshFromStorage() {
  const prior = current;
  const selected = current?.id;
  const priorRevision = current?.revision;
  const rows = readProjects();
  projects = rows;
  lastSaved = localStorage.getItem(KEY);
  if (selected) {
    current = rows.find((p) => p.id === selected && !p.deleted);
    const preserved = rows.find(
      (p) =>
        p.conflictOf === selected && p.revision === priorRevision && !p.deleted,
    );
    if (preserved) current = preserved;
    if (current && prior && current.revision === prior.revision) {
      const index = rows.indexOf(current);
      prior.id = current.id;
      prior.conflictOf = current.conflictOf;
      rows[index] = prior;
      current = prior;
      renderBoard();
      if (tab === 'assets') renderAssets().catch((e) => say(e.message));
      return;
    }
    if (!current) {
      $('project').hidden = true;
    } else {
      for (const key of fields) {
        if (document.activeElement !== $(key)) $(key).value = current[key];
      }
      $('project-heading').textContent = current.title;
      if (!$('filming').open) {
        if (tab === 'shoot') renderItems();
        if (tab === 'assets') renderAssets().catch((e) => say(e.message));
      }
    }
  }
  renderBoard();
}
window.addEventListener('tim-projects-merged', refreshFromStorage);
window.addEventListener('tim-projects-changed', () => {
  if (!saving && localStorage.getItem(KEY) !== lastSaved)
    queueMicrotask(refreshFromStorage);
});
// The planning host uses one planner instance for Videos and Shoot views.
// Switching views reads existing data; it never creates or migrates a project.
window.TimPlanningEditor = Object.freeze({
  isBusy: () => $('filming').open,
  createFromIdea,
  showView: (view, projectId) => {
    refreshIdeaOptions();
    if (view !== 'details' && view !== 'shoot') return;
    if (projectId && current?.id !== projectId) {
      if (!projects.some((p) => p.id === projectId && !p.deleted)) {
        say('This project is not available on this device.');
        return;
      }
      open(projectId);
    }
    if (view === 'shoot' && !current) {
      const first = projects.find((project) => !project.deleted);
      if (first) open(first.id);
      else say('Create a video to start its shoot plan.');
    }
    tab = view;
    if (current) {
      showTab(view);
      window.scrollTo({
        top: $('project').getBoundingClientRect().top + window.scrollY,
        behavior: 'instant',
      });
    }
  },
});
