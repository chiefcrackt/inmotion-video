import { catalog, byId } from './catalog.mjs';
import {
  initial,
  validate,
  newLayer,
  clone,
  clamp,
  formats,
  splitLayer,
  motionOptions,
  suggestedMotion,
  entranceMotions,
} from './model.mjs';
import { image, prepare, render, selection, hitTest } from './render.mjs';
import { templates, templateScene } from '../product-spotlight/templates.mjs';
const $ = (id) => document.getElementById(id),
  canvas = $('canvas'),
  key = 'tim-asset-animator-v1';
let state = initial(),
  selected = '',
  playing = false,
  position = 0,
  started = 0,
  busy = false,
  drag = null,
  videoBlob = null,
  videoName = '',
  videoURL = '',
  cancelRecording = null;
let timelinePreview = false;
try {
  const saved = JSON.parse(localStorage.getItem(key) || 'null');
  if (saved) state = validate(saved);
} catch {
  $('status').textContent =
    'The saved draft could not be restored. Import a saved project or start a new graphic.';
}
const say = (message) => ($('status').textContent = message);
const chosen = () => state.layers.find((l) => l.id === selected);
const name = (l) =>
  l.kind === 'text'
    ? l.text.trim().split('\n')[0] || 'Text'
    : byId.get(l.asset).name;
