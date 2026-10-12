import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
// _compat.mjs must keep the text rules recorded from 1.x. The expected values are inline, copied from those recorded results.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { splitlines, strip, stripEnd, stripChars, formatValue, valueText, replacePaths, escapeControls, padCodePoints, writeReport, FileReadError } from '../../skills/anchored-docs/scripts/_compat.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Recorded 1.2.0 text-rule results. Expected values are the behavior this port keeps.
const golden = {
  splitlines: [
    {"input":"","output":[]},
    {"input":"a","output":["a"]},
    {"input":"a\n","output":["a"]},
    {"input":"a\n\n","output":["a",""]},
    {"input":"a\r\nb","output":["a","b"]},
    {"input":"a\rb","output":["a","b"]},
    {"input":"a\u000bb\fc","output":["a","b","c"]},
    {"input":"a\u001cb\u001dc\u001ed","output":["a","b","c","d"]},
    {"input":"ab","output":["a","b"]},
    {"input":"a b c","output":["a","b","c"]},
    {"input":"\n","output":[""]},
    {"input":"\r\n\r\n","output":["",""]},
    {"input":"a\nb\n","output":["a","b"]},
    {"input":"  a  \n  b  ","output":["  a  ","  b  "]},
  ],
  strip: [
    {"input":"  a  ","strip":"a","rstrip":"  a"},
    {"input":"\t\na\r\n","strip":"a","rstrip":"\t\na"},
    {"input":" a ","strip":"a","rstrip":" a"},
    {"input":"﻿a﻿","strip":"﻿a﻿","rstrip":"﻿a﻿"},
    {"input":"\u001ca\u001f","strip":"a","rstrip":"\u001ca"},
    {"input":"a","strip":"a","rstrip":"a"},
    {"input":" a　","strip":"a","rstrip":" a"},
    {"input":"","strip":"","rstrip":""},
    {"input":"   ","strip":"","rstrip":""},
    {"input":"a b","strip":"a b","rstrip":"a b"},
  ],
  repr: [
    {"value":null,"output":"None"},
    {"value":true,"output":"True"},
    {"value":false,"output":"False"},
    {"value":0,"output":"0"},
    {"value":42,"output":"42"},
    {"value":-7,"output":"-7"},
    {"value":"","output":"''"},
    {"value":"plain","output":"'plain'"},
    {"value":"it's","output":"\"it's\""},
    {"value":"say \"hi\"","output":"'say \"hi\"'"},
    {"value":"both ' and \"","output":"'both \\' and \"'"},
    {"value":"tab\there","output":"'tab\\there'"},
    {"value":"nl\nhere","output":"'nl\\nhere'"},
    {"value":"cr\rhere","output":"'cr\\rhere'"},
    {"value":"back\\slash","output":"'back\\\\slash'"},
    {"value":"ctl\u0001","output":"'ctl\\x01\\x7f'"},
    {"value":"nbsp x","output":"'nbsp\\xa0x'"},
    {"value":"café","output":"'café'"},
    {"value":" sep","output":"'\\u2028sep'"},
    {"value":"﻿bom","output":"'\\ufeffbom'"},
    {"value":"emoji 😀","output":"'emoji 😀'"},
    {"value":"","output":"'\\x80\\x9f'"},
    {"value":[],"output":"[]"},
    {"value":[1,"a",null],"output":"[1, 'a', None]"},
    {"value":["it's","q\"q"],"output":"[\"it's\", 'q\"q']"},
    {"value":{},"output":"{}"},
    {"value":{"a":1,"b":[1,2],"c":{"d":null}},"output":"{'a': 1, 'b': [1, 2], 'c': {'d': None}}"},
    {"value":{"by":"nobody","at":"2026-01-10T10:00:00Z"},"output":"{'by': 'nobody', 'at': '2026-01-10T10:00:00Z'}"},
    {"value":["explanation","how-to","reference","tutorial"],"output":"['explanation', 'how-to', 'reference', 'tutorial']"},
    {"value":{"id":"b"},"output":"{'id': 'b'}"},
  ],
  str: [
    {"value":null,"output":"None"},
    {"value":true,"output":"True"},
    {"value":false,"output":"False"},
    {"value":0,"output":"0"},
    {"value":42,"output":"42"},
    {"value":-7,"output":"-7"},
    {"value":"","output":""},
    {"value":"plain","output":"plain"},
    {"value":"it's","output":"it's"},
    {"value":"say \"hi\"","output":"say \"hi\""},
    {"value":"both ' and \"","output":"both ' and \""},
    {"value":"tab\there","output":"tab\there"},
    {"value":"nl\nhere","output":"nl\nhere"},
    {"value":"cr\rhere","output":"cr\rhere"},
    {"value":"back\\slash","output":"back\\slash"},
    {"value":"ctl\u0001","output":"ctl\u0001"},
    {"value":"nbsp x","output":"nbsp x"},
    {"value":"café","output":"café"},
    {"value":" sep","output":" sep"},
    {"value":"﻿bom","output":"﻿bom"},
    {"value":"emoji 😀","output":"emoji 😀"},
    {"value":"","output":""},
    {"value":[],"output":"[]"},
    {"value":[1,"a",null],"output":"[1, 'a', None]"},
    {"value":["it's","q\"q"],"output":"[\"it's\", 'q\"q']"},
    {"value":{},"output":"{}"},
    {"value":{"a":1,"b":[1,2],"c":{"d":null}},"output":"{'a': 1, 'b': [1, 2], 'c': {'d': None}}"},
    {"value":{"by":"nobody","at":"2026-01-10T10:00:00Z"},"output":"{'by': 'nobody', 'at': '2026-01-10T10:00:00Z'}"},
    {"value":["explanation","how-to","reference","tutorial"],"output":"['explanation', 'how-to', 'reference', 'tutorial']"},
    {"value":{"id":"b"},"output":"{'id': 'b'}"},
  ],
};

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

test('formatValue shows None for null and undefined', () => {
  assert.equal(formatValue(null), 'None');
  assert.equal(formatValue(undefined), 'None');
});

test('reprString writes astral non-printable characters as \\U escapes', () => {
  assert.equal(formatValue('\u{E0001}'), "'\\U000e0001'");
});

test('padCodePoints pads by code points, and leaves text at or past the width alone', () => {
  assert.equal(padCodePoints('\u00e9\u{1F600}', 4), '\u00e9\u{1F600}  ');
  assert.equal(padCodePoints('abc', 2), 'abc');
});

test('FileReadError names the file and uses the message when the cause has no code', () => {
  const err = new FileReadError('docs/a.md', new Error('boom'));
  assert.equal(err.message, 'docs/a.md: cannot read (boom)');
  assert.equal(err.code, undefined);
});

// writeReport installs its stdout handler in a child process, so a test can emit a real error on that stream.
function emitOnStdout(code) {
  const url = pathToFileURL(join(HERE, '..', '..', 'skills', 'anchored-docs', 'scripts', '_compat.mjs')).href;
  const script = "const m = await import(process.argv[1]); m.writeReport('report\\n'); process.stdout.emit('error', Object.assign(new Error('stream'), { code: process.argv[2] }));";
  return spawnSync(process.execPath, ['--input-type=module', '-e', script, url, code], { encoding: 'utf8' });
}

test('writeReport ignores a closed pipe (EPIPE), so a reader such as head does not fail the check', () => {
  const r = emitOnStdout('EPIPE');
  assert.equal(r.status, 0, r.stderr);
});

test('writeReport rethrows any other stream error', () => {
  const r = emitOnStdout('EIO');
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /EIO/);
});
