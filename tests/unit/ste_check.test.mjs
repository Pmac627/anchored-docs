// Behavior of ste_check.mjs that has no 1.x golden: platform-independent file handling, clean errors, and
// where glossary notices are reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'skills', 'anchored-docs', 'scripts', 'ste_check.mjs');

/** Runs ste_check with no STE_* variables from the caller's environment, so the result does not depend on the machine. */
function run(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STE_')));
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withRepo(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-ste-'));
  try {
    const repo = join(td, 'proj');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    return fn(repo);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

const PASSIVE = 'The data was created by the job.\n';

test('doc comments are checked in .mjs, .cjs, .mts, and .cts files, as in .js and .ts', () => {
  withRepo((repo) => {
    mkdirSync(join(repo, 'src'));
    for (const ext of ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']) {
      writeFileSync(join(repo, 'src', `a${ext}`), `/** ${PASSIVE.trim()} */\nexport const a = 1;\n`);
    }
    const r = run(repo, 'src');
    for (const ext of ['.js', '.mjs', '.cjs', '.ts', '.mts', '.cts']) {
      assert.match(r.out, new RegExp(`a\\${ext}:1: \\[H\\] 3\\.6`), ext);
    }
    assert.match(r.out, /ste_check: 6 files/);
  });
});

test('index.md and log.md are never checked, with native path separators', () => {
  withRepo((repo) => {
    mkdirSync(join(repo, 'docs', 'flows'));
    writeFileSync(join(repo, 'docs', 'index.md'), PASSIVE);
    writeFileSync(join(repo, 'docs', 'log.md'), PASSIVE);
    writeFileSync(join(repo, 'docs', 'flows', 'index.md'), PASSIVE);
    writeFileSync(join(repo, 'docs', 'flows', 'a.md'), 'Read the file.\n');
    const dir = run(repo, 'docs');
    assert.equal(dir.code, 0, dir.out);
    assert.doesNotMatch(dir.out, /index\.md|log\.md/);
    assert.match(dir.out, /Docs-STE: pass/);
    const file = run(repo, join('docs', 'log.md'), join('docs', 'flows', 'index.md'));
    assert.doesNotMatch(file.out, /index\.md:|log\.md:/);
  });
});

test('a file that cannot be read stops the run with a message that names it, not a stack trace', () => {
  withRepo((repo) => {
    mkdirSync(join(repo, 'docs', 'zz.md'));
    writeFileSync(join(repo, 'docs', 'a.md'), 'Use `Foo` here.\n');
    const r = run(repo, '--glossary-report', 'docs');
    assert.equal(r.code, 2);
    assert.match(r.err, /ste_check: .*zz\.md: cannot read/);
    assert.doesNotMatch(r.err, /\n\s+at /);
  });
});

test('the notice for a leftover _glossary.yaml points at that file, not at the org glossary', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', '_glossary.yaml'), 'technical_nouns:\n  - term: queue\n');
    writeFileSync(join(repo, 'docs', 'a.md'), 'Read the file.\n');
    const r = run(repo, 'docs');
    assert.match(r.out, /docs[\\/]_glossary\.yaml:1: \[H\] 1\.8: glossary: found _glossary\.yaml/);
    assert.doesNotMatch(r.out, /org-glossary\.json:1:/);
  });
});

test('STE_AGENT_PACK expands a leading ~/ and ~\\ to the home folder', () => {
  const home = mkdtempSync(join(tmpdir(), 'ad-home-'));
  try {
    cpSync(join(HERE, '..', 'fixtures', 'synthetic-pack'), join(home, 'mypack'), { recursive: true });
    for (const value of ['~/mypack', '~\\mypack']) {
      const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STE_'))), HOME: home, USERPROFILE: home, STE_AGENT_PACK: value };
      const r = spawnSync(process.execPath, [SCRIPT, '--status'], { cwd: home, env, encoding: 'utf8' });
      assert.match(r.stdout, /STE word source: pack /, value);
      assert.ok(r.stdout.includes(join(home, 'mypack')), `${value}: ${r.stdout}`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});
