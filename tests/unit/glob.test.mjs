// _glob.mjs, _fs.mjs: pattern matching, globbing, date parsing, and path ordering must match the 1.2.0 record (golden/glob-1.2.0.json).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { fnmatchcase, globExists, parseIso } from '../../anchored-docs/scripts/_glob.mjs';
import { sortPaths, fileSuffix } from '../../anchored-docs/scripts/_fs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const g = JSON.parse(readFileSync(join(HERE, '..', 'golden', 'glob-1.2.0.json'), 'utf8'));

test('fnmatchcase matches the 1.2.0 record on every pattern and name', () => {
  const bad = g.fnmatch.filter((c) => fnmatchcase(c.name, c.pattern) !== c.match);
  assert.deepEqual(bad.map((c) => `${JSON.stringify(c.pattern)} vs ${JSON.stringify(c.name)} expected ${c.match}`), []);
});

test('globExists matches Path.glob on a fixed tree', () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-glob-'));
  try {
    for (const f of g.tree) {
      mkdirSync(dirname(join(td, f)), { recursive: true });
      writeFileSync(join(td, f), 'x\n');
    }
    for (const d of g.emptyDirs) mkdirSync(join(td, d));
    const bad = g.glob.filter((c) => globExists(td, c.pattern) !== c.exists);
    assert.deepEqual(bad.map((c) => `${JSON.stringify(c.pattern)} expected ${c.exists}`), []);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});

test('parseIso matches the 1.2.0 record', () => {
  const bad = [];
  for (const c of g.iso) {
    const r = parseIso(c.input);
    if (!c.ok) {
      if (r !== null) bad.push(`${JSON.stringify(c.input)} should be rejected`);
    } else if (r === null) bad.push(`${JSON.stringify(c.input)} should parse`);
    else if (c.ms !== null && (r.ms !== c.ms || r.date !== c.date)) bad.push(`${JSON.stringify(c.input)} got ${r.ms}/${r.date}, expected ${c.ms}/${c.date}`);
  }
  assert.deepEqual(bad, []);
});

test('sortPaths orders by path segments, as 1.2.0 did', () => {
  // The golden was captured on POSIX; sortPaths works on native separators.
  const native = (paths) => paths.map((p) => p.split('/').join(sep));
  for (const c of g.sort) assert.deepEqual(sortPaths(native(c.input)), native(c.output));
});

test('fileSuffix returns the text from the last dot, empty for dotfiles', () => {
  for (const [name, suffix] of [['a.md', '.md'], ['.md', ''], ['a.', ''], ['a.b.md', '.md'], ['README', ''], ['.hidden.md', '.md']]) assert.equal(fileSuffix(name), suffix, name);
});
