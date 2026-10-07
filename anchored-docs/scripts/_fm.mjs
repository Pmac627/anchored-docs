// Frontmatter, YAML-subset parsing, and the two-level glossary shared by ste_check.mjs and docs_check.mjs.
//
// Doc frontmatter stays YAML because OKF requires it. This module parses only the subset the skill writes:
// scalars, inline lists, inline maps ({ by: x, at: y }), block lists of scalars, and block lists of maps
// (- id: x / resource: y). It has no dependencies. Dates stay text exactly as the author wrote them.
//
// Glossary levels (JSON files, new in 2.0):
//   org      <skill>/references/org-glossary.json, or $STE_ORG_GLOSSARY. Shipped with the skill.
//   project  <docs>/_glossary.json. Terms specific to one repository.
// The effective glossary is the union. A project file may not contradict the org file (see loadGlossaries).

import { existsSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { WHITESPACE, strip, stripEnd, splitlines, readText } from './_compat.mjs';
import { purePath } from './_fs.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
export const ORG_GLOSSARY_DEFAULT = resolve(HERE, '..', 'references', 'org-glossary.json');
export const PROJECT_GLOSSARY_NAME = '_glossary.json';
const LEGACY_PROJECT_GLOSSARY_NAME = '_glossary.yaml';

const WS = `[${WHITESPACE}]`;
const FM_RE = /^---[ \t]*\n([\s\S]*?)\n---[ \t]*\n?/;
// After the first character a key may hold any Unicode letter or number, so match them explicitly.
const KEY_RE = new RegExp(`^([A-Za-z_][\\p{L}\\p{N}_-]*):${WS}*(.*)$`, 'u');

/** Returns { frontmatter: string | null, body, bodyStartLine }. bodyStartLine is 1-based. */
export function splitFrontmatter(text) {
  const m = FM_RE.exec(text);
  if (!m) return { frontmatter: null, body: text, bodyStartLine: 1 };
  const fm = m[1];
  return { frontmatter: fm, body: text.slice(m[0].length), bodyStartLine: (fm.match(/\n/g) ?? []).length + 3 };
}

function scalar(raw) {
  const s = strip(raw);
  if (s === '' || s === '~' || s === 'null') return null;
  const first = s[0];
  if ((first === '"' || first === "'") && s.length >= 2 && s[s.length - 1] === first) return s.slice(1, -1);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = strip(s.slice(1, -1));
    return inner === '' ? [] : splitTop(inner).map(scalar);
  }
  if (s.startsWith('{') && s.endsWith('}')) {
    const out = new Map();
    for (const part of splitTop(s.slice(1, -1))) {
      const idx = part.indexOf(':');
      if (idx >= 0) out.set(strip(part.slice(0, idx)), scalar(part.slice(idx + 1)));
    }
    return out;
  }
  const low = s.toLowerCase();
  if (low === 'true' || low === 'false') return low === 'true';
  return s;
}

function splitTop(s) {
  const parts = [];
  let depth = 0;
  let cur = '';
  let q = null;
  for (const ch of s) {
    if (q) {
      cur += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '[' || ch === '{') depth++;
    else if (ch === ']' || ch === '}') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur);
      cur = '';
    } else cur += ch;
  }
  if (strip(cur) !== '') parts.push(cur);
  return parts;
}

// A quote character toggles quote state even inside a word ("doesn't"), so a # after an apostrophe
// is kept. The 1.x parser behaved this way and the parity tests pin it.
function stripComment(line) {
  const chars = Array.from(line);
  let out = '';
  let q = null;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (q) {
      out += ch;
      if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
    else if (ch === '#' && (i === 0 || chars[i - 1] === ' ' || chars[i - 1] === '\t')) break;
    out += ch;
  }
  return stripEnd(out);
}

/**
 * Parse the YAML subset into a Map (insertion order kept). Values are null, boolean, string,
 * array, or Map. Anything outside the subset is skipped, as in 1.x; docs_check okf reports docs
 * whose required keys then come back empty.
 */
