import { render, presets, templates, metric } from './render.mjs';
import { duration, atTime } from './model.mjs';
const $ = (id) => document.getElementById(id),
  canvas = $('canvas');
let activity = null,
  progress = 1,
  playing = false,
  recording = false,
  started = 0,
  request = 0,
  worker = null,
  timeout = null,
  videoBlob = null,
  videoName = '',
  cancelRecording = null,
  loadId = 0,
  importing = false;
const numeric = [
  'fontSize',
  'thickness',
  'rotation',
  'scale',
  'opacity',
  'x',
  'y',
  'trim',
  'lapPage',
];
const checks = ['transparent', 'showRoute', 'markers', 'showMetrics'];
const settings = {
  preset: 'cyber',
  ...presets.cyber,
  template: 'summary',
  title: '',
  caption: '',
  font: 'brand',
  fontSize: 1,
  thickness: 8,
  rotation: 0,
  scale: 1,
  opacity: 1,
  x: 0,
  y: 0,
  trim: 0,
  lapPage: 0,
  transparent: false,
  showRoute: true,
  markers: true,
  showMetrics: true,
  imperial: false,
  metrics: ['distance', 'moving', 'pace', 'ascent'],
};
function say(id, message, error = false) {
  $(id).textContent = message;
  $(id).classList.toggle('error', error);
}
function paint(animated = playing || recording || progress < 1) {
  render(canvas, activity, settings, progress, animated);
  $('scrub').value = progress;
  const p = activity && atTime(activity, progress);
  $('time').textContent = p ? duration(p.elapsedS) : 'End';
}
function stop() {
  playing = false;
  cancelAnimationFrame(request);
  $('play').textContent = 'Play';
}
function animationProgress(p) {
  return $('style').value === 'ease' ? p * p * (3 - 2 * p) : p;
}
function linearProgress(p) {
  if ($('style').value !== 'ease') return p;
  let lo = 0,
    hi = 1;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (animationProgress(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
function frame(now) {
  const t = Math.min(
    1,
    (now - started) /
      (Math.max(3, Math.min(60, +$('seconds').value || 12)) * 1000),
  );
  progress = animationProgress(t);
  paint(true);
  if (t < 1 && playing) request = requestAnimationFrame(frame);
  else stop();
}
$('play').onclick = () => {
  if (playing) {
    stop();
    return;
  }
  playing = true;
  $('play').textContent = 'Pause';
  started =
    performance.now() -
    (progress >= 1 ? 0 : linearProgress(progress)) *
      Math.max(3, +$('seconds').value || 12) *
      1000;
  request = requestAnimationFrame(frame);
};
$('scrub').oninput = () => {
  stop();
  progress = +$('scrub').value;
  paint(true);
};
function configure() {
  $('editor').disabled = false;
  $('playback').disabled = false;
  $('title').value = activity.metadata.name;
  settings.title = activity.metadata.name;
  for (const option of $('template').options) {
    const req = templates[option.value].requires;
    option.disabled =
      !!req &&
      (req === 'laps'
        ? !activity.laps.some((l) => l.distance > 0 && l.duration > 0)
        : !activity.availability[req]);
  }
  if ($('template').selectedOptions[0].disabled) {
    $('template').value = 'summary';
    settings.template = 'summary';
  }
  $('metrics').replaceChildren();
  for (const key of [
    'distance',
    'moving',
    'elapsed',
    'pace',
    'heartRate',
    'maxHeartRate',
    'ascent',
    'cadence',
    'power',
  ]) {
    const label = document.createElement('label');
    label.className = 'toggle';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = key;
    input.checked = settings.metrics.includes(key);
    input.disabled = activity.summary[key] == null;
    input.onchange = () => {
      settings.metrics = Array.from(
        $('metrics').querySelectorAll('input:checked:not(:disabled)'),
      ).map((e) => e.value);
      paint();
    };
    label.append(
      input,
      document.createTextNode(metric(activity, key, settings)[0].toLowerCase()),
    );
    $('metrics').append(label);
  }
  $('lapPage').replaceChildren();
  for (
    let i = 0;
    i <
    Math.ceil(
      activity.laps.filter((l) => l.distance > 0 && l.duration > 0).length / 8,
    );
    i++
  ) {
    const o = document.createElement('option');
    o.value = i;
    o.textContent = `Laps ${i * 8 + 1}–${Math.min((i + 1) * 8, activity.laps.length)}`;
    $('lapPage').append(o);
  }
  settings.lapPage = 0;
  updateSummary();
  progress = 1;
  paint(false);
  videoBlob = null;
  $('saveVideo').hidden = true;
  say('exportStatus', '');
  $('play').disabled = !activity.availability.timeline;
  $('scrub').disabled = !activity.availability.timeline;
  $('video').disabled = !activity.availability.timeline;
  say(
    'previewNote',
    activity.warnings.join(' ') ||
      'Your activity is ready. Customize the graphic and export.',
  );
  $('lapControl').hidden = settings.template !== 'splits';
}
function updateSummary() {
  const el = $('summary');
  el.replaceChildren();
  for (const key of ['distance', 'moving', 'elapsed', 'pace']) {
    const [name, value] = metric(activity, key, settings),
      d = document.createElement('div'),
      b = document.createElement('b');
    b.textContent = value;
    d.append(document.createTextNode(name.toLowerCase()), b);
    el.append(d);
  }
  say(
    'sources',
    `Moving time: ${activity.provenance.moving}. Elevation gain: ${activity.provenance.ascent}. ${activity.points.length.toLocaleString()} records · ${activity.metadata.format.toUpperCase()}.`,
  );
}
async function load(file) {
  if (recording) return;
  const format = file.name.split('.').pop().toLowerCase();
  if (!['fit', 'gpx', 'tcx'].includes(format)) {
    say('importStatus', 'Choose a .FIT, .GPX or .TCX export.', true);
    return;
  }
  if (file.size > 40 * 1024 * 1024) {
    say(
      'importStatus',
      'This file exceeds the 40 MB import limit. Export a single activity or reduce its recording detail.',
      true,
    );
    return;
  }
  stop();
  worker?.terminate();
  clearTimeout(timeout);
  say('importStatus', `Reading ${file.name} locally…`);
  const id = ++loadId;
  importing = true;
  $('video').disabled = true;
  const done = () => {
    importing = false;
    $('video').disabled = !activity?.availability.timeline;
  };
  try {
    const buffer = await file.arrayBuffer();
    if (id !== loadId) return;
    worker = new Worker(new URL('./worker.js', import.meta.url));
    timeout = setTimeout(() => {
      worker?.terminate();
      done();
      say(
        'importStatus',
        'Import exceeded 90 seconds. Try a smaller single-activity export.',
        true,
      );
    }, 90000);
    worker.onmessage = ({ data }) => {
      if (id !== loadId) return;
      clearTimeout(timeout);
      worker.terminate();
      worker = null;
      done();
      if (data.error) {
        say('importStatus', data.error, true);
        return;
      }
      activity = data.activity;
      configure();
      say('importStatus', `Loaded ${file.name}. No data was uploaded.`);
    };
    worker.onerror = () => {
      clearTimeout(timeout);
      worker?.terminate();
      done();
      say(
        'importStatus',
        'The parser could not start. Serve this page over HTTP and check that worker.js is available.',
        true,
      );
    };
    worker.postMessage({ buffer, format }, [buffer]);
  } catch (e) {
    if (id === loadId) {
      done();
      say('importStatus', 'Unable to read the file: ' + e.message, true);
    }
  }
}
$('file').onchange = (e) => {
  if (e.target.files[0]) load(e.target.files[0]);
};
for (const name of ['dragenter', 'dragover'])
  $('drop').addEventListener(name, (e) => {
    e.preventDefault();
    $('drop').classList.add('over');
  });
for (const name of ['dragleave', 'drop'])
  $('drop').addEventListener(name, (e) => {
    e.preventDefault();
    $('drop').classList.remove('over');
    if (name === 'drop' && e.dataTransfer.files[0])
      load(e.dataTransfer.files[0]);
  });
$('editor').addEventListener('input', (e) => {
  const id = e.target.id;
  if (!id) return;
  if (id === 'size') {
    [canvas.width, canvas.height] = e.target.value.split(',').map(Number);
    $('dimensions').textContent = `${canvas.width} × ${canvas.height}`;
  } else if (id === 'units') {
    settings.imperial = e.target.value === 'imperial';
    updateSummary();
  } else if (id === 'preset') {
    Object.assign(settings, presets[e.target.value]);
    settings.preset = e.target.value;
    for (const k of ['background', 'text', 'accent', 'route'])
      $(k).value = settings[k];
  } else if (numeric.includes(id))
    settings[id] = Math.max(
      id === 'trim' ? 0 : -Infinity,
      Number(e.target.value) || 0,
    );
  else if (checks.includes(id)) settings[id] = e.target.checked;
  else if (id in settings) settings[id] = e.target.value;
  $('lapControl').hidden = settings.template !== 'splits';
  paint();
});
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  if (!activity || recording) return;
  const r = canvas.getBoundingClientRect();
  drag = {
    px: e.clientX,
    py: e.clientY,
    x: settings.x,
    y: settings.y,
    w: r.width,
    h: r.height,
  };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  for (const [k, v] of [
    ['x', drag.x + ((e.clientX - drag.px) / drag.w) * 100],
    ['y', drag.y + ((e.clientY - drag.py) / drag.h) * 100],
  ]) {
    settings[k] = Math.max(-25, Math.min(25, v));
    $(k).value = settings[k];
  }
  paint();
});
for (const name of ['pointerup', 'pointercancel'])
  canvas.addEventListener(name, () => (drag = null));
async function save(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (e) {
      if (e.name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
$('png').onclick = async () => {
  stop();
  await document.fonts.ready;
  paint();
  canvas.toBlob(async (blob) => {
    if (!blob) {
      say('exportStatus', 'PNG export failed. Try a smaller canvas.', true);
      return;
    }
    try {
      await save(blob, 'tim-activity.png');
      say(
        'exportStatus',
        `PNG ready · ${canvas.width} × ${canvas.height}${settings.transparent ? ' · transparent' : ''}.`,
      );
    } catch (e) {
      say('exportStatus', e.message, true);
    }
  }, 'image/png');
};
function pickType() {
  if (!window.MediaRecorder) return null;
  return (
    [
      'video/mp4;codecs=avc1.42E01E',
      'video/mp4',
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
    ].find((t) => MediaRecorder.isTypeSupported(t)) || null
  );
}
function lock(value) {
  $('editor').disabled = value;
  $('file').disabled = value;
  for (const id of ['play', 'scrub', 'png', 'video', 'seconds', 'style'])
    $(id).disabled = value;
  recording = value;
  $('cancel').hidden = !value;
  $('progress').hidden = !value;
}
$('video').onclick = async () => {
  if (importing || recording) return;
  const type = pickType();
  if (!type || !canvas.captureStream) {
    say(
      'exportStatus',
      'Canvas video recording is unavailable in this browser. PNG export is still available.',
      true,
    );
    return;
  }
  stop();
  await document.fonts.ready;
  videoBlob = null;
  $('saveVideo').hidden = true;
  const durationS = Math.max(3, Math.min(60, +$('seconds').value || 12));
  $('seconds').value = durationS;
  const originalTransparent = settings.transparent;
  settings.transparent = false;
  progress = 0;
  paint(true);
  let stream, mr;
  try {
    stream = canvas.captureStream(30);
    mr = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: 8e6 });
  } catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    settings.transparent = originalTransparent;
    paint();
    say('exportStatus', 'Recording could not start: ' + e.message, true);
    return;
  }
  lock(true);
  let chunks = [],
    bytes = 0,
    canceled = false,
    raf = 0,
    watchdog;
  const finish = () => {
    cancelAnimationFrame(raf);
    clearTimeout(watchdog);
    if (mr.state !== 'inactive') mr.stop();
  };
  cancelRecording = () => {
    canceled = true;
    finish();
  };
  mr.ondataavailable = (e) => {
    if (e.data.size) {
      bytes += e.data.size;
      if (bytes > 128 * 1024 * 1024) {
        canceled = true;
        finish();
      } else chunks.push(e.data);
    }
  };
  mr.onerror = () => {
    canceled = true;
    finish();
  };
  mr.onstop = () => {
    stream.getTracks().forEach((t) => t.stop());
    lock(false);
    settings.transparent = originalTransparent;
    progress = 1;
    paint(false);
    cancelRecording = null;
    chunks = canceled ? [] : chunks;
    if (canceled) {
      say(
        'exportStatus',
        'Recording canceled or interrupted. Keep the tab visible and try a shorter export.',
        true,
      );
      return;
    }
    const mime = (mr.mimeType || type).split(';')[0];
    videoBlob = new Blob(chunks, { type: mime });
    videoName = 'tim-activity.' + (mime.includes('mp4') ? 'mp4' : 'webm');
    $('saveVideo').hidden = false;
    say(
      'exportStatus',
      `${videoName} ready · ${(videoBlob.size / 1048576).toFixed(1)} MB. Tap Save video to download or share.`,
    );
  };
  mr.start(1000);
  const start = performance.now();
  watchdog = setTimeout(
    () => {
      canceled = true;
      finish();
    },
    (durationS + 15) * 1000,
  );
  const tick = (now) => {
    const t = Math.min(1, (now - start) / (durationS * 1000));
    progress = animationProgress(t);
    paint(true);
    $('progress').value = t;
    say(
      'exportStatus',
      `Recording ${Math.round(t * 100)}% · keep this tab visible`,
    );
    if (t < 1) raf = requestAnimationFrame(tick);
    else finish();
  };
  raf = requestAnimationFrame(tick);
};
$('cancel').onclick = () => cancelRecording?.();
$('saveVideo').onclick = () => videoBlob && save(videoBlob, videoName);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop();
    if (recording) cancelRecording?.();
  }
});
document.fonts.ready.then(() => paint());
paint();

