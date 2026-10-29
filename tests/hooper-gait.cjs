const fs = require('node:fs'),
  vm = require('node:vm'),
  assert = require('node:assert/strict'),
  path = require('node:path');
const root = path.resolve(__dirname, '..');
const file = fs.existsSync(path.join(root, 'scene/runner.js'))
  ? 'scene/runner.js'
  : 'special-post/index.html';
const src = fs.readFileSync(path.join(root, file), 'utf8');
const start = src.search(/var DOGPARTS\s*=/),
  end = src.indexOf('function makeDog(', start);
const box = {};
vm.runInNewContext(src.slice(start, end), box);
const fnEnd = file.endsWith('.html')
  ? src.indexOf('function drawHooper(', end)
  : src.indexOf('/* Run scene', end);
vm.runInNewContext(src.slice(end, fnEnd), box);
const dog = box.makeDog({}, box.DOGPARTS, { imgScale: 0.3 }),
  offs = { a: 0.48, bb: 0.4, c: 0, d: 0.07 };
let prev = dog.pose(0),
  maxContact = 0;
for (let i = 1; i <= 2000; i++) {
  const p = i / 2000,
    q = dog.pose(p);
  assert.ok(Math.abs(q.y - prev.y) < 1, 'body motion must remain continuous');
  for (const key of Object.keys(offs)) {
    const ch = q[key],
      old = prev[key],
      phase = (p - offs[key] + 1) % 1;
    for (let j = 0; j < 3; j++) {
      const part = box.DOGPARTS[ch.n[j]],
        tip = j === 2 ? ch.paw : ch.j[j + 1],
        joint = ch.j[j];
      const length =
        Math.hypot(part.end[0] - part.pivot[0], part.end[1] - part.pivot[1]) *
        part.s;
      assert.ok(
        Math.abs(Math.hypot(tip[0] - joint[0], tip[1] - joint[1]) - length) <
          1e-6,
        'bone length',
      );
      assert.ok(
        Math.hypot(joint[0] - old.j[j][0], joint[1] - old.j[j][1]) < 5,
        'joint continuity ' +
          JSON.stringify({ p, key, j, now: joint, old: old.j[j] }),
      );
    }
    if (phase < 0.3)
      maxContact = Math.max(maxContact, Math.abs(ch.paw[1] + q.y));
  }
  prev = q;
}
assert.ok(maxContact < 1e-6, 'stance paws stay on ground');
console.log(
  'PASS: 2,000 gallop poses; ground contact, fixed bone lengths, continuous body and joints.',
);
