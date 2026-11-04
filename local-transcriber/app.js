const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="local-token"]').content;
let jobId,
  mediaUrl,
  currentJob,
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
// Clean voice first: remembered on this browser, off when Clean Voice isn't installed.
const cleanKey = 'tim-transcriber-clean-v1';
try {
  const saved = localStorage.getItem(cleanKey);
  if (saved && [...$('clean').options].some((o) => o.value === saved))
    $('clean').value = saved;
} catch {
  /* Works without storage. */
}
$('clean').addEventListener('change', () => {
  try {
    localStorage.setItem(cleanKey, $('clean').value);
  } catch {
    /* Works without storage. */
  }
});
fetch('/api/status')
  .then((response) => response.json())
  .then((status) => {
    if (status.cleaner) return;
    $('clean').value = 'off';
    for (const option of $('clean').options)
      option.disabled = option.value !== 'off';
    $('clean-note').textContent =
      'To clean the voice first, run local-voice/Start Clean Voice.cmd once to install Clean Voice, then reload this page.';
  })
  .catch(() => {});
const cleanedLabels = {
  'cleaned.mp4': 'Cleaned video',
  'cleaned.mkv': 'Cleaned video',
  'cleaned.wav': 'Cleaned WAV',
};
function downloadLinks(enabled = true) {
  $('downloads').replaceChildren();
  if (!enabled) return;
  const cleaned = (currentJob?.cleaned || []).slice();
  cleaned.sort((a) => (a === 'cleaned.wav' ? 1 : -1)); // Video first.
  for (const name of cleaned) {
    const link = document.createElement('a');
    link.className = 'download';
    link.href = `/download/${jobId}/${name}`;
    link.textContent = cleanedLabels[name];
    $('downloads').append(link);
  }
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
  currentJob = structuredClone(job);
  currentJob.original_segments ||= structuredClone(job.segments);
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
  $('ai-panel').classList.remove('hidden');
  updateAIPreview();
}
$('segments').addEventListener('input', () => {
  dirty = true;
  $('save-status').textContent = 'Unsaved edits';
  downloadLinks(false);
  updateAIPreview();
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
    updateAIPreview();
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
  $('ai-panel').classList.add('hidden');
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
      clean: $('clean').value,
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
      if (['cleaning', 'transcribing', 'complete'].includes(job.status))
        $('progress').value = job.progress;
      if (job.status === 'error') throw Error(job.message);
      if (job.status === 'complete') {
        // Play the cleaned recording, so the Play buttons sound like the result.
        const cleaned = job.cleaned.find((name) => name !== 'cleaned.wav');
        if (cleaned || job.cleaned.length) {
          const time = $('video').currentTime;
          $('video').src = `/media/${jobId}/${cleaned || job.cleaned[0]}`;
          $('video').currentTime = time;
        }
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

const aiFields = [
  'title',
  'platform',
  'length',
  'audience',
  'goal',
  'style',
  'footage',
  'instructions',
];
const aiPresets = {
  length: [
    '',
    '20–30 seconds',
    '30–45 seconds',
    '45–60 seconds',
    '60–90 seconds',
    '2–3 minutes',
    '5–8 minutes',
    '8–12 minutes',
    '12–20 minutes',
  ],
  audience: [
    '',
    'Beginner runners',
    'Recreational runners',
    'Experienced runners',
    'People researching running shoes and gear',
    'My existing followers',
    'Content creators',
    'A general audience',
  ],
  goal: [
    '',
    'Teach a practical running tip',
    'Share a personal story or experience',
    'Recap a race or event',
    'Review running shoes or gear honestly',
    'Document training progress',
    'Motivate viewers to get moving',
    'Help viewers make a buying decision',
    'Start a discussion and invite comments',
    'Encourage viewers to watch the full video',
  ],
  style: [
    'Natural, clear and engaging. Preserve my speaking speed, meaning and meaningful pauses.',
    'Concise and energetic, with a strong hook. Preserve natural speech speed and word endings.',
    'Calm, reflective storytelling. Give meaningful moments room to breathe.',
    'Practical and educational. Use clear steps, examples and restrained graphics.',
    'Honest, balanced gear review. Prioritize evidence, useful details and trade-offs.',
    'Race recap with a clear beginning, challenge and finish. Preserve the actual story.',
    'Casual and conversational. Keep my personality, natural rhythm and appropriate humor.',
    '',
  ],
};
const aiStorageKey = 'tim-transcriber-ai-preferences-v1';
for (const [key, values] of Object.entries(aiPresets)) {
  const select = $('ai-' + key);
  for (const [index, value] of values.entries()) {
    const option = document.createElement('option');
    option.value = value;
    option.textContent =
      key === 'style' && value
        ? [
            'Natural & conversational',
            'Energetic & concise',
            'Reflective storytelling',
            'Clear & educational',
            'Balanced gear review',
            'Race recap',
            'Casual with personality',
          ][index]
        : value || 'Recommend from the transcript';
    select.append(option);
  }
  const custom = document.createElement('option');
  custom.value = '__custom__';
  custom.textContent = 'Custom…';
  select.append(custom);
}
function refreshCustomFields() {
  for (const key of Object.keys(aiPresets))
    $('ai-' + key + '-custom').hidden = $('ai-' + key).value !== '__custom__';
}
function rememberAIPreferences() {
  const values = { platform: $('ai-platform').value };
  for (const key of Object.keys(aiPresets)) {
    values[key] = $('ai-' + key).value;
    values[key + 'Custom'] = $('ai-' + key + '-custom').value;
  }
  try {
    localStorage.setItem(aiStorageKey, JSON.stringify(values));
  } catch {
    /* Preferences remain usable without storage. */
  }
}
try {
  const saved = JSON.parse(localStorage.getItem(aiStorageKey) || '{}');
  for (const key of ['platform', ...Object.keys(aiPresets)]) {
    const select = $('ai-' + key);
    if ([...select.options].some((option) => option.value === saved[key]))
      select.value = saved[key];
    if (key in aiPresets && typeof saved[key + 'Custom'] === 'string')
      $('ai-' + key + '-custom').value = saved[key + 'Custom'].slice(0, 1000);
  }
} catch {
  /* Ignore invalid or unavailable saved preferences. */
}
refreshCustomFields();
$('ai-reset').onclick = () => {
  for (const key of ['platform', ...Object.keys(aiPresets)])
    $('ai-' + key).selectedIndex = 0;
  for (const key of Object.keys(aiPresets))
    $('ai-' + key + '-custom').value = '';
  refreshCustomFields();
  rememberAIPreferences();
  if (currentJob) updateAIPreview();
};
function aiPackage() {
  if (!currentJob) throw Error('Transcribe a recording first.');
  const segments = [...document.querySelectorAll('.segment')].map((row) => {
    const start = row.querySelector('[data-field=start]');
    const end = row.querySelector('[data-field=end]');
    if (!start.value || !end.value)
      throw Error('Fill in the transcript start and end times.');
    return {
      start: Number(start.value),
      end: Number(end.value),
      text: row.querySelector('textarea').value,
    };
  });
  return {
    context: Object.fromEntries(
      aiFields.map((key) => [
        key,
        key in aiPresets && $('ai-' + key).value === '__custom__'
          ? $('ai-' + key + '-custom').value
          : $('ai-' + key).value,
      ]),
    ),
    payload: TranscriptAI.makePayload(currentJob, segments),
  };
}
function updateAIPreview() {
  try {
    const { context, payload } = aiPackage();
    $('ai-preview').value = TranscriptAI.buildPrompt(context, payload);
    for (const id of ['ai-copy', 'ai-copy-only', 'ai-json', 'ai-text'])
      $(id).disabled = false;
    $('ai-status').textContent = dirty
      ? 'Includes your current unsaved text edits. The matching JSON below uses those same edits.'
      : '';
  } catch (error) {
    $('ai-preview').value = '';
    $('ai-status').textContent = error.message;
    for (const id of ['ai-copy', 'ai-copy-only', 'ai-json', 'ai-text'])
      $(id).disabled = true;
  }
}
aiFields.forEach((key) => {
  $('ai-' + key).addEventListener('input', () => {
    refreshCustomFields();
    rememberAIPreferences();
    if (currentJob) updateAIPreview();
  });
  if (key in aiPresets)
    $('ai-' + key + '-custom').addEventListener('input', () => {
      rememberAIPreferences();
      if (currentJob) updateAIPreview();
    });
});
async function copyAIPrompt(includeJSON) {
  try {
    const { context, payload } = aiPackage();
    const text = TranscriptAI.buildPrompt(context, payload, includeJSON);
    $('ai-preview').value = text;
    try {
      await navigator.clipboard.writeText(text);
      $('ai-status').textContent = includeJSON
        ? 'Copied the full edit brief, content-package request and word JSON. Paste into ChatGPT or Claude.'
        : 'Copied the prompt. Attach the matching JSON when you paste it into your assistant.';
    } catch {
      $('ai-preview-details').open = true;
      $('ai-preview').focus();
      $('ai-preview').select();
      $('ai-status').textContent =
        'Clipboard access was unavailable. The prompt is selected below; press Ctrl+C to copy.';
    }
  } catch (error) {
    $('ai-status').textContent = error.message;
  }
}
function downloadAI(kind) {
  try {
    const { context, payload } = aiPackage();
    const text =
      kind === 'json'
        ? JSON.stringify(payload, null, 2)
        : TranscriptAI.buildPrompt(context, payload);
    const blob = new Blob([text], {
      type: kind === 'json' ? 'application/json' : 'text/plain;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download =
      kind === 'json' ? 'ai-transcript.json' : 'ai-edit-brief.txt';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    $('ai-status').textContent = 'Downloaded ' + link.download;
  } catch (error) {
    $('ai-status').textContent = error.message;
  }
}
$('ai-copy').onclick = () => copyAIPrompt(true);
$('ai-copy-only').onclick = () => copyAIPrompt(false);
$('ai-json').onclick = () => downloadAI('json');
$('ai-text').onclick = () => downloadAI('text');
