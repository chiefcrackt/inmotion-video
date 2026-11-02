// Causal clocks let older device snapshots coexist without rolling back newer edits.
export function stable(value) {
  if (Array.isArray(value)) return '[' + value.map(stable).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ':' + stable(value[k]))
        .join(',') +
      '}'
    );
  return JSON.stringify(value);
}
export function content(p) {
  const { clock, revision, updated, ...value } = p;
  return stable(value);
}
export function dominates(a = {}, b = {}) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return (
    [...keys].every((k) => (a[k] || 0) >= (b[k] || 0)) &&
    [...keys].some((k) => (a[k] || 0) > (b[k] || 0))
  );
}
export function stamp(previous, projects, device) {
  const old = new Map(previous.map((p) => [p.id, p]));
  for (const p of projects) {
    const before = old.get(p.id);
    if (!p.revision || !before || content(before) !== content(p)) {
      p.clock = Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(before?.clock || {}),
            ...Object.keys(p.clock || {}),
          ]),
        ].map((k) => [k, Math.max(before?.clock?.[k] || 0, p.clock?.[k] || 0)]),
      );
      p.clock[device] = (p.clock[device] || 0) + 1;
      p.revision = crypto.randomUUID();
      p.updated = Date.now();
    }
  }
  return projects;
}
export function mergeProjects(...lists) {
  const rows = new Map(),
    queue = lists.flat().map((p) => structuredClone(p));
  for (let i = 0; i < queue.length; i++) {
    const p = queue[i],
      a = rows.get(p.id);
    if (!a) {
      rows.set(p.id, p);
      continue;
    }
    if (stable(a) === stable(p) || (a.revision && a.revision === p.revision))
      continue;
    if (dominates(a.clock, p.clock)) continue;
    if (dominates(p.clock, a.clock)) {
      rows.set(p.id, p);
      continue;
    }
    if (content(a) === content(p)) {
      const winner = String(a.revision) > String(p.revision) ? a : p;
      winner.clock = Object.fromEntries(
        [
          ...new Set([
            ...Object.keys(a.clock || {}),
            ...Object.keys(p.clock || {}),
          ]),
        ].map((k) => [k, Math.max(a.clock?.[k] || 0, p.clock?.[k] || 0)]),
      );
      rows.set(p.id, winner);
      continue;
    }
    const [winner, loser] =
      String(a.revision) > String(p.revision) ? [a, p] : [p, a];
    rows.set(p.id, winner);
    queue.push({ ...loser, id: p.id + '~' + loser.revision, conflictOf: p.id });
  }
  return [...rows.values()].sort((a, b) => a.id.localeCompare(b.id));
}
