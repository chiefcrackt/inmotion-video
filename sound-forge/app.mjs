import { FACTORY } from '../shared/sound/presets.mjs';
import {
  preset,
  layer,
  CATEGORIES,
  SOURCES,
  quickEdit,
  slug,
  duration,
} from '../shared/sound/model.mjs';
import { render, audioContext, playBuffer } from '../shared/sound/engine.mjs';
import * as storage from '../shared/sound/storage.mjs';
import { encodeWav, download } from '../shared/sound/wav.mjs';
const $ = (id) => document.getElementById(id),
  memory = new Map();
let base = preset(FACTORY[0]),
  current = preset(base),
  custom = [],
  selected = 0,
  ctx,
  resolver,
  result,
  revision = 0,
  renderedRevision = -1,
  busy = false,
  source,
  playingAt = 0,
  raf,
  playToken = 0,
  stemURLs = [];
let q = { duration: 1, pitch: 0, intensity: 1, texture: 0 },
  loadedSnapshot = preset(base);
const say = (s, error = false) => {
  $('status').textContent = s;
  $('status').classList.toggle('error', error);
};
function context() {
  if (!ctx) {
    ctx = audioContext();
    resolver = storage.assetResolver(ctx, memory);
  }
  return ctx;
}
function stop() {
  playToken++;
  if (source) {
    source.onended = null;
    try {
      source.stop();
    } catch {}
    source.disconnect();
    source = null;
  }
  cancelAnimationFrame(raf);
  $('playhead').style.display = 'none';
  document.getElementById('timeline-head')?.remove();
}
function revokeStems() {
  stemURLs.forEach((u) => URL.revokeObjectURL(u));
  stemURLs = [];
  $('stem-downloads').replaceChildren();
}
function changed() {
  stop();
  revision++;
  result = null;
  revokeStems();
  $('peak-meter').value = 0;
  $('level').textContent = 'Edits pending · Preview to update waveform';
  $('wave').getContext('2d').clearRect(0, 0, $('wave').width, $('wave').height);
  $('tracks').replaceChildren();
  $('sound-name').textContent = current.name;
  $('seed').textContent = `Seed ${current.seed}`;
}
function load(p) {
  base = preset(p);
  current = preset(p);
  loadedSnapshot = preset(p);
  q = { duration: 1, pitch: 0, intensity: 1, texture: 0 };
  changed();
  quickUI();
  library();
  editor();
  timeline();
}
function el(tag, text, props = {}) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  Object.assign(e, props);
  return e;
}
function library() {
  const box = $('presets');
  box.replaceChildren();
  const category = $('category').value,
    search = $('search').value.toLowerCase();
  const list = [...FACTORY, ...custom].filter(
    (p) =>
      (category === 'custom'
        ? custom.some((c) => c.id === p.id)
        : !category || p.category === category) &&
      p.name.toLowerCase().includes(search),
  );
  let group = '';
  for (const p of list) {
    if (!category && p.category !== group) {
      group = p.category;
      box.append(el('p', group, { className: 'preset-group' }));
    }
    const b = el('button', p.name);
    b.setAttribute('aria-pressed', String(base.id === p.id));
    b.append(el('small', p.id.startsWith('factory-') ? 'Factory' : 'Saved'));
    b.onclick = () => load(p);
    box.append(b);
  }
  if (!list.length)
    box.append(
      el('p', 'No matching sounds. Try another search or save your own.'),
    );
}
for (const c of CATEGORIES) $('category').append(el('option', c, { value: c }));
$('category').onchange = library;
$('search').oninput = library;
const quickDefs = [
  ['duration', 'Duration', 0.25, 3, 0.05, '×'],
  ['pitch', 'Pitch', -24, 24, 1, ' st'],
  ['intensity', 'Intensity', 0.1, 2, 0.05, '×'],
  ['texture', 'Texture / distortion', 0, 1, 0.01, ''],
];
function quickUI() {
  $('quick').replaceChildren();
  for (const [key, title, min, max, step, unit] of quickDefs) {
    const label = el('label', title),
      out = el('output', `${q[key]}${unit}`),
      input = el('input', undefined, {
        type: 'range',
        min,
        max,
        step,
        value: q[key],
      });
    input.setAttribute('aria-label', title);
    input.oninput = () => {
      q[key] = +input.value;
      out.textContent = `${q[key]}${unit}`;
      current = quickEdit(base, q);
      changed();
      editor();
      timeline();
    };
    label.append(out, input);
    $('quick').append(label);
  }
}
function bake() {
  base = preset(current);
  q = { duration: 1, pitch: 0, intensity: 1, texture: 0 };
  quickUI();
}
const fields = [
  ['name', 'Layer name', 'text'],
  ['source', 'Source', 'select'],
  ['enabled', 'Enabled', 'check'],
  ['mute', 'Mute', 'check'],
  ['solo', 'Solo', 'check'],
  ['reverse', 'Reverse', 'check'],
  ['volume', 'Volume', 0, 1, 0.01],
  ['start', 'Start offset (s)', 0, 20, 0.01],
  ['duration', 'Output duration (s)', 0.02, 12, 0.01],
  ['trim', 'Sample trim start (s)', 0, 600, 0.01],
  ['pitch', 'Pitch / sample rate (semitones)', -24, 24, 1],
  ['pan', 'Stereo pan', -1, 1, 0.01],
  ['fadeIn', 'Fade in (s)', 0, 6, 0.001],
  ['fadeOut', 'Fade out (s)', 0, 6, 0.001],
  ['frequency', 'Start frequency (Hz)', 20, 16000, 1],
  ['endFrequency', 'End frequency (Hz)', 20, 16000, 1],
  ['modRate', 'FM rate (Hz)', 0, 2000, 1],
  ['modDepth', 'FM depth (Hz)', 0, 2000, 1],
  ['pulse', 'Pulse rate (Hz)', 0, 80, 0.1],
  ['attack', 'Attack (s)', 0, 6, 0.001],
  ['decay', 'Decay (s)', 0.001, 6, 0.001],
  ['sustain', 'Sustain level', 0, 1, 0.01],
  ['release', 'Release (s)', 0.001, 6, 0.001],
  ['lowpass', 'Low-pass (Hz)', 30, 20000, 1],
  ['highpass', 'High-pass (Hz)', 20, 18000, 1],
  ['resonance', 'Filter resonance Q', 0.1, 8, 0.1],
  ['distortion', 'Distortion', 0, 1, 0.01],
  ['reverb', 'Reverb wet', 0, 1, 0.01],
  ['reverbTime', 'Reverb tail (s)', 0.1, 3, 0.1],
  ['delay', 'Delay wet', 0, 0.8, 0.01],
  ['delayTime', 'Echo interval (s)', 0.03, 1, 0.01],
];
function editor() {
  const tabs = $('layer-tabs');
  tabs.replaceChildren();
  current.layers.forEach((l, i) => {
    const b = el('button', `${i + 1} · ${l.name}`, {
      className: i === selected ? 'selected' : '',
    });
    b.onclick = () => {
      selected = i;
      editor();
      timeline();
    };
    tabs.append(b);
  });
  const box = $('layer-editor');
  box.replaceChildren();
  const grid = el('div', undefined, { className: 'editor-grid' }),
    l = current.layers[selected];
  for (const [key, title, type, max, step] of fields) {
    if (
      l.source === 'sample' &&
      [
        'frequency',
        'endFrequency',
        'modRate',
        'modDepth',
        'pulse',
        'attack',
        'decay',
        'sustain',
        'release',
      ].includes(key)
    )
      continue;
    if (l.source !== 'sample' && key === 'trim') continue;
    if (l.source.includes('noise') && ['modRate', 'modDepth'].includes(key))
      continue;
    if (
      l.source === 'noise' &&
      ['frequency', 'endFrequency', 'pitch'].includes(key)
    )
      continue;
    const label = el('label', title);
    let input;
    if (type === 'select') {
      input = el('select');
      for (const s of SOURCES)
        input.append(
          el(
            'option',
            s === 'sample'
              ? 'Imported sample'
              : s === 'noise'
                ? 'White noise'
                : s === 'filtered-noise'
                  ? 'Filtered noise sweep'
                  : s,
            { value: s },
          ),
        );
      input.value = l[key];
    } else if (type === 'check') {
      label.className = 'check';
      input = el('input', undefined, { type: 'checkbox', checked: l[key] });
    } else
      input = el('input', undefined, {
        type: type === 'text' ? 'text' : 'number',
        value: l[key],
        ...(typeof type === 'number' ? { min: type, max, step } : {}),
      });
    input.setAttribute('aria-label', title);
    input.onchange = () => {
      bake();
      let v =
        type === 'check'
          ? input.checked
          : typeof type === 'number'
            ? +input.value
            : input.value;
      if ((key === 'start' || key === 'duration') && $('snap').checked)
        v = +(Math.round(v / 0.05) * 0.05).toFixed(2);
      current.layers[selected] = layer({
        ...current.layers[selected],
        [key]: v,
      });
      base = preset(current);
      changed();
      editor();
      timeline();
    };
    label.append(input);
    grid.append(label);
  }
  box.append(grid);
  const upload = el(
    'label',
    l.source === 'sample'
      ? 'Import / relink WAV or MP3 for this layer'
      : 'Replace this layer with WAV or MP3',
  );
  const input = el('input', undefined, {
    type: 'file',
    accept: '.wav,.mp3,audio/wav,audio/mpeg',
  });
  input.onchange = () => guard(() => importAudio(input.files[0]));
  upload.append(input);
  box.append(upload);
  if (l.source === 'sample')
    box.append(
      el(
        'p',
        l.assetId
          ? `Sample: ${l.assetName} · Local asset ${l.assetId}`
          : 'Missing sample. Import or relink an audio file.',
        { className: 'note asset-note' },
      ),
    );
}
async function importAudio(file) {
  if (!file) return;
  const rev = revision,
    target = selected;
  if (file.size > 25 * 1024 * 1024)
    throw Error(
      'Choose an audio file smaller than 25 MB. Trim longer recordings before importing.',
    );
  const a = context();
  await a.resume();
  const data = await file.arrayBuffer();
  let decoded;
  try {
    decoded = await a.decodeAudioData(data.slice(0));
  } catch {
    throw Error('This audio format could not be decoded. Try PCM WAV or MP3.');
  }
  if (rev !== revision || target !== selected)
    throw Error(
      'The selected sound or layer changed during import. Choose the file again for the intended layer.',
    );
  const id = globalThis.crypto.randomUUID?.() || `asset-${Date.now()}`;
  const record = { id, name: file.name, type: file.type, data };
  memory.set(id, record);
  let warning = '';
  try {
    await storage.saveAssetRecord(record);
  } catch (e) {
    warning = ` ${e.message}`;
  }
  bake();
  current.layers[selected] = layer({
    ...current.layers[selected],
    source: 'sample',
    assetId: id,
    assetName: file.name,
    trim: 0,
    duration: Math.min(12, decoded.duration),
    enabled: true,
  });
  base = preset(current);
  changed();
  editor();
  timeline();
  say(`Loaded ${file.name}.${warning}`);
}
function draw(canvas, buffer, color = '#2E9BAD') {
  const w = Math.max(1, Math.round(canvas.clientWidth * devicePixelRatio)),
    h = Math.max(1, Math.round(canvas.clientHeight * devicePixelRatio));
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  c.clearRect(0, 0, w, h);
  c.strokeStyle = '#25395C';
  c.beginPath();
  c.moveTo(0, h / 2);
  c.lineTo(w, h / 2);
  c.stroke();
  if (!buffer) return;
  c.strokeStyle = color;
  const d = buffer.getChannelData(0),
    d2 = buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : d;
  for (let x = 0; x < w; x++) {
    let lo = 0,
      hi = 0;
    const start = Math.floor((x * d.length) / w),
      end = Math.max(start + 1, Math.floor(((x + 1) * d.length) / w));
    for (let j = start; j < end; j++) {
      lo = Math.min(lo, d[j] || 0, d2[j] || 0);
      hi = Math.max(hi, d[j] || 0, d2[j] || 0);
    }
    c.beginPath();
    c.moveTo(x, h / 2 - lo * h * 0.46);
    c.lineTo(x, h / 2 - hi * h * 0.46);
    c.stroke();
  }
}
function timeline() {
  const D = result?.buffer.duration || duration(current),
    zoom = +$('zoom').value;
  $('timeline').style.width = `${zoom * 100}%`;
  $('ruler').replaceChildren();
  for (let i = 0; i <= 8; i++)
    $('ruler').append(el('span', `${((D * i) / 8).toFixed(2)}s`));
  $('tracks').replaceChildren();
  current.layers.forEach((l, i) => {
    const row = el('div', undefined, {
      className: `track ${selected === i ? 'selected' : ''} ${!l.enabled || l.mute ? 'dim' : ''}`,
      tabIndex: 0,
      role: 'button',
    });
    row.setAttribute(
      'aria-label',
      `Edit layer ${i + 1}, ${l.name}, start ${l.start} seconds, duration ${l.duration} seconds`,
    );
    row.onclick = () => {
      selected = i;
      editor();
      timeline();
    };
    row.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        row.click();
      }
    };
    const wave = el('canvas');
    wave.setAttribute('aria-hidden', 'true');
    row.append(
      wave,
      el(
        'span',
        `${i + 1} · ${l.name} · ${l.start.toFixed(2)}–${(l.start + l.duration).toFixed(2)}s`,
      ),
    );
    const block = el('div');
    Object.assign(block.style, {
      position: 'absolute',
      left: `${(l.start / D) * 100}%`,
      width: `${(l.duration / D) * 100}%`,
      top: '20px',
      bottom: '2px',
      border: '1px solid #E8C96A66',
      pointerEvents: 'none',
    });
    row.append(block);
    $('tracks').append(row);
    const stem = result?.stems.find((s) => s.index === i);
    draw(wave, stem?.buffer, selected === i ? '#E8C96A' : '#2E9BAD');
  });
}
$('zoom').onchange = timeline;
$('advanced').ontoggle = () => {
  if ($('advanced').open) timeline();
};
async function ensureRender() {
  context();
  if (result && renderedRevision === revision) return result;
  const rev = revision,
    p = preset(current);
  $('progress').hidden = false;
  say('Rendering layers and effects…');
  const r = await render(p, {
    sampleRate: +$('sample-rate').value,
    normalize: $('normalize').checked,
    resolveAsset: resolver,
    onProgress: (v) => ($('progress').value = v),
  });
  if (rev !== revision)
    throw Error(
      'The sound changed during rendering. Preview again to hear the latest edits.',
    );
  result = r;
  renderedRevision = rev;
  draw($('wave'), r.buffer);
  timeline();
  $('peak-meter').value = Math.min(1, r.peak * r.gain);
  $('level').textContent =
    `Peak ${r.peak ? (20 * Math.log10(r.peak * r.gain)).toFixed(1) : '−∞'} dBFS${r.peak > 1 ? ' · Clipping prevented' : ''} · ${r.buffer.duration.toFixed(2)} s`;
  return r;
}
async function guard(fn) {
  if (busy) return;
  busy = true;
  const buttons = ['preview', 'export', 'stems', 'save', 'import', 'package'];
  buttons.forEach((id) => ($(id).disabled = true));
  try {
    await fn();
  } catch (e) {
    say(e.message || String(e), true);
  } finally {
    busy = false;
    buttons.forEach((id) => ($(id).disabled = false));
    $('progress').hidden = true;
  }
}
function animate() {
  if (!source) return;
  const t = ctx.currentTime - playingAt,
    position = `${Math.min(100, (t / result.buffer.duration) * 100)}%`;
  $('playhead').style.display = 'block';
  $('playhead').style.left = position;
  let head = document.getElementById('timeline-head');
  if (!head) {
    head = el('div', undefined, { id: 'timeline-head' });
    Object.assign(head.style, {
      position: 'absolute',
      top: '27px',
      bottom: '0',
      width: '2px',
      background: '#E8C96A',
      pointerEvents: 'none',
    });
    $('timeline').append(head);
  }
  head.style.left = position;
  raf = requestAnimationFrame(animate);
}
$('preview').onclick = () => {
  guard(async () => {
    stop();
    const token = playToken;
    const a = context();
    await a.resume();
    const r = await ensureRender();
    if (token !== playToken) return;
    source = playBuffer(a, r.buffer);
    playingAt = a.currentTime;
    source.onended = () => {
      stop();
      say('Preview complete.');
    };
    animate();
    say('Playing rendered mix.');
  });
};
$('stop').onclick = () => {
  stop();
  say('Stopped.');
};
$('reset').onclick = () => load(loadedSnapshot);
$('factory').onclick = () =>
  load(FACTORY.find((p) => p.id === base.id) || FACTORY[0]);