window.TimProjects.mount({
  tool: 'activity-studio',
  preset: true,
  busy: () => recording || playing || importing,
  get: () => ({
    settings,
    size: $('size').value,
    seconds: $('seconds').value,
    style: $('style').value,
  }),
  set: async (data) => {
    const next = window.TimProjects.checkState(data.settings, settings);
    for (const id of ['size', 'seconds', 'style']) {
      const el = $(id);
      if (
        el.tagName === 'SELECT' &&
        ![...el.options].some((o) => o.value === data[id])
      )
        throw Error('Invalid export setting.');
      if (
        id === 'seconds' &&
        !(Number(data[id]) >= 3 && Number(data[id]) <= 60)
      )
        throw Error('Invalid duration.');
    }
    if (
      !['brand', 'sans', 'serif', 'mono'].includes(next.font) ||
      !presets[next.preset] ||
      !templates[next.template]
    )
      throw Error('Invalid design preset.');
    Object.assign(settings, next);
    for (const [id, value] of Object.entries(settings)) {
      const el = $(id);
      if (!el || id === 'metrics') continue;
      if (el.type === 'checkbox') el.checked = value;
      else el.value = value;
    }
    $('units').value = settings.imperial ? 'imperial' : 'metric';
    for (const id of ['size', 'seconds', 'style']) $(id).value = data[id];
    [canvas.width, canvas.height] = data.size.split(',').map(Number);
    $('dimensions').textContent = canvas.width + ' × ' + canvas.height;
    if (activity) {
      const saved = structuredClone(settings);
      configure();
      saved.template = settings.template;
      Object.assign(settings, saved);
      $('title').value = settings.title;
      for (const el of $('metrics').querySelectorAll('input'))
        el.checked = settings.metrics.includes(el.value);
      $('lapPage').value = settings.lapPage;
      updateSummary();
    }
    paint();
  },
});
