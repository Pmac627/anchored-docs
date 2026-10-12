// _glob.mjs, _fs.mjs: pattern matching, globbing, date parsing, and path ordering must match the recorded 1.x results, copied inline.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { fnmatchcase, globExists, parseIso } from '../../skills/anchored-docs/scripts/_glob.mjs';
import { sortPaths, fileSuffix, resolvePath } from '../../skills/anchored-docs/scripts/_fs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
// Recorded 1.2.0 results for glob, date, and path-order rules. Expected values are the behavior this port keeps.
const g = {
  fnmatch: [
    {"pattern":"src/Orders/[A-Z]*.cs","name":"src/Orders/OrderService.cs","match":true},
    {"pattern":"src/Orders/[A-Z]*.cs","name":"src/Orders/Zed.cs","match":true},
    {"pattern":"src/Orders/[A-Z]*.cs","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"src/Orders/[A-Z]*.cs","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"src/Orders/[A-Z]*.cs","name":"docs/a.md","match":false},
    {"pattern":"src/Orders/[A-Z]*.cs","name":"a.cs","match":false},
    {"pattern":"src/Orders/[!A-Z]*.cs","name":"src/Orders/sub/Deep.cs","match":true},
    {"pattern":"src/Orders/[!A-Z]*.cs","name":"src/Orders/a.cs","match":true},
    {"pattern":"src/Orders/[!A-Z]*.cs","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"src/Orders/[!A-Z]*.cs","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"src/Orders/[!A-Z]*.cs","name":"docs/a.md","match":false},
    {"pattern":"src/Orders/[!A-Z]*.cs","name":"a.cs","match":false},
    {"pattern":"a?c","name":"abc","match":true},
    {"pattern":"a?c","name":"aXc","match":true},
    {"pattern":"a?c","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"a?c","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"a?c","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"a?c","name":"docs/a.md","match":false},
    {"pattern":"[a-c]x","name":"ax","match":true},
    {"pattern":"[a-c]x","name":"bx","match":true},
    {"pattern":"[a-c]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[a-c]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[a-c]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[a-c]x","name":"docs/a.md","match":false},
    {"pattern":"[!a-c]x","name":"dx","match":true},
    {"pattern":"[!a-c]x","name":"]x","match":true},
    {"pattern":"[!a-c]x","name":"ex","match":true},
    {"pattern":"[!a-c]x","name":"-x","match":true},
    {"pattern":"[!a-c]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[!a-c]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[!a-c]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[!a-c]x","name":"docs/a.md","match":false},
    {"pattern":"[]]x","name":"]x","match":true},
    {"pattern":"[]]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[]]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[]]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[]]x","name":"docs/a.md","match":false},
    {"pattern":"[!]]x","name":"ax","match":true},
    {"pattern":"[!]]x","name":"bx","match":true},
    {"pattern":"[!]]x","name":"dx","match":true},
    {"pattern":"[!]]x","name":"ex","match":true},
    {"pattern":"[!]]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[!]]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[!]]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[!]]x","name":"docs/a.md","match":false},
    {"pattern":"[a-","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[a-","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[a-","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[a-","name":"docs/a.md","match":false},
    {"pattern":"[","name":"[","match":true},
    {"pattern":"[","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[","name":"docs/a.md","match":false},
    {"pattern":"x[","name":"x[","match":true},
    {"pattern":"x[","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"x[","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"x[","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"x[","name":"docs/a.md","match":false},
    {"pattern":"?","name":"a","match":true},
    {"pattern":"?","name":"[","match":true},
    {"pattern":"?","name":"&","match":true},
    {"pattern":"?","name":"~","match":true},
    {"pattern":"?","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"?","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"?","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"?","name":"docs/a.md","match":false},
    {"pattern":"[a-z0-9]*","name":"src/Orders/OrderService.cs","match":true},
    {"pattern":"[a-z0-9]*","name":"src/Orders/sub/Deep.cs","match":true},
    {"pattern":"[a-z0-9]*","name":"src/Api/Controllers/X.cs","match":true},
    {"pattern":"[a-z0-9]*","name":"docs/a.md","match":true},
    {"pattern":"[a-z0-9]*","name":"]x","match":false},
    {"pattern":"[a-z0-9]*","name":"","match":false},
    {"pattern":"[a-z0-9]*","name":"-x","match":false},
    {"pattern":"[a-z0-9]*","name":"[","match":false},
    {"pattern":"[z-a]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[z-a]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[z-a]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[z-a]x","name":"docs/a.md","match":false},
    {"pattern":"[a-c-e]x","name":"ax","match":true},
    {"pattern":"[a-c-e]x","name":"bx","match":true},
    {"pattern":"[a-c-e]x","name":"ex","match":true},
    {"pattern":"[a-c-e]x","name":"-x","match":true},
    {"pattern":"[a-c-e]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[a-c-e]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[a-c-e]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[a-c-e]x","name":"docs/a.md","match":false},
    {"pattern":"[\\]x","name":"\\x","match":true},
    {"pattern":"[\\]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[\\]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[\\]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[\\]x","name":"docs/a.md","match":false},
    {"pattern":"a[-]b","name":"a-b","match":true},
    {"pattern":"a[-]b","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"a[-]b","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"a[-]b","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"a[-]b","name":"docs/a.md","match":false},
    {"pattern":"[&~|]","name":"&","match":true},
    {"pattern":"[&~|]","name":"~","match":true},
    {"pattern":"[&~|]","name":"|","match":true},
    {"pattern":"[&~|]","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[&~|]","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[&~|]","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[&~|]","name":"docs/a.md","match":false},
    {"pattern":"[^a]x","name":"ax","match":true},
    {"pattern":"[^a]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[^a]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[^a]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[^a]x","name":"docs/a.md","match":false},
    {"pattern":"[[]x","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"[[]x","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"[[]x","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"[[]x","name":"docs/a.md","match":false},
    {"pattern":"a\\b","name":"a\\b","match":true},
    {"pattern":"a\\b","name":"src/Orders/OrderService.cs","match":false},
    {"pattern":"a\\b","name":"src/Orders/sub/Deep.cs","match":false},
    {"pattern":"a\\b","name":"src/Api/Controllers/X.cs","match":false},
    {"pattern":"a\\b","name":"docs/a.md","match":false},
  ],
  glob: [
    {"pattern":"src/Orders/**","exists":true},
    {"pattern":"src/Orders/OrderService.cs","exists":true},
    {"pattern":"src/**/*.cs","exists":true},
    {"pattern":"src/**","exists":true},
    {"pattern":"**","exists":true},
    {"pattern":"**/*.md","exists":true},
    {"pattern":"src/*/X.cs","exists":false},
    {"pattern":"src/Api/*/X.cs","exists":true},
    {"pattern":"src/missing/**","exists":false},
    {"pattern":"src/Orders/*.cs","exists":true},
    {"pattern":"src/Orders/[A-Z]*.cs","exists":true},
    {"pattern":"*.md","exists":true},
    {"pattern":"docs/","exists":true},
    {"pattern":"src/Orders/","exists":true},
    {"pattern":"README.md/","exists":false},
    {"pattern":"./src/Orders/OrderService.cs","exists":true},
    {"pattern":"src//Orders","exists":true},
    {"pattern":".hidden/*","exists":true},
    {"pattern":"*","exists":true},
    {"pattern":"empty/**","exists":true},
    {"pattern":"empty/*","exists":false},
    {"pattern":"src/Orders/OrderService.c?","exists":true},
    {"pattern":"src/Orders/Order[!x]ervice.cs","exists":true},
    {"pattern":"src/orders/**","exists":false},
    {"pattern":"src/Orders/**/Deep.cs","exists":true},
    {"pattern":"**/Deep.cs","exists":true},
    {"pattern":"src/**/","exists":true},
    {"pattern":"/abs","exists":false},
    {"pattern":"","exists":false},
    {"pattern":".","exists":false},
    {"pattern":"..","exists":true},
    {"pattern":"src/Orders/OrderService.cs/x","exists":false},
    {"pattern":"dir.md","exists":true},
    {"pattern":"dir.md/*","exists":true},
    {"pattern":"case/**","exists":false},
    {"pattern":"Case/**","exists":true},
    {"pattern":"a-b/*","exists":true},
    {"pattern":"src/Orders/**/","exists":true},
    {"pattern":"**/Up.cs","exists":true},
    {"pattern":"src/**/Deep.cs","exists":true},
    {"pattern":"*/*/*.cs","exists":true},
    {"pattern":"src/[OA]*/*.cs","exists":true},
    {"pattern":"src/Api/**","exists":true},
  ],
  iso: [
    {"input":"2026-01-10T10:00:00Z","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00+00:00","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"2020-03-01T08:30:00+00:00","ms":1583051400000,"date":"2020-03-01","ok":true},
    {"input":"2099-01-01T00:00:00Z","ms":4070908800000,"date":"2099-01-01","ok":true},
    {"input":"2026-01-10","ms":1768003200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10 10:00","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00.123","ms":1768039200123,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00.123456789Z","ms":1768039200123,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00,5","ms":1768039200500,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00+05:30","ms":1768019400000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00-0800","ms":1768068000000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00+05","ms":1768021200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T23:59:59-23:59","ms":1768175939000,"date":"2026-01-10","ok":true},
    {"input":"2026-02-30","ok":false},
    {"input":"2026-13-01","ok":false},
    {"input":"2026-00-10","ok":false},
    {"input":"2026-01-00","ok":false},
    {"input":"2023-02-29","ok":false},
    {"input":"2024-02-29","ms":1709164800000,"date":"2024-02-29","ok":true},
    {"input":"0000-01-01","ok":false},
    {"input":"0001-01-01","ms":null,"date":"0001-01-01","ok":true},
    {"input":"9999-12-31T23:59:59Z","ms":253402300799000,"date":"9999-12-31","ok":true},
    {"input":"2026-01-10T24:00","ok":false},
    {"input":"2026-01-10T10:60","ok":false},
    {"input":"2026-01-10T10:00:60","ok":false},
    {"input":"yesterday","ok":false},
    {"input":"","ok":false},
    {"input":"None","ok":false},
    {"input":"2026-1-10","ok":false},
    {"input":"2026-01-10X10:00","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10t10:00:00Z","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00+24:00","ok":false},
    {"input":"20260110","ms":1768003200000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00 ","ok":false},
    {"input":" 2026-01-10","ok":false},
    {"input":"2026-01-10T","ok":false},
    {"input":"2026-01-10T10:00:00Z extra","ok":false},
    {"input":"2026-01-10T10:00:00+00:00:30","ms":1768039170000,"date":"2026-01-10","ok":true},
    {"input":"2026-01-10T10:00:00-00:00","ms":1768039200000,"date":"2026-01-10","ok":true},
    {"input":"1999-12-31T23:59:59+14:00","ms":946634399000,"date":"1999-12-31","ok":true},
  ],
  tree: [
    "src/Orders/OrderService.cs",
    "src/Orders/sub/Deep.cs",
    "src/Api/Controllers/X.cs",
    "src/engine/rank.cpp",
    "docs/a.md",
    "README.md",
    ".hidden/x.txt",
    "a-b/c.txt",
    "dir.md/inner.txt",
    "Case/Up.cs",
  ],
  emptyDirs: [
    "empty",
  ],
  sort: [
    {"input":["docs/flows-x.md","docs/flows/a.md","docs/Flows/b.md","docs/a b.md","docs/a.md","docs/é.md","docs/😀.md","docs/z.md","docs/flows.md","docs/flows/index.md","docs/Z.md","docs/_map.md","docs/-a.md","docs/a/b/c.md","docs/a/b.md","docs/a.b.md"],"output":["docs/-a.md","docs/Flows/b.md","docs/Z.md","docs/_map.md","docs/a/b/c.md","docs/a/b.md","docs/a b.md","docs/a.b.md","docs/a.md","docs/flows/a.md","docs/flows/index.md","docs/flows-x.md","docs/flows.md","docs/z.md","docs/é.md","docs/😀.md"]},
  ],
};

test('fnmatchcase matches the recorded 1.2.0 results on bracket, escape, negation, and ? patterns', () => {
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

test('globExists finds nothing under a root that does not exist, "**" included', () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-glob-'));
  try {
    const missing = join(td, 'nope');
    for (const p of ['**', '**/', '**/*', 'a/**', '*']) assert.equal(globExists(missing, p), false, p);
    assert.equal(globExists(td, '**'), true);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});

test('sortPaths puts a folder before the paths inside it', () => {
  assert.deepEqual(sortPaths([join('a', 'b'), 'a', join('a', 'b', 'c')]), ['a', join('a', 'b'), join('a', 'b', 'c')]);
});

test('globExists is false for a dangling link that its folder lists', () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-glob-link-'));
  try {
    symlinkSync(join(td, 'missing-target'), join(td, 'dangling'));
    assert.equal(globExists(td, 'dangling'), false);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});

test('a bracket range that ends in "-" holds the dash, and "[!]]" negates a class that holds only the closing bracket', () => {
  assert.equal(fnmatchcase('-', '[a-]'), true);
  assert.equal(fnmatchcase('a', '[a-]'), true);
  assert.equal(fnmatchcase('b', '[a-]'), false);
  assert.equal(fnmatchcase('ax', '[!]]x'), true);
  assert.equal(fnmatchcase(']x', '[!]]x'), false);
});

test('a trailing-slash wildcard matches only folders', () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-glob-dirs-'));
  try {
    writeFileSync(join(td, 'plain.txt'), 'x\n');
    assert.equal(globExists(td, '*/'), false);
    mkdirSync(join(td, 'folder'));
    assert.equal(globExists(td, '*/'), true);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});
