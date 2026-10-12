// Branch coverage for docs_check.mjs: inputs the other docs_check tests and tests/cases.json do not reach.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..', '..', 'skills', 'anchored-docs', 'scripts');
const SCRIPT = join(SCRIPTS, 'docs_check.mjs');
const LEGACY_FIXTURE = join(HERE, '..', 'fixtures', 'repo-legacy');

/** Runs a docs_check copy with no STE_* variables from the caller's environment, so the result does not depend on the machine. */
function runScript(script, cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STE_')));
  const r = spawnSync(process.execPath, [script, ...args], { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

const run = (cwd, ...args) => runScript(SCRIPT, cwd, ...args);

/** Makes a repo with docs/ and src/ folders, runs fn on it, and removes it. */
function withRepo(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-dcb-'));
  try {
    const repo = join(td, 'proj');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    mkdirSync(join(repo, 'src'), { recursive: true });
    return fn(repo);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

/** Frontmatter for a concept doc; each key in over replaces the default line, and null removes the key. */
function doc(over = {}) {
  const base = {
    type: 'type: Flow',
    title: 'title: T',
    description: 'description: D',
    diataxis: 'diataxis: explanation',
    status: 'status: stable',
    sources: 'sources:\n  - id: a\n    resource: src/a.cs',
    generated: 'generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }',
    verified: 'verified:\n  - { by: human:pat, at: 2099-01-01T00:00:00Z }',
  };
  const lines = Object.entries({ ...base, ...over }).filter(([, v]) => v !== null).map(([, v]) => v);
  return `---\n${lines.join('\n')}\n---\n# T\n\nBody.\n`;
}

test('okf: a doc with no sources key, a bare scalar entry, and a malformed generated mapping report findings', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 'nosrc.md'), doc({ sources: null }));
    writeFileSync(join(repo, 'docs', 'scalar.md'), doc({ sources: 'sources: [plain]' }));
    writeFileSync(join(repo, 'docs', 'noby.md'), doc({ generated: 'generated: { at: 2026-01-10T10:00:00Z }' }));
    writeFileSync(join(repo, 'docs', 'noat.md'), doc({ generated: 'generated: { by: claude/1.0 }' }));
    const r = run(repo, 'okf', 'docs');
    assert.equal(r.code, 1);
    assert.match(r.out, /nosrc\.md: missing sources/);
    assert.match(r.out, /scalar\.md: sources entry without resource: plain/);
    assert.match(r.out, /noby\.md: generated\.by is not an OKF actor/);
    assert.match(r.out, /noat\.md: generated\.at is not ISO 8601/);
  });
});

test('okf: a verified entry without by is malformed', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 't.md'), doc({ verified: 'verified: { at: 2099-01-01T00:00:00Z }' }));
    const r = run(repo, 'okf', 'docs');
    assert.equal(r.code, 1);
    assert.match(r.out, /t\.md: verified entry malformed/);
  });
});

test('okf and stale: verified as one mapping counts as one event, and a scalar counts as none', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 'one.md'), doc({ verified: 'verified: { by: human:pat, at: 2099-01-01T00:00:00Z }' }));
    writeFileSync(join(repo, 'docs', 'scalar.md'), doc({ verified: 'verified: yes' }));
    writeFileSync(join(repo, 'src', 'a.cs'), 'class A {}\n');
    const okf = run(repo, 'okf', 'docs');
    assert.equal(okf.code, 0, okf.out);
    assert.match(okf.out, /okf: 2 concept docs, 0 findings/);
    const stale = run(repo, 'stale', 'docs');
    assert.equal(stale.code, 1);
    assert.match(stale.out, /scalar\.md: never verified/);
    assert.doesNotMatch(stale.out, /one\.md/);
  });
});

test('links: external links are skipped and a link that starts with a slash resolves from the docs root', () => {
  withRepo((repo) => {
    mkdirSync(join(repo, 'docs', 'sub'));
    writeFileSync(join(repo, 'docs', 'index.md'), '# Index\n\n* [A](a.md)\n* [S](sub/)\n');
    writeFileSync(join(repo, 'docs', 'a.md'), doc().replace('Body.', '[web](https://example.com/x) [mail](mailto:a@b.c) [root](/sub/b.md)'));
    writeFileSync(join(repo, 'docs', 'sub', 'index.md'), '# Sub\n\n* [B](b.md)\n');
    writeFileSync(join(repo, 'docs', 'sub', 'b.md'), doc());
    const r = run(repo, 'links', 'docs');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /links: 4 docs, 0 code back-links, 0 findings/);
  });
});

test('links: a source path that cannot be read as a file is skipped', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 'index.md'), '# Index\n\n* [T](t.md)\n');
    writeFileSync(join(repo, 'docs', 't.md'), doc());
    // A folder whose name ends in .js is listed by the walk, and reading it fails.
    mkdirSync(join(repo, 'src', 'folder.js'));
    const r = run(repo, 'links', 'docs');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /links: 2 docs, 0 code back-links, 0 findings/);
  });
});

test('links: a back-link target without docs/ is ignored when the file mentions docs/ elsewhere', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 'index.md'), '# Index\n\n* [T](t.md)\n');
    writeFileSync(join(repo, 'docs', 't.md'), doc());
    writeFileSync(join(repo, 'src', 'a.mjs'), '// Notes live in docs/ somewhere.\n/**\n * @see elsewhere.md\n */\nexport function a() {}\n');
    const r = run(repo, 'links', 'docs');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /links: 2 docs, 0 code back-links, 0 findings/);
  });
});

