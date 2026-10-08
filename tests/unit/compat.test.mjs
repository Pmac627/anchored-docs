// _compat.mjs must keep the 1.2.0 text rules. The expected values are the recorded 1.2.0 results (golden/fm-1.2.0.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { splitlines, strip, stripEnd, stripChars, formatValue, valueText, replacePaths, escapeControls } from '../../skills/anchored-docs/scripts/_compat.mjs';

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

// The path regex that replacePaths replaces. ste_check used it until 2.0.1.
const PATH_RE = /(?<![\p{L}\p{N}_])(?:\.{0,2}\/)?[\p{L}\p{N}_.-]+(?:\/[\p{L}\p{N}_.-]+)+(?::\p{Nd}+)?/gu;

test('replacePaths gives the same result as the path regex', () => {
  const fixed = ['see src/a.cs:12 now', './x/y', '../a/b/', '.../a/b', 'a//b', '/a/b', 'x/y:', 'x/y:1a', '\u00e9/\u00fc',
    'a\u0301/b', '\u{1d400}/b', 'ab-/c', '_/_', 'a/b c/d', 'a/b/c:3:4', 'v1.2/x', '..', './', 'a/', '/'];
  for (const s of fixed) assert.equal(replacePaths(s, ' PATH '), s.replace(PATH_RE, ' PATH '), JSON.stringify(s));

  // Random strings from the characters that change the result: path characters, separators, a digit, a
  // combining mark (not a word character), and an astral letter.
  const alphabet = ['a', 'Z', '_', '.', '-', '/', ':', '7', ' ', '\u00e9', '\u0301', '\u{1d400}', '!'];
  let seed = 1;
  const rand = (k) => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed % k;
  };
  for (let i = 0; i < 50000; i++) {
    let s = '';
    for (let len = rand(24); len > 0; len--) s += alphabet[rand(alphabet.length)];
    assert.equal(replacePaths(s, ' PATH '), s.replace(PATH_RE, ' PATH '), JSON.stringify(s));
  }
});

test('replacePaths takes linear time on long runs of dots or dashes', () => {
  for (const ch of ['.', '-', 'a.']) {
    const s = 'x ' + ch.repeat(80000) + ' a/b';
    const t0 = performance.now();
    assert.equal(replacePaths(s, ' PATH '), 'x ' + ch.repeat(80000) + '  PATH ');
    assert.ok(performance.now() - t0 < 500, `${ch}: took ${(performance.now() - t0).toFixed(0)} ms`);
  }
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

test('escapeControls shows control characters as escapes and keeps tabs, newlines, and other text', () => {
  assert.equal(escapeControls('a\tb\nc'), 'a\tb\nc');
  assert.equal(escapeControls('\x1b[31mred\x1b]8;;u\x07x'), '\\x1b[31mred\\x1b]8;;u\\x07x');
  assert.equal(escapeControls('\x00\x7f\x85\x9f'), '\\x00\\x7f\\x85\\x9f');
  assert.equal(escapeControls('a\u202eb\u2066c'), 'a\\u202eb\\u2066c');
  assert.equal(escapeControls('\u00e9 \u00a0 \u200b'), '\u00e9 \u00a0 \u200b');
});