$('random').onclick = () => {
  bake();
  current.seed = (current.seed + 2654435761) >>> 0 || 1;
  const s = current.seed / 4294967296;
  current.layers = current.layers.map((l, i) =>
    layer({
      ...l,
      pitch: l.pitch + (s - 0.5) * (i + 1) * 3,
      modRate: l.modRate * (0.8 + s * 0.4),
      start: l.start + (i ? s * 0.03 : 0),
    }),
  );
  base = preset(current);
  changed();
  editor();
  timeline();
};
async function refreshLibrary() {
  try {
    custom = await storage.listPresets();
    library();
  } catch (e) {
    say(e.message, true);
  }
}
async function save(copy = false) {
  const name = prompt(
    copy ? 'Name the duplicate' : 'Save sound as',
    current.name,
  );
  if (!name?.trim()) return;
  const p = preset({
    ...current,
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: name.trim(),
  });
  await storage.savePreset(p);
  await refreshLibrary();
  load(p);
  say('Saved in this browser’s shared T.im sound library.');
}
$('save').onclick = () => guard(() => save());
$('duplicate').onclick = () => guard(() => save(true));
$('rename').onclick = () =>
  guard(async () => {
    if (!custom.some((p) => p.id === current.id))
      throw Error('Save this factory sound as a custom preset first.');
    const name = prompt('Rename sound', current.name);
    if (!name?.trim()) return;
    const p = preset({ ...current, name });
    await storage.savePreset(p);
    await refreshLibrary();
    load(p);
    say('Renamed.');
  });
