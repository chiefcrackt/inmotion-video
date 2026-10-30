const $ = (id) => document.getElementById(id);
const canvas = $('canvas'),
  output = canvas.getContext('2d'),
  layer = document.createElement('canvas'),
  bands = document.createElement('canvas'),
  tint = document.createElement('canvas'),
  ctx = layer.getContext('2d');
const fields = [
  ...document.querySelectorAll(
    '#controls input, #controls select, #controls textarea',
  ),
];
const defaults = Object.fromEntries(
  fields.map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value]),
);
try {
  const saved = JSON.parse(
    localStorage.getItem('tim-text-motion-v1') || 'null',
  );
  if (saved)
    for (const el of fields) {
      const value = saved[el.id];
      if (el.type === 'checkbox') el.checked = value === true;
      else if (
        typeof value === 'string' &&
        (el.tagName !== 'SELECT' ||
          [...el.options].some((o) => o.value === value))
      )
        el.value = value;
    }
} catch {
  /* Storage is optional. */
}
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
  ctx.clearRect(0, 0, w, h);
  let size = Number($('size').value) * unit;
  let lines = linesFor($('headline').value, w * 0.82, size);
  while (lines.length * size * 1.06 > h * 0.55 && size > 10) {
    size *= 0.92;
    lines = linesFor($('headline').value, w * 0.82, size);
  }
  const speed = Number($('speed').value);
  const enter = ease(t / (0.85 * speed)),
    exit = ease((duration() - t) / 0.5),
    alpha = Math.min(enter, exit);
  ctx.save();
  const align = $('align').value;
  const anchor =
    align === 'left' ? w * 0.09 : align === 'right' ? w * 0.91 : w / 2;
  const blockHalf = lines.length * size * 0.53 + 110 * unit;
  const desiredY = { top: h * 0.3, center: h / 2, bottom: h * 0.7 }[
    $('placement').value
  ];
  ctx.translate(anchor, Math.max(blockHalf, Math.min(h - blockHalf, desiredY)));
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
      0.7 +
      0.3 * enter +
      Math.sin(Math.min(1, t / (0.85 * speed)) * Math.PI) * 0.09;
    ctx.scale(scale, scale);
    ctx.globalAlpha = alpha;
  }
  if (effect === 'fade') ctx.globalAlpha = alpha;
  if (effect === 'wipe') {
    ctx.beginPath();
    ctx.rect(w * 0.09 - anchor, -h, w * 0.82 * enter, h * 2);
    ctx.clip();
  }
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = $('accent').value;
  ctx.fillRect(
    align === 'left' ? 0 : align === 'right' ? -64 * unit : -32 * unit,
    -lines.length * size * 0.53 - 60 * unit,
    64 * unit * enter,
    6 * unit,
  );
  ctx.fillStyle = $('ink').value;
  ctx.font = `900 ${size}px "Barlow Condensed", "Arial Narrow", Arial`;
  let remaining = Math.floor(
    Math.min(1, t / (1.25 * speed)) * lines.join('').length,
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
  output.clearRect(0, 0, w, h);
  if (!$('transparent').checked) {
    output.fillStyle = $('background').value;
    output.fillRect(0, 0, w, h);
  }
  composite(t, unit);
  $('scrub').value = Math.round((t / duration()) * 1000);
  $('time').value = `${t.toFixed(1)} / ${duration().toFixed(1)}s`;
}
// The same visual language as Title Maker: displaced bands and teal/gold splits.
// A seeded generator keeps scrubbing, preview and exported frames consistent.
function composite(t, unit) {
  const timing = $('glitchTiming').value;
  const intro = Math.max(0, 1 - t / (0.65 * Number($('speed').value)));
  const outro = Math.max(0, 1 - (duration() - t) / 0.45);
  const burst = t % 1.1 < 0.16 ? 0.75 : 0;
  const k = $('glitch').checked
    ? (Number($('glitchStrength').value) / 100) *
      (timing === 'intro'
        ? intro
        : timing === 'edges'
          ? Math.max(intro, outro)
          : Math.max(intro, burst))
    : 0;
  if (k < 0.01) {
    output.drawImage(layer, 0, 0);
    return;
  }
  let seed = Math.floor(t * 30) * 7 + 3;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const bx = bands.getContext('2d'),
    tx = tint.getContext('2d');
  const w = canvas.width,
    h = canvas.height;
  bx.clearRect(0, 0, w, h);
  for (let y = 0; y < h;) {
    const height = Math.min(
      h - y,
      Math.max(4, Math.floor(random() * h * 0.07)),
    );
    const dx = random() < 0.35 * k + 0.05 ? (random() - 0.5) * w * 0.12 * k : 0;
    bx.drawImage(layer, 0, y, w, height, dx, y, w, height);
    y += height;
  }
  for (const [color, offset] of [
    ['#2e9bad', -18],
    ['#e8c96a', 18],
  ]) {
    tx.globalCompositeOperation = 'source-over';
    tx.clearRect(0, 0, w, h);
    tx.drawImage(bands, 0, 0);
    tx.globalCompositeOperation = 'source-in';
    tx.fillStyle = color;
    tx.fillRect(0, 0, w, h);
    output.save();
    output.globalAlpha = 0.85;
    output.drawImage(tint, offset * k * unit, 0);
    output.restore();
  }
  output.drawImage(bands, 0, 0);
}
function sync() {
  const transparent = $('transparent').checked;
  canvas.classList.toggle('transparent', transparent);
  $('sequence').hidden = !transparent;
  $('video').disabled = false;
  $('background').disabled = transparent;
  $('status').textContent = transparent
    ? 'Transparent output: download an alpha WebM video, PNG frame, or PNG-sequence ZIP (30 fps).'
    : 'Video exports include the background. No audio. Your draft saves automatically on this device.';
  const dimensions = {
    landscape: [1920, 1080],
    portrait: [1080, 1920],
    square: [1080, 1080],
  }[$('format').value];
  [canvas.width, canvas.height] = dimensions;
  for (const buffer of [layer, bands, tint])
    [buffer.width, buffer.height] = dimensions;
  $('dimensions').textContent = dimensions.join(' × ');
  position = Math.min(position, duration());
  draw(position);
}
function playLabel() {
  $('play').textContent = playing ? 'Pause' : 'Play';
}
$('controls').addEventListener('submit', (e) => e.preventDefault());
$('controls').addEventListener('input', () => {
  sync();
  try {
    localStorage.setItem(
      'tim-text-motion-v1',
      JSON.stringify(
        Object.fromEntries(
          fields.map((el) => [
            el.id,
            el.type === 'checkbox' ? el.checked : el.value,
          ]),
        ),
      ),
    );
  } catch {
    /* Storage is optional. */
  }
});
$('palette').addEventListener('input', () => {
  const palettes = {
    navy: ['#0e1a2e', '#e8c96a', '#f6f4ef'],
    teal: ['#10383f', '#e8c96a', '#f6f4ef'],
    paper: ['#f6f4ef', '#2e9bad', '#0e1a2e'],
    night: ['#090d16', '#2e9bad', '#f6f4ef'],
  };
  ['background', 'accent', 'ink'].forEach(
    (id, i) => ($(id).value = palettes[$('palette').value][i]),
  );
});
$('reset').onclick = () => {
  for (const el of fields) {
    if (el.type === 'checkbox') el.checked = defaults[el.id];
    else el.value = defaults[el.id];
  }
  try {
    localStorage.removeItem('tim-text-motion-v1');
  } catch {
    /* Storage is optional. */
  }
  position = duration() / 2;
  sync();
  $('status').textContent =
    'Settings reset. Your draft saves automatically on this device.';
};
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
  if ($('transparent').checked) {
    if (recording) return;
    await document.fonts.ready;
    const wasPlaying = playing,
      savedPosition = position;
    recording = true;
    playing = false;
    document
      .querySelectorAll('button,input,select,textarea')
      .forEach((el) => (el.disabled = true));
    try {
      const blob = await window.exportAlphaVideo(
        canvas,
        draw,
        duration(),
        (fraction) => {
          $('status').textContent =
            'Encoding transparent video… ' + Math.round(fraction * 100) + '%';
        },
      );
      download(blob, 'tim-text-motion-transparent.webm');
      $('status').textContent =
        'Transparent WebM ready. Import it into an editor that supports WebM alpha.';
    } catch (error) {
      $('status').textContent =
        error.message ||
        'Could not export transparent video. Try the PNG sequence.';
    } finally {
      recording = false;
      playing = wasPlaying;
      position = savedPosition;
      previous = 0;
      document
        .querySelectorAll('button,input,select,textarea')
        .forEach((el) => (el.disabled = false));
      $('background').disabled = $('transparent').checked;
      draw(position);
      playLabel();
    }
    return;
  }
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
    $('background').disabled = $('transparent').checked;
    $('video').disabled = false;
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
if (!playing) position = duration() / 2;
sync();
playLabel();
document.fonts.ready.then(() => draw(position));
requestAnimationFrame(tick);

