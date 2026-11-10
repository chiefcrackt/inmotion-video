// Motion Studio 2: browser preview and spec export. Rendering to video happens
// on the computer (see ./render), so this page only needs canvas and Blob.
import {
  buildSpec,
  frameState,
  specToJson,
  PIECE_TYPES,
  BRAND,
} from './model.mjs?v=a7255fe3';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');
const form = $('controls');
const scrub = $('scrub');
const timeLabel = $('time');
const errorLabel = $('error');
const playButton = $('play');

let spec = null;
let frame = 0;
let playing = false;
let last = 0;

const GREEN = '#00B140';

// Fill the form's default duration and aspect options for the chosen type.
function syncTypeOptions() {
  const piece = PIECE_TYPES[$('type').value];
  const aspect = $('aspect');
  for (const option of aspect.options) {
    option.disabled = !piece.aspects.includes(option.value);
  }
  if (!piece.aspects.includes(aspect.value)) aspect.value = piece.aspects[0];
  $('duration').value = piece.duration;
}

function readForm() {
  const data = new FormData(form);
  return {
    type: data.get('type'),
    aspect: data.get('aspect'),
    background: data.get('background'),
    duration: data.get('duration'),
    bpm: data.get('bpm'),
    eyebrow: data.get('eyebrow'),
    headline: data.get('headline'),
    sub: data.get('sub'),
    brand: $('brand').checked,
  };
}

