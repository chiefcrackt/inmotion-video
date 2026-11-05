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
  const api = { parseCutList, mergeCuts, summarize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CutList = api;
})(globalThis);