// Stored ZIP entries keep PNG bytes intact; PNG already compresses each frame.
function zipFiles(files) {
  const parts = [],
    directory = [];
  let offset = 0,
    centralSize = 0;
  for (const { name, data } of files) {
    const filename = new TextEncoder().encode(name);
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++)
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
    crc = (crc ^ 0xffffffff) >>> 0;
    const header = new Uint8Array(30),
      h = new DataView(header.buffer);
    h.setUint32(0, 0x04034b50, true);
    h.setUint16(4, 20, true);
    h.setUint16(12, 33, true);
    h.setUint32(14, crc, true);
    h.setUint32(18, data.length, true);
    h.setUint32(22, data.length, true);
    h.setUint16(26, filename.length, true);
    parts.push(header, filename, data);
    const entry = new Uint8Array(46),
      e = new DataView(entry.buffer);
    e.setUint32(0, 0x02014b50, true);
    e.setUint16(4, 20, true);
    e.setUint16(6, 20, true);
    e.setUint16(14, 33, true);
    e.setUint32(16, crc, true);
    e.setUint32(20, data.length, true);
    e.setUint32(24, data.length, true);
    e.setUint16(28, filename.length, true);
    e.setUint32(42, offset, true);
    directory.push(entry, filename);
    centralSize += entry.length + filename.length;
    offset += header.length + filename.length + data.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, centralSize, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...directory, end], { type: 'application/zip' });
}
$('sequence').onclick = async () => {
  if (recording) return;
  await document.fonts.ready;
  const wasPlaying = playing,
    savedPosition = position;
  playing = false;
  recording = true;
  document
    .querySelectorAll('button,input,select,textarea')
    .forEach((el) => (el.disabled = true));
  try {
    const fps = 30,
      count = duration() * fps,
      files = [];
    for (let frame = 0; frame < count; frame++) {
      draw(frame / fps);
      const png = await new Promise((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!png) throw Error('PNG encoding failed');
      files.push({
        name: 'frames/frame-' + String(frame).padStart(5, '0') + '.png',
        data: new Uint8Array(await png.arrayBuffer()),
      });
      $('status').textContent =
        'Exporting PNG sequence… ' +
        Math.round(((frame + 1) / count) * 100) +
        '%';
    }
    files.push({
      name: 'README.txt',
      data: new TextEncoder().encode(
        'T.im Text Motion\nImport the frames folder as an image sequence at 30 fps.\n' +
          canvas.width +
          ' x ' +
          canvas.height +
          '; ' +
          count +
          ' frames; ' +
          duration() +
          ' seconds.\nTransparent PNGs include alpha. The preview checkerboard is not exported.\n',
      ),
    });
    download(zipFiles(files), 'tim-text-motion-30fps.zip');
    $('status').textContent =
      'PNG sequence ready. Import the frames at 30 fps in your video editor.';
  } catch {
    $('status').textContent =
      'Could not export the sequence. Try again, or save a PNG frame.';
  } finally {
    recording = false;
    playing = wasPlaying;
    previous = 0;
    position = savedPosition;
    document
      .querySelectorAll('button,input,select,textarea')
      .forEach((el) => (el.disabled = false));
    $('background').disabled = $('transparent').checked;
    $('video').disabled = false;
    draw(position);
    playLabel();
  }
};
