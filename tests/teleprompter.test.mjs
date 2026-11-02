import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clamp,
  wordCount,
  estimateSeconds,
  formatDuration,
  scrollPxPerSecond,
} from '../teleprompter/model.mjs';

test('word count ignores extra whitespace and blank scripts', () => {
  assert.equal(wordCount('  Hello   there\n\nfriend  '), 3);
  assert.equal(wordCount(''), 0);
  assert.equal(wordCount(null), 0);
});

test('estimated time follows the speed in words per minute', () => {
  const script = Array(140).fill('word').join(' ');
  assert.equal(estimateSeconds(script, 140), 60);
  assert.equal(estimateSeconds(script, 0), 0);
});

test('durations format as minutes and two-digit seconds', () => {
  assert.equal(formatDuration(125.4), '2:05');
  assert.equal(formatDuration(-3), '0:00');
  assert.equal(formatDuration(undefined), '0:00');
});

test('scroll speed keeps pace with the script length', () => {
  // 140 words per minute over 280 words and 2800 px of travel: 10 px per word,
  // so 140/60 words per second is about 23.3 px per second.
  assert.ok(Math.abs(scrollPxPerSecond(140, 280, 2800) - (140 / 60) * 10) < 1e-9);
  assert.equal(scrollPxPerSecond(140, 0, 2800), 0);
  assert.equal(scrollPxPerSecond(140, 280, 0), 0);
});

test('clamp keeps values inside a range', () => {
  assert.equal(clamp(5, 10, 20), 10);
  assert.equal(clamp(25, 10, 20), 20);
  assert.equal(clamp(15, 10, 20), 15);
});