test('map: sources given as a mapping, a string, a list of strings, or a list with a URL and a non-resource entry', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 'asmap.md'), doc({ sources: 'sources:\n  key1: v1\n  key2: v2' }));
    writeFileSync(join(repo, 'docs', 'asstr.md'), doc({ sources: 'sources: xy' }));
    writeFileSync(join(repo, 'docs', 'aslist.md'), doc({ sources: 'sources: [src/s.cs, "https://example.com/p"]' }));
    writeFileSync(join(repo, 'docs', 'asbool.md'), doc({ sources: 'sources: true' }));
    const r = run(repo, 'map', 'docs');
    assert.equal(r.code, 0, r.out);
    const map = JSON.parse(readFileSync(join(repo, 'docs', '_map.json'), 'utf8')).map;
    const byCode = new Map(map.map((e) => [e.code, e.docs]));
    assert.deepEqual(byCode.get('key1'), ['docs/asmap.md']);
    assert.deepEqual(byCode.get('key2'), ['docs/asmap.md']);
    assert.deepEqual(byCode.get('x'), ['docs/asstr.md']);
    assert.deepEqual(byCode.get('y'), ['docs/asstr.md']);
    assert.deepEqual(byCode.get('src/s.cs'), ['docs/aslist.md']);
    assert.equal(byCode.has('https://example.com/p'), false);
    assert.equal(map.length, 5);
  });
});

test('stale: a draft doc with no generated key, or with a generated value that is not a mapping, is still reported', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 'nogen.md'), doc({ status: 'status: draft', generated: null }));
    writeFileSync(join(repo, 'docs', 'strgen.md'), doc({ status: 'status: draft', generated: 'generated: someone' }));
    const r = run(repo, 'stale', 'docs');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /nogen\.md: still draft \(generated None\); needs human sign-off/);
    assert.match(r.out, /strgen\.md: still draft \(generated \?\); needs human sign-off/);
  });
});

test('stale: --days with no value, or a value beyond the safe integer range, exits 2', () => {
  withRepo((repo) => {
    for (const args of [['--days'], ['--days', '99999999999999999999']]) {
      const r = run(repo, 'stale', 'docs', ...args);
      assert.equal(r.code, 2, args.join(' '));
      assert.match(r.out, /docs_check: --days needs a whole number/, args.join(' '));
    }
  });
});

test('glossary: a skill copy without references/ and a docs folder without _glossary.json show none for both levels', () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-dcb-skill-'));
  try {
    const scripts = join(td, 'skill', 'scripts');
    mkdirSync(scripts, { recursive: true });
    for (const f of readdirSync(SCRIPTS)) {
      if (f.endsWith('.mjs')) {
        cpSync(join(SCRIPTS, f), join(scripts, f));
      }
    }
    const docs = join(td, 'proj', 'docs');
    mkdirSync(docs, { recursive: true });
    const r = runScript(join(scripts, 'docs_check.mjs'), td, 'glossary', docs, '--terms');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /org glossary: {5}none {2}\(0 terms\)/);
    assert.match(r.out, /project glossary: none {2}\(0 terms\)/);
    assert.match(r.out, /effective: {8}0 terms, 0 unapproved synonyms/);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});

test('glossary: a docs folder without _glossary.json shows none for the project level', () => {
  withRepo((repo) => {
    const r = run(repo, 'glossary', 'docs');
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /project glossary: none {2}\(0 terms\)/);
    assert.doesNotMatch(r.out, /org glossary: {5}none/);
  });
});

test('migrate: a path that is not a directory exits 2', () => {
  withRepo((repo) => {
    const missing = join(repo, 'nope');
    const r = run(repo, 'migrate', missing);
    assert.equal(r.code, 2);
    assert.match(r.out, /docs_check: .*nope is not a directory/);
  });
});

test('migrate: an existing destination is reported as a conflict and exits 1', () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-dcb-mig-'));
  try {
    const repo = join(td, 'repo');
    cpSync(LEGACY_FIXTURE, repo, { recursive: true });
    mkdirSync(join(repo, 'docs', 'anchored-docs', 'flows'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'anchored-docs', 'flows', 'ingest.md'), '# Someone else\n');
    const r = run(td, 'migrate', repo, '--apply');
    assert.equal(r.code, 1);
    assert.match(r.out, /Resolve the conflicts by hand/);
    assert.doesNotMatch(r.out, /migrate: moved/);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});

test('a missing docs/anchored-docs/ folder with a 2.0 bundle in docs/ prints the legacy notice and exits 2', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', '_glossary.json'), '{}\n');
    const r = run(repo, 'okf', join('docs', 'anchored-docs'));
    assert.equal(r.code, 2);
    assert.match(r.out, /is not a directory/);
    assert.match(r.out, /notice: the docs bundle is in docs\/ \(anchored-docs 2\.0 layout\)/);
  });
});

test('an error that is not an expected input problem exits 2 with a one-line report and the stack on stderr', () => {
  withRepo((repo) => {
    writeFileSync(join(repo, 'docs', 't.md'), doc());
    // Writing the map fails because _map.json is a folder. The script does not catch that case by name.
    mkdirSync(join(repo, 'docs', '_map.json'));
    const r = run(repo, 'map', 'docs');
    assert.equal(r.code, 2);
    assert.match(r.out, /docs_check: unexpected error: /);
    assert.match(r.err, /EISDIR/);
  });
});
