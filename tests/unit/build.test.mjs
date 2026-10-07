// tools/build-skill.mjs: the zip it writes, the release guards, and the changelog extraction.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { crc32, buildZip, extractNotes, checkSkill, frontmatterField, parseTag } from '../../tools/build-skill.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'tools', 'build-skill.mjs');

/** Reads a zip through its central directory, the way an unzip tool does. */
function readZip(buf) {
  const end = buf.length - 22;
  assert.equal(buf.readUInt32LE(end), 0x06054b50, 'end of central directory');
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central header');
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const size = buf.readUInt32LE(p + 24);
    const localNameLen = buf.readUInt16LE(local + 26);
    entries.push({
      name: buf.subarray(p + 46, p + 46 + nameLen).toString('utf8'),
      method: buf.readUInt16LE(p + 10),
      time: buf.readUInt16LE(p + 12),
      date: buf.readUInt16LE(p + 14),
      crc: buf.readUInt32LE(p + 16),
      mode: buf.readUInt32LE(p + 38) >>> 16,
      data: buf.subarray(local + 30 + localNameLen, local + 30 + localNameLen + size),
    });
    p += 46 + nameLen;
  }
  return entries;
}

const SKILL = (version = '2.0.0', name = 'anchored-docs') => `---
name: ${name}
version: ${version}
description: x
---
# Body

## Changelog

### 2.0.0
- New thing.

- Other thing.

### 1.2.0
- Old thing.
`;

test('crc32 gives the standard check values', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('buildZip stores every file and folder, sorted, with its content, CRC, and mode', () => {
  const zip = buildZip([
    { path: 'anchored-docs/scripts/b.mjs', data: Buffer.from('b\n'), executable: true },
    { path: 'anchored-docs/SKILL.md', data: Buffer.from('skill\n') },
  ], Date.UTC(2026, 9, 7, 15, 14, 48) / 1000);
  const entries = readZip(zip);
  assert.deepEqual(entries.map((e) => e.name), ['anchored-docs/', 'anchored-docs/SKILL.md', 'anchored-docs/scripts/', 'anchored-docs/scripts/b.mjs']);
  for (const e of entries) {
    assert.equal(e.method, 0, e.name);
    assert.equal(e.crc, crc32(e.data), e.name);
  }
  assert.equal(entries[1].data.toString(), 'skill\n');
  assert.equal(entries[0].mode, 0o40755);
  assert.equal(entries[1].mode, 0o100644);
  assert.equal(entries[3].mode, 0o100755);
  assert.equal(entries[1].date, ((2026 - 1980) << 9) | (10 << 5) | 7);
  assert.equal(entries[1].time, (15 << 11) | (14 << 5) | 24);
});

test('buildZip gives the same bytes for the same input in any order', () => {
  const a = { path: 'x/a.md', data: Buffer.from('a') };
  const b = { path: 'x/b/c.md', data: Buffer.from('c') };
  assert.deepEqual(buildZip([a, b], 1791386088), buildZip([b, a], 1791386088));
  assert.notDeepEqual(buildZip([a, b], 1791386088), buildZip([a, b], 1791386090));
});

test('extractNotes returns one version section without the blank lines around it', () => {
  assert.equal(extractNotes(SKILL(), '2.0.0'), '- New thing.\n\n- Other thing.');
  assert.equal(extractNotes(SKILL(), '1.2.0'), '- Old thing.');
  assert.equal(extractNotes(SKILL().replaceAll('\n', '\r\n'), '1.2.0'), '- Old thing.');
  assert.equal(extractNotes(SKILL(), '9.9.9'), null);
  assert.equal(extractNotes('# no changelog\n### 2.0.0\n- x\n', '2.0.0'), null);
});

test('parseTag tells a release from a pre-release', () => {
  assert.deepEqual(parseTag('v2.0.0'), { version: '2.0.0', prerelease: false });
  assert.deepEqual(parseTag('v2.0.0-rc.1'), { version: '2.0.0', prerelease: true });
  assert.equal(parseTag('release-2'), null);
});

test('frontmatterField reads a key only from the frontmatter', () => {
  assert.equal(frontmatterField(SKILL(), 'version'), '2.0.0');
  assert.equal(frontmatterField('# no frontmatter\nversion: 1\n', 'version'), null);
});

test('checkSkill accepts a clean skill and reports each release blocker', () => {
  const ok = { folder: 'anchored-docs', files: ['SKILL.md', 'references/asd-ste100-agent-pack/HOW-TO-INSTALL.md'], skillText: SKILL(), tag: 'v2.0.0' };
  assert.deepEqual(checkSkill(ok), []);
  assert.deepEqual(checkSkill({ ...ok, tag: undefined }), []);
  assert.match(checkSkill({ ...ok, tag: 'v2.0.1' }).join(), /tag "v2\.0\.1" differs/);
  assert.deepEqual(checkSkill({ ...ok, tag: 'v2.0.0-rc.1' }), []);
  for (const bad of ['2.0.0', 'v2.0', 'v2.0.0-', 'v2.0.0+build', 'v2.0.1-rc.1']) assert.match(checkSkill({ ...ok, tag: bad }).join(), /differs/, bad);
  assert.match(checkSkill({ ...ok, skillText: SKILL('2.0.0', 'other') }).join(), /name "other" differs/);
  assert.match(checkSkill({ ...ok, skillText: SKILL('3.0.0'), tag: 'v3.0.0' }).join(), /no changelog entry "### 3\.0\.0"/);
  assert.match(checkSkill({ ...ok, files: [...ok.files, 'references/asd-ste100-agent-pack/dictionary.json'] }).join(), /agent pack files .*dictionary\.json/);
  assert.match(checkSkill({ ...ok, files: ['README.md'] }).join(), /SKILL\.md is not tracked/);
});

test('the CLI builds this repo from git, and refuses a tag that differs from SKILL.md', () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-build-'));
  try {
    const out = join(td, 'a.skill');
    const r = spawnSync(process.execPath, [SCRIPT, 'build', '--out', out], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const names = readZip(readFileSync(out)).map((e) => e.name);
    assert.ok(names.includes('anchored-docs/SKILL.md'));
    assert.ok(names.every((n) => n.startsWith('anchored-docs/')));
    assert.deepEqual(names.filter((n) => n.includes('asd-ste100-agent-pack/') && !n.endsWith('/')), ['anchored-docs/references/asd-ste100-agent-pack/HOW-TO-INSTALL.md']);

    const bad = spawnSync(process.execPath, [SCRIPT, 'build', '--tag', 'v0.0.0', '--out', out], { encoding: 'utf8' });
    assert.equal(bad.status, 2);
    assert.match(bad.stderr, /refusing to build:.*tag "v0\.0\.0" differs/s);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});
