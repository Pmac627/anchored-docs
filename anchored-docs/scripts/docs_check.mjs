#!/usr/bin/env node
// docs_check.mjs: structural checks for the docs/ OKF bundle. Needs Node 22 or newer. No dependencies.

import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { loadGlossaries, readDoc, GlossaryError, PROJECT_GLOSSARY_NAME } from './_fm.mjs';
import { WHITESPACE, padCodePoints, formatValue, valueText, strip, readText, FileReadError } from './_compat.mjs';
import { comparePaths, exists, isDir, isFile, listDir, pathParts, fileSuffix, resolvePath, rglobExt, sortPaths } from './_fs.mjs';
import { fnmatchcase, globExists, parseIso } from './_glob.mjs';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('docs_check: Node 22 or newer is required.');
  process.exit(2);
}

const USAGE = `docs_check.mjs: structural checks for the docs/ OKF bundle.

  docs_check.mjs okf <docs>                 frontmatter conformance (OKF v0.2 + this skill's required keys)
  docs_check.mjs links <docs>               internal links, index completeness, orphans, code back-links, tickets contamination
  docs_check.mjs map <docs> [--check]       regenerate docs/_map.json from sources (or compare with --check)
  docs_check.mjs stale <docs> [--days N]    STATUS: STALE docs, stale_after in the past, verified older than N days (default 90)
  docs_check.mjs affected <docs> <file>...  docs whose sources match the given changed files
  docs_check.mjs glossary <docs> [--terms]  the two glossary levels (org: <skill>/references/org-glossary.json or
                                            $STE_ORG_GLOSSARY; project: <docs>/_glossary.json), their conflicts, and
                                            with --terms every effective term with its origin

Exit 0 clean, 1 findings, 2 usage. Repo root is the parent of <docs> unless --repo is given.
`;

