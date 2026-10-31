// Beat beds and data-video hits for T.im tools.
// bedEvents() is pure (a timeline of notes, easy to test); makeKit() and
// playEvents() turn that timeline into Web Audio on a live or offline context.

export const STYLES = {
  cyber: {
    name: 'Cyber',
    bpm: 120,
    swing: 0,
    bassWave: 'sawtooth',
    filter: 18000,
    desc: 'Synth bass, kick, snare and hats. The data-video sound.',
  },
  soft: {
    name: 'Soft',
    bpm: 84,
    swing: 0.15,
    bassWave: 'sine',
    filter: 9000,
    desc: 'Warm pad, soft kick and rim. Sits under talking.',
  },
  minimal: {
    name: 'Minimal',
    bpm: 112,
    swing: 0,
    bassWave: 'sine',
    filter: 18000,
    desc: 'Kick, hats and a sub. Lots of space.',
  },
  drive: {
    name: 'Drive',
    bpm: 132,
    swing: 0,
    bassWave: 'sawtooth',
    filter: 18000,
    desc: 'Four on the floor, 16th hats, arpeggio. High energy.',
  },
  lofi: {
    name: 'Lo-fi',
    bpm: 78,
    swing: 0.45,
    bassWave: 'sine',
    filter: 3400,
    desc: 'Lazy swung drums, soft keys and vinyl crackle.',
  },
  synthwave: {
    name: 'Synthwave',
    bpm: 100,
    swing: 0,
    bassWave: 'sawtooth',
    filter: 12000,
    desc: '80s night drive: pulsing bass, big snare, arpeggios.',
  },
  cinematic: {
    name: 'Cinematic',
    bpm: 70,
    swing: 0,
    bassWave: 'sine',
    filter: 7000,
    desc: 'Booms, low drums and long strings. Trailers and race intros.',
  },
  trap: {
    name: 'Trap',
    bpm: 140,
    swing: 0,
    bassWave: '808',
    filter: 18000,
    desc: 'Half-time snare, rolling hats and an 808.',
  },
};

// Minor keys; value is the bass root (octave 2) in Hz.
export const KEYS = {
  E: 82.41,
  'F#': 92.5,
  G: 98,
  A: 110,
  C: 65.41,
  D: 73.42,
};

export const PARTS = ['drums', 'hats', 'bass', 'chords', 'hits'];

// Section types for arrangements. `parts` are the defaults when a section is added.
export const SECTION_TYPES = {
  intro: { name: 'Intro', parts: { drums: false, hats: true, bass: false, chords: true } },
  build: { name: 'Build', parts: { drums: true, hats: true, bass: true, chords: true } },
  drop: { name: 'Drop', parts: { drums: true, hats: true, bass: true, chords: true } },
  verse: { name: 'Verse', parts: { drums: true, hats: true, bass: true, chords: false } },
  breakdown: { name: 'Breakdown', parts: { drums: false, hats: false, bass: true, chords: true } },
  outro: { name: 'Outro', parts: { drums: false, hats: false, bass: false, chords: true } },
};

export const ARRANGEMENTS = {
  story: [
    ['intro', 4],
    ['build', 4],
    ['drop', 8],
    ['breakdown', 4],
    ['drop', 8],
    ['outro', 4],
  ],
  short: [
    ['intro', 2],
    ['drop', 8],
    ['outro', 2],
  ],
  buildup: [
    ['intro', 4],
    ['build', 4],
    ['drop', 8],
  ],
  talk: [
    ['intro', 2],
    ['verse', 12],
    ['drop', 4],
  ],
};

export function makeSections(name) {
  return (ARRANGEMENTS[name] || ARRANGEMENTS.story).map(([type, bars]) => ({
    type,
    bars,
    parts: { ...SECTION_TYPES[type].parts },
  }));
}

// i – VI – VII – v, as semitone offsets from the root (bass, then chord tones).
const PROG = [
  { bass: 0, chord: [12, 15, 19] },
  { bass: -4, chord: [8, 12, 15] },
  { bass: -2, chord: [10, 14, 17] },
  { bass: -5, chord: [7, 10, 14] },
];
const st = (f, s) => f * Math.pow(2, s / 12);

