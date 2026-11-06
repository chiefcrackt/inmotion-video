/* Reads the cut list the edit plan returns. Shared by the page and Node checks; no network calls. */
(function (root) {
  // Accepts the whole reply, a bare JSON object, or a fenced ```json block inside prose.
  function parseCutList(text) {
    const fenced = String(text || '').match(/```(?:json)?\s*([\s\S]*?)```/);
    const body = (fenced ? fenced[1] : String(text || '')).trim();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      throw Error(
        'Paste the JSON cut list from the edit plan. It starts with { and contains "cuts".',
      );
    }
    const cuts = Array.isArray(data) ? data : data && data.cuts;
    if (!Array.isArray(cuts) || cuts.length === 0)
      throw Error('The cut list has no cuts.');
    return cuts.map((cut) => ({
      start: Number(cut && cut.start),
      end: Number(cut && cut.end),
      reason: cut && typeof cut.reason === 'string' ? cut.reason : '',
    }));
  }
  // Overlapping or touching cuts are merged, so the totals below count each second once.
  function mergeCuts(cuts) {
    const sorted = cuts
      .map((cut) => ({ start: cut.start, end: cut.end }))
      .sort((a, b) => a.start - b.start);
    const merged = [];
    for (const cut of sorted) {
      const last = merged[merged.length - 1];
      if (last && cut.start <= last.end) last.end = Math.max(last.end, cut.end);
      else merged.push({ ...cut });
    }
    return merged;
  }
  function summarize(cuts, duration) {
    const merged = mergeCuts(cuts);
    const removed = merged.reduce((sum, cut) => sum + (cut.end - cut.start), 0);
    return {
      cuts: merged.length,
      removed,
      kept: Math.max(0, duration - removed),
      duration,
    };
  }
  // ---- Word cutting: pick words and pauses on the transcript; the cuts are built from word times. ----
  // Gap k sits before word k: gap 0 is the lead-in, gap n (n = word count) the tail after the last word.
  const PAUSE_MIN = 0.5; // Gaps at least this long show as a pause you can shorten.
  const PAUSE_HOLD = 0.15; // A shortened pause keeps this much on each side, so it still breathes.
  const round = (n) => Math.round(n * 1000) / 1000;
  function cleanWords(words) {
    return (words || [])
      .map((w) => ({
        start: Number(w.start),
        end: Number(w.end),
        word: String(w.word || '').trim(),
        probability: w.probability === undefined ? 1 : Number(w.probability),
      }))
      .filter((w) => isFinite(w.start) && isFinite(w.end) && w.word);
  }
  function gapBounds(words, duration, k) {
    return {
      start: k === 0 ? 0 : words[k - 1].end,
      end: k === words.length ? duration : words[k].start,
    };
  }
  // Pauses worth showing: every gap of PAUSE_MIN or more, including the lead-in and tail.
  function pauses(words, duration, min = PAUSE_MIN) {
    const list = [];
    for (let k = 0; k <= words.length; k++) {
      const { start, end } = gapBounds(words, duration, k);
      if (end - start >= min) list.push({ gap: k, start, end });
    }
    return list;
  }
  // Removing words i..j cuts from the middle of the gap before to the middle of the gap after,
  // so the cut lands in silence and the joined speech keeps a natural pause.
  // Removing a pause keeps PAUSE_HOLD at each edge (none at the very start or end of the recording).
  function selectionCuts(words, duration, removedWords, removedGaps) {
    const isWord = (i) => removedWords.has(i);
    const cuts = [];
    const n = words.length;
    for (let i = 0; i < n; i++) {
      if (!isWord(i) || isWord(i - 1)) continue;
      let j = i;
      while (j + 1 < n && isWord(j + 1)) j++;
      const start = i === 0 ? 0 : (words[i - 1].end + words[i].start) / 2;
      const end = j === n - 1 ? duration : (words[j].end + words[j + 1].start) / 2;
      const text = words
        .slice(i, j + 1)
        .map((w) => w.word)
        .join(' ');
      cuts.push({ start, end, reason: 'removed: ' + (text.length > 60 ? text.slice(0, 57) + '…' : text) });
    }
    for (const k of removedGaps) {
      if (k < 0 || k > n) continue;
      const gap = gapBounds(words, duration, k);
      const start = k === 0 ? 0 : gap.start + PAUSE_HOLD;
      const end = k === n ? duration : gap.end - PAUSE_HOLD;
      if (end - start >= 0.05)
        cuts.push({ start, end, reason: k === 0 ? 'lead-in' : k === n ? 'tail' : 'shortened pause' });
    }
    cuts.sort((a, b) => a.start - b.start);
    // Merge touching cuts, keeping the first reason, then round for the list.
    const merged = [];
    for (const cut of cuts) {
      const last = merged[merged.length - 1];
      if (last && cut.start <= last.end + 0.001) {
        if (cut.end > last.end) last.end = cut.end;
        if (!last.reason.includes(cut.reason)) last.reason += '; ' + cut.reason;
      } else merged.push({ ...cut });
    }
    return merged
      .map((c) => ({ start: round(Math.max(0, c.start)), end: round(Math.min(duration, c.end)), reason: c.reason }))
      .filter((c) => c.end - c.start >= 0.01);
  }
  // Show an existing cut list (for example the edit plan's) on the words: a word counts as removed
  // when its middle is inside a cut; a pause when well over half of it is (a removed word next to a
  // pause takes exactly half of that pause, which must not count).
  function selectionFromCuts(words, duration, cuts) {
    const merged = mergeCuts(cuts);
    const inside = (t) => merged.some((c) => t >= c.start && t <= c.end);
    const covered = (a, b) =>
      merged.reduce((sum, c) => sum + Math.max(0, Math.min(b, c.end) - Math.max(a, c.start)), 0);
    const removedWords = new Set();
    words.forEach((w, i) => {
      if (inside((w.start + w.end) / 2)) removedWords.add(i);
    });
    const removedGaps = new Set();
    for (const p of pauses(words, duration)) if (covered(p.start, p.end) > (p.end - p.start) * 0.6) removedGaps.add(p.gap);
    return { removedWords, removedGaps };
  }
  const api = {
    parseCutList,
    mergeCuts,
    summarize,
    cleanWords,
    pauses,
    selectionCuts,
    selectionFromCuts,
    PAUSE_MIN,
    PAUSE_HOLD,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CutList = api;
})(globalThis);
