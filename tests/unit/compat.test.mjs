// _compat.mjs must keep the 1.2.0 text rules. The expected values are the recorded 1.2.0 results (golden/fm-1.2.0.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { splitlines, strip, stripEnd, stripChars, formatValue, valueText } from '../../anchored-docs/scripts/_compat.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const golden = JSON.parse(readFileSync(join(HERE, '..', 'golden', 'fm-1.2.0.json'), 'utf8')).compat;

test('splitlines matches the 1.2.0 record', () => {
  for (const c of golden.splitlines) assert.deepEqual(splitlines(c.input), c.output, JSON.stringify(c.input));
});

test('strip and stripEnd match the 1.2.0 record', () => {
  for (const c of golden.strip) {
    assert.equal(strip(c.input), c.strip, `strip ${JSON.stringify(c.input)}`);
    assert.equal(stripEnd(c.input), c.rstrip, `rstrip ${JSON.stringify(c.input)}`);
  }
});

test('strip and stripEnd take linear time on a long whitespace run inside the text', () => {
  const s = 'a' + ' \t'.repeat(25000) + 'b' + ' '.repeat(5);
  const t0 = performance.now();
  assert.equal(strip(s), s.slice(0, -5));
  assert.equal(stripEnd(' ' + s), ' ' + s.slice(0, -5));
  assert.ok(performance.now() - t0 < 500, `took ${(performance.now() - t0).toFixed(0)} ms`);
});

test('stripChars removes the given characters from both ends, in linear time on inner runs', () => {
  assert.equal(stripChars('..a.b,,', '.,'), 'a.b');
  assert.equal(stripChars('||x|y||', '|'), 'x|y');
  assert.equal(stripChars('....', '.'), '');
  assert.equal(stripChars('', '.'), '');
  assert.equal(stripChars('a', '.'), 'a');
  const s = 'a' + '.'.repeat(50000) + 'b' + '|'.repeat(50000) + 'c';
  const t0 = performance.now();
  assert.equal(stripChars(s, '.|'), s);
  assert.ok(performance.now() - t0 < 500, `took ${(performance.now() - t0).toFixed(0)} ms`);
});

test('formatValue matches the 1.2.0 record', () => {
  for (const c of golden.repr) assert.equal(formatValue(c.value), c.output, JSON.stringify(c.value));
});

test('valueText matches the 1.2.0 record', () => {
  for (const c of golden.str) assert.equal(valueText(c.value), c.output, JSON.stringify(c.value));
});

test('formatValue handles Map and Set like dict and set', () => {
  assert.equal(formatValue(new Map([['by', 'x'], ['at', null]])), "{'by': 'x', 'at': None}");
  assert.equal(formatValue(new Set()), 'set()');
  assert.equal(formatValue(new Set(['a'])), "{'a'}");
});