export const ENDINGS = ['hit', 'fade', 'sweep', 'loop', 'cut'];
export const INTROS = ['cold', 'riser', 'fade'];

export function barLength(bpm) {
  return (60 / bpm) * 4;
}

// Snap a requested length to whole bars (at least 1).
export function bars(seconds, bpm) {
  return Math.max(1, Math.round(seconds / barLength(bpm)));
}

// Scale an arrangement so it lasts about `seconds`, keeping at least 1 bar per section.
export function fitSections(sections, seconds, bpm) {
  const target = bars(seconds, bpm),
    now = sections.reduce((n, s) => n + s.bars, 0) || 1;
  const out = sections.map((s) => ({
    ...s,
    parts: { ...s.parts },
    bars: Math.max(1, Math.round((s.bars * target) / now)),
  }));
  let diff = target - out.reduce((n, s) => n + s.bars, 0);
  for (let i = out.length - 1; diff !== 0 && i >= 0; i = i ? i - 1 : out.length - 1) {
    if (diff > 0) {
      out[i].bars++;
      diff--;
    } else if (out[i].bars > 1) {
      out[i].bars--;
      diff++;
    } else if (out.every((s) => s.bars === 1)) break;
  }
  return out;
}

const ALL = { drums: true, hats: true, bass: true, chords: true };

export function bedEvents(o = {}) {
  const style = STYLES[o.style] ? o.style : 'cyber';
  const def = STYLES[style];
  const bpm = Math.max(60, Math.min(180, +o.bpm || def.bpm));
  const root = KEYS[o.key] || KEYS.E;
  const ending = ENDINGS.includes(o.ending) ? o.ending : 'hit';
  const intro = INTROS.includes(o.intro) ? o.intro : 'cold';
  const swing = Math.max(0, Math.min(0.7, o.swing ?? def.swing));
  const L = { ...ALL, ...(o.layers || {}) };
  const beat = 60 / bpm,
    bar = beat * 4;
  const useArr = Array.isArray(o.sections) && o.sections.length > 0;
  const secs = useArr
    ? o.sections.map((s) => ({
        type: SECTION_TYPES[s.type] ? s.type : 'drop',
        bars: Math.max(1, Math.min(64, Math.round(+s.bars || 1))),
        parts: { ...ALL, ...(s.parts || {}) },
      }))
    : [{ type: 'main', bars: bars(o.seconds ?? 30, bpm), parts: { ...L } }];
  const n = secs.reduce((a, s) => a + s.bars, 0);
  const body = n * bar;
  const tail = ending === 'hit' ? 2.2 : ending === 'sweep' ? 1.2 : 0;
  const ev = [];
  const push = (t, kind, part, p = {}) => ev.push({ t: +t.toFixed(6), kind, part, ...p });
  // swing: delay the "and" (8th) and the 2nd/4th 16ths
  const pos = (s16) => (s16 * beat) / 4 + (s16 === 2 ? (swing * beat) / 6 : s16 % 2 ? (swing * beat) / 12 : 0);
  const quietBars = intro === 'riser' && !useArr && n > 2 ? 1 : 0;
  if (intro === 'riser') push(0, 'riser', 'hits', { d: quietBars ? bar : Math.min(bar, 1.5), v: 0.16 });
  const sections = [];
  let b = 0;
  secs.forEach((sec, si) => {
    const start = b * bar;
    sections.push({ type: sec.type, bars: sec.bars, start, end: start + sec.bars * bar, parts: sec.parts });
    // arrangement accents
    if (useArr) {
      if (sec.type === 'build')
        push(start + Math.max(0, sec.bars - 1) * bar, 'riser', 'hits', { d: bar, v: 0.14 });
      if (sec.type === 'drop' && si > 0) {
        push(start, 'sub', 'hits', { v: 0.6 });
        push(start, 'crash', 'hits', { v: 0.12 });
      }
    }
    for (let k = 0; k < sec.bars; k++, b++) {
      const t0 = b * bar,
        ch = PROG[b % 4],
        bf = st(root, ch.bass),
        tones = ch.chord.map((s) => st(root, s));
      const P = {
        drums: sec.parts.drums && b >= quietBars,
        hats: sec.parts.hats && b >= quietBars,
        bass: sec.parts.bass,
        chords: sec.parts.chords,
      };
      const lastOfBuild = useArr && sec.type === 'build' && k === sec.bars - 1;
      GEN[style]({ t0, b, beat, bar, bf, tones, P, push, pos, lastOfBuild, first: k === 0 });
      if (lastOfBuild && P.drums)
        for (let s = 0; s < 16; s++)
          push(t0 + (s * beat) / 4, 'snare', 'drums', { v: 0.08 + (s / 16) * 0.22 });
    }
  });
  if (intro === 'fade') push(0, 'fadeIn', 'master', { d: Math.min(bar * 2, body / 2) });
  const firstChord = PROG[0].chord.map((s) => st(root, s));
  if (ending === 'hit') {
    push(body, 'kick', 'hits', { v: 0.8 });
    push(body, 'sub', 'hits', { v: 0.8 });
    push(body, 'stab', 'hits', { fs: firstChord, v: 0.09 });
    push(body + 0.05, 'chime', 'hits', { v: 0.03 });
  } else if (ending === 'sweep') {
    push(body, 'sub', 'hits', { v: 0.6 });
    push(body, 'sweep', 'hits', { v: 0.1 });
  } else if (ending === 'fade') {
    const d = Math.min(bar * 2, body / 2);
    push(Math.max(0, body - d), 'fadeOut', 'master', { d });
  }
  ev.sort((a, c) => a.t - c.t);
  return { events: ev, bpm, bar, beat, bars: n, body, total: body + tail, style, swing, sections };
}