function persist() {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    say(
      'Browser storage is unavailable. Export JSON in Saved projects to keep your work.',
    );
  }
}
function stop() {
  playing = false;
  $('play').textContent = 'Play animation';
}
function paint() {
  render(canvas, state, position, { still: !playing && !timelinePreview });
  selection($('selection'), state, playing ? '' : selected);
  const [w, h] = formats[state.format];
  $('stage').style.aspectRatio = w + '/' + h;
  $('stage').style.width = `min(100%, calc(56vh * ${w / h}))`;
  $('scrub').value = position / state.duration;
}
function sync() {
  if (!state.layers.some((l) => l.id === selected))
    selected = state.layers.at(-1)?.id || '';
  $('layers').replaceChildren(
    ...(state.layers.length
      ? state.layers.map(
          (l, i) =>
            new Option(
              `${i + 1}. ${name(l)}${l.visible ? '' : ' (hidden)'}`,
              l.id,
            ),
        )
      : [new Option('No layers yet', '')]),
  );
  $('layers').value = selected;
  const l = chosen();
  $('layerEditor').hidden = !l;
  if (l) {
    $('motion').replaceChildren(
      ...motionOptions(l).map((m) => new Option(m.label, m.value)),
    );
    $('entranceControls').hidden = !entranceMotions.includes(l.motion);
    $('delay').max = (state.duration - 0.1).toFixed(1);
    $('entrance').max = (state.duration - (l.delay ?? 0)).toFixed(1);
    $('delay').value = l.delay ?? 0;
    $('entrance').value = l.entrance ?? Math.min(1.4, state.duration);
    $('delayValue').value = Number(l.delay ?? 0).toFixed(1) + 's';
    $('entranceValue').value =
      Number(l.entrance ?? Math.min(1.4, state.duration)).toFixed(1) + 's';
    $('motionHint').textContent =
      l.kind === 'text'
        ? 'Type-on keeps each letter in its final position. Entrances finish and hold.'
        : l.asset?.startsWith('toy:')
          ? 'Two original actions for this motion toy. Adjust the entrance duration to change its speed; the final pose holds.'
          : 'Draw-in follows the actual vector paths. Build-in moves separate parts. Entrances finish and hold.';
    $('textControls').hidden = l.kind !== 'text';
    for (const field of [
      'x',
      'y',
      'size',
      'rotation',
      'opacity',
      'motion',
      'text',
      'fontSize',
      'color',
    ])
      if (field in l && $(field).value !== String(l[field]))
        $(field).value = l[field];
    $('visible').checked = l.visible;
    for (const field of ['x', 'y', 'size', 'rotation', 'opacity'])
      $(field + 'Value').value = l[field] + (field === 'rotation' ? '°' : '%');
  }
  for (const field of ['format', 'duration', 'mode', 'exit'])
    $(field).value = state[field] ?? 'original';
  for (const el of document.querySelectorAll(
    '.controls button,.controls input,.controls select,.controls textarea,#play,#scrub',
  ))
    el.disabled = busy;
  $('cancel').hidden = !cancelRecording;
  $('cancel').disabled = false;
  const i = state.layers.findIndex((l) => l.id === selected);
  $('backward').disabled = busy || i <= 0;
  $('forward').disabled = busy || i < 0 || i === state.layers.length - 1;
  $('duplicate').disabled = busy || state.layers.length >= 12;
  $('addText').disabled = busy || state.layers.length >= 12;
  const parts = l?.kind === 'asset' ? byId.get(l.asset)?.parts : null;
  $('split').hidden = !parts;
  $('split').disabled =
    busy || (!!parts && state.layers.length - 1 + parts.length > 12);
  for (const b of $('catalog').querySelectorAll('button'))
    b.disabled = busy || state.layers.length >= 12;
  $('png').disabled = $('export').disabled =
    busy || !state.layers.some((l) => l.visible);
  $('sequence').disabled = busy || !state.layers.length;
  paint();
}
function change(fn) {
  if (busy) return;
  stop();
  position = 0;
  timelinePreview = false;
  fn();
  persist();
  sync();
}
async function addAsset(asset) {
  if (busy || state.layers.length >= 12) return;
  busy = true;
  sync();
  say('Loading ' + asset.name + '…');
  try {
    await image(asset.id);
    const l = newLayer('asset', asset.id);
    if (asset.id.startsWith('toy:')) {
      l.motion = 'perform';
      l.entrance = Math.min(2.8, state.duration);
    }
    const next = { ...state, layers: [...state.layers, l] };
    await prepare(next);
    state = next;
    selected = l.id;
    stop();
    position = 0;
    timelinePreview = false;
    persist();
    say(asset.name + ' added. Drag it or use the position controls.');
    return true;
  } catch (e) {
    say(e.message);
  } finally {
    busy = false;
    sync();
  }
}
for (const option of $('pack').options) {
  const count =
    option.value === 'all'
      ? catalog.length
      : catalog.filter((asset) => asset.pack === option.value).length;
  option.textContent += ` · ${count} graphics`;
}
for (const item of catalog) {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.pack = item.pack;
  button.dataset.search = (item.name + ' ' + item.category).toLowerCase();
  button.setAttribute('aria-label', 'Add ' + item.name);
  const im = document.createElement('img');
  im.src = item.src;
  im.alt = '';
  im.loading = 'lazy';
  const label = document.createElement('span');
  label.textContent = item.name;
  button.append(im, label);
  button.onclick = () => addAsset(item);
  $('catalog').append(button);
}
function filter() {
  const pack = $('pack').value,
    query = $('search').value.trim().toLowerCase();
  let n = 0;
  for (const b of $('catalog').children) {
    b.hidden =
      (pack !== 'all' && b.dataset.pack !== pack) ||
      !b.dataset.search.includes(query);
    if (!b.hidden) n++;
  }
  $('assetCount').textContent = n;
  $('noMatches').hidden = n > 0;
}
$('pack').onchange = $('search').oninput = filter;
for (const [id, item] of templates)
  $('template').add(new Option(item.name, id));
async function applyTemplate(id) {
  if (busy) return false;
  if (!templates.has(id)) {
    say('That library template was not found.');
    return false;
  }
  if (
    state.layers.length &&
    !confirm('Replace the current graphic with this template?')
  )
    return false;
  busy = true;
  sync();
  try {
    const next = validate(templateScene(id));
    await prepare(next);
    await document.fonts.ready;
    stop();
    position = 0;
    timelinePreview = false;
    state = next;
    selected = state.layers[1]?.id || state.layers[0].id;
    persist();
    say('Template ready. Select a text layer to change the wording.');
    return true;
  } catch (e) {
    say(e.message);
    return false;
  } finally {
    busy = false;
    sync();
  }
}
$('template').onchange = () => {
  const id = $('template').value;
  $('template').value = '';
  if (id) applyTemplate(id);
};
$('addText').onclick = () =>
  change(() => {
    if (state.layers.length >= 12) return;
    const l = newLayer('text');
    state.layers.push(l);
    selected = l.id;
  });