$('delete').onclick = () =>
  guard(async () => {
    if (!custom.some((p) => p.id === current.id))
      throw Error('Only custom presets can be deleted.');
    if (!confirm(`Delete “${current.name}” from this browser?`)) return;
    await storage.deletePreset(current.id);
    await refreshLibrary();
    load(FACTORY[0]);
    say('Custom preset deleted.');
  });
$('json').onclick = () =>
  download(
    JSON.stringify(current, null, 2),
    `tim-${slug(current.name)}.preset.json`,
    'application/json',
  );
$('package').onclick = () =>
  guard(async () => {
    say('Packaging settings and audio…');
    const p = await storage.packageProject(preset(current), memory);
    download(
      JSON.stringify(p),
      `tim-${slug(current.name)}.project.json`,
      'application/json',
    );
    say('Portable project exported with all sample data.');
  });
$('import').onclick = () => $('import-file').click();
$('import-file').onchange = () =>
  guard(async () => {
    const file = $('import-file').files[0];
    if (!file) return;
    if (file.size > 145e6)
      throw Error('This project exceeds the 145 MB import limit.');
    let obj;
    try {
      obj = JSON.parse(await file.text());
    } catch {
      throw Error(
        'This file is not valid JSON. Choose an exported sound preset or project package.',
      );
    }
    let p,
      warning = '';
    if (obj.format === 'tim-sound-project') {
      const project = storage.unpackProject(obj);
      p = project.preset;
      for (const a of project.assets) {
        memory.set(a.id, a);
        try {
          await storage.saveAssetRecord(a);
        } catch (e) {
          warning = e.message;
        }
      }
    } else p = preset(obj);
    load({ ...p, id: `import-${Date.now()}` });
    say(
      `Imported into the editor. Save as custom to add to your library. JSON-only samples may need relinking.${warning ? ' ' + warning : ''}`,
      Boolean(warning),
    );
    $('import-file').value = '';
  });
