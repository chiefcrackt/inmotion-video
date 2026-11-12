const $ = (id) => document.getElementById(id);
const token = document.querySelector('meta[name="local-token"]').content;
const DRAFT = 'voiceover-draft';
let voices = [];
let presets = [];
let prons = [];
let speakerVoices = {};
let overrides = {};
let result = null;
let stopAt = null;

async function api(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'X-Local-Token': token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  const data = await response.json();
  if (!response.ok) throw Error(data.error || 'Request failed');
  return data;
}

// ---------------------------------------------------------------- draft

function saveDraft() {
  try {
    localStorage.setItem(
      DRAFT,
      JSON.stringify({
        script: $('script').value,
        filename: $('filename').value,
        voice: $('voice').value,
        speed: $('speed').value,
        pause: $('pause').value,
        loudness: $('loudness').checked,
        speakers: speakerVoices,
        overrides,
      }),
    );
  } catch {}
}
function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT) || '{}');
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------- voices

const PRESET = 'preset:';
function voiceLabel(v) {
  return `${v.name} · ${v.accent} ${v.gender} (${v.grade})`;
}
// A <select> of saved blends, then every voice grouped by accent and gender.
function fillVoiceSelect(select, value, { blends = true } = {}) {
  select.replaceChildren();
  if (blends && presets.length) {
    const group = document.createElement('optgroup');
    group.label = 'Your blends';
    for (const p of presets) group.append(new Option(p.name, PRESET + p.name));
    select.append(group);
  }
  const groups = {};
  for (const v of voices) {
    const key = `${v.accent} ${v.gender}`;
    if (!groups[key]) {
      groups[key] = document.createElement('optgroup');
      groups[key].label = key[0].toUpperCase() + key.slice(1);
      select.append(groups[key]);
    }
    groups[key].append(new Option(voiceLabel(v), v.id));
  }
  select.value = value;
  if (select.value !== value)
    select.value =
      blends && presets.length ? PRESET + presets[0].name : 'am_puck';
}
// What the server takes: a voice id or a list of {voice, weight}.
function resolve(value) {
  if (value && value.startsWith(PRESET)) {
    const preset = presets.find((p) => PRESET + p.name === value);
    return preset ? preset.mix : 'am_puck';
  }
  return value || 'am_puck';
}

