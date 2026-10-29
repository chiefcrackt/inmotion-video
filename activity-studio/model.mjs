// SI units internally: meters, seconds, watts, bpm, steps/min; timestamps in ms.
export const finite = (v) => typeof v === 'number' && Number.isFinite(v);
export const number = (v) =>
  v == null || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null;
export const timestamp = (v) =>
  v == null || v === ''
    ? null
    : Number.isFinite(+new Date(v))
      ? +new Date(v)
      : null;
export function haversine(a, b) {
  const r = Math.PI / 180,
    dlat = (b.lat - a.lat) * r,
    dlng = (b.lon - a.lon) * r;
  return (
    6371000 *
    2 *
    Math.asin(
      Math.min(
        1,
        Math.sqrt(
          Math.sin(dlat / 2) ** 2 +
            Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dlng / 2) ** 2,
        ),
      ),
    )
  );
}
export const coordinate = (p) =>
  finite(p.lat) &&
  finite(p.lon) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lon) <= 180;
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
export function normalize(raw) {
  if (!raw.records.length)
    throw Error('No activity records found in this file.');
  const records = [],
    byTime = new Map();
  raw.records.forEach((p, i) => {
    if (finite(p.time) && byTime.has(p.time)) {
      const old = byTime.get(p.time);
      for (const [k, v] of Object.entries(p)) if (v != null) old[k] = v;
    } else {
      const copy = { ...p, sourceIndex: i };
      records.push(copy);
      if (finite(p.time)) byTime.set(p.time, copy);
    }
  });
  // Preserve untimed records for static graphics; never fabricate their timestamps.
  records.sort((a, b) =>
    finite(a.time) && finite(b.time)
      ? a.time - b.time
      : finite(a.time)
        ? -1
        : finite(b.time)
          ? 1
          : a.sourceIndex - b.sourceIndex,
  );
  const points = [];
  let distance = 0,
    moving = 0,
    previous = null,
    ascent = 0,
    descent = 0,
    altAnchor = null;
  let inferredMoving = false;
  const events = (raw.events || [])
    .filter((e) => finite(e.time))
    .sort((a, b) => a.time - b.time);
  let ei = 0,
    timer = true;
  for (const p of records) {
    let timerSeconds = 0;
    if (previous && finite(previous.time) && finite(p.time)) {
      let cursor = previous.time;
      while (ei < events.length && events[ei].time <= p.time) {
        const e = events[ei++];
        if (timer) timerSeconds += Math.max(0, e.time - cursor) / 1000;
        cursor = Math.max(cursor, e.time);
        timer = e.running;
      }
      if (timer) timerSeconds += Math.max(0, p.time - cursor) / 1000;
    } else
      while (ei < events.length && events[ei].time <= p.time)
        timer = events[ei++].running;
    const dt =
      previous && finite(p.time) && finite(previous.time)
        ? (p.time - previous.time) / 1000
        : null;
    const geo =
      previous && coordinate(p) && coordinate(previous)
        ? haversine(previous, p)
        : null;
    p.breakBefore =
      !!previous &&
      (p.segment !== previous.segment ||
        !coordinate(previous) ||
        !coordinate(p) ||
        (finite(dt) && dt > 120) ||
        (finite(geo) && finite(dt) && dt > 0 && geo / dt > 25));
    const dd =
      finite(p.distance) &&
      (!previous ||
        !finite(previous.distance) ||
        p.distance >= previous.distance)
        ? Math.max(0, p.distance - (previous?.distance || 0))
        : !p.breakBefore && finite(geo)
          ? geo
          : 0;
    distance += dd;
    p.distanceM = distance;
    const speed = finite(p.speed)
      ? p.speed
      : finite(dt) && dt > 0 && dt <= 120
        ? dd / dt
        : null;
    p.speedMps = speed;
    if (finite(dt) && dt > 0) {
      if (events.length) moving += timerSeconds;
      else if (dt <= 120 && finite(speed) && speed > 0.5) {
        moving += dt;
        inferredMoving = true;
      }
    }
    p.movingS = moving;
    if (finite(p.elevation)) {
      if (altAnchor === null) altAnchor = p.elevation;
      // 5 m hysteresis suppresses GPS jitter, not a claim of surveyed ascent.
      if (Math.abs(p.elevation - altAnchor) >= 5) {
        const d = p.elevation - altAnchor;
        ascent += Math.max(0, d);
        descent += Math.max(0, -d);
        altAnchor = p.elevation;
      }
    }
    points.push(p);
    previous = p;
  }
  const timed = points.filter((p) => finite(p.time)),
    start = timed[0]?.time ?? null,
    end = timed.at(-1)?.time ?? null;
  points.forEach(
    (p) =>
      (p.elapsedS =
        finite(p.time) && finite(start) ? (p.time - start) / 1000 : null),
  );
  const s = raw.summary || {},
    vals = (k) => points.map((p) => p[k]).filter(finite);
  const total = finite(s.distance) ? s.distance : distance || null;
  const elapsed = finite(s.elapsed)
    ? s.elapsed
    : finite(start) && finite(end)
      ? (end - start) / 1000
      : null;
  const move = finite(s.moving) ? s.moving : moving > 0 ? moving : null;
  const summary = {
    distance: total,
    elapsed,
    moving: move,
    pace: total > 0 && move > 0 ? move / (total / 1000) : null,
    ascent: finite(s.ascent)
      ? s.ascent
      : vals('elevation').length > 1
        ? ascent
        : null,
    descent: finite(s.descent)
      ? s.descent
      : vals('elevation').length > 1
        ? descent
        : null,
    heartRate: finite(s.heartRate) ? s.heartRate : mean(vals('heartRate')),
    maxHeartRate: finite(s.maxHeartRate)
      ? s.maxHeartRate
      : vals('heartRate').reduce((m, v) => Math.max(m ?? v, v), null),
    cadence: finite(s.cadence) ? s.cadence : mean(vals('cadence')),
    power: finite(s.power) ? s.power : mean(vals('power')),
  };
  return {
    version: 1,
    metadata: {
      name: raw.name || 'Untitled activity',
      date: raw.date ?? start,
      format: raw.format,
    },
    raw,
    points,
    timeline: timed,
    laps: raw.laps || [],
    summary,
    availability: {
      gps: points.filter(coordinate).length > 1,
      timeline: timed.length > 1 && end > start,
      elevation: vals('elevation').length > 1,
      heartRate: vals('heartRate').length > 0,
      cadence: vals('cadence').length > 0,
      power: vals('power').length > 0,
    },
    provenance: {
      moving: finite(s.moving)
        ? 'recorded'
        : events.length
          ? 'timer events'
          : inferredMoving
            ? 'estimated from movement'
            : 'unavailable',
      ascent: finite(s.ascent)
        ? 'recorded'
        : 'estimated with 5 m elevation hysteresis',
    },
    warnings: [
      ...(raw.warnings || []),
      ...(!finite(s.moving) && move
        ? ['Moving time is derived; pauses and GPS gaps may affect it.']
        : []),
    ],
  };
}
export function atTime(activity, progress) {
  const pts =
    activity.timeline || activity.points.filter((p) => finite(p.time));
  if (!pts.length) return null;
  const target = pts[0].time + (pts.at(-1).time - pts[0].time) * progress;
  let lo = 0,
    hi = pts.length - 1;
  while (lo < hi) {
    const m = Math.ceil((lo + hi) / 2);
    if (pts[m].time <= target) lo = m;
    else hi = m - 1;
  }
  return pts[lo]; // hold last observed value; do not interpolate across pauses or gaps
}
export function privateRoute(points, trimM) {
  const gps = points.filter(coordinate);
  if (!gps.length) return [];
  // Mask every point within the privacy radius of either endpoint, including loop returns.
  return points.map((p) => ({
    ...p,
    private:
      !coordinate(p) ||
      (trimM > 0 &&
        (haversine(p, gps[0]) < trimM || haversine(p, gps.at(-1)) < trimM)),
  }));
}
export const units = (imperial) => ({
  distance: imperial ? 1609.344 : 1000,
  elevation: imperial ? 0.3048 : 1,
  distanceLabel: imperial ? 'mi' : 'km',
  elevationLabel: imperial ? 'ft' : 'm',
});
export function duration(s) {
  if (!finite(s)) return '—';
  s = Math.max(0, Math.round(s));
  return `${Math.floor(s / 3600) ? Math.floor(s / 3600) + ':' : ''}${String(Math.floor(s / 60) % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