for (const id of ['sample-rate', 'normalize']) $(id).onchange = changed;
$('export').onclick = () =>
  guard(async () => {
    stop();
    const r = await ensureRender();
    download(
      encodeWav(r.buffer),
      `tim-${slug(current.name)}-${r.buffer.sampleRate}.wav`,
      'audio/wav',
    );
    say('Stereo WAV exported.');
  });
$('stems').onclick = () =>
  guard(async () => {
    stop();
    const r = await ensureRender();
    revokeStems();
    for (const stem of r.stems) {
      const url = URL.createObjectURL(
        new Blob([encodeWav(stem.buffer)], { type: 'audio/wav' }),
      );
      stemURLs.push(url);
      $('stem-downloads').append(
        el('a', `Download ${stem.index + 1} · ${stem.name}`, {
          href: url,
          download: `tim-${slug(current.name)}-${stem.index + 1}-${slug(stem.name)}.wav`,
          className: 'stem-link',
        }),
      );
    }
    say(
      r.stems.length
        ? 'Stems ready. Tap each link to save its WAV.'
        : 'No active layers. Enable a layer to export stems.',
    );
  });
window.addEventListener('resize', () => {
  draw($('wave'), result?.buffer);
  timeline();
});
window.addEventListener('pagehide', () => {
  stop();
  revokeStems();
  ctx?.close();
  ctx = null;
  resolver = null;
});
load(FACTORY[0]);
refreshLibrary();
