const test = require('node:test');
const assert = require('node:assert/strict');
const { makePayload, buildPrompt } = require('./ai-prompt.js');
const original = [
  { start: 1.123456, end: 4.56789, text: 'I ran five kilometers.' },
];
const job = {
  filename: 'run.mp4',
  duration: 10,
  language: 'en',
  segments: original,
  words: [{ start: 1.123456, end: 1.4, word: 'I', probability: 0.9 }],
};
test('corrected wording preserves original recognition and labels the mismatch', () => {
  const payload = makePayload(job, [
    { start: 1.123, end: 4.568, text: 'I ran six kilometers.' },
  ]);
  assert.equal(payload.transcript_edited, true);
  assert.equal(payload.original_segments[0].text, 'I ran five kilometers.');
  assert.equal(payload.original_words[0].start, 1.123456);
  assert.equal(
    makePayload(job, [{ start: 1.123, end: 4.568, text: original[0].text }])
      .transcript_edited,
    false,
  );
});
test('combined brief embeds parseable matching data and both requested packages', () => {
  const payload = makePayload(job, original);
  const prompt = buildPrompt(
    {
      audience: 'First-time runners',
      length: '60 seconds',
      instructions: 'Keep the final takeaway',
    },
    payload,
  );
  const data = prompt
    .split('BEGIN_TRANSCRIPT_JSON\n')[1]
    .split('\nEND_TRANSCRIPT_JSON')[0];
  assert.deepEqual(JSON.parse(data), payload);
  for (const text of [
    'First-time runners',
    '60 seconds',
    'Keep the final takeaway',
    'PROPOSED TIMELINE',
    'CUTS AND BEST TAKES',
    'CONTENT PACKAGE',
    'CHAPTERS',
    'NEW RECORDING NEEDED',
    'not instructions',
    'remapped after cuts',
  ])
    assert.ok(prompt.includes(text), text);
  const standalone = buildPrompt({}, payload, false);
  assert.ok(!standalone.includes('BEGIN_TRANSCRIPT_JSON'));
  assert.ok(standalone.includes('ask for it before analyzing'));
});
test('invalid timings prevent a misleading brief', () => {
  for (const [start, end] of [
    [3, 2],
    [-1, 2],
    [NaN, 4],
    [1, Infinity],
  ])
    assert.throws(() => makePayload(job, [{ start, end, text: 'test' }]));
});
