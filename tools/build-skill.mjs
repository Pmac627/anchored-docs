#!/usr/bin/env node
// Builds the downloadable anchored-docs.skill archive from git (Node 22+, zero dependencies).
//
//   node tools/build-skill.mjs build [--ref <commit>] [--tag v<version>] [--out <file>]
//   node tools/build-skill.mjs notes [--ref <commit>] <version or tag>
//
// build  Writes a store-only zip of skills/anchored-docs with one top-level folder, anchored-docs/.
//        The files come from git, not the working folder: the staged index by default, or <commit> with --ref.
//        Ignored files, such as a local ASD-STE100 agent pack, therefore cannot enter the archive.
//        Entries are sorted and every timestamp is the commit time, so the same input gives the same bytes.
//        It refuses to build when the frontmatter name differs from the folder name, when --tag is neither
//        v<version> nor a pre-release v<version>-<suffix>, when SKILL.md has no changelog entry for its version,
//        or when agent pack files are tracked.
// notes  Prints the SKILL.md changelog section for <version>, for use as release notes. A tag such as v2.0.0-rc.1
//        selects the section of its version, 2.0.0.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILL_DIR = 'skills/anchored-docs';
const PACK_DIR = 'references/asd-ste100-agent-pack/';
const PACK_ALLOWED = new Set([`${PACK_DIR}HOW-TO-INSTALL.md`]);

export class BuildError extends Error {}

// ---------- zip ----------

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

export function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// MS-DOS date and time, in UTC so the result does not depend on the machine's time zone.
function dosDateTime(epochSeconds) {
  const d = new Date(epochSeconds * 1000);
  if (d.getUTCFullYear() < 1980) throw new BuildError('timestamps before 1980 cannot be stored in a zip');
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/**
 * Returns a store-only zip of `files` ({ path, data, executable }), plus an entry for every parent folder.
 * Entries are in byte order of their names and all carry the timestamp `epochSeconds`.
 */
export function buildZip(files, epochSeconds) {
  const { time, date } = dosDateTime(epochSeconds);

  const entries = new Map();
  for (const f of files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dir = `${parts.slice(0, i).join('/')}/`;
      if (!entries.has(dir)) entries.set(dir, { name: dir, data: Buffer.alloc(0), attr: ((0o40755 << 16) | 0x10) >>> 0 });
    }
    entries.set(f.path, { name: f.path, data: f.data, attr: ((f.executable ? 0o100755 : 0o100644) << 16) >>> 0 });
  }

  const sorted = [...entries.values()].sort((a, b) => Buffer.compare(Buffer.from(a.name), Buffer.from(b.name)));
  if (sorted.length > 0xffff) throw new BuildError('too many entries for a zip without zip64');

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of sorted) {
    const name = Buffer.from(e.name, 'utf8');
    const crc = crc32(e.data);
    const size = e.data.length;

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);          // version needed
    local.writeUInt16LE(0x0800, 6);      // names are UTF-8
    local.writeUInt16LE(0, 8);           // stored
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, e.data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 20, 4);   // made by Unix, so the attributes below are file modes
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(e.attr, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + size;
    if (offset > 0xffffffff) throw new BuildError('archive too large for a zip without zip64');
  }

  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(sorted.length, 8);
  end.writeUInt16LE(sorted.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

// ---------- SKILL.md ----------

export function frontmatterField(text, key) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/.exec(text);
  if (!m) return null;
  const line = new RegExp(`^${key}:[ \\t]*(.*?)[ \\t]*$`, 'm').exec(m[1].replace(/\r/g, ''));
  return line && line[1] !== '' ? line[1] : null;
}

