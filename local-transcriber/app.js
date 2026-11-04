const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="local-token"]').content;
let jobId,
  mediaUrl,
  dirty = false;
const headers = { 'X-Local-Token': token };
async function responseJSON(response) {
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}
$('language').addEventListener('change', () => {
  // Multilingual recognition uses the same-sized multilingual model.
  $('model-note').textContent =
    'First use downloads the model. Later runs can work offline. Language detection uses a multilingual model.';
  const suffix = $('language').value === 'en' ? 'English' : 'multilingual';
  $('quality').options[0].textContent = 'Fast · small ' + suffix + ' model';
  $('quality').options[1].textContent =
    'Higher quality · medium ' + suffix + ' model';
});
$('file').addEventListener('change', () => {
  if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  const file = $('file').files[0];
  if (file) {
    mediaUrl = URL.createObjectURL(file);
    $('video').src = mediaUrl;
  }
});
function downloadLinks(enabled = true) {
  $('downloads').replaceChildren();
  if (!enabled) return;
  for (const [name, label] of [
    ['transcript.txt', 'Text'],
    ['transcript.srt', 'SRT'],
    ['transcript.vtt', 'VTT'],
    ['transcript.json', 'Word JSON'],
    ['review.txt', 'Review notes'],
  ]) {
    const link = document.createElement('a');
    link.className = 'download';
    link.href = `/download/${jobId}/${name}`;
    link.download = name;
    link.textContent = label;
    $('downloads').append(link);
  }
}
function render(job) {
  $('segments').replaceChildren();
  job.segments.forEach((segment, i) => {
    const row = document.createElement('div');
    row.className = 'segment';
    const times = document.createElement('div');
    times.className = 'times';
    for (const key of ['start', 'end']) {
      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.step = '.001';
      input.value = segment[key].toFixed(3);
      input.dataset.field = key;
      input.setAttribute('aria-label', `Sentence ${i + 1} ${key} seconds`);
      times.append(input);
    }
    const play = document.createElement('button');
    play.className = 'secondary';
    play.textContent = '▶ Play';
    play.onclick = () => {
      $('video').currentTime = Number(times.querySelector('input').value);
      $('video')
        .play()
        .catch(() => {
          $('save-status').textContent =
            'This media format cannot be played in the browser.';
        });
    };
    times.append(play);
    const text = document.createElement('textarea');
    text.value = segment.text;
    text.dataset.field = 'text';
    text.setAttribute('aria-label', `Sentence ${i + 1} text`);
    row.append(times, text);
    $('segments').append(row);
  });
  dirty = false;
  $('save-status').textContent = '';
  downloadLinks();
  $('result').classList.remove('hidden');
}
$('segments').addEventListener('input', () => {
  dirty = true;
  $('save-status').textContent = 'Unsaved edits';
  downloadLinks(false);
});
$('save').onclick = async () => {
  try {
    const segments = [...document.querySelectorAll('.segment')].map((row) => ({
      start: Number(row.querySelector('[data-field=start]').value),
      end: Number(row.querySelector('[data-field=end]').value),
      text: row.querySelector('textarea').value,
    }));
    await responseJSON(
      await fetch(`/api/save/${jobId}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ segments }),
      }),
    );
    dirty = false;
    $('save-status').textContent = 'Saved locally';
    downloadLinks();
  } catch (error) {
    $('save-status').textContent = error.message;
  }
};
$('form').onsubmit = async (event) => {
  event.preventDefault();
  if (dirty && !confirm('Start a new transcript and discard unsaved edits?'))
    return;
  const file = $('file').files[0];
  if (!file) return;
  if (file.size > 8 * 1024 ** 3) {
    $('status').textContent = 'Choose a file smaller than 8 GB.';
    return;
  }
  $('form')
    .querySelectorAll('input,select,button')
    .forEach((control) => {
      control.disabled = true;
    });
  $('result').classList.add('hidden');
  $('warnings').textContent = '';
  $('status').textContent =
    'Copying recording to the local transcription folder…';
  $('progress').removeAttribute('value');
  try {
    const options = {
      filename: file.name,
      quality: $('quality').value,
      device: $('device').value,
      language: $('language').value,
      vocabulary: $('vocabulary').value,
    };
    const started = await responseJSON(
      await fetch('/api/transcribe', {
        method: 'POST',
        headers: {
          ...headers,
          'X-Options': encodeURIComponent(JSON.stringify(options)),
          'Content-Type': 'application/octet-stream',
        },
        body: file,
      }),
    );
    jobId = started.id;
    while (true) {
      const job = await responseJSON(await fetch(`/api/job/${jobId}`));
      $('status').textContent = job.message || 'Preparing transcription…';
      $('warnings').textContent = job.warnings.join('\n');
      if (job.status === 'transcribing' || job.status === 'complete')
        $('progress').value = job.progress;
      if (job.status === 'error') throw Error(job.message);
      if (job.status === 'complete') {
        render(job);
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    $('status').textContent = 'Transcription failed: ' + error.message;
    $('progress').value = 0;
  } finally {
    $('form')
      .querySelectorAll('input,select,button')
      .forEach((control) => {
        control.disabled = false;
      });
  }
};
window.addEventListener('beforeunload', (event) => {
  if (dirty) {
    event.preventDefault();
    event.returnValue = '';
  }
});