$('layers').onchange = () => {
  if (busy) return;
  stop();
  position = 0;
  timelinePreview = false;
  selected = $('layers').value;
  sync();
};
for (const field of [
  'x',
  'y',
  'size',
  'rotation',
  'opacity',
  'fontSize',
  'text',
  'color',
  'motion',
  'visible',
  'delay',
  'entrance',
])
  $(field).addEventListener('input', () =>
    change(() => {
      const l = chosen();
      if (l)
        l[field] =
          field === 'visible'
            ? $(field).checked
            : ['text', 'color', 'motion'].includes(field)
              ? $(field).value
              : Number($(field).value);
      if (l && field === 'delay')
        l.entrance = Math.max(
          0.1,
          Math.min(l.entrance ?? 1.4, state.duration - l.delay),
        );
    }),
  );
for (const [button, step] of [
  ['backward', -1],
  ['forward', 1],
])
  $(button).onclick = () =>
    change(() => {
      const i = state.layers.findIndex((l) => l.id === selected),
        j = i + step;
      if (i >= 0 && j >= 0 && j < state.layers.length)
        [state.layers[i], state.layers[j]] = [state.layers[j], state.layers[i]];
    });
$('remove').onclick = () =>
  change(() => (state.layers = state.layers.filter((l) => l.id !== selected)));
$('duplicate').onclick = () =>
  change(() => {
    const l = chosen();
    if (!l || state.layers.length >= 12) return;
    const copy = {
      ...l,
      id: crypto.randomUUID(),
      x: clamp(l.x + 3, 0, 100),
      y: clamp(l.y + 3, 0, 100),
    };
    state.layers.push(copy);
    selected = copy.id;
  });
$('split').onclick = async () => {
  if (busy) return;
  const index = state.layers.findIndex((l) => l.id === selected);
  busy = true;
  sync();
  try {
    const next = validate({ ...state, layers: splitLayer(state, selected) });
    await prepare(next);
    stop();
    position = 0;
    timelinePreview = false;
    state = next;
    selected = state.layers[index].id;
    persist();
    say(
      'Split into aligned parts. Select each part to give it its own motion.',
    );
  } catch (e) {
    say(e.message);
  } finally {
    busy = false;
    sync();
  }
};
for (const field of ['format', 'duration', 'mode', 'exit'])
  $(field).onchange = () =>
    change(() => {
      state[field] =
        field === 'duration' ? Number($(field).value) : $(field).value;
      if (field === 'duration')
        for (const l of state.layers) {
          l.delay = Math.min(l.delay ?? 0, state.duration - 0.1);
          l.entrance = Math.max(
            0.1,
            Math.min(l.entrance ?? 1.4, state.duration - l.delay),
          );
        }
    });
