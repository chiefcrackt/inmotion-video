import { organizeEditor } from './ux.js';
import { startPositioning } from './positioning.mjs';
import { startEditor } from './editor.mjs';
import { defaults, photoSettings } from './photo.mjs';
import { templates, palettes, clone, move, zipStore } from './model.mjs';
import { render, imageFor, loadSlideImages } from './render.mjs';
const $ = (id) => document.getElementById(id),
  key = 'tim-carousel-v1';
let backgroundControls;
let state = {
  slides: clone(templates[0].slides),
  selected: 0,
  template: 0,
  palette: palettes[0],
  font: 'Barlow Condensed',
  height: 1350,
  handle: '@tristan.inmotion',
  project: 'My daily miles, upgraded.',
};
try {
  const saved = JSON.parse(localStorage.getItem(key));
  if (
    saved &&
    Array.isArray(saved.slides) &&
    saved.slides.length &&
    saved.slides.every(
      (s) => typeof s.title === 'string' && typeof s.body === 'string',
    )
  )
    state = { ...state, ...saved };
} catch {}
state.selected = Math.max(0, Math.min(state.selected, state.slides.length - 1));
let revision = 0;
let editor = null,
  positioning = null;
const undoStack = [],
  redoStack = [];
let lastSnapshot = JSON.stringify(state);
function historySave() {
  const current = JSON.stringify(state);
  if (current !== lastSnapshot) {
    undoStack.push(lastSnapshot);
    if (undoStack.length > 40) undoStack.shift();
    redoStack.length = 0;
    lastSnapshot = current;
  }
  editor?.historyButtons();
}
function restore(snapshot) {
  state = JSON.parse(snapshot);
  state.selected = Math.max(
    0,
    Math.min(state.selected || 0, state.slides.length - 1),
  );
  lastSnapshot = JSON.stringify(state);
  for (const f of ['font', 'handle', 'project']) $(f).value = state[f];
  $('ratio').value = state.height;
  paletteButtons();
  templateButtons();
  select(state.selected);
  save(false);
}
function toast(t) {
  $('toast').textContent = t;
  $('toast').style.display = 'block';
  setTimeout(() => ($('toast').style.display = 'none'), 2800);
}
function save(record = true) {
  if (record) historySave();
  try {
    localStorage.setItem(key, JSON.stringify(state));
    $('saved').textContent = '● Saved locally';
  } catch {
    $('saved').textContent = 'Draft not saved — storage full';
  }
  draw();
  editor?.sync();
}
async function paint(canvas, s, i) {
  await document.fonts.ready;
  let img = null;
  try {
    await loadSlideImages(s);
    img = await imageFor(s.photo);
  } catch {
    toast('Photo could not be loaded. Please upload it again.');
  }
  render(canvas, s, i, state.slides.length, state, img);
}
async function draw() {
  const rev = ++revision;
  $('slideCount').textContent = state.slides.length + ' slides';
  $('previewSlide').textContent =
    'Slide ' + (state.selected + 1) + ' of ' + state.slides.length;
  $('previousSlide').disabled = state.selected === 0;
  $('nextSlide').disabled = state.selected === state.slides.length - 1;
  $('selectedLabel').textContent = String(state.selected + 1).padStart(2, '0');
  $('dimensions').textContent = '1080 × ' + state.height + ' PX';
  $('delete').disabled = state.slides.length === 1;
  const active = state.slides[state.selected];
  let img = null;
  try {
    await loadSlideImages(active);
    img = await imageFor(active.photo);
  } catch {}
  if (rev !== revision) return;
  render($('canvas'), active, state.selected, state.slides.length, state, img);
  editor?.overlay();
  positioning?.overlay();
  $('film').replaceChildren();
  $('overview').replaceChildren();
  state.slides.forEach((s, i) => {
    const b = document.createElement('div');
    b.className = 'thumb' + (i === state.selected ? ' active' : '');
    b.draggable = true;
    const choose = document.createElement('button');
    choose.className = 'choose';
    choose.setAttribute('aria-label', 'Edit slide ' + (i + 1));
    const c = document.createElement('canvas');
    choose.append(c);
    choose.onclick = () => select(i);
    b.append(choose);
    const n = document.createElement('span');
    n.textContent = String(i + 1).padStart(2, '0');
    b.append(n);
    const controls = document.createElement('div');
    controls.className = 'reorder';
    for (const [label, delta] of [
      ['←', -1],
      ['→', 1],
    ]) {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.setAttribute(
        'aria-label',
        `Move slide ${i + 1} ${delta < 0 ? 'left' : 'right'}`,
      );
      btn.disabled = i + delta < 0 || i + delta >= state.slides.length;
      btn.onclick = () => reorder(i, i + delta);
      controls.append(btn);
    }
    b.append(controls);
    b.ondragstart = (e) => e.dataTransfer.setData('text/plain', String(i));
    b.ondragover = (e) => e.preventDefault();
    b.ondrop = (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      if (Number.isInteger(from)) reorder(from, i);
    };
    $('film').append(b);
    paint(c, s, i);
    const ob = document.createElement('button'),
      oc = document.createElement('canvas');
    ob.append(oc);
    ob.setAttribute('aria-label', 'Edit slide ' + (i + 1));
    ob.onclick = () => {
      select(i);
      setTab(false);
    };
    $('overview').append(ob);
    paint(oc, s, i);
  });
}
function reorder(from, to) {
  move(state.slides, from, to);
  state.selected = to;
  select(to);
  save();
}
function select(i) {
  state.selected = i;
  editor?.clear();
  syncPhoto();
  $('hideTemplateText').checked = !!state.slides[i].hideTemplateText;
  $('hideFooter').checked = !!state.slides[i].hideFooter;
  for (const field of ['layout', 'kicker', 'title', 'body', 'stat'])
    $(field).value = state.slides[i][field] || '';
  draw();
}
for (const field of ['layout', 'kicker', 'title', 'body', 'stat'])
  $(field).addEventListener('input', () => {
    state.slides[state.selected][field] = $(field).value;
    save();
  });
