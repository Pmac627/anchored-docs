// Behavior of docs_check.mjs that has no 1.x golden: a deliberate bug fix and the new JSON error paths.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'skills', 'anchored-docs', 'scripts', 'docs_check.mjs');

/** Runs docs_check with no STE_* variables from the caller's environment, so the result does not depend on the machine. */
function run(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STE_')));
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withRepo(parent, fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-dc-'));
  try {
    const repo = join(td, ...parent, 'proj');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    mkdirSync(join(repo, 'src'), { recursive: true });
    return fn(repo);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

const DOC = `---
type: Flow
title: T
description: D
diataxis: explanation
status: stable
sources:
  - id: a
    resource: src/a.cs
generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }
verified:
  - { by: human:pat, at: 2099-01-01T00:00:00Z }
---
# T

Body.
`;

test('back-links are checked even when the repo sits under a folder named build, bin, or dist', () => {
  // 1.x skipped every source file when any parent folder of the repo had one of those names.
  for (const parent of [['build'], ['bin'], ['dist'], ['node_modules']]) {
    withRepo(parent, (repo) => {
      writeFileSync(join(repo, 'docs', 'index.md'), '# Index\n\n* [T](t.md)\n');
      writeFileSync(join(repo, 'docs', 't.md'), DOC);
      writeFileSync(join(repo, 'src', 'a.cs'), '/// <seealso href="docs/missing.md"/>\nclass A {}\n');
      const r = run(repo, 'links', 'docs');
      assert.equal(r.code, 1, parent.join('/'));
      assert.match(r.out, /src[\\/]a\.cs: back-link target missing: docs\/missing\.md/, parent.join('/'));
    });
  }
});

test('back-links in .mjs files are checked, as ste_check.mjs already reads .mjs comments', () => {
  // 2.0.0 listed .js but not .mjs, so a Node ESM repo (the skill's own scripts included) reported 0 back-links.
  withRepo([], (repo) => {
    writeFileSync(join(repo, 'docs', 'index.md'), '# Index\n\n* [T](t.md)\n');
    writeFileSync(join(repo, 'docs', 't.md'), DOC);
    writeFileSync(join(repo, 'src', 'good.mjs'), '/**\n * Good.\n * @see ../docs/t.md\n */\nexport function good() {}\n');
    writeFileSync(join(repo, 'src', 'bad.mjs'), '/**\n * Bad.\n * @see ../docs/missing.md\n */\nexport function bad() {}\n');
    const r = run(repo, 'links', 'docs');
    assert.equal(r.code, 1);
    assert.match(r.out, /src[\\/]bad\.mjs: back-link target missing: \.\.\/docs\/missing\.md/);
    assert.doesNotMatch(r.out, /good\.mjs/);
    assert.match(r.out, /links: 2 docs, 2 code back-links, 1 findings/);
  });
});

test('back-links in .cjs, .mts, and .cts files are checked too', () => {
  for (const ext of ['.cjs', '.mts', '.cts']) {
    withRepo([], (repo) => {
      writeFileSync(join(repo, 'docs', 'index.md'), '# Index\n\n* [T](t.md)\n');
      writeFileSync(join(repo, 'docs', 't.md'), DOC);
      writeFileSync(join(repo, 'src', `bad${ext}`), '/**\n * Bad.\n * @see ../docs/missing.md\n */\nfunction bad() {}\n');
      const r = run(repo, 'links', 'docs');
      assert.equal(r.code, 1, ext);
      assert.match(r.out, new RegExp(`src[\\\\/]bad\\${ext}: back-link target missing`), ext);
    });
  }
});

test('source files inside a build folder under the repo are still skipped', () => {
  withRepo([], (repo) => {
    mkdirSync(join(repo, 'src', 'build'));
    writeFileSync(join(repo, 'docs', 'index.md'), '# Index\n\n* [T](t.md)\n');
    writeFileSync(join(repo, 'docs', 't.md'), DOC);
    writeFileSync(join(repo, 'src', 'build', 'gen.cs'), '/// <seealso href="docs/missing.md"/>\nclass G {}\n');
    assert.equal(run(repo, 'links', 'docs').code, 0);
  });
});

test('map writes JSON, check ignores the date and formatting, and sees a real change', () => {
  withRepo([], (repo) => {
    writeFileSync(join(repo, 'docs', 't.md'), DOC);
    writeFileSync(join(repo, 'src', 'a.cs'), 'class A {}\n');
    assert.equal(run(repo, 'map', 'docs').code, 0);
    const path = join(repo, 'docs', '_map.json');
    const data = JSON.parse(readFileSync(path, 'utf8'));
    assert.deepEqual(data.map, [{ code: 'src/a.cs', docs: ['docs/t.md'] }]);
    assert.match(data.generated, /^\d{4}-\d{2}-\d{2}$/);
    writeFileSync(path, JSON.stringify({ generated: '2000-01-01', map: data.map }));
    assert.equal(run(repo, 'map', 'docs', '--check').code, 0);
    writeFileSync(path, JSON.stringify({ generated: '2000-01-01', map: [] }));
    assert.equal(run(repo, 'map', 'docs', '--check').code, 1);
  });
});

test('a missing or broken _map.json makes affected and map --check behave sensibly', () => {
  withRepo([], (repo) => {
    writeFileSync(join(repo, 'docs', 't.md'), DOC);
    assert.match(run(repo, 'affected', 'docs', 'src/a.cs').out, /no doc's sources match/);
    assert.equal(run(repo, 'map', 'docs', '--check').code, 1);
    writeFileSync(join(repo, 'docs', '_map.json'), '{ not json');
    const r = run(repo, 'affected', 'docs', 'src/a.cs');
    assert.equal(r.code, 2);
    assert.match(r.out, /_map\.json: not valid JSON/);
  });
});

test('a 1.x _map.yaml with no _map.json is called out instead of silently ignored', () => {
  withRepo([], (repo) => {
    writeFileSync(join(repo, 'docs', '_map.yaml'), 'map:\n  - code: src/a.cs\n    docs:\n      - docs/t.md\n');
    const r = run(repo, 'affected', 'docs', 'src/a.cs');
    assert.match(r.out, /notice: found _map\.yaml; anchored-docs 2\.0 reads _map\.json/);
  });
});

test('a broken glossary file exits 2 and names the file', () => {
  withRepo([], (repo) => {
    writeFileSync(join(repo, 'docs', '_glossary.json'), '{ "technical_nouns": [ , ] }');
    const r = run(repo, 'glossary', 'docs');
    assert.equal(r.code, 2);
    assert.match(r.out, /_glossary\.json: not valid JSON/);
  });
});

test('usage errors for --days and --repo exit 2', () => {
  withRepo([], (repo) => {
    assert.equal(run(repo, 'stale', 'docs', '--days', 'soon').code, 2);
    assert.equal(run(repo, 'okf', 'docs', '--repo').code, 2);
  });
});

test('--days accepts the whole numbers 1.2.0 accepted and rejects other numbers', () => {
  withRepo([], (repo) => {
    writeFileSync(join(repo, 'src', 'a.cs'), 'class A {}\n');
    writeFileSync(join(repo, 'docs', 't.md'), DOC);
    for (const bad of ['', ' ', '1.0', '1e3', '0x10', 'abc', '1__0', '_1', '1_']) {
      const r = run(repo, 'stale', 'docs', '--days', bad);
      assert.equal(r.code, 2, JSON.stringify(bad));
      assert.match(r.out, /--days needs a whole number/, JSON.stringify(bad));
    }
    for (const good of ['7', ' 7 ', '+3', '-5', '1_000', '0']) assert.notEqual(run(repo, 'stale', 'docs', '--days', good).code, 2, JSON.stringify(good));
  });
});

test('a file that cannot be read keeps the findings printed so far and names the file, without a stack trace', () => {
  withRepo([], (repo) => {
    mkdirSync(join(repo, 'docs', 'flows', 'zz.md'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'flows', 'a.md'), '# no frontmatter\n');
    const r = run(repo, 'okf', 'docs');
    assert.equal(r.code, 2);
    assert.match(r.out, /flows[\\/]a\.md: no frontmatter/);
    assert.match(r.out, /docs_check: .*zz\.md: cannot read/);
    assert.doesNotMatch(r.out + r.err, /\n\s+at /);
  });
});

test('CRLF documents give the same findings as LF documents', () => {
  withRepo([], (repo) => {
    writeFileSync(join(repo, 'src', 'a.cs'), 'class A {}\n');
    writeFileSync(join(repo, 'docs', 't.md'), DOC.replaceAll('\n', '\r\n'));
    assert.equal(run(repo, 'okf', 'docs').code, 0);
  });
});
