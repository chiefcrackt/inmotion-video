import { number as n, timestamp as ts, normalize } from './model.mjs';
const children = (el, name) =>
  Array.from(el?.childNodes || []).filter(
    (x) => x.nodeType === 1 && x.localName === name,
  );
const descendants = (el, name) =>
  Array.from(el.getElementsByTagName('*')).filter((x) => x.localName === name);
const first = (el, name) => descendants(el, name)[0];
const text = (el, name) => first(el, name)?.textContent?.trim() || null;
const val = (el, name) => n(text(el, name));
export function parseXML(xml, format, Parser = globalThis.DOMParser) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml))
    throw Error('XML document types and entities are not supported.');
  const doc = new Parser({
    onError: (_level, message) => {
      throw Error('Invalid XML: ' + message);
    },
  }).parseFromString(xml, 'application/xml');
  if (descendants(doc, 'parsererror').length || !doc.documentElement)
    throw Error('This XML file is corrupt.');
  const root = doc.documentElement.localName;
  if (root !== (format === 'gpx' ? 'gpx' : 'TrainingCenterDatabase'))
    throw Error(`This is not a valid ${format.toUpperCase()} activity.`);
  const raw = {
    format,
    name: null,
    date: null,
    records: [],
    laps: [],
    summary: {},
    warnings: [],
  };
  if (format === 'gpx') {
    if (descendants(doc, 'trk').length > 1)
      throw Error('Choose a GPX export containing exactly one track.');
    raw.name = text(first(doc, 'trk') || doc, 'name');
    descendants(doc, 'trkseg').forEach((seg, i) =>
      children(seg, 'trkpt').forEach((p) =>
        raw.records.push({
          segment: i,
          lat: n(p.getAttribute('lat')),
          lon: n(p.getAttribute('lon')),
          time: ts(text(p, 'time')),
          elevation: val(p, 'ele'),
          heartRate: val(p, 'hr'),
          cadence: val(p, 'cad'),
          power: val(p, 'power'),
        }),
      ),
    );
  } else {
    const acts = descendants(doc, 'Activity');
    if (acts.length !== 1)
      throw Error('Choose a TCX export containing exactly one activity.');
    raw.name = text(acts[0], 'Name') || acts[0].getAttribute('Sport');
    raw.date = ts(text(acts[0], 'Id'));
    descendants(acts[0], 'Lap').forEach((lap, i) =>
      raw.laps.push({
        label: i + 1,
        start: ts(lap.getAttribute('StartTime')),
        distance: val(lap, 'DistanceMeters'),
        duration: val(lap, 'TotalTimeSeconds'),
        source: 'recorded',
      }),
    );
    let segment = 0;
    descendants(acts[0], 'Track').forEach((track) => {
      children(track, 'Trackpoint').forEach((p) =>
        raw.records.push({
          segment,
          lat: val(p, 'LatitudeDegrees'),
          lon: val(p, 'LongitudeDegrees'),
          time: ts(text(p, 'Time')),
          distance: val(p, 'DistanceMeters'),
          elevation: val(p, 'AltitudeMeters'),
          heartRate: val(
            first(p, 'HeartRateBpm') || doc.createElement('empty'),
            'Value',
          ),
          cadence:
            val(p, 'RunCadence') != null
              ? val(p, 'RunCadence') * 2
              : val(p, 'Cadence'),
          power: val(p, 'Watts'),
          speed: val(p, 'Speed'),
        }),
      );
      segment++;
    });
    const sum = (k) =>
      raw.laps.every((l) => l[k] != null)
        ? raw.laps.reduce((s, l) => s + l[k], 0)
        : null;
    raw.summary.distance = sum('distance');
    raw.summary.moving = sum('duration');
  }
  return normalize(raw);
}
export function fromFIT(messages) {
  const sessions = messages.sessionMesgs || [];
  if (sessions.length > 1)
    throw Error(
      'Multisport FIT files are not supported yet; export one activity.',
    );
  const s = sessions[0] || {},
    semi = (v) => (n(v) == null ? null : (n(v) * 180) / 2147483648);
  const raw = {
    format: 'fit',
    name: s.sportProfileName || s.sport || 'Running activity',
    date: ts(s.startTime),
    summary: {
      distance: n(s.totalDistance),
      elapsed: n(s.totalElapsedTime),
      moving: n(s.totalTimerTime),
      ascent: n(s.totalAscent),
      descent: n(s.totalDescent),
      heartRate: n(s.avgHeartRate),
      maxHeartRate: n(s.maxHeartRate),
      cadence: n(s.avgCadence) == null ? null : n(s.avgCadence) * 2,
      power: n(s.avgPower),
    },
    records: (messages.recordMesgs || []).map((p) => ({
      time: ts(p.timestamp),
      lat: semi(p.positionLat),
      lon: semi(p.positionLong),
      distance: n(p.distance),
      elevation: n(p.enhancedAltitude ?? p.altitude),
      speed: n(p.enhancedSpeed ?? p.speed),
      heartRate: n(p.heartRate),
      cadence: n(p.cadence) == null ? null : n(p.cadence) * 2,
      power: n(p.power),
      segment: 0,
    })),
    laps: (messages.lapMesgs || []).map((l, i) => ({
      label: i + 1,
      start: ts(l.startTime),
      duration: n(l.totalTimerTime),
      distance: n(l.totalDistance),
      source: 'recorded',
    })),
    events: (messages.eventMesgs || [])
      .filter((e) => e.event === 'timer')
      .map((e) => ({
        time: ts(e.timestamp),
        running: e.eventType === 'start',
      })),
  };
  return normalize(raw);
}