async function preview(button, voice, text) {
  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Making…';
  try {
    const { url } = await api('/api/preview', {
      voice,
      text,
      speed: +$('speed').value,
      pronunciations: prons,
    });
    const player = $('preview-player');
    player.src = url;
    await player.play();
  } catch (error) {
    $('status').textContent = 'Preview failed: ' + error.message;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}
$('preview-voice').onclick = (e) =>
  preview(e.currentTarget, resolve($('voice').value));

// ---------------------------------------------------------------- speakers

let parseTimer;
function scheduleParse() {
  clearTimeout(parseTimer);
  parseTimer = setTimeout(parse, 300);
}
async function parse() {
  try {
    const { lines, speakers } = await api('/api/parse', {
      script: $('script').value,
    });
    const spoken = lines.filter((l) => l.kind === 'speech').length;
    $('line-count').textContent = spoken
      ? `${spoken} line${spoken === 1 ? '' : 's'} to speak.`
      : '';
    renderSpeakers(speakers);
    // Only replace the getting-started hints, not a message about something just done.
    if (/^(Ready\. Press|Paste a script)/.test($('status').textContent))
      $('status').textContent = spoken
        ? 'Ready. Press Make voiceover.'
        : 'Paste a script to begin.';
  } catch {}
}
function renderSpeakers(names) {
  $('speakers-section').classList.toggle('hidden', !names.length);
  $('speakers').replaceChildren(
    ...names.map((name) => {
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = name;
      const select = document.createElement('select');
      fillVoiceSelect(select, speakerVoices[name] || $('voice').value);
      select.onchange = () => {
        speakerVoices[name] = select.value;
        saveDraft();
      };
      label.append(select);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'quiet small';
      button.textContent = '▶ Preview';
      button.onclick = () => preview(button, resolve(select.value));
      row.append(label, button);
      return row;
    }),
  );
}

// ---------------------------------------------------------------- blends

const mixParts = [
  { voice: 'am_puck', weight: 60 },
  { voice: 'am_michael', weight: 40 },
  { voice: '', weight: 0 },
];
function renderMixer() {
  $('mix-parts').replaceChildren(
    ...mixParts.map((part, n) => {
      const row = document.createElement('div');
      row.className = 'part';
      const select = document.createElement('select');
      select.setAttribute('aria-label', `Blend voice ${n + 1}`);
      fillVoiceSelect(select, part.voice, { blends: false });
      if (n === 2) {
        select.prepend(new Option('(no third voice)', ''));
        select.value = part.voice;
      }
      const range = document.createElement('input');
      range.type = 'range';
      range.min = 0;
      range.max = 100;
      range.step = 5;
      range.value = part.weight;
      range.setAttribute('aria-label', `Blend amount ${n + 1}`);
      const out = document.createElement('output');
      const show = () => {
        const total = mixParts.reduce(
          (s, p) => s + (p.voice ? p.weight : 0),
          0,
        );
        for (const [i, o] of [
          ...$('mix-parts').querySelectorAll('output'),
        ].entries()) {
          const p = mixParts[i];
          o.textContent =
            p.voice && total ? Math.round((100 * p.weight) / total) + '%' : '–';
        }
      };
      select.onchange = () => {
        part.voice = select.value;
        if (part.voice && !part.weight) part.weight = 30;
        renderMixer();
      };
      range.oninput = () => {
        part.weight = +range.value;
        show();
      };
      range.disabled = !part.voice;
      row.append(select, range, out);
      queueMicrotask(show);
      return row;
    }),
  );
}
function currentMix() {
  return mixParts
    .filter((p) => p.voice && p.weight > 0)
    .map((p) => ({ voice: p.voice, weight: p.weight }));
}
$('mix-preview').onclick = (e) => {
  const mix = currentMix();
  if (mix.length) preview(e.currentTarget, mix);
};
$('mix-save').onclick = async () => {
  const name = $('mix-name').value.trim();
  const mix = currentMix();
  if (!name) return $('mix-name').focus();
  if (!mix.length) return;
  presets = [...presets.filter((p) => p.name !== name), { name, mix }];
  await saveSettings();
  refreshVoiceLists();
  $('voice').value = PRESET + name;
  saveDraft();
  $('status').textContent =
    `Saved the blend "${name}" and chose it as the voice.`;
};
function renderSaved() {
  $('saved-mixes').replaceChildren(
    ...presets.map((p) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      const total = p.mix.reduce((s, m) => s + m.weight, 0);
      span.textContent = `${p.name}: ${p.mix
        .map(
          (m) =>
            `${Math.round((100 * m.weight) / total)}% ${voices.find((v) => v.id === m.voice)?.name || m.voice}`,
        )
        .join(' + ')}`;
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'quiet small';
      edit.textContent = 'Edit';
      edit.onclick = () => {
        p.mix.forEach((m, i) =>
          Object.assign(mixParts[i], {
            voice: m.voice,
            weight: Math.round((100 * m.weight) / total),
          }),
        );
        for (let i = p.mix.length; i < 3; i++)
          Object.assign(mixParts[i], { voice: '', weight: 0 });
        $('mix-name').value = p.name;
        renderMixer();
      };
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quiet small';
      remove.textContent = 'Delete';
      remove.setAttribute('aria-label', `Delete ${p.name}`);
      remove.onclick = async () => {
        presets = presets.filter((x) => x !== p);
        await saveSettings();
        refreshVoiceLists();
      };
      const buttons = document.createElement('span');
      buttons.style.display = 'flex';
      buttons.style.gap = '6px';
      buttons.append(edit, remove);
      li.append(span, buttons);
      return li;
    }),
  );
}
function refreshVoiceLists() {
  fillVoiceSelect($('voice'), $('voice').value);
  renderSaved();
  scheduleParse();
}

// ---------------------------------------------------------------- pronunciation

