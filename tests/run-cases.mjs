#!/usr/bin/env node
// Parity harness for the anchored-docs 2.0 rewrite (Node 22+, zero dependencies).
//
//   node tests/run-cases.mjs run      --skill <skill dir> --out <dir> [--only <id>]
//   node tests/run-cases.mjs compare  <golden dir> <candidate dir>
//   node tests/run-cases.mjs coverage <golden dir>
//
// run       (--prefix dc- runs one tool's cases; --pack <dir> points the pack cases at a real agent pack)
//           Executes every case in tests/cases.json against the scripts in <skill dir> and writes one
//           normalized JSON result per case. The baseline in tests/golden/1.2.0 is the recorded output of
//           1.2.0 on these cases; it is fixed and is not captured again.
// compare   Diffs two result directories. Known, intended 2.0 text changes (file renames) are applied
//           to the golden side first, from tests/intended-differences.json.
// coverage  Lists the expected finding messages (tests/coverage-patterns.json) that no case output
//           contains, so a corpus gap is visible before the port starts.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, realpathSync, cpSync, readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs, isDeepStrictEqual } from 'node:util';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('run-cases: Node 22 or newer is required.');
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, 'fixtures');

const readJson = (p) => JSON.parse(readFileSync(p, 'utf8'));

// ---------- normalization ----------

function normalizeText(text, { repo, skill }) {
  let t = text.replace(/\r\n/g, '\n');
  if (repo) t = t.split(repo).join('<REPO>');
  if (skill) t = t.split(skill).join('<SKILL>');
  t = t.split(FIXTURES).join('<FIXTURES>');
  // The goldens were captured on POSIX. On Windows the scripts print "\" in paths. No fixture
  // text contains a backslash, so mapping every one to "/" hides only the separator.
  if (process.platform === 'win32') t = t.replaceAll('\\', '/');
  t = t.replace(/^generated: \d{4}-\d{2}-\d{2}$/gm, 'generated: <DATE>');
  return t;
}

// The map is compared by content: the date and the note are not part of the result.
function canonicalMap(text) {
  const o = JSON.parse(text);
  return { generated: '<DATE>', map: (o.map ?? []).map((e) => ({ code: e.code, docs: [...e.docs] })) };
}

// ---------- running ----------

function runCase(c, { skill }, opts = {}) {
  // The scripts print paths as the OS resolves them: /private/var on macOS, long names instead of the
  // 8.3 short names that TEMP holds on GitHub's Windows runners. Resolve first so the placeholders match.
  const tmp = realpathSync.native(mkdtempSync(join(tmpdir(), 'ad-case-')));
  const repo = join(tmp, 'repo');
  cpSync(join(FIXTURES, c.fixture), repo, { recursive: true });
  const env = {};
  for (const k of ['PATH', 'HOME', 'SYSTEMROOT', 'TEMP', 'TMP']) if (process.env[k]) env[k] = process.env[k];
  for (const [k, v] of Object.entries(c.env ?? {})) {
    env[k] = v.replaceAll('{FIXTURES}', FIXTURES).replaceAll('{REPO}', repo).replaceAll('{SKILL}', skill);
  }
  if (opts.pack && c.env?.STE_AGENT_PACK) env.STE_AGENT_PACK = resolve(opts.pack);
  const steps = [];
  for (const args of c.steps) {
    const r = spawnSync(process.execPath, [join(skill, 'scripts', `${c.tool}.mjs`), ...args], { cwd: repo, env, encoding: 'utf8' });
    steps.push({
      args,
      code: r.status,
      stdout: normalizeText(r.stdout ?? '', { repo, skill }),
      stderr: normalizeText(r.stderr ?? '', { repo, skill }),
    });
  }
  const files = {};
  for (const rel of c.capture ?? []) {
    if (rel.endsWith('/_map')) {
      const p = join(repo, `${rel}.json`);
      if (existsSync(p)) files[rel] = canonicalMap(readFileSync(p, 'utf8'));
    } else {
      const p = join(repo, rel);
      if (existsSync(p)) files[rel] = normalizeText(readFileSync(p, 'utf8'), { repo, skill });
    }
  }
  rmSync(tmp, { recursive: true, force: true });
  return { id: c.id, tool: c.tool, steps, files };
}

function cmdRun(opts) {
  const skill = resolve(opts.skill);
  const out = resolve(opts.out);
  mkdirSync(out, { recursive: true });
  const cases = readJson(join(HERE, 'cases.json')).filter((c) => (!opts.only || c.id === opts.only) && (!opts.prefix || c.id.startsWith(opts.prefix)));
  for (const c of cases) {
    const res = runCase(c, { skill }, opts);
    writeFileSync(join(out, `${c.id}.json`), JSON.stringify(res, null, 2) + '\n');
    console.log(`${c.id}: ${res.steps.map((s) => s.code).join(',')}`);
  }
  console.log(`run: ${cases.length} cases, results in ${out}`);
}

// ---------- compare ----------

function applyIntended(text, rules) {
  let t = text;
  for (const r of rules) t = t.replace(new RegExp(r.pattern, r.flags ?? 'g'), r.replace);
  return t;
}