// One generator per style. Each pushes one bar of notes.
const GEN = {
  cyber({ t0, beat, bar, bf, tones, P, push, pos }) {
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (P.drums) {
        push(t, 'kick', 'drums', { v: 0.6 });
        if (q % 2) push(t, 'snare', 'drums', { v: 0.28 });
      }
      if (P.hats) push(t + pos(2), 'hat', 'hats', { v: 0.06 });
      if (P.bass) {
        push(t, 'bass', 'bass', { f: bf, d: beat * 0.44, v: 0.15, cut: 420, wave: 'sawtooth' });
        push(t + pos(2), 'bass', 'bass', { f: bf * 2, d: beat * 0.36, v: 0.09, cut: 520, wave: 'sawtooth' });
      }
    }
    if (P.chords) push(t0, 'pad', 'chords', { fs: tones, d: bar * 0.95, v: 0.025, a: 0.02, cut: 1800 });
  },
  soft({ t0, beat, bar, bf, tones, P, push, pos }) {
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (P.drums) {
        if (q === 0 || q === 2) push(t, 'kick', 'drums', { v: 0.42, soft: true });
        if (q % 2) push(t, 'rim', 'drums', { v: 0.12 });
      }
      if (P.hats) for (let s = 0; s < 4; s++) push(t + pos(s), 'shaker', 'hats', { v: s % 2 ? 0.02 : 0.035 });
      if (P.bass && q === 0) push(t, 'bass', 'bass', { f: bf, d: bar * 0.95, v: 0.2, cut: 600, wave: 'sine' });
    }
    if (P.chords) push(t0, 'pad', 'chords', { fs: tones, d: bar * 1.05, v: 0.04, a: 0.35, cut: 1300, wave: 'sine' });
  },
  minimal({ t0, b, beat, bf, tones, P, push, pos }) {
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (P.drums) push(t, 'kick', 'drums', { v: 0.62 });
      if (P.hats) push(t + pos(2), 'hat', 'hats', { v: 0.05 });
      if (P.bass && (q === 0 || q === 2)) push(t, 'bass', 'bass', { f: bf, d: beat * 1.8, v: 0.22, cut: 600, wave: 'sine' });
    }
    if (P.chords) {
      if (b % 2 === 0) push(t0, 'pluck', 'chords', { f: tones[0] * 2, v: 0.035 });
      push(t0 + beat * 2 + pos(2), 'pluck', 'chords', { f: tones[2] * 2, v: 0.025 });
    }
  },
  drive({ t0, beat, bar, bf, tones, P, push, pos }) {
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (P.drums) {
        push(t, 'kick', 'drums', { v: 0.62 });
        if (q % 2) {
          push(t, 'snare', 'drums', { v: 0.26 });
          push(t + 0.012, 'clap', 'drums', { v: 0.16 });
        }
      }
      if (P.hats) for (let s = 0; s < 4; s++) push(t + pos(s), 'hat', 'hats', { v: s === 2 ? 0.07 : 0.035 });
      if (P.bass)
        for (let s = 0; s < 4; s++)
          push(t + pos(s), 'bass', 'bass', { f: s === 2 ? bf * 2 : bf, d: beat * 0.2, v: 0.12, cut: 700, wave: 'sawtooth' });
    }
    if (P.chords) {
      push(t0, 'pad', 'chords', { fs: tones, d: bar * 0.95, v: 0.02, a: 0.01, cut: 2400 });
      for (let s = 0; s < 16; s++)
        push(t0 + Math.floor(s / 4) * beat + pos(s % 4), 'pluck', 'chords', { f: tones[s % 3] * 2, v: 0.018 });
    }
  },
  lofi({ t0, beat, bar, bf, tones, P, push, pos }) {
    if (P.drums) {
      push(t0, 'kick', 'drums', { v: 0.48, soft: true });
      push(t0 + 2 * beat + pos(2), 'kick', 'drums', { v: 0.4, soft: true });
      push(t0 + beat, 'snare', 'drums', { v: 0.16, soft: true });
      push(t0 + 3 * beat, 'snare', 'drums', { v: 0.16, soft: true });
    }
    if (P.hats)
      for (let q = 0; q < 4; q++) {
        push(t0 + q * beat, 'hat', 'hats', { v: 0.035 });
        push(t0 + q * beat + pos(2), 'hat', 'hats', { v: 0.022 });
      }
    if (P.bass) {
      push(t0, 'bass', 'bass', { f: bf, d: beat * 1.6, v: 0.2, cut: 500, wave: 'sine' });
      push(t0 + 2 * beat + pos(2), 'bass', 'bass', { f: bf, d: beat * 1.2, v: 0.15, cut: 500, wave: 'sine' });
    }
    if (P.chords) {
      tones.forEach((f, i) => push(t0 + i * 0.03, 'keys', 'chords', { f, d: beat * 1.8, v: 0.045 }));
      tones.forEach((f, i) => push(t0 + 2 * beat + pos(2) + i * 0.03, 'keys', 'chords', { f, d: beat * 1.2, v: 0.03 }));
      push(t0, 'crackle', 'chords', { d: bar, v: 0.025 });
    }
  },
  synthwave({ t0, beat, bar, bf, tones, P, push, pos }) {
    for (let q = 0; q < 4; q++) {
      const t = t0 + q * beat;
      if (P.drums) {
        push(t, 'kick', 'drums', { v: 0.6 });
        if (q % 2) push(t, 'snare', 'drums', { v: 0.34, big: true });
      }
      if (P.hats) push(t + pos(2), 'hat', 'hats', { v: 0.05 });
      if (P.bass)
        for (let s = 0; s < 4; s += 2)
          push(t + pos(s), 'bass', 'bass', { f: s ? bf * 2 : bf, d: beat * 0.4, v: 0.13, cut: 900, wave: 'sawtooth' });
    }
    if (P.chords) {
      push(t0, 'pad', 'chords', { fs: tones, d: bar * 0.98, v: 0.018, a: 0.08, cut: 2600, wave: 'sawtooth', detune: true });
      for (let s = 0; s < 16; s++)
        push(t0 + Math.floor(s / 4) * beat + pos(s % 4), 'pluck', 'chords', { f: tones[[0, 1, 2, 1][s % 4]] * 4, v: 0.014 });
    }
  },
  cinematic({ t0, b, beat, bar, bf, tones, P, push }) {
    if (P.drums) {
      if (b % 2 === 0) push(t0, 'boom', 'drums', { v: 0.75 });
      push(t0 + 2 * beat, 'tom', 'drums', { f: 110, v: 0.3 });
      push(t0 + 3 * beat, 'tom', 'drums', { f: 90, v: 0.26 });
      push(t0 + 3.5 * beat, 'tom', 'drums', { f: 80, v: 0.32 });
    }
    if (P.hats) for (let q = 0; q < 4; q++) push(t0 + q * beat, 'shaker', 'hats', { v: 0.02 });
    if (P.bass)
      for (let s = 0; s < 8; s++)
        push(t0 + (s * beat) / 2, 'bass', 'bass', { f: bf, d: beat * 0.42, v: 0.12, cut: 380, wave: 'sine' });
    if (P.chords) push(t0, 'pad', 'chords', { fs: [tones[0] / 2, ...tones], d: bar * 1.1, v: 0.025, a: 0.6, cut: 1500, wave: 'sawtooth' });
  },
  trap({ t0, b, beat, bar, bf, tones, P, push }) {
    if (P.drums) {
      push(t0, 'kick', 'drums', { v: 0.66 });
      push(t0 + 1.75 * beat, 'kick', 'drums', { v: 0.55 });
      if (b % 2) push(t0 + 3.5 * beat, 'kick', 'drums', { v: 0.5 });
      push(t0 + 2 * beat, 'snare', 'drums', { v: 0.3 });
      push(t0 + 2 * beat + 0.012, 'clap', 'drums', { v: 0.2 });
    }
    if (P.hats)
      for (let s = 0; s < 8; s++) {
        const roll = b % 2 === 1 && s >= 6;
        if (roll) for (let r = 0; r < 4; r++) push(t0 + (s * beat) / 2 + (r * beat) / 8, 'hat', 'hats', { v: 0.03 + r * 0.008 });
        else push(t0 + (s * beat) / 2, 'hat', 'hats', { v: s % 2 ? 0.035 : 0.05 });
      }
    if (P.bass) {
      push(t0, 'bass', 'bass', { f: bf, d: beat * 1.6, v: 0.32, cut: 900, wave: '808' });
      push(t0 + 1.75 * beat, 'bass', 'bass', { f: bf, d: beat * 1.2, v: 0.26, cut: 900, wave: '808' });
    }
    if (P.chords) push(t0, 'pad', 'chords', { fs: tones, d: bar * 0.95, v: 0.02, a: 0.2, cut: 1600, wave: 'triangle' });
  },
};

