const $ = (id) => document.getElementById(id);
const canvas = $('canvas'),
  ctx = canvas.getContext('2d');
let playing = !matchMedia('(prefers-reduced-motion: reduce)').matches,
  position = 0,
  previous = 0,
  recording = false;
const duration = () => Number($('duration').value);
const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
function linesFor(text, width, fontSize) {
  ctx.font = `900 ${fontSize}px "Barlow Condensed", "Arial Narrow", Arial`;
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const char of paragraph) {
      if (ctx.measureText(line + char).width > width && line) {
        lines.push(line);
        line = '';
      }
      line += char;
    }
    lines.push(line);
  }
  return lines;
}
function draw(t) {
  const w = canvas.width,
    h = canvas.height,
    unit = Math.min(w, h) / 1080;
  ctx.globalAlpha = 1;
  ctx.fillStyle = $('background').value;
  ctx.fillRect(0, 0, w, h);
  let size = Number($('size').value) * unit;
  let lines = linesFor($('headline').value, w * 0.82, size);
  while (lines.length * size * 1.06 > h * 0.55 && size > 10) {
    size *= 0.92;
    lines = linesFor($('headline').value, w * 0.82, size);
  }
  const enter = ease(t / 0.85),
    exit = ease((duration() - t) / 0.5),
    alpha = Math.min(enter, exit);
  ctx.save();
  ctx.translate(w / 2, h / 2);
  ctx.globalAlpha = exit;
  const effect = $('effect').value;
  if (effect === 'rise') {
    ctx.translate(0, (1 - enter) * 100 * unit);
    ctx.globalAlpha = alpha;
  }
  if (effect === 'slide') {
    ctx.translate((enter - 1) * w * 0.6, 0);
    ctx.globalAlpha = alpha;
  }
  if (effect === 'pop') {
    const scale =
      0.7 + 0.3 * enter + Math.sin(Math.min(1, t / 0.85) * Math.PI) * 0.09;
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = $('accent').value;
  ctx.fillRect(
    -32 * unit,
    -lines.length * size * 0.53 - 60 * unit,
    64 * unit * enter,
    6 * unit,
  );
  ctx.fillStyle = $('ink').value;
  ctx.font = `900 ${size}px "Barlow Condensed", "Arial Narrow", Arial`;
  let remaining = Math.floor(
    Math.min(1, t / 1.25) * $('headline').value.length,
  );
  lines.forEach((line, i) => {
    const shown =
      effect === 'type' ? line.slice(0, Math.max(0, remaining)) : line;
    remaining -= line.length;
    ctx.fillText(shown, 0, (i - (lines.length - 1) / 2) * size * 1.06);
  });
  ctx.globalAlpha = alpha;
  ctx.fillStyle = $('accent').value;
  ctx.font = `600 ${28 * unit}px Barlow, Arial`;
  ctx.fillText(
    $('caption').value,
    0,
    lines.length * size * 0.53 + 60 * unit,
    w * 0.82,
  );
  ctx.restore();
  $('scrub').value = Math.round((t / duration()) * 1000);
  $('time').value = `${t.toFixed(1)} / ${duration().toFixed(1)}s`;
}
function sync() {
  const dimensions = {
    landscape: [1920, 1080],
    portrait: [1080, 1920],
    square: [1080, 1080],
  }[$('format').value];
  [canvas.width, canvas.height] = dimensions;
  $('dimensions').textContent = dimensions.join(' × ');
  position = 0;
  draw(0);
}
function playLabel() {
  $('play').textContent = playing ? 'Pause' : 'Play';
}
$('controls').addEventListener('submit', (e) => e.preventDefault());
$('controls').addEventListener('input', sync);
$('play').onclick = () => {
  playing = !playing;
  playLabel();
};
$('replay').onclick = () => {
  position = 0;
  playing = true;
  playLabel();
  draw(0);
};
$('scrub').oninput = () => {
  playing = false;
  position = (Number($('scrub').value) / 1000) * duration();
  playLabel();
  draw(position);
};
function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
$('png').onclick = () =>
  canvas.toBlob((blob) => {
    if (blob) download(blob, 'tim-text-motion.png');
  });
$('video').onclick = async () => {
  if (!window.MediaRecorder || !canvas.captureStream) {
    $('status').textContent =
      'Video export is unavailable in this browser. You can still save a PNG frame.';
    return;
  }
  const mime = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ].find((type) => MediaRecorder.isTypeSupported(type));
  if (!mime) {
    $('status').textContent =
      'No supported video format. Try Chrome or Edge, or save a PNG.';
    return;
  }
  await document.fonts.ready;
  const stream = canvas.captureStream(30),
    chunks = [];
  const wasPlaying = playing;
  playing = false;
  recording = true;
  document
    .querySelectorAll('button,input,select,textarea')
    .forEach((el) => (el.disabled = true));
  let recorder;
  const finish = (message) => {
    recording = false;
    playing = wasPlaying;
    previous = 0;
    stream.getTracks().forEach((track) => track.stop());
    document
      .querySelectorAll('button,input,select,textarea')
      .forEach((el) => (el.disabled = false));
    $('status').textContent = message;
    playLabel();
  };
  try {
    recorder = new MediaRecorder(stream, {
      mimeType: mime,
      videoBitsPerSecond: 8000000,
    });
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => {
      if (chunks.length) {
        download(
          new Blob(chunks, { type: mime }),
          `tim-text-motion.${mime.includes('mp4') ? 'mp4' : 'webm'}`,
        );
        finish('Video ready. Your download has started.');
      } else finish('Could not export video. Try again.');
    };
    recorder.onerror = () => finish('Could not export video. Try again.');
    draw(0);
    recorder.start();
    const start = performance.now();
    function record(now) {
      if (!recording) return;
      const t = Math.min(duration(), (now - start) / 1000);
      draw(t);
      $('status').textContent =
        `Exporting… ${Math.round((t / duration()) * 100)}%`;
      if (t < duration()) requestAnimationFrame(record);
      else recorder.stop();
    }
    requestAnimationFrame(record);
  } catch {
    finish('Could not start video export. Try another browser or save a PNG.');
  }
};
function tick(now) {
  if (previous && playing && !recording)
    position = (position + (now - previous) / 1000) % duration();
  previous = now;
  if (!recording) draw(position);
  requestAnimationFrame(tick);
}
sync();
playLabel();
document.fonts.ready.then(() => draw(position));
requestAnimationFrame(tick);
