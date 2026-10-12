// tools/build-skill.mjs: the branches that the main build test does not reach.
// Every test that builds an archive uses its own temporary git repository, selected through GIT_DIR,
// GIT_WORK_TREE, and GIT_INDEX_FILE, so the index of the real repository is never read or changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, sep } from 'node:path';
import { BuildError, buildZip, extractNotes, frontmatterField, frontmatterKeys, metadataField } from '../../tools/build-skill.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'tools', 'build-skill.mjs');

const SKILL = (version = '2.0.0') => `---
name: anchored-docs
description: x
metadata:
  version: "${version}"
---
# Body

## Changelog

### ${version}
- New thing.
`;

/** Returns the environment without any variable that selects a git repository. */
function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k.startsWith('GIT_')) {
      delete env[k];
    }
  }
  return env;
}

/** Runs git inside the temporary repository `dir`. */
function gitIn(dir, args, extraEnv = {}) {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', ...args], {
    cwd: dir,
    env: { ...cleanEnv(), ...extraEnv },
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
  return r.stdout.trim();
}

/** Creates a temporary repository, writes `files` ({ relative path: content }), and stages them. */
function makeRepo(files) {
  const dir = mkdtempSync(join(tmpdir(), 'ad-branches-'));
  gitIn(dir, ['init', '-q']);
  for (const [rel, content] of Object.entries(files)) {
    const full = join(dir, ...rel.split('/'));
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  gitIn(dir, ['add', '-A']);
  return dir;
}

/** Commits the staged files of `dir` at the given raw git date and returns the commit id. */
function commit(dir, rawDate = '1791386088 +0000') {
  gitIn(dir, ['commit', '-q', '-m', 'x'], { GIT_AUTHOR_DATE: rawDate, GIT_COMMITTER_DATE: rawDate });
  return gitIn(dir, ['rev-parse', 'HEAD']);
}

/** Runs the real script against the temporary repository `dir`. */
function runCli(dir, args, extraEnv = {}) {
  return spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: 'utf8',
    env: {
      ...cleanEnv(),
      GIT_DIR: join(dir, '.git'),
      GIT_WORK_TREE: dir,
      GIT_INDEX_FILE: join(dir, '.git', 'index'),
      ...extraEnv,
    },
  });
}

/** Runs `body` with a temporary repository and removes the repository afterwards. */
function withRepo(files, body) {
  const dir = makeRepo(files);
  try {
    body(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const SKILL_PATH = 'skills/anchored-docs/SKILL.md';

test('buildZip rejects a timestamp before 1980', () => {
  assert.throws(() => buildZip([{ path: 'a/b', data: Buffer.alloc(0) }], 0), (e) => e instanceof BuildError && /before 1980/.test(e.message));
});

test('buildZip rejects more entries than a zip without zip64 can hold', () => {
  const files = Array.from({ length: 0x10000 }, (_, i) => ({ path: `f${i}`, data: Buffer.alloc(0) }));
  assert.throws(() => buildZip(files, 1791386088), (e) => e instanceof BuildError && /too many entries/.test(e.message));
});

test('buildZip rejects an archive larger than 4 GiB without allocating the data', () => {
  const big = { length: 0xffffffff, *[Symbol.iterator]() {} };
  assert.throws(() => buildZip([{ path: 'a', data: big }], 1791386088), (e) => e instanceof BuildError && /too large/.test(e.message));
});

test('the frontmatter readers return empty results for missing or empty values', () => {
  assert.deepEqual(frontmatterKeys('# no frontmatter\n'), []);
  assert.equal(metadataField('# no frontmatter\n', 'version'), null);
  assert.equal(frontmatterField('---\nname:\n---\n', 'name'), null);
  assert.equal(frontmatterField('---\nname: "q"\n---\n', 'name'), 'q');
  assert.equal(metadataField('---\nmetadata:\n  version:\n---\n', 'version'), null);
  assert.equal(metadataField('---\nmetadata:\n  author: me\n---\n', 'version'), null);
});

test('extractNotes reads a last section and treats an empty section as missing', () => {
  assert.equal(extractNotes('## Changelog\n### 1.0.0\n- x\n', '1.0.0'), '- x');
  assert.equal(extractNotes('## Changelog\n### 1.0.0\n\n### 0.9.0\n- y\n', '1.0.0'), null);
});

test('the CLI builds from the index, with executable files, into a new folder', () => {
  withRepo({ [SKILL_PATH]: SKILL(), 'skills/anchored-docs/run.sh': '#!/bin/sh\n' }, (dir) => {
    gitIn(dir, ['update-index', '--chmod=+x', 'skills/anchored-docs/run.sh']);
    commit(dir);
    const out = join(dir, 'nested', 'deeper', 'a.skill');
    const r = runCli(dir, ['build', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /^build: 2 files, \d+ bytes, /);
    assert.ok(r.stdout.trim().endsWith(`${sep}nested${sep}deeper${sep}a.skill`));
    assert.ok(existsSync(out));
  });
});

test('the CLI writes to dist/anchored-docs.skill in the tool folder tree when --out is absent', () => {
  const dist = join(HERE, '..', '..', 'dist');
  const target = join(dist, 'anchored-docs.skill');
  const distExisted = existsSync(dist);
  const previous = existsSync(target) ? readFileSync(target) : null;
  try {
    withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
      commit(dir);
      const r = runCli(dir, ['build']);
      assert.equal(r.status, 0, r.stderr);
      assert.ok(existsSync(target));
    });
  } finally {
    if (previous !== null) {
      writeFileSync(target, previous);
    } else if (distExisted) {
      rmSync(target, { force: true });
    } else {
      rmSync(dist, { recursive: true, force: true });
    }
  }
});

test('the CLI builds from a commit with --ref and a pre-release --tag', () => {
  withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
    const id = commit(dir);
    const out = join(dir, 'a.skill');
    const r = runCli(dir, ['build', '--ref', id, '--tag', 'v2.0.0-rc.1', '--out', out]);
    assert.equal(r.status, 0, r.stderr);
    assert.ok(readFileSync(out).length > 0);
  });
});