// Deterministic noise so the same settings always render the same file.
function noiseBuffer(ctx, seed = 7, seconds = 1, channels = 1) {
  const buf = ctx.createBuffer(channels, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
  let s = seed >>> 0;
  for (let c = 0; c < channels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      d[i] = (s / 4294967296) * 2 - 1;
    }
  }
  return buf;
}
function impulse(ctx, seed, seconds = 2.2) {
  const buf = noiseBuffer(ctx, seed + 99, seconds, 2);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= Math.pow(1 - i / d.length, 3);
  }
  return buf;
}

export const DEFAULT_SHAPING = {
  mix: {
    drums: { vol: 1, mute: false, solo: false },
    hats: { vol: 1, mute: false, solo: false },
    bass: { vol: 1, mute: false, solo: false },
    chords: { vol: 1, mute: false, solo: false },
    hits: { vol: 1, mute: false, solo: false },
  },
  bassWave: 'auto',
  filter: 0, // 0 = style default
  reverb: 0.15,
  delay: 0,
};
const SEND = {
  reverb: { drums: 0.35, hats: 0.4, bass: 0, chords: 1, hits: 0.8 },
  delay: { drums: 0, hats: 0.6, bass: 0, chords: 1, hits: 0.6 },
};

// A small instrument kit wired to `dest`. Every method takes an absolute
// context time and an optional bus. Parts each get a bus so they can be mixed.
export function makeKit(ctx, dest, opts = {}) {
  const master = ctx.createGain();
  master.gain.value = opts.volume ?? 0.5;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.ratio.value = 4;
  master.connect(comp);
  comp.connect(dest);
  const music = ctx.createGain(),
    tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = opts.tone ?? 18000;
  tone.Q.value = 0.7;
  music.gain.value = opts.music ?? 1;
  music.connect(tone);
  tone.connect(master);
  const fx = ctx.createGain();
  fx.connect(master);
  const seed = opts.seed ?? 7;
  const noise = noiseBuffer(ctx, seed);
  // reverb and delay returns
  const verb = ctx.createConvolver();
  verb.buffer = impulse(ctx, seed);
  const verbIn = ctx.createGain(),
    verbOut = ctx.createGain();
  verbIn.connect(verb).connect(verbOut).connect(master);
  const dly = ctx.createDelay(2),
    fb = ctx.createGain(),
    dlyIn = ctx.createGain(),
    dlyOut = ctx.createGain(),
    dlyTone = ctx.createBiquadFilter();
  dlyTone.type = 'lowpass';
  dlyTone.frequency.value = 3500;
  dly.delayTime.value = 0.375;
  fb.gain.value = 0.35;
  dlyIn.connect(dly);
  dly.connect(dlyTone).connect(fb).connect(dly);
  dlyTone.connect(dlyOut).connect(master);
  verbOut.gain.value = 0;
  dlyOut.gain.value = 0;
  // part buses
  const bus = {},
    sends = {};
  for (const p of PARTS) {
    bus[p] = ctx.createGain();
    bus[p].connect(p === 'hits' ? fx : music);
    const r = ctx.createGain(),
      d = ctx.createGain();
    r.gain.value = SEND.reverb[p];
    d.gain.value = SEND.delay[p];
    bus[p].connect(r).connect(verbIn);
    bus[p].connect(d).connect(dlyIn);
    sends[p] = { r, d };
  }
  const env = (g, t, a, p, d) => {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, p), t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  };
  const osc = (t, f, type, v, d, cut, out, a = 0.005, detune = 0) => {
    const o = ctx.createOscillator(),
      g = ctx.createGain(),
      fl = ctx.createBiquadFilter();
    o.type = type;
    o.frequency.value = f;
    if (detune) o.detune.value = detune;
    fl.type = 'lowpass';
    fl.frequency.value = cut;
    env(g, t, a, v, d);
    o.connect(fl).connect(g).connect(out);
    o.start(t);
    o.stop(t + a + d + 0.05);
  };
  const nz = (t, type, f, v, d, out, q = 1) => {
    const s = ctx.createBufferSource();
    s.buffer = noise;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.setValueAtTime(v, t + d * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(fl).connect(g).connect(out);
    s.start(t, (t * 0.37) % 0.5);
    s.stop(t + d + 0.02);
  };
  const shaper = ctx.createWaveShaper();
  {
    const c = new Float32Array(1024);
    for (let i = 0; i < c.length; i++) {
      const x = (i / (c.length - 1)) * 2 - 1;
      c[i] = Math.tanh(2.2 * x);
    }
    shaper.curve = c;
  }
  shaper.connect(bus.bass);
  let bassWave = 'auto';
  const k = {
    ctx,
    master,
    music,
    fx,
    tone,
    bus,
    kick(t, v = 0.6, out = bus.drums, soft = false) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.setValueAtTime(soft ? 110 : 150, t);
      o.frequency.exponentialRampToValueAtTime(soft ? 45 : 42, t + 0.12);
      env(g, t, 0.003, v, soft ? 0.4 : 0.32);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.5);
    },
    snare(t, v = 0.28, out = bus.drums, soft = false, big = false) {
      nz(t, soft ? 'bandpass' : 'highpass', soft ? 2200 : 1400, v, big ? 0.26 : soft ? 0.1 : 0.13, out);
      osc(t, 190, 'triangle', v * 0.8, 0.08, 3000, out, 0.002);
    },
    clap(t, v = 0.16, out = bus.drums) {
      for (let i = 0; i < 3; i++) nz(t + i * 0.011, 'bandpass', 1600, v, 0.05, out, 1.5);
    },
    rim(t, v = 0.12, out = bus.drums) {
      nz(t, 'bandpass', 2600, v, 0.03, out, 4);
      osc(t, 820, 'triangle', v * 0.6, 0.04, 4000, out, 0.001);
    },
    tom(t, f = 100, v = 0.3, out = bus.drums) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = 'triangle';
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.3);
      env(g, t, 0.004, v, 0.45);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.55);
      nz(t, 'lowpass', 600, v * 0.3, 0.06, out);
    },
    boom(t, v = 0.75, out = bus.drums) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(28, t + 1.2);
      env(g, t, 0.01, v, 1.6);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 1.7);
      nz(t, 'lowpass', 300, v * 0.4, 0.4, out);
    },
    hat(t, v = 0.06, out = bus.hats) {
      nz(t, 'highpass', 7500, v, 0.035, out);
    },
    shaker(t, v = 0.03, out = bus.hats) {
      nz(t, 'bandpass', 6000, v, 0.06, out, 0.8);
    },
    crash(t, v = 0.12, out = bus.hits) {
      nz(t, 'highpass', 5000, v, 1.4, out, 0.5);
    },
    crackle(t, d, v = 0.025, out = bus.chords) {
      nz(t, 'bandpass', 3200, v * 0.3, d, out, 0.4);
      for (let i = 0; i < 6; i++) nz(t + ((i * 0.618 * d) % d), 'highpass', 4000, v * 2, 0.008, out);
    },
    bass(t, f, d, v = 0.15, cut = 420, out = bus.bass, wave = 'sawtooth') {
      const w = bassWave !== 'auto' ? bassWave : wave;
      if (w === '808') {
        const o = ctx.createOscillator(),
          g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(f * 1.5, t);
        o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
        env(g, t, 0.004, v, d);
        o.connect(g).connect(shaper);
        o.start(t);
        o.stop(t + d + 0.05);
        return;
      }
      osc(t, f, w, w === 'sine' || w === 'triangle' ? v * 1.4 : v, d, w === 'sine' ? 1200 : cut, out, w === 'sine' ? 0.01 : 0.005);
    },
    pad(t, fs, d, v = 0.025, a = 0.02, cut = 1800, wave = 'triangle', out = bus.chords, detune = false) {
      fs.forEach((f) => {
        osc(t, f, wave, v, d, cut, out, a);
        if (detune) osc(t, f, wave, v * 0.7, d, cut, out, a, 9);
      });
    },
    keys(t, f, d, v = 0.04, out = bus.chords) {
      osc(t, f, 'triangle', v, d, 2200, out, 0.004);
      osc(t, f * 2, 'sine', v * 0.35, d * 0.5, 4000, out, 0.003);
    },
    pluck(t, f, v = 0.03, out = bus.chords) {
      osc(t, f, 'square', v, 0.14, 2600, out, 0.002);
    },
    click(t, v = 0.22, out = fx) {
      nz(t, 'highpass', 3000, v, 0.012, out);
    },
    blip(t, f, v = 0.04, out = fx) {
      osc(t, f, 'square', v, 0.07, 4000, out, 0.002);
    },
    stab(t, fs, v = 0.08, out = fx) {
      fs.forEach((f) => {
        osc(t, f, 'square', v, 0.3, 2600, out);
        osc(t, f * 1.006, 'sawtooth', v * 0.6, 0.3, 2200, out);
      });
    },
    sub(t, v = 0.7, out = fx) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.frequency.setValueAtTime(95, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.7);
      env(g, t, 0.005, v, 0.75);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.85);
    },
    chime(t, v = 0.03, out = fx) {
      [1318.5, 1975.5, 2637].forEach((f, i) => osc(t + i * 0.06, f, 'square', v, 0.3, 6000, out));
    },
    riser(t, d, v = 0.18, out = fx) {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      s.loop = true;
      const fl = ctx.createBiquadFilter();
      fl.type = 'bandpass';
      fl.Q.value = 4;
      fl.frequency.setValueAtTime(300, t);
      fl.frequency.exponentialRampToValueAtTime(7000, t + d);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + d);
      g.gain.setValueAtTime(0.0001, t + d + 0.01);
      s.connect(fl).connect(g).connect(out);
      s.start(t);
      s.stop(t + d + 0.05);
    },
    sweep(t, v = 0.1, out = fx) {
      const o = ctx.createOscillator(),
        g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.45);
      env(g, t, 0.005, v, 0.45);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.55);
    },
    // duck the music bus between two times (used for stops and talking)
    duck(a, b, to = 0.3) {
      const g = music.gain;
      g.setValueAtTime(1, a);
      g.linearRampToValueAtTime(to, a + 0.06);
      g.setValueAtTime(to, Math.max(a + 0.07, b - 0.05));
      g.linearRampToValueAtTime(1, b + 0.05);
    },
    cutMusic(t) {
      music.gain.setValueAtTime(music.gain.value || 1, t - 0.02);
      music.gain.linearRampToValueAtTime(0.0001, t + 0.05);
    },
    // Mixer and effects. Safe to call while playing; changes apply right away.
    shape(sh = {}, style = 'cyber', bpm = 120) {
      const s = { ...DEFAULT_SHAPING, ...sh, mix: { ...DEFAULT_SHAPING.mix, ...(sh.mix || {}) } };
      const anySolo = PARTS.some((p) => s.mix[p] && s.mix[p].solo);
      for (const p of PARTS) {
        const m = s.mix[p] || {};
        const v = m.mute || (anySolo && !m.solo) ? 0 : Math.max(0, Math.min(1.5, m.vol ?? 1));
        bus[p].gain.setTargetAtTime(v, ctx.currentTime, 0.01);
      }
      const f = +s.filter || (STYLES[style] || STYLES.cyber).filter;
      tone.frequency.setTargetAtTime(Math.max(200, Math.min(18000, f)), ctx.currentTime, 0.02);
      verbOut.gain.setTargetAtTime(Math.max(0, Math.min(1, s.reverb)) * 0.9, ctx.currentTime, 0.02);
      dlyOut.gain.setTargetAtTime(Math.max(0, Math.min(1, s.delay)) * 0.7, ctx.currentTime, 0.02);
      dly.delayTime.setValueAtTime((60 / bpm) * 0.75, ctx.currentTime);
      bassWave = s.bassWave || 'auto';
    },
  };
  return k;
}