let settingsTimer;
async function saveSettings() {
  clearTimeout(settingsTimer);
  try {
    ({ presets, pronunciations: prons } = await api('/api/settings', {
      presets,
      pronunciations: prons,
    }));
  } catch (error) {
    $('status').textContent = 'Could not save: ' + error.message;
  }
}
function renderProns() {
  $('prons').replaceChildren(
    ...prons.map((p, n) => {
      const row = document.createElement('div');
      row.className = 'pron';
      const word = document.createElement('input');
      word.value = p.word;
      word.placeholder = 'Word';
      word.setAttribute('aria-label', 'Word');
      const say = document.createElement('input');
      say.value = p.say;
      say.placeholder = 'Say it like';
      say.setAttribute('aria-label', `Say ${p.word || 'it'} like`);
      const change = () => {
        prons[n] = { word: word.value, say: say.value };
        clearTimeout(settingsTimer);
        settingsTimer = setTimeout(saveSettings, 800);
      };
      word.oninput = say.oninput = change;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'quiet small';
      remove.textContent = '✕';
      remove.setAttribute('aria-label', `Remove ${p.word || 'this word'}`);
      remove.onclick = async () => {
        prons.splice(n, 1);
        renderProns();
        await saveSettings();
      };
      row.append(word, say, remove);
      return row;
    }),
  );
}
$('pron-add').onclick = () => {
  prons.push({ word: '', say: '' });
  renderProns();
  $('prons').lastElementChild.querySelector('input').focus();
};

// ---------------------------------------------------------------- generate

function outputs(job) {
  const labels = {
    'voiceover.wav': 'Voiceover (WAV)',
    'words.json': 'Word timing (JSON)',
    'captions.srt': 'Captions (SRT)',
    'captions.vtt': 'Captions (VTT)',
  };
  $('downloads').replaceChildren(
    ...job.outputs.map((name) => {
      const link = document.createElement('a');
      link.className = 'download';
      link.href = `/download/${job.id}/${name}`;
      link.textContent = labels[name];
      return link;
    }),
  );
}

const SPEEDS = [
  '',
  '0.8',
  '0.85',
  '0.9',
  '0.95',
  '1',
  '1.05',
  '1.1',
  '1.15',
  '1.2',
];
function renderLines(job) {
  $('lines').replaceChildren(
    ...job.lines.map((line) => {
      const li = document.createElement('li');
      if (line.kind === 'pause') {
        const span = document.createElement('span');
        span.className = 'pause';
        span.textContent = `Pause ${(line.end - line.start).toFixed(1)} s`;
        li.append(span);
        return li;
      }
      const play = document.createElement('button');
      play.type = 'button';
      play.className = 'quiet small';
      play.textContent = '▶';
      play.setAttribute('aria-label', `Play line: ${line.text.slice(0, 60)}`);
      play.onclick = () => {
        const player = $('player');
        document
          .querySelectorAll('.lines li')
          .forEach((x) => x.classList.remove('playing'));
        li.classList.add('playing');
        player.currentTime = line.start;
        stopAt = line.end + 0.05;
        player.play().catch(() => {});
      };
      const body = document.createElement('div');
      const text = document.createElement('div');
      text.className = 'text';
      text.textContent = line.text;
      const meta = document.createElement('div');
      meta.className = 'meta';
      const voiceName = line.voice.replace(
        /[a-z]{2}_[a-z]+/g,
        (id) => voices.find((v) => v.id === id)?.name || id,
      );
      meta.textContent = `${line.speaker ? line.speaker + ' · ' : ''}${voiceName} · ${(line.end - line.start).toFixed(1)} s`;
      body.append(text, meta);
      const tweaks = document.createElement('div');
      tweaks.className = 'tweaks';
      const own = overrides[line.text] || {};
      const speedLabel = document.createElement('label');
      speedLabel.textContent = 'Speed';
      const speed = document.createElement('select');
      for (const s of SPEEDS)
        speed.append(new Option(s ? `${(+s).toFixed(2)}×` : 'Script speed', s));
      speed.value = own.speed != null ? String(own.speed) : '';
      speedLabel.append(speed);
      const pauseLabel = document.createElement('label');
      pauseLabel.textContent = 'Pause after (s)';
      const pause = document.createElement('input');
      pause.type = 'number';
      pause.min = 0;
      pause.max = 5;
      pause.step = 0.1;
      pause.placeholder = String($('pause').value);
      pause.value = own.pause != null ? own.pause : '';
      pauseLabel.append(pause);
      const change = () => {
        const next = {};
        if (speed.value) next.speed = +speed.value;
        if (pause.value !== '') next.pause = +pause.value;
        if (Object.keys(next).length) overrides[line.text] = next;
        else delete overrides[line.text];
        saveDraft();
        $('status').textContent =
          'Changed. Press Make voiceover again; only changed lines are spoken again.';
      };
      speed.onchange = pause.onchange = change;
      tweaks.append(speedLabel, pauseLabel);
      li.append(play, body, tweaks);
      return li;
    }),
  );
}
$('player').addEventListener('timeupdate', () => {
  if (stopAt != null && $('player').currentTime >= stopAt) {
    $('player').pause();
    stopAt = null;
  }
});
$('player').addEventListener('seeking', () => {
  if (stopAt != null && Math.abs($('player').currentTime - stopAt) > 30)
    stopAt = null;
});
$('player').addEventListener('pause', () =>
  document
    .querySelectorAll('.lines li')
    .forEach((x) => x.classList.remove('playing')),
);