$('clear').onclick = () => {
  if (
    !busy &&
    state.layers.length &&
    confirm('Remove all layers from this canvas?')
  )
    change(() => (state.layers = []));
};
function previewFromStart() {
  position = 0;
  timelinePreview = true;
  playing = true;
  started = performance.now();
  $('play').textContent = 'Pause animation';
  paint();
}
$('suggest').onclick = () => {
  if (busy || !chosen()) return;
  change(() => {
    const l = chosen();
    l.motion = suggestedMotion(l);
    l.delay = 0;
    l.entrance = Math.min(1.5, state.duration);
  });
  previewFromStart();
};
$('sequence').onclick = () => {
  if (busy || !state.layers.length) return;
  change(() => {
    state.layers.forEach((l, i) => {
      l.motion = suggestedMotion(l);
      l.delay = Math.min(
        state.duration * 0.45,
        i * state.duration * 0.055 +
          (l.kind === 'text' ? state.duration * 0.22 : 0),
      );
      l.entrance = Math.min(
        state.duration - l.delay,
        state.duration * (l.kind === 'text' ? 0.32 : 0.38),
      );
    });
  });
  say('Entrance sequence ready. Each layer reveals, then holds.');
  previewFromStart();
};
$('play').onclick = () => {
  if (busy) return;
  if (playing) {
    stop();
    paint();
    return;
  }
  playing = true;
  timelinePreview = true;
  started = performance.now() - position * 1000;
  $('play').textContent = 'Pause animation';
};
$('scrub').oninput = () => {
  if (busy) return;
  stop();
  position = Number($('scrub').value) * state.duration;
  timelinePreview = true;
  paint();
};
function tick(now) {
  if (playing && !busy) {
    position = ((now - started) / 1000) % state.duration;
    paint();
  }
  requestAnimationFrame(tick);
}
function coordinates(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) * canvas.width) / r.width,
    y: ((e.clientY - r.top) * canvas.height) / r.height,
  };
}
canvas.addEventListener('pointerdown', (e) => {
  if (busy) return;
  stop();
  position = 0;
  timelinePreview = false;
  const p = coordinates(e),
    l = hitTest(state, p.x, p.y);
  if (!l) {
    selected = '';
    selection($('selection'), state, '');
    return;
  }
  selected = l.id;
  drag = { id: l.id, start: p, x: l.x, y: l.y };
  canvas.setPointerCapture(e.pointerId);
  sync();
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag || busy) return;
  const p = coordinates(e),
    l = state.layers.find((l) => l.id === drag.id);
  if (!l) return;
  l.x = clamp(drag.x + ((p.x - drag.start.x) / canvas.width) * 100, 0, 100);
  l.y = clamp(drag.y + ((p.y - drag.start.y) / canvas.height) * 100, 0, 100);
  sync();
});
for (const event of ['pointerup', 'pointercancel'])
  canvas.addEventListener(event, () => {
    if (drag) {
      drag = null;
      persist();
    }
  });
function download(blob, name) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function png(c) {
  return new Promise((resolve, reject) =>
    c.toBlob(
      (b) => (b ? resolve(b) : reject(Error('PNG export failed.'))),
      'image/png',
    ),
  );
}
async function exporting(fn) {
  if (busy) return;
  stop();
  busy = true;
  sync();
  try {
    await document.fonts.ready;
    const snapshot = validate(clone(state));
    await prepare(snapshot);
    await fn(snapshot);
  } catch (e) {
    say(e.message || 'Export failed. Try again.');
  } finally {
    cancelRecording = null;
    busy = false;
    sync();
  }
}
$('png').onclick = () =>
  exporting(async (snapshot) => {
    const c = document.createElement('canvas');
    render(c, snapshot, 0, { still: true });
    download(await png(c), 'tim-asset-overlay.png');
    say('Transparent PNG ready. Add it as an overlay in your editor.');
  });
