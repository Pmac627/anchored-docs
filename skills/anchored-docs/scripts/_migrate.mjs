// _migrate.mjs: moves an anchored-docs 2.0 bundle from docs/ to docs/anchored-docs/ and rewrites the links that point at it.
//
// Two steps. planMigration reads the repository and changes nothing. applyPlan performs a ready plan. A plan stops
// before any move when a destination already exists, so a conflict never leaves a half-moved bundle. A second run
// finds nothing to move and changes nothing. Needs Node 22 or newer. No dependencies.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, rmdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { WHITESPACE } from './_compat.mjs';
import { readDoc, truthy, BUNDLE_DIR_NAME } from './_fm.mjs';

// The link and back-link patterns of docs_check.mjs. Images match too: a moved doc can show a picture that stays
// in docs/, and that link must follow the doc.
const LINK_RE = new RegExp(`\\[[^\\]]*\\]\\(([^)${WHITESPACE}#]+)(?:#[^)]*)?\\)`, 'gu');
const NWS = `[^${WHITESPACE}]`;
const BACKLINK_RE = new RegExp(`(?:seealso[${WHITESPACE}]+href="([^"]+)"|@see[${WHITESPACE}]+(${NWS}+)|See(?: also)?:[${WHITESPACE}]+(${NWS}+))`, 'gu');
const SOURCE_EXT = ['.cs', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.c', '.py', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.mts', '.cts'];
const SKIP_PARTS = new Set(['node_modules', 'build', 'bin', 'obj', 'third_party', '.git', 'dist']);

const posix = (p) => p.split(sep).join('/');
const isInside = (p, dir) => p === dir || p.startsWith(dir + sep);
const extOf = (f) => {
  const i = f.lastIndexOf('.');
  return i < 0 ? '' : f.slice(i);
};
const isMarkdown = (f) => f.endsWith('.md');
const isSource = (f) => SOURCE_EXT.includes(extOf(f));

/** Every file under dir, sorted. Symbolic links are not followed. Folders named in skip are not entered. */
function walk(dir, skip = new Set()) {
  const out = [];
  const visit = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      if (e.isSymbolicLink() || skip.has(e.name)) continue;
      const p = join(d, e.name);
      if (e.isDirectory()) visit(p);
      else if (e.isFile()) out.push(p);
    }
  };
  visit(dir);
  return out.sort();
}

/** The text with line endings normalized, and whether the file used CRLF, so the write can restore it. */
function readRaw(p) {
  const raw = readFileSync(p, 'utf8');
  return { text: raw.replace(/\r\n/g, '\n'), crlf: raw.includes('\r\n') };
}

function writeRaw(p, text, crlf) {
  writeFileSync(p, crlf ? text.replace(/\n/g, '\r\n') : text);
}