export function parseYamlSubset(text) {
  const lines = splitlines(text).map(stripComment);
  const root = new Map();
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (strip(line) === '') {
      i++;
      continue;
    }
    const m = KEY_RE.exec(line);
    if (!m) {
      i++;
      continue;
    }
    const key = m[1];
    const rest = m[2];
    if (strip(rest) !== '') {
      root.set(key, scalar(rest));
      i++;
      continue;
    }
    i++;
    const items = [];
    const blockMap = new Map();
    let cur = null;
    while (i < lines.length && (lines[i].startsWith(' ') || lines[i].startsWith('\t') || lines[i].startsWith('-') || strip(lines[i]) === '')) {
      const l = lines[i];
      if (strip(l) === '') {
        i++;
        continue;
      }
      const st = strip(l);
      if (st.startsWith('- ')) {
        if (cur !== null) items.push(cur);
        const body = strip(st.slice(2));
        const mm = KEY_RE.exec(body);
        if (mm && !body.startsWith('{')) {
          cur = new Map([[mm[1], scalar(mm[2])]]);
        } else {
          cur = null;
          items.push(scalar(body));
        }
      } else if (st === '-') {
        // a bare dash carries nothing
      } else {
        const mm = KEY_RE.exec(st);
        if (mm) {
          if (cur !== null) cur.set(mm[1], scalar(mm[2]));
          else blockMap.set(mm[1], scalar(mm[2]));
        }
      }
      i++;
    }
    if (cur !== null) items.push(cur);
    root.set(key, items.length ? items : blockMap);
  }
  return root;
}

/** Returns { fm: Map, body, bodyStartLine, text }. */
export function readDoc(path) {
  const text = readText(path);
  const { frontmatter, body, bodyStartLine } = splitFrontmatter(text);
  const fm = frontmatter !== null ? parseYamlSubset(frontmatter) : new Map();
  return { fm, body, bodyStartLine, text };
}

// ---------- glossary ----------

/** A glossary file that cannot be read or has the wrong shape. The message names the file. */
export class GlossaryError extends Error {
  constructor(message) {
    super(message);
    this.name = 'GlossaryError';
  }
}

function normMeaning(m) {
  if (m === null || m === undefined) return null;
  const t = strip(String(m).replace(new RegExp(`${WS}+`, 'g'), ' ')).replace(/\.+$/, '').toLowerCase();
  return t === '' ? null : t;
}

