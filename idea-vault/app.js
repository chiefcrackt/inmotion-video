import {
  PLANNER_KEY,
  reconcileLinked,
  statusForStage,
} from '../shared/pipeline-link.mjs';
import {
  isWorkspace,
  hasIdentity,
  rev,
  touch,
  newRevision,
  useCopyAsOriginal,
  discardCopy,
  validDueDate,
  localDay,
  defaultChecklist,
  normalizeChecklist,
  checklistProgress,
  isOverdue,
  dueDateCsv,
} from './vault-core.mjs';

// Storage keys. Changing KEY would strand existing user data, so it stays fixed.
const KEY = 'tim-idea-vault-v1'; // ideas, version 1 (unchanged)
const UNREADABLE_KEY = 'tim-idea-vault-unreadable-v1'; // raw copy of unreadable local data

const $ = (id) => document.getElementById(id);
const now = () => new Date().toISOString();
let items = [],
  selected = null;

let draftChecklist = []; // steps being edited in the open idea; saved only by Save changes
const MAX_CHECKLIST_STEPS = 50;

function notify(s) {
  $('message').textContent = s;
}
// Ideas save on this device. Workspace cloud sync in Content Studio keeps them
// in step across devices (Google Drive sync was removed in November 2026).
function renderSyncState() {
  const el = $('cloudstatus');
  el.dataset.state = 'local';
  el.textContent =
    'Saved on this device · use Workspace cloud sync in Content Studio to sync devices';
}

// ---- Durable local state -------------------------------------------------

// Every change is saved on this device at once. If the browser refuses the write
// (storage full or blocked), say so instead of failing silently.
function persist() {
  let saved = true;
  try {
    localStorage.setItem(KEY, JSON.stringify({ version: 1, ideas: items }));
  } catch {
    saved = false;
    notify(
      'This browser could not save your ideas (storage is full or blocked). Export a backup now so nothing is lost.',
    );
  }
  render();
  return saved;
}

function load() {
  let raw = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    notify('This browser blocks saved data, so ideas cannot be kept here.');
    return;
  }
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
  try {
    if (!localStorage.getItem(UNREADABLE_KEY))
      localStorage.setItem(UNREADABLE_KEY, raw);
  } catch {}
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
  $('stats').textContent = items.filter((x) => !x.archived).length + ' active';
  $('results').replaceChildren();
  const projects = plannerProjects();
  for (const i of visible.sort((a, b) =>
    String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')),
  )) {
    const card = txt($('results'), 'article', '', 'card');
    const project = linkedProject(i, projects);
    txt(
      card,
      'span',
      i.conflictOf ? 'Conflict copy' : project?.stage || i.status,
      'pill',
    );
    txt(card, 'h3', i.title);
    txt(card, 'small', i.platform + ' · ' + (i.category || 'General'));
    if (i.sourceId) txt(card, 'small', 'Linked outline');
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
    if (!i.archived && !i.conflictOf) {
      const link = txt(card, 'a', project ? 'Open project' : 'Create project');
      const params = project
        ? new URLSearchParams({ project: project.id })
        : new URLSearchParams({ idea: i.id });
      link.href = '../content-studio/?' + params + '#projects';
      link.dataset.linkedProject = '';
    }
  }
  if (!visible.length)
    txt($('results'), 'p', 'No ideas match these filters.', 'muted');
}

function linkedProject(idea, projects = plannerProjects()) {
  if (idea.archived || idea.conflictOf) return;
  return projects.find((p) => p && !p.deleted && p.id === 'idea:' + idea.id);
}

function open(id) {
  selected = id;
  const i = items.find((x) => x.id === id);
  if (!i) return;
  $('e-title').value = i.title;
  $('e-notes').value = i.notes || '';
  $('e-platform').value = i.platform || 'YouTube';
  $('e-category').value = i.category || '';
  const project = linkedProject(i);
  $('e-status').disabled = !!project;
  $('e-status').title = project
    ? 'Update production status in the linked project.'
    : '';
  $('e-status').value = project
    ? statusForStage(project.stage, i.status)
    : i.status || 'Inbox';
  $('e-priority').value = i.priority || 'Normal';
  $('e-due').value = validDueDate(i.dueDate);
  draftChecklist = normalizeChecklist(i.checklist);
  renderChecklist();
  $('doclink').hidden = !i.docUrl;
  if (i.docUrl) $('doclink').href = i.docUrl;
  $('resolve').hidden = !i.conflictOf;
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
  if (!persist()) return;
  e.target.reset();
  notify('Idea saved on this device.');
};

$('save').onclick = () => {
  const i = items.find((x) => x.id === selected);
  if (!i) return;
  if (!$('e-title').value.trim()) return notify('Title is required');
  const project = linkedProject(i);
  Object.assign(i, {
    title: $('e-title').value.trim(),
    notes: $('e-notes').value,
    platform: $('e-platform').value,
    category: $('e-category').value,
    status: project
      ? statusForStage(project.stage, i.status)
      : $('e-status').value,
    priority: $('e-priority').value,
    dueDate: validDueDate($('e-due').value),
    checklist: normalizeChecklist(draftChecklist),
  });
  touch(i, now());
  if (!persist()) return;
  close();
  notify('Saved on this device');
};

$('archive').onclick = () => {
  const i = items.find((x) => x.id === selected);
  if (
    !i ||
    !confirm('Archive this idea? You can still find it in a backup.')
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
    notify('Original replaced with the conflict copy.');
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
  else render();
});
render();
renderSyncState();
// Leave draft edits in place until the user saves or closes the idea editor.
window.TimPlanningEditor = Object.freeze({
  isBusy: () => $('editor').classList.contains('open'),
});
