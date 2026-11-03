import { create, validate, dimensions, LAYERS, PRESETS } from './model.mjs';
import { render } from './render.mjs';
import { soundtrack } from './audio.mjs';
import { encodeWav, download } from '../shared/sound/wav.mjs';
const $ = (id) => document.getElementById(id),
  cv = $('preview'),
  ctx = cv.getContext('2d');
const KEY = 'tim-brand-assets-v1';
let state = create(),
  time = 0,
  playing = false,
  recording = false,
  working = false,
  videoMode = false,
  start = 0,
  raf = 0,
  recorder,
  source,
  audio,
  resultUrl;
let undo = [],
  redo = [];
const clone = (v) => structuredClone(v);
try {
  const saved = localStorage.getItem(KEY);
  if (saved) state = validate(JSON.parse(saved));
} catch {}
const requested = new URLSearchParams(location.search).get('template');
if (PRESETS[requested]) {
  state = create(requested);
  const url = new URL(location.href);
  url.searchParams.delete('template');
  history.replaceState(null, '', url);
}
// Canvas text needs its faces loaded up front; document.fonts.ready does not
// fetch faces the page never uses directly.
async function loadFonts() {
  await Promise.all([
    document.fonts.load('900 100px "Barlow Condensed"'),
    document.fonts.load('700 100px "Barlow Condensed"'),
    document.fonts.load('italic 700 100px "Barlow Condensed"'),
  ]);
}
function status(message) {
  $('status').textContent = message;
}
function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    status(
      'Browser storage is unavailable. Export project JSON to keep your edits.',
    );
  }
}
function paint() {
  const [w, h] = dimensions(state);
  if (cv.width !== w || cv.height !== h) {
    cv.width = w;
    cv.height = h;
  }
  render(ctx, state, {
    time,
    video: videoMode,
    guides: !recording && $('guides').checked,
  });
  $('time').value = time;
}
function sync() {
  document
    .querySelectorAll('[data-setting]')
    .forEach((el) => (el.value = state[el.id]));
  $('preset').value = state.preset;
  LAYERS.forEach((k) => ($('layer-' + k).checked = state.layers[k]));
  const banner = state.preset === 'banner';
  $('storyText').hidden = banner;
  $('safeNote').textContent = banner
    ? 'Dashed box: 1546 × 423 center safe area. The wordmark stays inside it.'
    : 'Text guides leave 250 px at the top and 400 px at the bottom clear. Footer watermark sits at 40 px left inset with 65% opacity in video.';
  $('size').textContent =
    dimensions(state).join(' × ') +
    ' px · PNG uses the full design; video uses the timeline.';
  $('time').max = state.duration;
  $('undo').disabled = !undo.length;
  $('redo').disabled = !redo.length;
  paint();
}
function remember() {
  undo.push(clone(state));
  if (undo.length > 40) undo.shift();
  redo = [];
}
function stop() {
  playing = false;
  cancelAnimationFrame(raf);
  if (source) {
    try {
      source.stop();
    } catch {}
    source = null;
  }
  closeAudio();
  $('play').textContent = 'Play motion';
}
async function closeAudio() {
  if (audio) {
    const old = audio;
    audio = null;
    await old.close().catch(() => {});
  }
}
function lock(value) {
  working = value;
  document
    .querySelectorAll(
      '#controls input,#controls select,#controls textarea,#controls button,.stage button,.stage input',
    )
    .forEach((el) => (el.disabled = value));
  $('cancel').hidden = !recording;
  $('cancel').disabled = false;
  if (!value) {
    $('undo').disabled = !undo.length;
    $('redo').disabled = !redo.length;
  }
}
async function guarded(fn) {
  if (working || recording) return;
  stop();
  lock(true);
  try {
    await fn();
  } catch (e) {
    status(e.message || 'Could not complete export.');
  } finally {
    lock(false);
    paint();
  }
}
LAYERS.forEach((k) => {
  const label = document.createElement('label'),
    input = document.createElement('input');
  input.type = 'checkbox';
  input.id = 'layer-' + k;
  input.onchange = () => {
    stop();
    remember();
    state.layers[k] = input.checked;
    save();
    sync();
  };
  label.append(
    input,
    ' ' + ({ footer: 'Handle / footer', border: 'Top wave border' }[k] || k),
  );
  $('layers').append(label);
});
document.querySelectorAll('[data-setting]').forEach((el) =>
  el.addEventListener('change', () => {
    stop();
    const next = clone(state);
    next[el.id] =
      el.type === 'range' || el.type === 'number' ? Number(el.value) : el.value;
    try {
      const checked = validate(next);
      remember();
      state = checked;
      time = Math.min(time, state.duration);
      save();
      sync();
    } catch (e) {
      status(e.message);
      sync();
    }
  }),
);
$('apply').onclick = () => {
  stop();
  remember();
  state = create($('preset').value);
  time = 0;
  videoMode = false;
  save();
  sync();
  status('Template applied. All words and graphics remain editable.');
};
$('undo').onclick = () => {
  stop();
  redo.push(clone(state));
  state = undo.pop();
  time = 0;
  save();
  sync();
};
$('redo').onclick = () => {
  stop();
  undo.push(clone(state));
  state = redo.pop();
  time = 0;
  save();
  sync();
};
$('guides').onchange = paint;
$('still').onclick = () => {
  stop();
  videoMode = false;
  time = 0;
  paint();
};
$('time').oninput = () => {
  stop();
  videoMode = true;
  time = Number($('time').value);
  paint();
};
function animate(now) {
  if (!playing) return;
  time = ((now - start) / 1000) % state.duration;
  paint();
  raf = requestAnimationFrame(animate);
}
$('play').onclick = () => {
  if (playing) {
    stop();
    return;
  }
  return guarded(async () => {
    videoMode = true;
    time = 0;
    if (state.sound !== 'none') {
      audio = new AudioContext();
      await audio.resume();
      const buffer = await soundtrack(state);
      source = audio.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(audio.destination);
      source.start();
    }
    start = performance.now();
    playing = true;
    $('play').textContent = 'Stop motion';
    raf = requestAnimationFrame(animate);
  });
};
$('png').onclick = () =>
  guarded(async () => {
    await loadFonts();
    const out = document.createElement('canvas');
    [out.width, out.height] = dimensions(state);
    render(out.getContext('2d'), state);
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    if (!blob) throw Error('PNG export failed.');
    download(blob, `tim-${state.preset}.png`, 'image/png');
    status('PNG saved at ' + dimensions(state).join(' × ') + '.');
  });