function isGitWorkTree(repo) {
  try {
    return execFileSync('git', ['-C', repo, 'rev-parse', '--is-inside-work-tree'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() === 'true';
  } catch {
    return false;
  }
}

/**
 * True for a skill concept doc: a markdown file with a type, and with at least one of sources, generated, or verified.
 * A doc that has a finding from docs_check okf (for example an empty verified list) still counts, so it moves with the
 * bundle and the checks keep seeing it. A page from another tool that also uses type alone does not count.
 */
function isSkillConcept(p) {
  const { fm } = readDoc(p);
  return truthy(fm.get('type')) && ['sources', 'generated', 'verified'].some((k) => truthy(fm.get(k)));
}

/**
 * Decides which files of docs/ belong to the bundle. Skill concept docs move. The root index.md moves when it has
 * okf_version. The root log.md moves when it has the update-log heading or when the root index moves, so the bundle
 * never ends up with two logs. The two JSON data files at the root move. A subfolder index.md moves with the docs
 * beside it. Everything else stays where it is.
 */
function classify(legacy, files) {
  const moving = new Set();
  const candidates = files.filter((f) => {
    const rel = posix(relative(legacy, f));
    return !rel.startsWith(`${BUNDLE_DIR_NAME}/`) && !rel.startsWith('tickets/');
  });
  const rootIndex = join(legacy, 'index.md');
  const rootIndexMoves = candidates.includes(rootIndex) && /^okf_version:/m.test(readRaw(rootIndex).text);
  for (const f of candidates) {
    const name = basename(f);
    const root = dirname(f) === legacy;
    if (isMarkdown(f) && name !== 'index.md') {
      if (name === 'log.md' && root) {
        if (rootIndexMoves || /^# Docs update log\s*$/m.test(readRaw(f).text)) moving.add(f);
      } else if (isSkillConcept(f)) {
        moving.add(f);
      }
    } else if (root && (name === '_glossary.json' || name === '_map.json')) {
      moving.add(f);
    }
  }
  if (rootIndexMoves) moving.add(rootIndex);
  for (const f of candidates) {
    const subIndex = basename(f) === 'index.md' && dirname(f) !== legacy;
    if (subIndex && [...moving].some((m) => dirname(m) === dirname(f))) moving.add(f);
  }
  return moving;
}

/** Link text for a markdown link. Returns the old text when the link does not change. */
function rewriteLink(t, srcOld, srcNew, legacy, target, mapPath) {
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  // A leading slash means "from the bundle root". Only links inside docs/ use that form, so only they are rewritten.
  const bundleStyle = t.startsWith('/');
  if (bundleStyle && !isInside(srcOld, legacy)) return t;
  const oldAbs = bundleStyle ? join(legacy, t.slice(1)) : resolve(dirname(srcOld), t);
  const newAbs = mapPath(oldAbs);
  if (newAbs === oldAbs && srcNew === srcOld) return t;
  let out;
  if (bundleStyle && isInside(srcNew, target) && isInside(newAbs, target)) out = '/' + posix(relative(target, newAbs));
  else out = posix(relative(dirname(srcNew), newAbs)) || '.';
  if (t.endsWith('/') && !out.endsWith('/')) out += '/';
  return out;
}

/** Back-link target text. It keeps the form it had: relative to the source file, or repo-relative. */
function rewriteBacklink(t, srcOld, srcNew, repo, mapPath) {
  const rel = resolve(dirname(srcOld), t);
  const repoRel = resolve(repo, t.replace(/^[./]+/, ''));
  const fromDocs = resolve(repo, t.slice(t.indexOf('docs/')));
  const isRelative = existsSync(rel) || mapPath(rel) !== rel;
  const oldAbs = isRelative ? rel : [repoRel, fromDocs].find((c) => existsSync(c) || mapPath(c) !== c);
  if (!oldAbs) return t;
  const newAbs = mapPath(oldAbs);
  if (newAbs === oldAbs && srcNew === srcOld) return t;
  return isRelative ? posix(relative(dirname(srcNew), newAbs)) : posix(relative(repo, newAbs));
}

/**
 * Rewrites the text of one file. Returns the new text (same as the old when nothing changes).
 * Markdown files get their links rewritten; source files get their back-links rewritten.
 */
function rewriteFile(srcOld, text, ctx) {
  const srcNew = ctx.movedMap.get(srcOld) ?? srcOld;
  if (isMarkdown(srcOld)) {
    return text.replace(LINK_RE, (whole, t) => {
      const next = rewriteLink(t, srcOld, srcNew, ctx.legacy, ctx.target, ctx.mapPath);
      if (next === t) return whole;
      ctx.counts.links++;
      const at = whole.indexOf('](') + 2;
      return whole.slice(0, at) + next + whole.slice(at + t.length);
    });
  }
  return text.replace(BACKLINK_RE, (whole, a, b, c) => {
    const t = a ?? b ?? c;
    if (!t || !t.includes('docs/')) return whole;
    const next = rewriteBacklink(t, srcOld, srcNew, ctx.repo, ctx.mapPath);
    if (next === t) return whole;
    ctx.counts.backlinks++;
    const at = whole.indexOf(t);
    return whole.slice(0, at) + next + whole.slice(at + t.length);
  });
}

// Files that can hold a path or a command. Source files are included for their doc comments.
const TEXT_EXT = new Set(['.md', '.yml', '.yaml', '.json', '.sh', '.ps1', '.txt', ...SOURCE_EXT]);
// A command line: node or npx running one of the scripts, or a CI "run:" step. Prose that names a script does not match.
const SCRIPT_CALL_RE = /(?:\b(?:node|npx)\s+\S*(?:docs_check|ste_check)\S*|^\s*(?:-\s+)?run:\s)/;
// A bare docs argument: "docs" or "docs/" followed by a space, a quote, a backtick, or the end of the line.
const BARE_DOCS_RE = /(?<![\w.-])docs\/?(?=[\s'"`]|$)/;
// A root agent file that still says docs/ in a path. Paths in the bundle and in docs/tickets/ are correct.
const AGENT_FILES = new Set(['CLAUDE.md', 'AGENTS.md']);
const OLD_DOCS_RE = /(?<![\w.-])docs\/(?!anchored-docs\/|tickets\/)/;

/**
 * Lines that still name a moved path, or that call the scripts on a bare docs folder, after the rewrite. These are
 * not changed. The report lists them so a person can decide. A CI step such as "docs_check.mjs map docs --check"
 * shows up here, because the bundle no longer sits at docs/.
 */
function findLeftovers(repo, moves, legacy, edits) {
  // The lookbehind keeps docs/ inside anchored-docs/ from counting as a moved path.
  const escape = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
  const names = moves.map((m) => new RegExp(`(?<![\\w.-])docs/${escape(posix(relative(legacy, m.from)))}`, 'u'));
  const hits = [];
  for (const f of walk(repo, SKIP_PARTS)) {
    const rel = posix(relative(repo, f));
    // The map is regenerated after the move, so its old paths are not a leftover.
    if (basename(f) === '_map.json' && (dirname(f) === legacy || dirname(f) === join(legacy, BUNDLE_DIR_NAME))) continue;
    const isAgentFile = dirname(f) === repo && AGENT_FILES.has(basename(f));
    if (!TEXT_EXT.has(extOf(f)) && !isAgentFile) continue;
    const text = edits.get(f)?.text ?? readRaw(f).text;
    text.split('\n').forEach((line, i) => {
      const where = `${rel}:${i + 1}: ${line.trim().slice(0, 120)}`;
      if (names.some((n) => n.test(line))) hits.push(where);
      else if (SCRIPT_CALL_RE.test(line) && BARE_DOCS_RE.test(line)) hits.push(`${where}  (script call on a bare docs folder)`);
      else if (isAgentFile && OLD_DOCS_RE.test(line)) hits.push(`${where}  (agent file names docs/)`);
    });
  }
  return hits;
}

/**
 * The plan: which files move where, which links change, which files still name a moved path, and which files stay.
 * Changes nothing. Status is one of: none (no docs/), nothing (no skill files in docs/), conflict, ready.
 */
export function planMigration(repo) {
  const legacy = resolve(repo, 'docs');
  const target = join(legacy, BUNDLE_DIR_NAME);
  if (!existsSync(legacy)) return { status: 'none', repo, legacy, target };
  const legacyFiles = walk(legacy).filter((f) => !isInside(f, target));
  const moving = classify(legacy, legacyFiles);
  if (moving.size === 0) return { status: 'nothing', repo, legacy, target };

  const moves = [...moving].sort().map((from) => ({ from, to: join(target, relative(legacy, from)) }));
  const movedMap = new Map(moves.map((m) => [m.from, m.to]));
  // A folder that holds moved files moves with them, so a link to that folder follows it.
  const moveDirs = new Set();
  for (const m of moves) {
    for (let d = dirname(m.from); d !== legacy && isInside(d, legacy); d = dirname(d)) moveDirs.add(d);
  }
  const mapPath = (abs) => {
    if (movedMap.has(abs)) return movedMap.get(abs);
    if (moveDirs.has(abs)) return join(target, relative(legacy, abs));
    return abs;
  };
  const conflicts = moves.filter((m) => existsSync(m.to)).map((m) => posix(relative(repo, m.to)));

  const ctx = { repo, legacy, target, movedMap, mapPath, counts: { links: 0, backlinks: 0 } };
  const edits = new Map();
  for (const f of walk(repo, SKIP_PARTS)) {
    if (!isMarkdown(f) && !isSource(f)) continue;
    const { text, crlf } = readRaw(f);
    const out = rewriteFile(f, text, ctx);
    if (out !== text) edits.set(f, { text: out, crlf });
  }

  return {
    status: conflicts.length ? 'conflict' : 'ready',
    repo, legacy, target, moves, conflicts, edits,
    links: ctx.counts.links,
    backlinks: ctx.counts.backlinks,
    stays: legacyFiles.filter((f) => !moving.has(f)).map((f) => posix(relative(repo, f))),
    leftovers: findLeftovers(repo, moves, legacy, edits),
    git: isGitWorkTree(repo),
  };
}

/** The lines that describe a plan, for a dry run or a report. */
export function describePlan(plan, apply) {
  const rel = (p) => posix(relative(plan.repo, p));
  if (plan.status === 'none') return ['migrate: no docs/ folder. Nothing to move.'];
  if (plan.status === 'nothing') return [`migrate: nothing to move. The bundle is already in ${rel(plan.target)}/, or docs/ has none.`];
  const out = [`migrate: ${rel(plan.legacy)}/ -> ${rel(plan.target)}/`];
  if (plan.status === 'conflict') {
    out.push('migrate: stopped. These destinations already exist, so nothing was moved:');
    for (const c of plan.conflicts) out.push(`  ${c}`);
    out.push('Resolve the conflicts by hand, then run again.');
    return out;
  }
  out.push(`moves (${plan.moves.length}):`);
  for (const m of plan.moves) out.push(`  ${rel(m.from)} -> ${rel(m.to)}`);
  out.push(`links to rewrite: ${plan.links} markdown, ${plan.backlinks} code back-links, in ${plan.edits.size} file(s).`);
  out.push(`stays in ${rel(plan.legacy)}/ (${plan.stays.length}):`);
  for (const s of plan.stays) out.push(`  ${s}`);
  if (plan.leftovers.length) {
    out.push(`still names a moved path, check by hand (${plan.leftovers.length}):`);
    for (const l of plan.leftovers) out.push(`  ${l}`);
  }
  out.push(apply ? (plan.git ? 'git: files move with git mv, so history follows them.' : 'git: not a git work tree; files are renamed.') : 'dry run: nothing changed. Run again with --apply.');
  return out;
}

/** The log with a new dated group at the top, as OKF §9 asks: newest first, under the heading. */
export function logWithEntry(existing, summary, date) {
  const block = `## ${date}\n\n* **Update**: ${summary}\n`;
  if (existing === null) return `# Docs update log\n\n${block}`;
  const i = existing.indexOf('\n## ');
  if (i === -1) return `${existing.trimEnd()}\n\n${block}`;
  return `${existing.slice(0, i + 1)}${block}\n${existing.slice(i + 1)}`;
}

function moveOne(repo, from, to, useGit) {
  mkdirSync(dirname(to), { recursive: true });
  if (useGit) {
    try {
      execFileSync('git', ['-C', repo, 'mv', from, to], { stdio: 'ignore' });
      return;
    } catch {
      // The file is not tracked by git. Rename it instead.
    }
  }
  renameSync(from, to);
}

/** Removes the folders that the moves emptied. The bundle folder itself is kept. */
function removeEmptyFolders(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory() || e.name === BUNDLE_DIR_NAME) continue;
    const p = join(dir, e.name);
    removeEmptyFolders(p);
    if (readdirSync(p).length === 0) rmdirSync(p);
  }
}

/**
 * Performs a ready plan and returns the number of files moved. Throws for any other status, so it never runs half-done.
 * It does not regenerate _map.json: the moved map keeps its old paths until `docs_check.mjs map` runs. The migrate command runs it.
 */
export function applyPlan(plan, date = new Date().toISOString().slice(0, 10)) {
  if (plan.status !== 'ready') throw new Error(`migrate: the plan is ${plan.status}, not ready; nothing was changed`);
  for (const m of plan.moves) moveOne(plan.repo, m.from, m.to, plan.git);
  const movedMap = new Map(plan.moves.map((m) => [m.from, m.to]));
  for (const [src, e] of plan.edits) {
    writeRaw(movedMap.get(src) ?? src, e.text, e.crlf);
  }
  const logPath = join(plan.target, 'log.md');
  const existing = existsSync(logPath) ? readRaw(logPath) : null;
  const summary = `Moved ${plan.moves.length} bundle file(s) from docs/ to docs/${BUNDLE_DIR_NAME}/ and rewrote ${plan.links + plan.backlinks} link(s).`;
  writeRaw(logPath, logWithEntry(existing?.text ?? null, summary, date), existing?.crlf ?? false);
  removeEmptyFolders(plan.legacy);
  return plan.moves.length;
}