/** Returns the body of "### <version>" under "## Changelog", without surrounding blank lines, or null. */
export function extractNotes(text, version) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const log = lines.findIndex((l) => /^## Changelog\s*$/.test(l));
  if (log < 0) return null;
  const start = lines.findIndex((l, i) => i > log && l.trim() === `### ${version}`);
  if (start < 0) return null;
  let end = lines.findIndex((l, i) => i > start && /^#{1,3} /.test(l));
  if (end < 0) end = lines.length;
  const body = lines.slice(start + 1, end).join('\n').trim();
  return body === '' ? null : body;
}

/**
 * Splits a release tag. "v2.0.0" is a release of 2.0.0; "v2.0.0-rc.1" is a pre-release of 2.0.0.
 * Returns { version, prerelease }, or null for a tag of any other shape.
 */
export function parseTag(tag) {
  const m = /^v(\d+\.\d+\.\d+)(?:-([0-9A-Za-z.-]+))?$/.exec(tag);
  return m ? { version: m[1], prerelease: m[2] !== undefined } : null;
}

const tagVersion = (tag) => parseTag(tag)?.version ?? null;

/**
 * Returns every reason the skill must not be released. `files` are paths relative to the skill folder.
 */
export function checkSkill({ folder, files, skillText, tag }) {
  const errors = [];
  if (!files.includes('SKILL.md')) return [`${folder}/SKILL.md is not tracked by git`];

  const name = frontmatterField(skillText, 'name');
  const version = frontmatterField(skillText, 'version');
  if (name !== folder) errors.push(`SKILL.md name "${name}" differs from the folder name "${folder}"`);
  if (!version) errors.push('SKILL.md has no version');
  else {
    if (tag !== undefined && tagVersion(tag) !== version) errors.push(`tag "${tag}" differs from the SKILL.md version "v${version}"`);
    if (extractNotes(skillText, version) === null) errors.push(`SKILL.md has no changelog entry "### ${version}"`);
  }

  const pack = files.filter((f) => f.startsWith(PACK_DIR) && !PACK_ALLOWED.has(f));
  if (pack.length) errors.push(`agent pack files are tracked and must never be released: ${pack.join(', ')}`);
  return errors;
}

// ---------- git ----------

function git(args, input) {
  const r = spawnSync('git', args, { cwd: ROOT, input, maxBuffer: 1 << 30 });
  if (r.error) throw new BuildError(`cannot run git: ${r.error.message}`);
  if (r.status !== 0) throw new BuildError(`git ${args.join(' ')} failed: ${r.stderr.toString().trim()}`);
  return r.stdout;
}

/** Lists the tracked files under SKILL_DIR, from the index or from `ref`, with their contents. */
function readSkillFiles(ref) {
  const out = ref === undefined
    ? git(['ls-files', '-s', '-z', '--', SKILL_DIR])
    : git(['ls-tree', '-r', '-z', ref, '--', SKILL_DIR]);
  const listed = out.toString('utf8').split('\0').filter(Boolean).map((rec) => {
    const [meta, path] = rec.split('\t');
    const f = meta.split(' ');
    const [mode, sha, type] = ref === undefined ? [f[0], f[1], 'blob'] : [f[0], f[2], f[1]];
    if (type !== 'blob' || (mode !== '100644' && mode !== '100755')) throw new BuildError(`${path}: unsupported entry (mode ${mode}, ${type})`);
    return { path, sha, executable: mode === '100755' };
  });
  if (!listed.length) throw new BuildError(`no tracked files under ${SKILL_DIR}${ref ? ` at ${ref}` : ''}`);

  const batch = git(['cat-file', '--batch'], listed.map((f) => f.sha).join('\n') + '\n');
  let pos = 0;
  for (const f of listed) {
    const nl = batch.indexOf(0x0a, pos);
    const size = Number(batch.subarray(pos, nl).toString().split(' ')[2]);
    f.data = batch.subarray(nl + 1, nl + 1 + size);
    pos = nl + 1 + size + 1;
  }
  return listed;
}

function commitTime(ref) {
  return Number(git(['show', '-s', '--format=%ct', ref ?? 'HEAD']).toString().trim());
}

// ---------- commands ----------

function cmdBuild({ ref, tag, out }) {
  const folder = SKILL_DIR.split('/').pop();
  const files = readSkillFiles(ref).map((f) => ({ ...f, rel: f.path.slice(SKILL_DIR.length + 1) }));
  const skill = files.find((f) => f.rel === 'SKILL.md');
  const errors = checkSkill({ folder, files: files.map((f) => f.rel), skillText: skill ? skill.data.toString('utf8') : '', tag });
  if (errors.length) throw new BuildError(`refusing to build:\n  ${errors.join('\n  ')}`);

  const zip = buildZip(files.map((f) => ({ path: `${folder}/${f.rel}`, data: f.data, executable: f.executable })), commitTime(ref));
  const target = resolve(out ?? join(ROOT, 'dist', `${folder}.skill`));
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, zip);
  console.log(`build: ${files.length} files, ${zip.length} bytes, ${target}`);
}

function cmdNotes({ ref }, versionOrTag) {
  const version = tagVersion(versionOrTag) ?? versionOrTag;
  const text = git(['show', `${ref ?? ''}:${SKILL_DIR}/SKILL.md`]).toString('utf8');
  const notes = extractNotes(text, version);
  if (notes === null) throw new BuildError(`SKILL.md has no changelog entry "### ${version}"`);
  process.stdout.write(`${notes}\n`);
}

function main() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new BuildError('Node 22 or newer is required.');
  const usage = 'usage: build-skill.mjs build [--ref <commit>] [--tag v<version>] [--out <file>] | notes [--ref <commit>] <version>';
  const [sub, ...rest] = process.argv.slice(2);
  let parsed;
  try {
    parsed = parseArgs({ args: rest, allowPositionals: true, options: { ref: { type: 'string' }, tag: { type: 'string' }, out: { type: 'string' } } });
  } catch (e) {
    throw new BuildError(`${e.message}\n${usage}`);
  }
  const { values, positionals } = parsed;
  if (sub === 'build' && positionals.length === 0) cmdBuild(values);
  else if (sub === 'notes' && positionals.length === 1 && !values.tag && !values.out) cmdNotes(values, positionals[0]);
  else throw new BuildError(usage);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (e) {
    console.error(`build-skill: ${e instanceof BuildError ? e.message : e.stack}`);
    process.exit(2);
  }
}