for (const field of ['font', 'handle', 'project']) {
  $(field).value = state[field];
  $(field).oninput = () => {
    state[field] = $(field).value;
    save();
  };
}
$('ratio').value = state.height;
$('ratio').onchange = () => {
  state.height = Number($('ratio').value);
  save();
};
function templateButtons() {
  $('templates').replaceChildren();
  const blank = document.createElement('button');
  blank.id = 'blankProject';
  blank.className = 'template' + (state.template === -1 ? ' selected' : '');
  blank.setAttribute('aria-pressed', String(state.template === -1));
  blank.innerHTML =
    '<span class="ticon">＋</span><span><strong>Blank project</strong><small>Start fresh with an empty canvas</small></span>';
  blank.onclick = () => {
    if (
      !confirm(
        'Start a blank project? This replaces your current draft. Save or export your project first to keep a separate copy.',
      )
    )
      return;
    const previousSnapshot = lastSnapshot;
    state = {
      slides: [
        {
          layout: 'blank',
          kicker: '',
          title: '',
          body: '',
          stat: '',
          photo: '',
          elements: [],
        },
      ],
      selected: 0,
      template: -1,
      palette: clone(palettes[0]),
      font: 'Barlow Condensed',
      height: 1350,
      handle: '',
      project: 'Untitled carousel',
    };
    restore(JSON.stringify(state));
    // restore updates the UI; save the replacement as one undoable action.
    lastSnapshot = previousSnapshot;
    save();
    setTab(false);
    document.querySelector('.elementPanel').closest('details').open = true;
    toast(
      'Blank project ready. Add text, photos or shapes in Elements & layers.',
    );
  };
  $('templates').append(blank);
  templates.forEach((t, i) => {
    const b = document.createElement('button');
    b.className = 'template' + (state.template === i ? ' selected' : '');
    b.innerHTML = `<span class="ticon">${t.icon}</span><span><strong>${t.name}</strong><small>${t.note}</small></span>`;
    b.onclick = () => {
      if (
        !confirm(
          'Replace your current slides with the ' + t.name + ' template?',
        )
      )
        return;
      state.slides = clone(t.slides);
      state.template = i;
      state.project = t.slides[0].title.replaceAll('\n', ' ');
      $('project').value = state.project;
      templateButtons();
      select(0);
      save();
    };
    $('templates').append(b);
  });
}
templateButtons();
function paletteButtons() {
  $('palettes').replaceChildren();
  palettes.forEach((p, i) => {
    const b = document.createElement('button');
    b.className = 'palette' + (p[0] === state.palette[0] ? ' active' : '');
    b.setAttribute(
      'aria-label',
      [
        'T.im navy and gold',
        'Minimal paper and teal',
        'Race Broadcast charcoal and coral',
        'Trail green',
        'Clay',
      ][i],
    );
    p.forEach((color) => {
      const sw = document.createElement('i');
      sw.style.background = color;
      b.append(sw);
    });
    b.onclick = () => {
      state.palette = p;
      paletteButtons();
      save();
    };
    $('palettes').append(b);
  });
}
paletteButtons();
$('duplicate').onclick = () => {
  state.slides.splice(
    state.selected + 1,
    0,
    clone(state.slides[state.selected]),
  );
  select(state.selected + 1);
  save();
};
$('add').onclick = () => {
  state.slides.push(
    state.template === -1
      ? {
          layout: 'blank',
          kicker: '',
          title: '',
          body: '',
          stat: '',
          photo: '',
          elements: [],
        }
      : {
          layout: 'text',
          kicker: 'FIELD NOTES',
          title: 'Your next chapter.',
          body: 'Add your story here.',
          stat: '',
          photo: '',
        },
  );
  select(state.slides.length - 1);
  save();
};
$('delete').onclick = () => {
  if (state.slides.length < 2) return;
  if (!confirm('Delete this slide?')) return;
  state.slides.splice(state.selected, 1);
  select(Math.min(state.selected, state.slides.length - 1));
  save();
};
async function applyPhoto(file, backgroundId = '') {
  const slide = state.slides[state.selected];
  if (!file) return;
  try {
    if (!file.type.startsWith('image/')) throw Error('Choose an image file.');
    const url = URL.createObjectURL(file);
    let img;
    try {
      img = await imageFor(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    const c = document.createElement('canvas'),
      scale = Math.min(1, 1800 / Math.max(img.width, img.height));
    c.width = Math.round(img.width * scale);
    c.height = Math.round(img.height * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    slide.photo = c.toDataURL('image/jpeg', 0.88);
    slide.photoSettings = {
      ...defaults,
      ...(backgroundId
        ? {
            mode: 'background',
            textColor: 'palette',
            backgroundPack: backgroundId,
            matchTheme: true,
          }
        : {}),
    };
    syncPhoto();
    save();
  } catch (err) {
    toast(err.message);
    throw err;
  }
}
$('photo').onchange = async (e) => {
  try {
    await applyPhoto(e.target.files[0]);
  } catch {}
  e.target.value = '';
};
backgroundControls = window.TimBackgrounds.mount(
  $('photo').closest('label'),
  applyPhoto,
  {
    getState: () => {
      const slide = state.slides[state.selected],
        p = photoSettings(slide);
      return {
        available: !!slide.photo && !!p.backgroundPack,
        match: p.matchTheme,
      };
    },
    setMatch: (value) => updatePhoto('matchTheme', value),
  },
);
$('removePhoto').onclick = () => {
  state.slides[state.selected].photo = '';
  syncPhoto();
  save();
};
function setTab(all) {
  $('stage').hidden = all;
  $('overview').hidden = !all;
  $('editTab').classList.toggle('active', !all);
  $('editTab').setAttribute('aria-pressed', String(!all));
  $('overviewTab').setAttribute('aria-pressed', String(all));
  $('overviewTab').classList.toggle('active', all);
}
$('editTab').onclick = () => setTab(false);
$('overviewTab').onclick = () => setTab(true);
$('export').onclick = () => $('exportDialog').showModal();
$('closeDialog').onclick = () => $('exportDialog').close();
function download(blob, name) {
  const a = document.createElement('a'),
    url = URL.createObjectURL(blob);
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
async function png(s, i, snapshot) {
  await Promise.all(
    [400, 700, 900].map((w) =>
      document.fonts.load(`${w} 30px "${snapshot.font}"`),
    ),
  );
  const c = document.createElement('canvas');
  await loadSlideImages(s);
  render(c, s, i, snapshot.slides.length, snapshot, await imageFor(s.photo));
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error('PNG export failed'))),
      'image/png',
    ),
  );
}
async function exporting(all) {
  $('zip').disabled = $('png').disabled = true;
  const snapshot = clone(state),
    prefix =
      snapshot.project
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 60) || 'carousel';
  try {
    if (all) {
      const files = [];
      for (let i = 0; i < snapshot.slides.length; i++) {
        $('exportStatus').textContent =
          `Rendering slide ${i + 1} of ${snapshot.slides.length}…`;
        const blob = await png(snapshot.slides[i], i, snapshot);
        files.push({
          name: `${prefix}-${String(i + 1).padStart(2, '0')}.png`,
          data: new Uint8Array(await blob.arrayBuffer()),
        });
      }
      download(zipStore(files), prefix + '.zip');
    } else {
      download(
        await png(
          snapshot.slides[snapshot.selected],
          snapshot.selected,
          snapshot,
        ),
        `${prefix}-${String(snapshot.selected + 1).padStart(2, '0')}.png`,
      );
    }
    $('exportStatus').textContent =
      'Download ready. Your slides are numbered in order.';
  } catch (err) {
    $('exportStatus').textContent = 'Export failed: ' + err.message;
  } finally {
    $('zip').disabled = $('png').disabled = false;
  }
}
$('zip').onclick = () => exporting(true);
$('png').onclick = () => exporting(false);
select(state.selected);

