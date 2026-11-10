// Recorded instrument samples for Beat Bed. Each set lives in ./samples/<name>/
// as a manifest.json plus one MP3 per recorded note. Notes are pre-rendered
// one-shots (see manifest "source"), so playback is a pitch-shifted buffer.

const raw = new Map(); // name -> Promise<{ manifest, files: ArrayBuffer[] }>

// For tests: forget downloaded sets.
export function resetSampleCache() {
  raw.clear();
}

export function sampleUrl(name, file) {
  return new URL(`./samples/${name}/${file}`, import.meta.url).href;
}

export const midiToFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f) => 69 + 12 * Math.log2(f / 440);

function fetchRaw(name, fetchImpl) {
  if (!raw.has(name)) {
    const p = (async () => {
      const res = await fetchImpl(sampleUrl(name, 'manifest.json'));
      if (!res.ok) throw new Error(`Sample set ${name} not found`);
      const manifest = await res.json();
      const files = await Promise.all(
        manifest.notes.map(async (n) => {
          const r = await fetchImpl(sampleUrl(name, n.file));
          if (!r.ok) throw new Error(`Sample ${n.file} not found`);
          return r.arrayBuffer();
        }),
      );
      return { manifest, files };
    })();
    // A failed load is not cached, so a later try can succeed.
    p.catch(() => raw.delete(name));
    raw.set(name, p);
  }
  return raw.get(name);
}

// Loads and decodes a set for one audio context (live or offline).
export async function loadSampleSet(ctx, name, fetchImpl = globalThis.fetch) {
  const { manifest, files } = await fetchRaw(name, fetchImpl);
  const buffers = await Promise.all(files.map((b) => ctx.decodeAudioData(b.slice(0))));
  return {
    name,
    notes: manifest.notes.map((n, i) => ({ root: n.root, lo: n.lo, hi: n.hi, buffer: buffers[i] })),
  };
}

// The recorded note to play for a pitch: the zone covering it, else the nearest root.
export function pickNote(set, freq) {
  const m = Math.round(freqToMidi(freq));
  const hit = set.notes.find((n) => m >= n.lo && m <= n.hi);
  if (hit) return hit;
  return set.notes.reduce((best, n) => (Math.abs(n.root - m) < Math.abs(best.root - m) ? n : best));
}