// Schedule a bedEvents() timeline on a kit, starting at context time t0.
export function playEvents(kit, t0, bed) {
  for (const e of bed.events) {
    const t = t0 + e.t,
      out = kit.bus[e.part] || kit.fx;
    switch (e.kind) {
      case 'kick':
        kit.kick(t, e.v, out, e.soft);
        break;
      case 'snare':
        kit.snare(t, e.v, out, e.soft, e.big);
        break;
      case 'clap':
        kit.clap(t, e.v, out);
        break;
      case 'rim':
        kit.rim(t, e.v, out);
        break;
      case 'tom':
        kit.tom(t, e.f, e.v, out);
        break;
      case 'boom':
        kit.boom(t, e.v, out);
        break;
      case 'hat':
        kit.hat(t, e.v, out);
        break;
      case 'shaker':
        kit.shaker(t, e.v, out);
        break;
      case 'crash':
        kit.crash(t, e.v, out);
        break;
      case 'crackle':
        kit.crackle(t, e.d, e.v, out);
        break;
      case 'bass':
        kit.bass(t, e.f, e.d, e.v, e.cut, out, e.wave);
        break;
      case 'pad':
        kit.pad(t, e.fs, e.d, e.v, e.a, e.cut, e.wave || 'triangle', out, e.detune);
        break;
      case 'keys':
        kit.keys(t, e.f, e.d, e.v, out);
        break;
      case 'pluck':
        kit.pluck(t, e.f, e.v, out);
        break;
      case 'riser':
        kit.riser(t, e.d, e.v, out);
        break;
      case 'stab':
        kit.stab(t, e.fs, e.v, out);
        break;
      case 'sub':
        kit.sub(t, e.v, out);
        break;
      case 'chime':
        kit.chime(t, e.v, out);
        break;
      case 'sweep':
        kit.sweep(t, e.v, out);
        break;
      case 'fadeIn': {
        const g = kit.master.gain,
          v = g.value;
        g.setValueAtTime(0.0001, t);
        g.exponentialRampToValueAtTime(v, t + e.d);
        break;
      }
      case 'fadeOut': {
        const g = kit.master.gain,
          v = g.value;
        g.setValueAtTime(v, t);
        g.linearRampToValueAtTime(0.0001, t + e.d);
        break;
      }
    }
  }
}

// Render a bed to an AudioBuffer offline (48 kHz stereo).
export async function renderBed(opts, sampleRate = 48000) {
  const bed = bedEvents(opts);
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const len = Math.ceil((bed.total + 0.05) * sampleRate);
  const ctx = new OAC(2, len, sampleRate);
  const kit = makeKit(ctx, ctx.destination, {
    volume: 0.5,
    music: opts.voiceRoom ? 0.5 : 1,
    seed: 7,
  });
  kit.shape(opts.shaping, bed.style, bed.bpm);
  playEvents(kit, 0, bed);
  return { buffer: await ctx.startRendering(), bed };
}