function syncPhoto() {
  const slide = state.slides[state.selected],
    p = photoSettings(slide);
  backgroundControls?.sync();
  $('photoControls').disabled = !slide.photo;
  $('photoFit').value = p.fit;
  for (const [id, k] of [
    ['photoMode', 'mode'],
    ['photoTintColor', 'tintColor'],
    ['photoGradient', 'gradient'],
    ['photoTextColor', 'textColor'],
  ])
    $(id).value = p[k];
  for (const [id, k] of [
    ['Tint', 'tint'],
    ['GradientStrength', 'gradientStrength'],
  ]) {
    $('photo' + id).value = p[k];
    $('photo' + id + 'Value').textContent = p[k] + '%';
  }
  $('photoFit').disabled = p.mode === 'background';
  $('photoFrame').disabled = p.mode === 'background';
  $('photoOverlay').disabled = p.mode === 'background';
  for (const [id, key] of [
    ['Zoom', 'zoom'],
    ['X', 'x'],
    ['Y', 'y'],
    ['Frame', 'frame'],
    ['Overlay', 'overlay'],
  ]) {
    $('photo' + id).value = p[key];
    $('photo' + id + 'Value').textContent =
      id === 'Zoom' ? Number(p[key]).toFixed(2) + '×' : p[key] + '%';
  }
  $('photoFlip').setAttribute('aria-pressed', String(p.flip));
  $('photoRotate').textContent = 'Rotate 90° · ' + p.rotation + '°';
}
function updatePhoto(key, value) {
  const slide = state.slides[state.selected];
  slide.photoSettings = { ...photoSettings(slide), [key]: value };
  syncPhoto();
  save();
}
$('photoFit').onchange = () => updatePhoto('fit', $('photoFit').value);
for (const [id, key] of [
  ['Zoom', 'zoom'],
  ['X', 'x'],
  ['Y', 'y'],
  ['Frame', 'frame'],
  ['Overlay', 'overlay'],
])
  $('photo' + id).oninput = () =>
    updatePhoto(key, Number($('photo' + id).value));