$('generate').onclick = async () => {
  const button = $('generate');
  button.disabled = true;
  $('progress').value = 0;
  $('status').textContent = 'Starting…';
  try {
    const speakers = {};
    for (const [name, value] of Object.entries(speakerVoices))
      speakers[name] = resolve(value);
    const { id } = await api('/api/generate', {
      script: $('script').value,
      filename: $('filename').value,
      voice: resolve($('voice').value),
      speakers,
      speed: +$('speed').value,
      pause: +$('pause').value,
      loudness: $('loudness').checked,
      pronunciations: prons,
      overrides,
    });
    for (;;) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const response = await fetch(`/api/job/${id}`);
      const job = await response.json();
      if (!response.ok) throw Error(job.error || 'Lost the job');
      $('progress').value = job.progress || 0;
      $('status').textContent = job.message || 'Working…';
      if (job.status === 'error') throw Error(job.message);
      if (job.status === 'complete') {
        result = job;
        $('player').src = `/file/${id}/voiceover.wav`;
        $('player').classList.remove('hidden');
        outputs(job);
        renderLines(job);
        $('engine-note').textContent = '';
        break;
      }
    }
  } catch (error) {
    $('status').textContent = 'Voiceover failed: ' + error.message;
  } finally {
    button.disabled = false;
  }
};

// ---------------------------------------------------------------- start

$('speed').oninput = () =>
  ($('speed-out').textContent = (+$('speed').value).toFixed(2) + '×');
$('pause').oninput = () =>
  ($('pause-out').textContent = (+$('pause').value).toFixed(1) + ' s');
for (const id of ['script', 'filename'])
  $(id).addEventListener('input', () => {
    saveDraft();
    if (id === 'script') {
      result = null;
      scheduleParse();
    }
  });
for (const id of ['voice', 'speed', 'pause', 'loudness'])
  $(id).addEventListener('change', () => {
    saveDraft();
    if (id === 'voice') scheduleParse();
  });

$('quit').onclick = async () => {
  try {
    await api('/api/quit');
    $('quit-note').textContent =
      'Stopped. You can close this tab. Start Voiceover.cmd starts it again.';
    $('quit').disabled = true;
  } catch {
    $('quit-note').textContent = 'It may already be stopped.';
  }
};

(async () => {
  const status = await (await fetch('/api/status')).json();
  voices = status.voices;
  presets = status.presets;
  prons = status.pronunciations;
  const draft = loadDraft();
  $('script').value = draft.script || '';
  $('filename').value = draft.filename || 'voiceover';
  if (draft.speed) $('speed').value = draft.speed;
  if (draft.pause != null) $('pause').value = draft.pause;
  if (draft.loudness === false) $('loudness').checked = false;
  speakerVoices = draft.speakers || {};
  overrides = draft.overrides || {};
  fillVoiceSelect($('voice'), draft.voice || status.default);
  $('speed').oninput();
  $('pause').oninput();
  renderMixer();
  renderSaved();
  renderProns();
  if (!status.model)
    $('engine-note').textContent =
      'The first voiceover downloads the voice model (about 350 MB), then it works offline.';
  parse();
})();
