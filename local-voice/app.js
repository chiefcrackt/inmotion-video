const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="local-token"]').content;
const headers = { 'X-Local-Token': token };
const SETTINGS = 'clean-voice-settings';
const fields = ['mode', 'strength', 'device', 'highpass', 'loudness'];
let mediaUrl,
  player,
  listeningClean = false;

async function responseJSON(response) {
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}

try {
  const saved = JSON.parse(localStorage.getItem(SETTINGS) || '{}');
  for (const key of fields) {
    if (!(key in saved)) continue;
    if ($(key).type === 'checkbox') $(key).checked = Boolean(saved[key]);
    else $(key).value = saved[key];
  }
} catch {}
function remember() {
  const value = {};
  for (const key of fields)
    value[key] = $(key).type === 'checkbox' ? $(key).checked : $(key).value;
  try {
    localStorage.setItem(SETTINGS, JSON.stringify(value));
  } catch {}
}
for (const key of fields) $(key).addEventListener('change', remember);

function modeNote() {
  $('mode-note').textContent =
    $('mode').value === 'isolate'
      ? 'Separates the voice from music or a busy background first, then removes what noise is left. Slower.'
      : 'Light keeps a little of the room; Strong removes all the noise it can.';
}
$('mode').addEventListener('change', modeNote);
modeNote();

fetch('/api/status')
  .then((r) => r.json())
  .then((s) => {
    $('gpu').textContent = s.gpu ? `GPU: ${s.gpu}.` : s.note || '';
  })
  .catch(() => {});

// The original plays from the browser's copy of the file; the cleaned sound
// follows the same clock, so switching keeps your place.
function setListening(clean) {
  listeningClean = clean;
  $('ab-original').setAttribute('aria-pressed', String(!clean));
  $('ab-clean').setAttribute('aria-pressed', String(clean));
  player.muted = clean;
  const audio = $('clean');
  if (clean) {
    audio.currentTime = player.currentTime;
    if (!player.paused) audio.play().catch(() => {});
  } else audio.pause();
}
function follow() {
  const audio = $('clean');
  if (!listeningClean || !audio.src) return;
  if (Math.abs(audio.currentTime - player.currentTime) > 0.15)
    audio.currentTime = player.currentTime;
  if (player.paused) audio.pause();
  else if (audio.paused) audio.play().catch(() => {});
}
for (const element of [$('video'), $('audio')]) {
  for (const event of ['play', 'pause', 'seeked', 'timeupdate', 'ratechange'])
    element.addEventListener(event, () => element === player && follow());
}
$('ab-original').onclick = () => setListening(false);
$('ab-clean').onclick = () => setListening(true);

function resetResult() {
  setListening(false);
  $('clean').removeAttribute('src');
  $('ab-clean').disabled = true;
  $('downloads').replaceChildren();
  $('warnings').textContent = '';
}
$('file').addEventListener('change', () => {
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  const file = $('file').files[0];
  if (!file) return;
  if (player) player.pause();
  mediaUrl = URL.createObjectURL(file);
  const isAudio =
    file.type.startsWith('audio/') ||
    /\.(wav|mp3|m4a|aac|flac|ogg)$/i.test(file.name);
  player = isAudio ? $('audio') : $('video');
  $('video').classList.toggle('hidden', isAudio);
  $('audio').classList.toggle('hidden', !isAudio);
  player.src = mediaUrl;
  resetResult();
  $('status').textContent = 'Ready to clean.';
});
player = $('video');

function downloads(job) {
  const labels = {
    'cleaned.mp4': 'Video (MP4)',
    'cleaned.mkv': 'Video (MKV)',
    'cleaned.wav': 'Sound only (WAV)',
  };
  $('downloads').replaceChildren(
    ...job.outputs
      .slice()
      .reverse()
      .map((name) => {
        const link = document.createElement('a');
        link.className = 'download';
        link.href = `/download/${job.id}/${name}`;
        link.textContent = 'Download ' + labels[name];
        return link;
      }),
  );
}

$('form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const file = $('file').files[0];
  if (!file) return;
  resetResult();
  $('start').disabled = true;
  $('progress').value = 0;
  $('status').textContent = 'Sending the recording to the local engine…';
  try {
    const options = {
      filename: file.name,
      mode: $('mode').value,
      strength: $('strength').value,
      device: $('device').value,
      highpass: $('highpass').checked,
      loudness: $('loudness').checked,
    };
    const { id } = await responseJSON(
      await fetch('/api/clean', {
        method: 'POST',
        headers: {
          ...headers,
          'X-Options': encodeURIComponent(JSON.stringify(options)),
        },
        body: file,
      }),
    );
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 700));
      const job = await responseJSON(await fetch(`/api/job/${id}`));
      $('progress').value = job.progress || 0;
      $('status').textContent = job.message || 'Working…';
      $('warnings').textContent = (job.warnings || []).join('\n');
      if (job.status === 'error') throw Error(job.message);
      if (job.status === 'complete') {
        $('clean').src = `/file/${id}/cleaned.wav`;
        $('ab-clean').disabled = false;
        downloads(job);
        setListening(true);
        break;
      }
    }
  } catch (error) {
    $('status').textContent = 'Cleaning failed: ' + error.message;
  } finally {
    $('start').disabled = false;
  }
});