const RESERVED = new Set(['index.md', 'log.md']);
const REQUIRED = ['type', 'title', 'description', 'diataxis', 'sources', 'generated', 'verified', 'status'];
const STATUS_OK = new Set(['draft', 'stable', 'deprecated']);
const DIATAXIS_OK = new Set(['tutorial', 'how-to', 'reference', 'explanation']);
const ACTOR_RE = /^(?:human:[\p{L}\p{N}_.@-]+|process:[\p{L}\p{N}_.@-]+|[\p{L}\p{N}_.-]+\/[\p{L}\p{N}_.-]+)$/u;
const ISO_RE = /^\p{Nd}{4}-\p{Nd}{2}-\p{Nd}{2}(?:[T ]\p{Nd}{2}:\p{Nd}{2}(?::\p{Nd}{2})?(?:Z|[+-]\p{Nd}{2}:?\p{Nd}{2})?)?$/u;
const NWS = `[^${WHITESPACE}]`;
const LINK_RE = new RegExp(`(?<!!)\\[[^\\]]*\\]\\(([^)${WHITESPACE}#]+)(?:#[^)]*)?\\)`, 'gu');
const BACKLINK_RE = new RegExp(`(?:seealso[${WHITESPACE}]+href="([^"]+)"|@see[${WHITESPACE}]+(${NWS}+)|See(?: also)?:[${WHITESPACE}]+(${NWS}+))`, 'gu');
// Same source extensions as SOURCE_EXT in ste_check.mjs, so a file whose comments are checked also has its back-links checked.
const SOURCE_EXT = ['.cs', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.c', '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const SKIP_PARTS = new Set(['node_modules', 'build', 'bin', 'obj', 'third_party', '.git', 'dist']);

const lines = [];
const print = (s = '') => lines.push(s);

// A frontmatter value counts as set unless it is null, false, empty text, an empty list, or an empty mapping.
function truthy(v) {
  if (v === null || v === undefined || v === false || v === '') return false;
  if (Array.isArray(v)) return v.length > 0;
  if (v instanceof Map) return v.size > 0;
  return true;
}
const getOr = (map, key, dflt) => (map.has(key) ? map.get(key) : dflt);
const iso = (v) => valueText(v);

function events(v) {
  if (v === null || v === undefined) return [];
  if (v instanceof Map) return [v];
  if (Array.isArray(v)) return v.filter((e) => e instanceof Map);
  return [];
}

const rglobMd = (docs) => rglobExt(docs, '.md');
const parts = (p, docs) => pathParts(relative(docs, p));

function conceptDocs(docs) {
  return sortPaths(rglobMd(docs).filter((p) => !RESERVED.has(basename(p)) && !parts(p, docs).includes('tickets')));
}

function cmdOkf(docs, repo) {
  let bad = 0;
  const finding = (rel, msg) => {
    print(`${rel}: ${msg}`);
    bad++;
  };
  for (const p of conceptDocs(docs)) {
    const { fm, body, text } = readDoc(p);
    const rel = relative(docs, p);
    if (!text.startsWith('---')) {
      finding(rel, 'no frontmatter');
      continue;
    }
    if (fm.size === 0) {
      finding(rel, 'frontmatter did not parse');
      continue;
    }
    for (const k of REQUIRED) if (!truthy(fm.get(k))) finding(rel, `missing ${k}`);
    if (truthy(fm.get('status')) && !STATUS_OK.has(fm.get('status'))) finding(rel, `status must be draft|stable|deprecated, got ${valueText(fm.get('status'))}`);
    if (truthy(fm.get('diataxis')) && !DIATAXIS_OK.has(fm.get('diataxis'))) finding(rel, `diataxis must be one of ${formatValue([...DIATAXIS_OK].sort())}`);
    const g = fm.get('generated');
    if (g instanceof Map) {
      if (!ACTOR_RE.test(valueText(getOr(g, 'by', '')))) finding(rel, `generated.by is not an OKF actor: ${valueText(g.get('by'))}`);
      if (!ISO_RE.test(iso(getOr(g, 'at', '')))) finding(rel, `generated.at is not ISO 8601: ${valueText(g.get('at'))}`);
    } else if (g !== undefined && g !== null) {
      finding(rel, 'generated must be a { by, at } mapping');
    }
    for (const e of events(fm.get('verified'))) {
      if (!ACTOR_RE.test(valueText(getOr(e, 'by', ''))) || !ISO_RE.test(iso(getOr(e, 'at', '')))) finding(rel, `verified entry malformed: ${formatValue(e)}`);
    }
    const srcs = truthy(fm.get('sources')) ? fm.get('sources') : [];
    if (Array.isArray(srcs)) {
      for (const s of srcs) {
        const res = s instanceof Map ? s.get('resource') : null;
        if (!truthy(res)) finding(rel, `sources entry without resource: ${valueText(s)}`);
        else if (!/^https?:\/\//.test(valueText(res)) && !globExists(repo, valueText(res))) finding(rel, `sources resource matches no file: ${valueText(res)}`);
      }
    }
    if (truthy(fm.get('stale_after')) && !body.includes('STATUS: STALE')) finding(rel, 'stale_after set but body has no STATUS: STALE callout');
    if (body.includes('STATUS: STALE') && !truthy(fm.get('stale_after'))) finding(rel, 'STATUS: STALE callout but no stale_after in frontmatter');
    if (valueText(getOr(fm, 'type', '')) === 'Decision' && !truthy(fm.get('date'))) finding(rel, 'Decision has no date: key (ripwire will count its drift as live rot)');
  }
  const rootIdx = join(docs, 'index.md');
  if (exists(rootIdx)) {
    const { fm } = readDoc(rootIdx);
    if (fm.size > 0 && [...fm.keys()].some((k) => k !== 'okf_version')) {
      print('index.md: only okf_version is allowed in a root index frontmatter');
      bad++;
    }
  }
  print(`okf: ${conceptDocs(docs).length} concept docs, ${bad} findings`);
  return bad ? 1 : 0;
}

function linkTargets(text) {
  return [...text.matchAll(LINK_RE)].map((m) => m[1]);
}

function cmdLinks(docs, repo) {
  let bad = 0;
  const allMd = sortPaths(rglobMd(docs).filter((p) => !parts(p, docs).includes('tickets')));
  const inbound = new Map(allMd.map((p) => [p, 0]));
  for (const p of allMd) {
    const { text } = readDoc(p);
    for (const target of linkTargets(text)) {
      if (/^(https?:\/\/|mailto:)/.test(target)) continue;
      if (target.includes('tickets/')) {
        print(`${relative(docs, p)}: links into docs/tickets/: ${target}`);
        bad++;
        continue;
      }
      let t = target.startsWith('/') ? join(docs, target.replace(/^\/+/, '')) : join(dirname(p), target);
      t = resolvePath(t);
      if (isDir(t)) t = join(t, 'index.md');
      if (!exists(t)) {
        print(`${relative(docs, p)}: broken link ${target}`);
        bad++;
      } else if (inbound.has(t)) inbound.set(t, inbound.get(t) + 1);
    }
  }
  for (const [p, n] of inbound) {
    if (n === 0 && basename(p) !== 'index.md' && p !== join(docs, 'log.md')) {
      print(`${relative(docs, p)}: orphan (no inbound link)`);
      bad++;
    }
  }
  for (const idx of allMd.filter((q) => basename(q) === 'index.md')) {
    const listed = new Set(linkTargets(readText(idx)).map((l) => l.split('#')[0]));
    const sibs = listDir(dirname(idx)).map((e) => e).sort((a, b) => comparePaths(a.name, b.name));
    for (const sib of sibs) {
      const sp = join(dirname(idx), sib.name);
      if (isFile(sp) && fileSuffix(sib.name) === '.md' && !RESERVED.has(sib.name)) {
        if (!listed.has(sib.name) && !listed.has(`./${sib.name}`)) {
          print(`${relative(docs, idx)}: does not list ${sib.name}`);
          bad++;
        }
      } else if (isDir(sp) && !['tickets', 'assets', 'captures'].includes(sib.name) && listDir(sp).some((e) => e.name.endsWith('.md'))) {
        if (![...listed].some((l) => l.replace(/\/+$/, '') === sib.name || l === `${sib.name}/index.md` || l === `./${sib.name}/`)) {
          print(`${relative(docs, idx)}: does not list ${sib.name}/`);
          bad++;
        }
      }
    }
  }
  let seen = 0;
  for (const ext of SOURCE_EXT) {
    for (const src of sortPaths(rglobExt(repo, ext))) {
      if (pathParts(relative(repo, src)).some((part) => SKIP_PARTS.has(part))) continue;
      let txt;
      try {
        txt = readFileSync(src).toString('utf8');
      } catch {
        continue;
      }
      if (!txt.includes('docs/')) continue;
      for (const m of txt.matchAll(BACKLINK_RE)) {
        const target = m[1] || m[2] || m[3];
        if (!target.includes('docs/')) continue;
        seen++;
        const cand = [resolvePath(join(dirname(src), target)), resolvePath(join(repo, target.replace(/^[./]+/, ''))), resolvePath(join(repo, target.slice(target.indexOf('docs/'))))];
        if (!cand.some((c) => exists(c))) {
          print(`${relative(repo, src)}: back-link target missing: ${target}`);
          bad++;
        }
      }
    }
  }
  print(`links: ${allMd.length} docs, ${seen} code back-links, ${bad} findings`);
  return bad ? 1 : 0;
}

const MAP_NOTE = "Derived index from code paths to the docs that describe them. Regenerated by docs_check.mjs map from the `sources` in every doc's frontmatter. Do not hand-edit.";

function buildMap(docs) {
  const entries = new Map();
  for (const p of conceptDocs(docs)) {
    const { fm } = readDoc(p);
    const sources = truthy(fm.get('sources')) ? fm.get('sources') : [];
    const items = Array.isArray(sources) ? sources : sources instanceof Map ? [...sources.keys()] : typeof sources === 'string' ? Array.from(sources) : [];
    for (const s of items) {
      const res = s instanceof Map ? s.get('resource') : s;
      if (truthy(res) && !/^https?:\/\//.test(valueText(res))) {
        const key = valueText(res);
        if (!entries.has(key)) entries.set(key, []);
        entries.get(key).push(relative(dirname(docs), p).replaceAll('\\', '/'));
      }
    }
  }
  const map = [...entries.keys()].sort().map((code) => ({ code, docs: [...new Set(entries.get(code))].sort() }));
  return { note: MAP_NOTE, generated: new Date().toISOString().slice(0, 10), map };
}

class MapError extends Error {}

function readMap(docs) {
  const target = join(docs, '_map.json');
  if (!exists(target)) return [];
  let data;
  try {
    data = JSON.parse(readText(target));
  } catch (e) {
    throw new MapError(`${target}: not valid JSON (${e.message}). Run docs_check.mjs map to regenerate it.`);
  }
  if (!data || !Array.isArray(data.map)) throw new MapError(`${target}: expected a JSON object with a "map" array. Run docs_check.mjs map to regenerate it.`);
  return data.map.filter((e) => e && typeof e.code === 'string' && Array.isArray(e.docs)).map((e) => [e.code, e.docs.map(String)]);
}

function cmdMap(docs, repo, check) {
  const fresh = buildMap(docs);
  const target = join(docs, '_map.json');
  if (check) {
    let old = null;
    try {
      old = JSON.parse(readText(target)).map;
    } catch {
      old = null;
    }
    if (JSON.stringify(old) !== JSON.stringify(fresh.map)) {
      print('map: _map.json is out of date with sources; run without --check to regenerate');
      return 1;
    }
    print('map: _map.json matches sources');
    return 0;
  }
  writeFileSync(target, JSON.stringify(fresh, null, 2) + '\n');
  print(`map: wrote ${relative(repo, target)} (${fresh.map.length} code paths)`);
  return 0;
}

function cmdAffected(docs, files) {
  if (!exists(join(docs, '_map.json')) && exists(join(docs, '_map.yaml'))) {
    print('notice: found _map.yaml; anchored-docs 2.0 reads _map.json. Run docs_check.mjs map to create it.');
  }
  const hits = new Map();
  for (const [code, dlist] of readMap(docs)) {
    for (const raw of files) {
      const f = raw.replaceAll('\\', '/');
      if (fnmatchcase(f, code) || fnmatchcase(f, code.replaceAll('**', '*')) || (code.endsWith('/**') && f.startsWith(code.slice(0, -3) + '/'))) {
        for (const d of dlist) {
          if (!hits.has(d)) hits.set(d, new Set());
          hits.get(d).add(f);
        }
      }
    }
  }
  for (const d of [...hits.keys()].sort()) print(`${d}: ${[...hits.get(d)].sort().join(', ')}`);
  if (hits.size === 0) print("affected: no doc's sources match the changed files");
  return 0;
}

function cmdStale(docs, days) {
  const now = Date.now();
  let bad = 0;
  for (const p of conceptDocs(docs)) {
    const { fm, body } = readDoc(p);
    const rel = relative(docs, p);
    if (body.includes('STATUS: STALE') || truthy(fm.get('stale_after'))) {
      print(`${rel}: STATUS: STALE (stale_after=${valueText(fm.get('stale_after'))})`);
      bad++;
    }
    let latest = null;
    for (const e of events(fm.get('verified'))) {
      const d = parseIso(iso(e.get('at')));
      if (d && (latest === null || d.ms > latest.ms)) latest = d;
    }
    if (latest === null) {
      print(`${rel}: never verified`);
      bad++;
    } else if (now - latest.ms > days * 86400000) {
      print(`${rel}: last verified ${latest.date} (> ${days} days)`);
      bad++;
    }
    if (fm.get('status') === 'draft') {
      const g = truthy(fm.get('generated')) ? fm.get('generated') : new Map();
      print(`${rel}: still draft (generated ${g instanceof Map ? valueText(g.get('at')) : '?'}); needs human sign-off`);
    }
  }
  print(`stale: ${bad} findings`);
  return bad ? 1 : 0;
}

function cmdGlossary(docs, showTerms) {
  const g = loadGlossaries(docs);
  const nOrg = [...g.approved].filter((t) => ['org', 'both'].includes(g.origin.get(t))).length;
  const nProj = [...g.approved].filter((t) => ['project', 'both'].includes(g.origin.get(t))).length;
  print(`org glossary:     ${g.orgPath ?? 'none'}  (${nOrg} terms)`);
  print(`project glossary: ${g.projectPath ?? 'none'}  (${nProj} terms)`);
  print(`effective:        ${g.approved.size} terms, ${g.unapproved.size} unapproved synonyms`);
  for (const c of g.conflicts) print(`CONFLICT: ${c}`);
  for (const n of g.notices) print(`notice: ${n}`);
  if (showTerms) {
    print();
    for (const t of [...g.approved].sort()) {
      const e = g.entries.get(t)[0];
      const syns = [...new Set(g.entries.get(t).flatMap((x) => x.unapproved))].sort();
      let line = `  ${padCodePoints(t, 32)} ${padCodePoints(e.kind, 5)} ${padCodePoints(g.origin.get(t) ?? '', 8)}`;
      if (e.meaning) line += `  ${e.meaning}`;
      if (syns.length) line += `  (not: ${syns.join(', ')})`;
      print(line);
    }
  }
  print(`glossary: ${g.conflicts.length} conflicts, ${g.notices.length} notices`);
  return g.conflicts.length ? 1 : 0;
}

/**
 * The --days value as 1.x read it: optional sign, digits with single underscores between them,
 * surrounding whitespace allowed. Returns null for anything else ("", "1.0", "1e3", "0x10"), which Number() would
 * accept. Non-ASCII digits, which 1.x also took, are rejected.
 */
function parseDays(raw) {
  if (raw === undefined) return null;
  const t = strip(raw);
  if (!/^[+-]?[0-9]+(?:_[0-9]+)*$/.test(t)) return null;
  const n = Number(t.replaceAll('_', ''));
  return Number.isSafeInteger(n) ? n : null;
}

function main(argv) {
  if (argv.length < 2 || !['okf', 'links', 'map', 'stale', 'affected', 'glossary'].includes(argv[0])) {
    print(USAGE);
    return 2;
  }
  const cmd = argv[0];
  const docs = resolvePath(argv[1]);
  const rest = argv.slice(2);
  let repo = dirname(docs);
  const ri = rest.indexOf('--repo');
  if (ri >= 0) {
    if (ri + 1 >= rest.length) {
      print('docs_check: --repo needs a path');
      return 2;
    }
    repo = resolvePath(rest[ri + 1]);
    rest.splice(ri, 2);
  }
  if (!isDir(docs)) {
    print(`docs_check: ${docs} is not a directory`);
    return 2;
  }
  switch (cmd) {
    case 'okf':
      return cmdOkf(docs, repo);
    case 'links':
      return cmdLinks(docs, repo);
    case 'map':
      return cmdMap(docs, repo, rest.includes('--check'));
    case 'stale': {
      const di = rest.indexOf('--days');
      const days = di >= 0 ? parseDays(rest[di + 1]) : 90;
      if (days === null) {
        print('docs_check: --days needs a whole number');
        return 2;
      }
      return cmdStale(docs, days);
    }
    case 'affected':
      return cmdAffected(docs, rest);
    default:
      return cmdGlossary(docs, rest.includes('--terms'));
  }
}

// Any error stops the run with exit 2, after the findings collected so far, so a crash never reads as
// exit 1 (findings) and never loses output. Expected input problems get one line; anything else is a bug
// in this script, so its stack goes to stderr.
let code;
try {
  code = main(process.argv.slice(2));
} catch (e) {
  if (e instanceof GlossaryError || e instanceof MapError || e instanceof FileReadError) {
    print(`docs_check: ${e.message}`);
  } else {
    print(`docs_check: unexpected error: ${e?.message ?? e}`);
    process.stderr.write(`${e?.stack ?? e}\n`);
  }
  code = 2;
}
process.stdout.write(lines.length ? lines.join('\n') + '\n' : '');
process.exitCode = code;