$('audition').onclick = () =>
  guarded(async () => {
    await closeAudio();
    audio = new AudioContext();
    await audio.resume();
    const current = audio,
      buffer = await soundtrack(state);
    source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(audio.destination);
    source.onended = () => {
      if (audio === current) closeAudio();
    };
    source.start();
    status(
      state.sound === 'none'
        ? 'Silent selected.'
        : 'Playing ' + state.sound + '.',
    );
  });
$('wav').onclick = () =>
  guarded(async () => {
    const buffer = await soundtrack(state);
    download(
      encodeWav(buffer),
      `tim-${state.preset}-${state.sound}.wav`,
      'audio/wav',
    );
    status('WAV saved.');
  });
$('record').onclick = () =>
  guarded(async () => {
    if (!cv.captureStream || !globalThis.MediaRecorder)
      throw Error(
        'Video export is unavailable in this browser. Use Chrome or Edge, or save a PNG.',
      );
    await closeAudio();
    const mime = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm',
      'video/mp4',
    ].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime)
      throw Error(
        'No supported recording format. Save PNG or try Chrome / Edge.',
      );
    await loadFonts();
    let stream,
      frame,
      wasCancelled = false;
    try {
      let buffer;
      if (state.sound !== 'none') {
        audio = new AudioContext();
        await audio.resume();
        buffer = await soundtrack(state);
      }
      recording = true;
      lock(true);
      time = 0;
      videoMode = true;
      paint();
      stream = cv.captureStream(30);
      if (buffer) {
        const dest = audio.createMediaStreamDestination();
        source = audio.createBufferSource();
        source.buffer = buffer;
        source.connect(dest);
        dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      }
      recorder = new MediaRecorder(stream, {
        mimeType: mime,
        videoBitsPerSecond: 12000000,
      });
      const chunks = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      const ended = new Promise((resolve, reject) => {
        recorder.onstop = resolve;
        recorder.onerror = () =>
          reject(Error('Recording failed. Please try again.'));
      });
      $('cancel').onclick = () => {
        wasCancelled = true;
        if (recorder.state !== 'inactive') recorder.stop();
      };
      recorder.start();
      if (source) source.start();
      const began = performance.now();
      function tick(now) {
        if (recorder.state === 'inactive') return;
        time = Math.min(state.duration, (now - began) / 1000);
        paint();
        status(
          'Recording ' + time.toFixed(1) + ' / ' + state.duration + ' seconds…',
        );
        if (time < state.duration) frame = requestAnimationFrame(tick);
        else recorder.stop();
      }
      frame = requestAnimationFrame(tick);
      await ended;
      if (wasCancelled) {
        status('Recording cancelled.');
        return;
      }
      const blob = new Blob(chunks, { type: mime });
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = URL.createObjectURL(blob);
      $('result').src = resultUrl;
      $('result').hidden = false;
      download(
        blob,
        `tim-${state.preset}.${mime.startsWith('video/mp4') ? 'mp4' : 'webm'}`,
        mime,
      );
      status(
        'Video saved' + (buffer ? ' with ' + state.sound : ' (silent)') + '.',
      );
    } finally {
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
      recording = false;
      recorder = null;
      await closeAudio();
      $('cancel').hidden = true;
    }
  });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    stop();
    closeAudio();
    if (recorder?.state === 'recording') $('cancel').click();
  }
});
window.TimPublishingEditor = Object.freeze({
  isBusy: () => recording || working,
  pausePreview: () => {
    if (!recording && !working) stop();
  },
});
window.TimProjects.mount({
  tool: 'brand-assets',
  busy: () => recording || working || playing,
  get: () => ({ state: clone(state) }),
  set: async (data) => {
    const next = validate(data.state);
    stop();
    remember();
    state = next;
    time = 0;
    videoMode = false;
    save();
    sync();
  },
});
window.__brandAssets = {
  get: () => clone(state),
  ready: () => document.fonts.status === 'loaded',
};
sync();
save();
await loadFonts();
paint();