function rebuild() {
  try {
    spec = buildSpec(readForm());
    errorLabel.textContent = '';
    scrub.max = String(spec.frames);
    frame = Math.min(frame, spec.frames);
    scrub.value = String(frame);
    draw();
  } catch (error) {
    spec = null;
    errorLabel.textContent = error.message;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

function drawWave(y, color, amplitude) {
  ctx.beginPath();
  ctx.moveTo(0, y);
  for (let x = 0; x <= canvas.width; x += 16) {
    ctx.lineTo(x, y + Math.sin(x / 140) * amplitude);
  }
  ctx.lineTo(canvas.width, y + 40);
  ctx.lineTo(0, y + 40);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function draw() {
  if (!spec) return;
  const { width, height, scene, brand, background } = spec;
  const state = frameState(spec, frame);
  const { safeZone } = brand;
  canvas.width = width;
  canvas.height = height;

  // Background. Green-screen keeps the frame plain so it keys cleanly.
  ctx.fillStyle = background === 'green' ? GREEN : BRAND.navy;
  ctx.fillRect(0, 0, width, height);

  if (state.crtOff && background !== 'green') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, width, height);
    return;
  }

  const useBrand = brand.enabled && background !== 'green';
  const scale = width / 1920;
  const pad = 120 * scale;
  const textTop = safeZone.top * scale + (height - safeZone.top - safeZone.bottom) * 0.35;

  if (useBrand) {
    // Diagonal stripes, faint.
    ctx.save();
    ctx.globalAlpha = 0.05;
    ctx.strokeStyle = BRAND.paper;
    ctx.lineWidth = 2;
    for (let x = -height; x < width; x += 36) {
      ctx.beginPath();
      ctx.moveTo(x, height);
      ctx.lineTo(x + height, 0);
      ctx.stroke();
    }
    ctx.restore();

    // Gold wave border across the top edge.
    drawWave(0, BRAND.gold, 10 * scale);
    // Teal slash, upper right.
    ctx.fillStyle = BRAND.teal;
    ctx.beginPath();
    ctx.moveTo(width - 260 * scale, 0);
    ctx.lineTo(width - 200 * scale, 0);
    ctx.lineTo(width - 300 * scale, 160 * scale);
    ctx.lineTo(width - 360 * scale, 160 * scale);
    ctx.closePath();
    ctx.fill();
  }

  // Eyebrow, gold, wide-tracked.
  if (scene.eyebrow) {
    ctx.save();
    ctx.globalAlpha = state.eyebrowOpacity;
    ctx.fillStyle = BRAND.gold;
    ctx.font = `${BRAND.eyebrowWeight} ${34 * scale}px ${BRAND.font}`;
    ctx.letterSpacing = `${4 * scale}px`;
    ctx.fillText(scene.eyebrow.toUpperCase(), pad, textTop - 70 * scale);
    ctx.restore();
  }

  // Headline, paper, uppercase, slides up as it lands. Glitch offsets it briefly.
  const headlineSize = 150 * scale;
  ctx.save();
  ctx.globalAlpha = state.headlineProgress;
  ctx.fillStyle = BRAND.paper;
  ctx.font = `${BRAND.headlineWeight} ${headlineSize}px ${BRAND.font}`;
  ctx.letterSpacing = '0px';
  const rise = (1 - state.headlineProgress) * 40 * scale;
  const shift = state.glitch ? 14 * scale : 0;
  if (state.glitch) {
    ctx.fillStyle = BRAND.teal;
    ctx.fillText(scene.headline.toUpperCase(), pad - shift, textTop + rise);
    ctx.fillStyle = BRAND.gold;
    ctx.fillText(scene.headline.toUpperCase(), pad + shift, textTop + rise);
  }
  ctx.fillStyle = BRAND.paper;
  ctx.fillText(scene.headline.toUpperCase(), pad, textTop + rise);
  ctx.restore();

  // Sub line.
  if (scene.sub) {
    ctx.save();
    ctx.globalAlpha = state.subOpacity;
    ctx.fillStyle = BRAND.paper;
    ctx.font = `700 ${56 * scale}px ${BRAND.font}`;
    ctx.fillText(scene.sub, pad, textTop + headlineSize + 40 * scale);
    ctx.restore();
  }

  // Footer lockup, bottom left: teal dot plus the handle.
  if (useBrand) {
    const footY = height - (safeZone.bottom || 60 * scale) + 20 * scale;
    ctx.fillStyle = BRAND.teal;
    ctx.beginPath();
    ctx.arc(pad, footY - 14 * scale, 12 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = BRAND.paper;
    ctx.font = `700 ${36 * scale}px ${BRAND.font}`;
    ctx.fillText('TRISTAN.INMOTION', pad + 30 * scale, footY);
  }
}

function tick(now) {
  if (!playing) return;
  if (!last) last = now;
  const elapsed = (now - last) / 1000;
  last = now;
  frame += elapsed * (spec?.fps ?? 30);
  if (spec && frame >= spec.frames) {
    frame = 0;
  }
  scrub.value = String(Math.floor(frame));
  updateTime();
  draw();
  requestAnimationFrame(tick);
}

function updateTime() {
  const total = spec ? spec.duration.toFixed(2) : '0.00';
  const now = spec ? (Math.floor(frame) / spec.fps).toFixed(2) : '0.00';
  timeLabel.textContent = `${now} / ${total}s`;
}

function setPlaying(value) {
  playing = value;
  playButton.textContent = playing ? 'Pause' : 'Play';
  last = 0;
  if (playing) requestAnimationFrame(tick);
}

function exportSpec() {
  if (!spec) return;
  const blob = new Blob([specToJson(spec)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const slug = spec.scene.headline
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'piece';
  link.href = url;
  link.download = `${slug}-spec.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

$('type').addEventListener('change', () => {
  syncTypeOptions();
  rebuild();
});
form.addEventListener('input', rebuild);
form.addEventListener('change', rebuild);
scrub.addEventListener('input', () => {
  frame = Number(scrub.value);
  updateTime();
  draw();
});
playButton.addEventListener('click', () => {
  if (!spec) return;
  setPlaying(!playing);
});
$('export').addEventListener('click', exportSpec);

syncTypeOptions();
rebuild();
updateTime();

// Load the brand face before the first real draw so the preview is accurate.
if (document.fonts?.load) {
  Promise.all([
    document.fonts.load(`900 48px ${BRAND.font}`),
    document.fonts.load(`700 48px ${BRAND.font}`),
  ]).then(() => draw(), () => draw());
}