test('the CLI refuses a commit time before 1980', () => {
  withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
    commit(dir, '315000000 +0000');
    const r = runCli(dir, ['build', '--out', join(dir, 'a.skill')]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^build-skill: timestamps before 1980/);
  });
});

test('the CLI refuses a skill folder without SKILL.md', () => {
  withRepo({ 'skills/anchored-docs/other.md': 'x\n' }, (dir) => {
    commit(dir);
    const r = runCli(dir, ['build', '--out', join(dir, 'a.skill')]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /refusing to build:\n {2}anchored-docs\/SKILL\.md is not tracked by git/);
  });
});

test('the CLI reports an empty skill folder for the index and for a commit', () => {
  withRepo({ 'README.md': 'x\n' }, (dir) => {
    const id = commit(dir);
    const fromIndex = runCli(dir, ['build', '--out', join(dir, 'a.skill')]);
    assert.equal(fromIndex.status, 2);
    assert.match(fromIndex.stderr, /no tracked files under skills\/anchored-docs\n$/);

    const fromRef = runCli(dir, ['build', '--ref', id, '--out', join(dir, 'a.skill')]);
    assert.equal(fromRef.status, 2);
    assert.match(fromRef.stderr, new RegExp(`no tracked files under skills/anchored-docs at ${id}`));
  });
});

test('the CLI refuses a symbolic link in the index and a submodule in a commit', () => {
  withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
    const sha = spawnSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, env: cleanEnv(), input: 'SKILL.md', encoding: 'utf8' }).stdout.trim();
    gitIn(dir, ['update-index', '--add', '--cacheinfo', `120000,${sha},skills/anchored-docs/link`]);

    const fromIndex = runCli(dir, ['build', '--out', join(dir, 'a.skill')]);
    assert.equal(fromIndex.status, 2);
    assert.match(fromIndex.stderr, /skills\/anchored-docs\/link: unsupported entry \(mode 120000, blob\)/);

    gitIn(dir, ['rm', '-q', '--cached', 'skills/anchored-docs/link']);
    gitIn(dir, ['update-index', '--add', '--cacheinfo', `160000,${'a'.repeat(40)},skills/anchored-docs/sub`]);
    const id = commit(dir);
    const fromRef = runCli(dir, ['build', '--ref', id, '--out', join(dir, 'a.skill')]);
    assert.equal(fromRef.status, 2);
    assert.match(fromRef.stderr, /skills\/anchored-docs\/sub: unsupported entry \(mode 160000, commit\)/);
  });
});

test('the CLI reports a git failure and a missing git program', () => {
  withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
    commit(dir);
    const bad = runCli(dir, ['build', '--ref', 'no-such-ref', '--out', join(dir, 'a.skill')]);
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /build-skill: git ls-tree .* failed: /);

    const none = runCli(dir, ['build', '--out', join(dir, 'a.skill')], { PATH: '', Path: '' });
    assert.equal(none.status, 2);
    assert.match(none.stderr, /build-skill: cannot run git: /);
  });
});

test('the CLI prints a stack trace for an error that is not a BuildError', () => {
  withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
    commit(dir);
    writeFileSync(join(dir, 'plain-file'), 'x');
    const r = runCli(dir, ['build', '--out', join(dir, 'plain-file', 'sub', 'a.skill')]);
    assert.equal(r.status, 2);
    assert.match(r.stderr, /^build-skill: (Error|.*Error).*\n\s+at /s);
  });
});

test('the notes command prints a section from the index, from a commit, and for a tag', () => {
  withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
    const id = commit(dir);
    const fromIndex = runCli(dir, ['notes', '2.0.0']);
    assert.equal(fromIndex.status, 0, fromIndex.stderr);
    assert.equal(fromIndex.stdout, '- New thing.\n');

    const fromRef = runCli(dir, ['notes', '--ref', id, 'v2.0.0-rc.1']);
    assert.equal(fromRef.status, 0, fromRef.stderr);
    assert.equal(fromRef.stdout, '- New thing.\n');

    const missing = runCli(dir, ['notes', '9.9.9']);
    assert.equal(missing.status, 2);
    assert.match(missing.stderr, /SKILL\.md has no changelog entry "### 9\.9\.9"/);
  });
});

test('the CLI prints the usage text for a bad command line', () => {
  withRepo({ [SKILL_PATH]: SKILL() }, (dir) => {
    commit(dir);
    const cases = [
      ['build', '--bogus'],
      [],
      ['unknown'],
      ['build', 'extra'],
      ['notes'],
      ['notes', '2.0.0', 'extra'],
      ['notes', '--tag', 'v2.0.0', '2.0.0'],
      ['notes', '--out', 'x', '2.0.0'],
    ];
    for (const args of cases) {
      const r = runCli(dir, args);
      assert.equal(r.status, 2, args.join(' '));
      assert.match(r.stderr, /usage: build-skill\.mjs build /, args.join(' '));
    }
  });
});

test('the CLI does nothing when it is imported by a program without a script path', () => {
  const url = pathToFileURL(SCRIPT).href;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `await import(${JSON.stringify(url)});`], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, '');
});
