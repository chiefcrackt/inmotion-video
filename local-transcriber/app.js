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
// Precise word timing: remembered too; it runs in Clean Voice's environment.
const alignKey = 'tim-transcriber-align-v1';
try {
  $('align').checked = localStorage.getItem(alignKey) === '1';
} catch {
  /* Works without storage. */
}
$('align').addEventListener('change', () => {
  try {
    localStorage.setItem(alignKey, $('align').checked ? '1' : '0');
  } catch {
    /* Works without storage. */
  }
});
fetch('/api/status')
  .then((response) => response.json())
  .then((status) => {
    if (status.cleaner) return;
    $('align').checked = false;
    $('align').closest('label').hidden = true;
    $('align-note').textContent =
      'Precise word timing also needs Clean Voice: run local-voice/Start Clean Voice.cmd once, then reload this page.';
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
  $('cut-panel').classList.remove('hidden');
  updateAIPreview();
  setupWordCutter(job);
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
  $('cut-panel').classList.add('hidden');
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
      align: $('align').checked,
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
      if (
        ['cleaning', 'transcribing', 'aligning', 'complete'].includes(
          job.status,
        )
      )
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
    context: {
      cutList: $('ai-cutlist').checked,
      ...Object.fromEntries(
      aiFields.map((key) => [
        key,
        key in aiPresets && $('ai-' + key).value === '__custom__'
          ? $('ai-' + key + '-custom').value
          : $('ai-' + key).value,
      ]),
    ),
    },
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
$('ai-cutlist').addEventListener('change', updateAIPreview);

// Cut the video: the page only checks and shows the list; the server does the cut.
function cutSummary() {
  const cuts = CutList.parseCutList($('cut-input').value);
  const summary = CutList.summarize(cuts, Number(currentJob.duration));
  if (!(summary.duration > 0)) throw Error('Transcribe a recording first.');
  return summary;
}
$('cut-check').onclick = () => {
  try {
    const s = cutSummary();
    $('cut-status').textContent =
      `${s.cuts} cut${s.cuts === 1 ? '' : 's'}: removes about ${s.removed.toFixed(2)} s and keeps about ${s.kept.toFixed(2)} s of ${s.duration.toFixed(2)} s.`;
  } catch (error) {
    $('cut-status').textContent = error.message;
  }
};
$('cut-run').onclick = async () => {
  try {
    const s = cutSummary();
    const ok = confirm(
      `Make a new cut video? It removes about ${s.removed.toFixed(2)} s in ${s.cuts} section${s.cuts === 1 ? '' : 's'} and keeps about ${s.kept.toFixed(2)} s. Your original file is not changed. Continue?`,
    );
    if (!ok) return;
    const cuts = CutList.parseCutList($('cut-input').value);
    $('cut-run').disabled = true;
    $('cut-status').textContent = 'Cutting… this can take a while for long recordings.';
    $('cut-download').replaceChildren();
    const result = await responseJSON(
      await fetch(`/api/cut/${jobId}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ cuts }),
      }),
    );
    $('cut-status').textContent = `Cut made: kept ${result.kept_seconds} s in ${result.sections} section${result.sections === 1 ? '' : 's'}.`;
    const link = document.createElement('a');
    link.className = 'download';
    link.href = `/cut/${jobId}/${result.file}`;
    link.download = '';
    link.textContent = 'Download cut video';
    $('cut-download').append(link);
  } catch (error) {
    $('cut-status').textContent = error.message;
  } finally {
    $('cut-run').disabled = false;
  }
};

// Word cutter: click words and pauses to cut them. The picks write the cut list above the
// Make cut video button; a pasted cut list is shown on the words. Preview skips the cuts.
const cutter = {
  words: [],
  duration: 0,
  removedWords: new Set(),
  removedGaps: new Set(),
  anchor: null, // Last word clicked: shift-click range start, and where Preview starts.
  wordEls: [],
  gapEls: new Map(),
  frame: 0,
  lastNow: null,
};
function setupWordCutter(job) {
  cutter.words = CutList.cleanWords(job.words);
  cutter.duration = Number(job.duration) || 0;
  cutter.removedWords = new Set();
  cutter.removedGaps = new Set();
  cutter.anchor = null;
  cutter.lastNow = null;
  $('cut-input').value = '';
  $('cut-status').textContent = '';
  $('cut-download').replaceChildren();
  $('cut-video').src = $('video').currentSrc || $('video').src || '';
  $('cut-editor').hidden = !cutter.words.length;
  const pauses = new Map(
    CutList.pauses(cutter.words, cutter.duration).map((p) => [p.gap, p]),
  );
  const box = $('cut-words');
  const fragment = document.createDocumentFragment();
  cutter.wordEls = [];
  cutter.gapEls = new Map();
  const addPause = (k) => {
    const p = pauses.get(k);
    if (!p) return;
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'pause';
    chip.dataset.gap = k;
    const label =
      k === 0 ? 'start' : k === cutter.words.length ? 'end' : 'pause';
    chip.textContent = `⏸ ${label} ${(p.end - p.start).toFixed(1)} s`;
    chip.title = `${p.start.toFixed(2)}–${p.end.toFixed(2)} s · click to shorten`;
    cutter.gapEls.set(k, chip);
    fragment.append(chip, ' ');
  };
  cutter.words.forEach((w, i) => {
    addPause(i);
    const el = document.createElement('button');
    el.type = 'button';
    el.dataset.word = i;
    el.textContent = w.word;
    el.title = `${w.start.toFixed(2)}–${w.end.toFixed(2)} s`;
    if (w.probability < 0.65) el.classList.add('low');
    cutter.wordEls.push(el);
    fragment.append(el, ' ');
  });
  addPause(cutter.words.length);
  box.replaceChildren(fragment);
  paintCutter();
}
function paintCutter() {
  cutter.wordEls.forEach((el, i) => {
    const cut = cutter.removedWords.has(i);
    el.classList.toggle('cut', cut);
    el.setAttribute('aria-pressed', String(cut));
  });
  for (const [k, el] of cutter.gapEls) {
    const cut = cutter.removedGaps.has(k);
    el.classList.toggle('cut', cut);
    el.setAttribute('aria-pressed', String(cut));
  }
  showCutTotals();
}
function currentCuts() {
  try {
    return CutList.mergeCuts(CutList.parseCutList($('cut-input').value));
  } catch {
    return [];
  }
}
function showCutTotals() {
  const cuts = currentCuts();
  if (!cuts.length) {
    $('cut-totals').textContent = 'No cuts yet.';
    return;
  }
  const s = CutList.summarize(cuts, cutter.duration);
  $('cut-totals').textContent =
    `${s.cuts} cut${s.cuts === 1 ? '' : 's'} · removes ${s.removed.toFixed(2)} s · new length about ${s.kept.toFixed(2)} s`;
}
// Clicks rebuild the cut list from the words; this replaces a pasted list's exact times.
function writeCutsFromPicks() {
  const cuts = CutList.selectionCuts(
    cutter.words,
    cutter.duration,
    cutter.removedWords,
    cutter.removedGaps,
  );
  $('cut-input').value = cuts.length
    ? '{"cuts":[\n' + cuts.map((c) => '  ' + JSON.stringify(c)).join(',\n') + '\n]}'
    : '';
  $('cut-status').textContent = '';
  paintCutter();
}
$('cut-words').addEventListener('click', (event) => {
  const el = event.target.closest('button');
  if (!el) return;
  if (el.dataset.gap !== undefined) {
    const k = Number(el.dataset.gap);
    if (cutter.removedGaps.has(k)) cutter.removedGaps.delete(k);
    else cutter.removedGaps.add(k);
    writeCutsFromPicks();
    return;
  }
  const i = Number(el.dataset.word);
  if (event.altKey) {
    playCutVideo(cutter.words[i].start);
    return;
  }
  const cut = !cutter.removedWords.has(i);
  if (event.shiftKey && cutter.anchor !== null) {
    const [a, b] = [Math.min(cutter.anchor, i), Math.max(cutter.anchor, i)];
    for (let n = a; n <= b; n++)
      cut ? cutter.removedWords.add(n) : cutter.removedWords.delete(n);
    // Pauses inside a cut range go with it.
    for (let k = a + 1; k <= b; k++)
      cut ? cutter.removedGaps.add(k) : cutter.removedGaps.delete(k);
  } else cut ? cutter.removedWords.add(i) : cutter.removedWords.delete(i);
  cutter.anchor = i;
  writeCutsFromPicks();
});
// Typing or pasting a cut list shows it on the words without rewriting it.
$('cut-input').addEventListener('input', () => {
  const picks = CutList.selectionFromCuts(
    cutter.words,
    cutter.duration,
    currentCuts(),
  );
  cutter.removedWords = picks.removedWords;
  cutter.removedGaps = picks.removedGaps;
  paintCutter();
});
$('cut-clear').onclick = () => {
  cutter.removedWords.clear();
  cutter.removedGaps.clear();
  writeCutsFromPicks();
};
function playCutVideo(time) {
  const video = $('cut-video');
  video.currentTime = Math.max(0, time);
  video.play().catch(() => {
    $('cut-totals').textContent =
      'This media format cannot be played in the browser, so preview is unavailable. The cut still works.';
  });
}
$('cut-preview').onclick = () => {
  $('cut-skip').checked = true;
  const from =
    cutter.anchor === null ? 0 : cutter.words[cutter.anchor].start - 1;
  playCutVideo(from);
};
// While the video plays: jump over cut sections (when Skip is on) and highlight the spoken word.
function cutterTick() {
  const video = $('cut-video');
  if (video.paused || video.ended) return;
  const t = video.currentTime;
  if ($('cut-skip').checked) {
    const cut = currentCuts().find((c) => t >= c.start - 0.01 && t < c.end);
    if (cut) {
      if (cut.end >= cutter.duration - 0.01) video.pause();
      else video.currentTime = cut.end;
    }
  }
  let now = null;
  for (let i = 0; i < cutter.words.length; i++) {
    const w = cutter.words[i];
    if (t < w.start) break;
    if (t <= w.end) now = i;
  }
  if (now !== cutter.lastNow) {
    cutter.wordEls[cutter.lastNow]?.classList.remove('now');
    cutter.wordEls[now]?.classList.add('now');
    cutter.lastNow = now;
  }
  cutter.frame = requestAnimationFrame(cutterTick);
}
$('cut-video').addEventListener('play', () => {
  cancelAnimationFrame(cutter.frame);
  cutter.frame = requestAnimationFrame(cutterTick);
});