function applyIntendedToResult(res, rules) {
  const copy = structuredClone(res);
  for (const s of copy.steps) {
    s.stdout = applyIntended(s.stdout, rules);
    s.stderr = applyIntended(s.stderr, rules);
  }
  return copy;
}

function firstDiff(a, b) {
  const al = a.split('\n'), bl = b.split('\n');
  for (let i = 0; i < Math.max(al.length, bl.length); i++) {
    if (al[i] !== bl[i]) return `    line ${i + 1}\n      golden:    ${al[i] ?? '(missing)'}\n      candidate: ${bl[i] ?? '(missing)'}`;
  }
  return '';
}

// The rules rewrite 1.x file names in the 1.2.0 baseline. A newer baseline already has the 2.0 names, and
// its legacy-file notices must keep the 1.x names, so the rules apply to the 1.2.0 baseline only.
function rulesFor(goldenDir) {
  const intended = readJson(join(HERE, 'intended-differences.json'));
  return process.argv.includes('--no-intended') || basename(goldenDir) !== intended.golden ? [] : intended.rules;
}

function cmdCompare(goldenDir, candDir, partial) {
  const rules = rulesFor(goldenDir);
  const ids = readdirSync(goldenDir).filter((f) => f.endsWith('.json')).sort();
  let bad = 0;
  for (const f of ids) {
    const golden = applyIntendedToResult(readJson(join(goldenDir, f)), rules);
    const candPath = join(candDir, f);
    if (!existsSync(candPath)) { if (!partial) { console.log(`MISSING ${f}`); bad++; } continue; }
    const cand = readJson(candPath);
    const problems = [];
    golden.steps.forEach((gs, i) => {
      const cs = cand.steps[i];
      if (!cs) { problems.push(`  step ${i}: missing in candidate`); return; }
      if (gs.code !== cs.code) problems.push(`  step ${i} [${gs.args.join(' ')}]: exit ${gs.code} vs ${cs.code}`);
      if (gs.stdout !== cs.stdout) problems.push(`  step ${i} [${gs.args.join(' ')}]: stdout differs\n${firstDiff(gs.stdout, cs.stdout)}`);
      if (gs.stderr !== cs.stderr) problems.push(`  step ${i} [${gs.args.join(' ')}]: stderr differs\n${firstDiff(gs.stderr, cs.stderr)}`);
    });
    if (!isDeepStrictEqual(golden.files, cand.files)) problems.push(`  captured files differ\n    golden:    ${JSON.stringify(golden.files)}\n    candidate: ${JSON.stringify(cand.files)}`);
    if (problems.length) { bad++; console.log(`DIFF ${golden.id}\n${problems.join('\n')}`); }
    else console.log(`ok   ${golden.id}`);
  }
  const compared = partial ? ids.filter((f) => existsSync(join(candDir, f))).length : ids.length;
  console.log(`compare: ${compared - bad} of ${compared} identical`);
  process.exit(bad ? 1 : 0);
}

// ---------- coverage ----------

function cmdCoverage(goldenDir) {
  const patterns = readJson(join(HERE, 'coverage-patterns.json'));
  const rules = rulesFor(goldenDir);   // the patterns use the 2.0 file names
  const corpus = readdirSync(goldenDir).filter((f) => f.endsWith('.json'))
    .map((f) => applyIntendedToResult(readJson(join(goldenDir, f)), rules))
    .flatMap((r) => r.steps.map((s) => `${r.id}\u0000${s.stdout}\n${s.stderr}`)).join('\n');
  const missing = patterns.filter((p) => !new RegExp(p.pattern, 'm').test(corpus));
  for (const p of missing) console.log(`NOT COVERED ${p.id}: /${p.pattern}/`);
  console.log(`coverage: ${patterns.length - missing.length} of ${patterns.length} expected findings appear in the goldens`);
  process.exit(missing.length ? 1 : 0);
}

// ---------- main ----------

const [sub, ...rest] = process.argv.slice(2);
if (sub === 'run') {
  let values;
  try {
    ({ values } = parseArgs({ args: rest, options: { skill: { type: 'string' }, out: { type: 'string' }, only: { type: 'string' }, prefix: { type: 'string' }, pack: { type: 'string' } } }));
  } catch (e) {
    console.error(`run-cases: ${e.message} (run takes --skill, --out, --only, --prefix, --pack; --impl was removed)`);
    process.exit(2);
  }
  if (!values.skill || !values.out) { console.error('usage: run --skill <dir> --out <dir> [--only <id>]'); process.exit(2); }
  cmdRun(values);
} else if (sub === 'compare' && rest.filter((a) => !a.startsWith('--')).length === 2) { const [g, c] = rest.filter((a) => !a.startsWith('--')); cmdCompare(resolve(g), resolve(c), rest.includes('--partial')); }
else if (sub === 'coverage' && rest.length === 1) cmdCoverage(resolve(rest[0]));
else { console.error('usage: run-cases.mjs run|compare|coverage ...'); process.exit(2); }