$('photoRotate').onclick = () =>
  updatePhoto(
    'rotation',
    (photoSettings(state.slides[state.selected]).rotation + 90) % 360,
  );
$('photoFlip').onclick = () =>
  updatePhoto('flip', !photoSettings(state.slides[state.selected]).flip);
$('photoReset').onclick = () => {
  const current = photoSettings(state.slides[state.selected]);
  state.slides[state.selected].photoSettings = {
    ...defaults,
    backgroundPack: current.backgroundPack,
    matchTheme: current.matchTheme,
  };
  syncPhoto();
  save();
};

editor = startEditor({
  getState: () => state,
  save,
  draw,
  toast,
  download,
  restore,
  undoStack,
  redoStack,
  getSnapshot: () => lastSnapshot,
});
editor.sync();
editor.overlay();

for (const [id, k] of [
  ['photoMode', 'mode'],
  ['photoTintColor', 'tintColor'],
  ['photoGradient', 'gradient'],
  ['photoTextColor', 'textColor'],
])
  $(id).oninput = () => updatePhoto(k, $(id).value);
for (const [id, k] of [
  ['photoTint', 'tint'],
  ['photoGradientStrength', 'gradientStrength'],
])
  $(id).oninput = () => updatePhoto(k, Number($(id).value));
for (const id of ['hideTemplateText', 'hideFooter'])
  $(id).onchange = () => {
    state.slides[state.selected][id] = $(id).checked;
    save();
  };

positioning = startPositioning({ getState: () => state, save, draw });
positioning.overlay();

organizeEditor();
$('previousSlide').onclick = () => select(Math.max(0, state.selected - 1));
$('nextSlide').onclick = () =>
  select(Math.min(state.slides.length - 1, state.selected + 1));
setTab(false);