function greenVideo(snapshot, c) {
  if (!window.MediaRecorder || !c.captureStream)
    throw Error(
      'Video recording is unavailable. Save a PNG or try another browser.',
    );
  const type = [
    'video/mp4;codecs=avc1.42E01E',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm',
  ].find((t) => MediaRecorder.isTypeSupported(t));
  if (!type) throw Error('No supported recording format. Save a PNG instead.');
  return new Promise((resolve, reject) => {
    let mr,
      stream,
      raf = 0,
      watchdog = 0,
      failure = null,
      done = false;
    const chunks = [];
    const close = () => {
      if (done) return;
      done = true;
      cancelAnimationFrame(raf);
      clearTimeout(watchdog);
      stream?.getTracks().forEach((t) => t.stop());
      cancelRecording = null;
      if (failure) reject(failure);
      else if (!chunks.length)
        reject(Error('The recording was empty. Try again.'));
      else
        resolve(
          new Blob(chunks, { type: (mr.mimeType || type).split(';')[0] }),
        );
    };
    const finish = () => {
      if (mr && mr.state !== 'inactive') mr.stop();
      else close();
    };
    try {
      render(c, snapshot, 0, { green: true });
      stream = c.captureStream(30);
      mr = new MediaRecorder(stream, {
        mimeType: type,
        videoBitsPerSecond: 8e6,
      });
      mr.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      mr.onstop = close;
      mr.onerror = () => {
        failure = Error('Recording was interrupted. Try a shorter animation.');
        finish();
      };
      cancelRecording = () => {
        failure = Error('Recording canceled.');
        finish();
      };
      sync();
      mr.start(250);
      const start = performance.now();
      watchdog = setTimeout(
        () => {
          failure = Error(
            'Recording timed out. Keep the tab visible and try again.',
          );
          finish();
        },
        (snapshot.duration + 15) * 1000,
      );
      const frame = (now) => {
        const t = Math.min(snapshot.duration, (now - start) / 1000);
        render(c, snapshot, t, { green: true });
        say(
          'Recording ' +
            Math.round((t / snapshot.duration) * 100) +
            '% · keep this tab visible',
        );
        if (t < snapshot.duration) raf = requestAnimationFrame(frame);
        else finish();
      };
      raf = requestAnimationFrame(frame);
    } catch (e) {
      failure = e;
      close();
    }
  });
}
$('export').onclick = () =>
  exporting(async (snapshot) => {
    videoBlob = null;
    $('result').hidden = true;
    const c = document.createElement('canvas');
    render(c, snapshot, 0);
    say(
      snapshot.mode === 'transparent'
        ? 'Encoding transparent video…'
        : 'Starting green-screen recording…',
    );
    videoBlob =
      snapshot.mode === 'transparent'
        ? await window.exportAlphaVideo(
            c,
            (t) => render(c, snapshot, t),
            snapshot.duration,
            (p) =>
              say('Encoding transparent video… ' + Math.round(p * 100) + '%'),
          )
        : await greenVideo(snapshot, c);
    videoName =
      'tim-asset-overlay.' + (videoBlob.type.includes('mp4') ? 'mp4' : 'webm');
    if (videoURL) URL.revokeObjectURL(videoURL);
    videoURL = URL.createObjectURL(videoBlob);
    $('videoPreview').src = videoURL;
    $('videoInfo').textContent =
      videoName +
      ' · ' +
      snapshot.duration +
      's · ' +
      (videoBlob.size / 1048576).toFixed(1) +
      ' MB';
    $('result').hidden = false;
    say('Video ready. Save it, then overlay it in your editor.');
  });
$('cancel').onclick = () => cancelRecording?.();
$('saveVideo').onclick = () => videoBlob && download(videoBlob, videoName);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop();
    cancelRecording?.();
  }
});
window.TimProjects.mount({
  tool: 'asset-studio',
  busy: () => busy || playing,
  get: () => ({ scene: clone(state) }),
  set: async (data) => {
    const next = validate(data.scene);
    await prepare(next);
    state = next;
    selected = state.layers.at(-1)?.id || '';
    position = 0;
    timelinePreview = false;
    persist();
    sync();
  },
});
window.__assetStudio = {
  get: () => clone(state),
  render: (c, t = 0) => render(c, state, t),
  ready: () => !busy,
};
busy = true;
sync();
prepare(state)
  .then(() => document.fonts.ready)
  .then(async () => {
    busy = false;
    sync();
    const url = new URL(location.href),
      requested = url.searchParams.get('asset');
    const preset = url.searchParams.get('template');
    if (preset) {
      await applyTemplate(preset);
      url.searchParams.delete('template');
      url.searchParams.delete('asset');
      history.replaceState(null, '', url);
      return;
    }
    if (requested) {
      const item = byId.get(requested);
      if (item) {
        if (await addAsset(item)) {
          url.searchParams.delete('asset');
          history.replaceState(null, '', url);
        }
        return;
      }
      say('That library asset was not found. Choose a graphic below.');
    }
  })
  .catch((e) => {
    busy = false;
    sync();
    say(e.message);
  });
requestAnimationFrame(tick);
