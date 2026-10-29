import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOMParser } from '@xmldom/xmldom';
import { Decoder, Stream } from '@garmin/fitsdk';
import { parseXML, fromFIT } from '../parsers.mjs';
import {
  normalize,
  units,
  duration,
  atTime,
  privateRoute,
  haversine,
} from '../model.mjs';
import { projectRoute } from '../render.mjs';
import { gpx, tcx, fitFixture } from './fixtures.mjs';
test('GPX namespaces, sensor availability and geometry', () => {
  const a = parseXML(gpx, 'gpx', DOMParser);
  assert.equal(a.metadata.name, 'Synthetic test run');
  assert.equal(a.points.length, 30);
  assert.ok(a.summary.distance > 300);
  assert.equal(a.summary.maxHeartRate, 159);
  assert.equal(a.availability.power, false);
  assert.ok(a.summary.ascent < 40);
  assert.equal(a.raw.records[0].distanceM, undefined);
});
test('TCX recorded totals and laps, absent sensors remain null', () => {
  const a = parseXML(tcx, 'tcx', DOMParser);
  assert.equal(a.summary.distance, 1000);
  assert.equal(a.summary.moving, 300);
  assert.equal(a.summary.pace, 300);
  assert.equal(a.summary.power, null);
  assert.equal(a.laps[0].source, 'recorded');
  assert.equal(a.points[0].heartRate, null);
});
test('official Garmin SDK binary roundtrip, integrity and mapping', () => {
  const bytes = fitFixture(),
    d = new Decoder(Stream.fromByteArray(bytes));
  assert.ok(d.isFIT());
  assert.ok(d.checkIntegrity());
  const { messages, errors } = d.read();
  assert.equal(errors.length, 0);
  const a = fromFIT(messages);
  assert.equal(a.points.length, 6);
  assert.equal(a.summary.distance, 500);
  assert.equal(a.summary.moving, 45);
  assert.equal(a.summary.ascent, 5);
  assert.equal(a.summary.cadence, 170);
  assert.ok(Math.abs(a.points[0].lat - 40) < 0.00001);
  const bad = bytes.slice();
  bad[bad.length - 1] ^= 255;
  assert.equal(new Decoder(Stream.fromByteArray(bad)).checkIntegrity(), false);
});
test('duplicates, pause events and timeline share timestamp source', () => {
  const a = normalize({
    format: 'test',
    records: [
      { time: 0, distance: 0 },
      { time: 10000, distance: 10 },
      { time: 10000, heartRate: 140 },
      { time: 30000, distance: 10 },
      { time: 40000, distance: 20 },
    ],
    events: [
      { time: 0, running: true },
      { time: 10000, running: false },
      { time: 30000, running: true },
    ],
  });
  assert.equal(a.points.length, 4);
  assert.equal(a.summary.moving, 20);
  assert.equal(a.points[1].heartRate, 140);
  assert.equal(atTime(a, 0.5).time, 10000);
  assert.equal(atTime(a, 0.75).movingS, 10);
});
test('missing timestamps never become epoch and missing metrics not invented', () => {
  const a = parseXML(
    '<gpx><trk><trkseg><trkpt lat="40" lon="-74"/><trkpt lat="40.01" lon="-74"/></trkseg></trk></gpx>',
    'gpx',
    DOMParser,
  );
  assert.equal(a.metadata.date, null);
  assert.equal(a.summary.elapsed, null);
  assert.equal(a.summary.moving, null);
  assert.equal(a.summary.pace, null);
  assert.equal(a.availability.timeline, false);
});
test('GPS gaps and implausible jumps do not inflate distance', () => {
  const a = normalize({
    records: [
      { time: 0, lat: 40, lon: -74 },
      { time: 1000, lat: 45, lon: -70 },
      { time: 1000000, lat: 46, lon: -70 },
    ],
  });
  assert.ok(a.points[1].breakBefore);
  assert.ok(a.points[2].breakBefore);
  assert.equal(a.summary.distance, null);
});
test('units, time formatting, endpoint privacy and north-up projection', () => {
  assert.equal(units(true).distance, 1609.344);
  assert.equal(units(true).elevation, 0.3048);
  assert.equal(duration(360001), '100:00:01');
  const a = parseXML(gpx, 'gpx', DOMParser),
    pts = privateRoute(a.points, 100);
  assert.ok(pts[0].private);
  assert.ok(pts.at(-1).private);
  const xy = projectRoute(pts, { x: 0, y: 0, w: 100, h: 100 });
  assert.ok(xy.some(Boolean));
  assert.equal(xy[0], null);
  xy.filter(Boolean).forEach((p) =>
    assert.ok(
      p.x >= -0.001 && p.x <= 100.001 && p.y >= -0.001 && p.y <= 100.001,
    ),
  );
  assert.ok(haversine({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }) > 111000);
});
test('corrupt/unsupported XML and entity documents rejected', () => {
  assert.throws(() => parseXML('<foo/>', 'gpx', DOMParser));
  assert.throws(() => parseXML('<!DOCTYPE gpx><gpx/>', 'gpx', DOMParser));
  assert.throws(() => parseXML('<gpx><trk></gpx>', 'gpx', DOMParser));
});
test('100-hour ultra with 200,000 records normalizes without stack overflow', () => {
  const records = Array.from({ length: 200000 }, (_, i) => ({
    time: i * 2000,
    distance: i * 2,
    elevation: 100 + Math.sin(i) * 0.5,
  }));
  const a = normalize({ records });
  assert.equal(a.points.length, 200000);
  assert.equal(a.summary.ascent, 0);
  assert.equal(a.summary.distance, 399998);
  assert.equal(atTime(a, 1).time, 399998000);
});