function readJson(path) {
  let text;
  try {
    text = readText(path);
  } catch (e) {
    throw new GlossaryError(`${path}: cannot read the glossary file (${e.code ?? e.message})`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new GlossaryError(`${path}: not valid JSON (${e.message}). Glossary files are JSON in anchored-docs 2.0.`);
  }
}

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/** Returns an array of { term, kind, origin, source, meaning, unapproved }. Throws GlossaryError. */
export function parseGlossaryFile(path, origin) {
  const data = readJson(path);
  if (!isPlainObject(data)) throw new GlossaryError(`${path}: the top level must be a JSON object with technical_nouns and technical_verbs`);
  const out = [];
  for (const [section, kind] of [['technical_nouns', 'noun'], ['technical_verbs', 'verb']]) {
    const list = data[section];
    if (list === undefined || list === null) continue;
    if (!Array.isArray(list)) throw new GlossaryError(`${path}: "${section}" must be an array`);
    for (const entry of list) {
      if (isPlainObject(entry)) {
        const term = strip(String(entry.term ?? '')).toLowerCase();
        if (term === '') continue;
        const raw = entry.unapproved ?? [];
        if (!Array.isArray(raw)) throw new GlossaryError(`${path}: "unapproved" for "${term}" must be an array`);
        const unapproved = raw.map((x) => strip(String(x)).toLowerCase()).filter((x) => x !== '');
        out.push({ term, kind, origin, source: path, meaning: normMeaning(entry.meaning), unapproved });
      } else if (typeof entry === 'string' && strip(entry) !== '') {
        out.push({ term: strip(entry).toLowerCase(), kind, origin, source: path, meaning: null, unapproved: [] });
      }
    }
  }
  return out;
}

function expandUser(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/') || p.startsWith('~\\')) return join(homedir(), p.slice(2));
  return p;
}

export function findOrgGlossary() {
  const env = process.env.STE_ORG_GLOSSARY;
  if (env) {
    const p = purePath(expandUser(env));
    if (existsSync(p)) return p;
  }
  return existsSync(ORG_GLOSSARY_DEFAULT) ? ORG_GLOSSARY_DEFAULT : null;
}

/**
 * The effective glossary for one docs root: org entries plus project entries, with the conflicts
 * between them. Returns { approved: Set, unapproved: Map, entries: Map, origin: Map,
 * conflicts: string[], notices: string[], orgPath, projectPath, legacyProjectPath }.
 * legacyProjectPath is the 1.x _glossary.yaml when it is present and _glossary.json is not; else null.
 *
 * Conflicts (mechanical):
 *   - a term is also listed as an unapproved synonym in the same file
 *   - the project lists an org term as unapproved, or approves a word the org lists as unapproved
 *   - the same synonym points at different approved terms in the two files
 *   - the same term carries two different `meaning` texts
 * Notice: the project repeats an org term without a different meaning. That is redundant; delete it,
 * or move its extra synonyms up to the org glossary.
 */
export function loadGlossaries(docsRoot) {
  const g = {
    approved: new Set(),
    unapproved: new Map(),
    entries: new Map(),
    origin: new Map(),
    conflicts: [],
    notices: [],
    orgPath: findOrgGlossary(),
    projectPath: null,
    legacyProjectPath: null,
  };
  const proj = join(docsRoot, PROJECT_GLOSSARY_NAME);
  g.projectPath = existsSync(proj) ? proj : null;
  if (!g.projectPath && existsSync(join(docsRoot, LEGACY_PROJECT_GLOSSARY_NAME))) {
    g.legacyProjectPath = join(docsRoot, LEGACY_PROJECT_GLOSSARY_NAME);
    g.notices.push(`found ${LEGACY_PROJECT_GLOSSARY_NAME} in the docs folder; anchored-docs 2.0 reads ${PROJECT_GLOSSARY_NAME}, so the project glossary is ignored until you convert it to JSON (same keys)`);
  }
  const levels = [];
  if (g.orgPath) levels.push(parseGlossaryFile(g.orgPath, 'org'));
  if (g.projectPath) levels.push(parseGlossaryFile(g.projectPath, 'project'));

  for (const entries of levels) {
    const terms = new Set(entries.map((e) => e.term));
    for (const e of entries) {
      for (const syn of e.unapproved) {
        if (terms.has(syn)) g.conflicts.push(`${e.origin} glossary ${basename(e.source)}: "${syn}" is an approved term and also an unapproved synonym of "${e.term}"`);
      }
    }
  }

  for (const entries of levels) {
    for (const e of entries) {
      const prior = g.entries.get(e.term) ?? [];
      if (prior.length && e.origin === 'project') {
        const orgE = prior[0];
        if (e.meaning && orgE.meaning && e.meaning !== orgE.meaning) {
          g.conflicts.push(`project glossary redefines org term "${e.term}" with a different meaning (org: "${orgE.meaning}"; project: "${e.meaning}"). Use a different name for the project's item.`);
        } else {
          g.notices.push(`project glossary repeats org term "${e.term}" (redundant; delete it, or move its synonyms to the org glossary)`);
        }
      }
      if (e.origin === 'project' && g.unapproved.has(e.term)) {
        g.conflicts.push(`project glossary approves "${e.term}", which the org glossary lists as an unapproved synonym of "${g.unapproved.get(e.term)}"`);
      }
      if (!g.entries.has(e.term)) g.entries.set(e.term, []);
      g.entries.get(e.term).push(e);
      g.approved.add(e.term);
      g.origin.set(e.term, prior.length && prior[0].origin !== e.origin ? 'both' : (g.origin.get(e.term) || e.origin));
      for (const syn of e.unapproved) {
        if (e.origin === 'project' && g.approved.has(syn) && ['org', 'both'].includes(g.origin.get(syn))) {
          g.conflicts.push(`project glossary lists org term "${syn}" as an unapproved synonym of "${e.term}"`);
          continue;
        }
        if (g.unapproved.has(syn) && g.unapproved.get(syn) !== e.term) {
          g.conflicts.push(`synonym "${syn}" points at "${g.unapproved.get(syn)}" in one glossary and at "${e.term}" in the other`);
          continue;
        }
        g.unapproved.set(syn, e.term);
      }
    }
  }
  return g;
}

/** Returns [approved Set, unapproved Map] for the effective glossary. */
export function loadGlossary(docsRoot) {
  const g = loadGlossaries(docsRoot);
  return [g.approved, g.unapproved];
}

function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The docs bundle that governs a path: the enclosing docs/ folder, or the docs/ folder beside a source tree.
 * Relative input stays relative, as in 1.x, because callers print the result.
 */
export function findDocsRoot(start) {
  const p = isDir(start) ? start : dirname(start);
  const chain = [];
  for (let cand = p; ; ) {
    chain.push(cand);
    const parent = dirname(cand);
    if (parent === cand) break;
    cand = parent;
  }
  const nameOf = (c) => (c === '.' ? '' : basename(c));
  for (const cand of chain) {
    if (nameOf(cand) === 'docs' || existsSync(join(cand, PROJECT_GLOSSARY_NAME)) || (existsSync(join(cand, 'index.md')) && existsSync(join(cand, 'flows')))) return cand;
  }
  for (const cand of chain) {
    if (existsSync(join(cand, 'docs', PROJECT_GLOSSARY_NAME))) return join(cand, 'docs');
  }
  return p;
}
