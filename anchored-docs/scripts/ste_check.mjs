#!/usr/bin/env node
// ste_check.mjs: ASD-STE100 (Issue 9) checker for docs/ prose and source doc comments.
// Needs Node 22 or newer. No dependencies. Run with no arguments for usage.

import { readFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findDocsRoot, findOrgGlossary, loadGlossaries, parseGlossaryFile, readDoc, GlossaryError, PROJECT_GLOSSARY_NAME } from './_fm.mjs';
import { WHITESPACE, valueText, strip, stripChars, readText, splitlines, FileReadError } from './_compat.mjs';
import { comparePaths, exists, isDir, isFile, pathParts, purePath, fileSuffix, rglobAll, sortPaths } from './_fs.mjs';
import { APPROVED_ING, FUNCTION_WORDS, IMPERATIVE_VERBS, PASSIVE_PARTICIPLES, PHRASAL, STEP_OK_STARTS, USAGE } from './_ste_data.mjs';

if (Number(process.versions.node.split('.')[0]) < 22) {
  console.error('ste_check: Node 22 or newer is required.');
  process.exit(2);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const PACK_DIR_NAME = 'asd-ste100-agent-pack';
const PACK_DEFAULT = resolve(HERE, '..', 'references', PACK_DIR_NAME);
const ORG_GLOSSARY_DEFAULT_STR = resolve(HERE, '..', 'references', 'org-glossary.json');
// Technical categories whose example words are permitted without a glossary entry (rules 1.5, 1.12).
// TN 6 systems and components, 7 mathematical and engineering terms, 15 documents and standards,
// 19 computer science and ICT; TV 2 computer processes and applications. Override: STE_TECH_CATEGORIES="tn:6,7,15,19 tv:2".
const DEFAULT_TECH_CATEGORIES = () => new Map([['tn', new Set([6, 7, 15, 19])], ['tv', new Set([2])]]);
const PLACEHOLDERS = new Set(['code', 'path', 'url', 'paren', 'quote', 'image']);
const SOURCE_EXT = new Map([['.cs', 'cs'], ['.cpp', 'cpp'], ['.cc', 'cpp'], ['.cxx', 'cpp'], ['.h', 'cpp'], ['.hpp', 'cpp'], ['.c', 'cpp'], ['.py', 'py'], ['.ts', 'ts'], ['.tsx', 'ts'], ['.js', 'ts'], ['.jsx', 'ts'], ['.mjs', 'ts'], ['.cjs', 'ts'], ['.mts', 'ts'], ['.cts', 'ts']]);
const PROC_CAP = 20;
const DESC_CAP = 25;
const PARA_CAP = 6;

// ---------- regexes: word, space, digit, and word-boundary classes are Unicode-aware, so spell them out ----------
const W = '[\\p{L}\\p{N}_]';
const WB = `(?:(?<=${W})(?!${W})|(?<!${W})(?=${W}))`; // Unicode word boundary
const S = `[${WHITESPACE}]`;
const NS = `[^${WHITESPACE}]`;
const D = '\\p{Nd}';
const escapeRe = (t) => t.replace(/[\\^$.*+?()[\]{}|/]/g, '\\$&');

const PASSIVE_RE = new RegExp(`${WB}(is|are|was|were|be|been|being|get|gets|got)${S}+(?:(?:not|also|then|still|never|always|often|usually|already)${S}+)?${PASSIVE_PARTICIPLES}${WB}`, 'iu');
const PROGRESSIVE_RE = new RegExp(`${WB}(is|are|was|were|be|been|am)${S}+(?:not${S}+)?${W}+ing${WB}`, 'iu');
const PERFECT_RE = new RegExp(`${WB}(has|have|had)${S}+(?:not${S}+)?(?:been${S}+)?${PASSIVE_PARTICIPLES}${WB}`, 'iu');
const CONTRACTION_RE = new RegExp(`${WB}(?:${W}+n't|${W}+'re|${W}+'ve|${W}+'ll|${W}+'d|I'm|it's|that's|there's|what's|here's|let's|who's|where's|how's)${WB}`, 'iu');
const LATIN_RE = new RegExp(`(?<!${W}|\\.)(?:e\\.g\\.|i\\.e\\.|etc\\.?|vs\\.?|cf\\.|et al\\.|viz\\.|n\\.b\\.|ibid\\.)(?!${W})`, 'iu');
const PHRASAL_RE = new RegExp(`${WB}(${PHRASAL.map((p) => escapeRe(p).replaceAll(' ', `${S}+`)).join('|')})${WB}`, 'iu');
const BARE_THIS_RE = new RegExp(`^(?:This|That|These|Those|It)${S}+(is|was|are|were|means|does|will|can|has|have|makes|allows|ensures|causes|happens|lets|keeps|gives|makes|shows|works|matters|holds|applies|exists|becomes|stays|tells|prevents|adds|removes|returns|leaves|breaks|fails|passes|runs)${WB}`, 'u');
const UNIT_RE = /^(?:[kmgtKMGT]i?[bB]|[kmgtKMGT]?[bB]ytes?|ms|s|sec|secs|min|mins|h|hr|hrs|%|mm|cm|m|km|kg|g|lb|lbs|px|pt|fps|hz|khz|mhz|ghz|x)$/i;
const NUM_RE = new RegExp(`^[+-]?${D}[${D},.]*$`, 'u');
const WORD_RE = /[A-Za-z][A-Za-z'-]*/g;
const SENT_SPLIT_RE = new RegExp(`(?<=[.!?])${S}+(?=[A-Z"'(\\u201c])`, 'u');
const ORDERED_RE = new RegExp(`^${S}*(?:${D}+[.)]|[A-Za-z][.)]|\\(${D}+\\)|\\([a-z]\\))${S}+`, 'u');
const UNORDERED_RE = new RegExp(`^${S}*[-*+]${S}+`, 'u');
const HEADING_RE = new RegExp(`^${S}{0,3}#{1,6}${S}`, 'u');
const WAIVER_RE = new RegExp(`<!--${S}*ste-ok:${S}*([\\p{L}\\p{N}_.\\-]+|all)${WB}[^>]*-->`, 'gu');
const TABLE_RULE_RE = new RegExp(`^\\|?${S}*:?-{2,}`, 'u');
const CELL_RULE_RE = new RegExp(`^[-:${WHITESPACE}]+$`, 'u');
const WS_RUN = new RegExp(`${S}+`, 'gu');
const SPLIT_WS = new RegExp(`${S}+`, 'u');
const IMPERATIVE_SET = new Set(IMPERATIVE_VERBS);
const TWO_INSTRUCTIONS_RE = new RegExp(`${WB}(?:and then|, then|and)${S}+(${IMPERATIVE_VERBS.join('|')})${WB}`, 'u');

const wordRegexCache = new Map();
/** re.search(r"\b" + re.escape(term) + r"\b", text) */
function hasWord(term, text) {
  let re = wordRegexCache.get(term);
  if (!re) {
    re = new RegExp(`${WB}${escapeRe(term)}${WB}`, 'u');
    wordRegexCache.set(term, re);
  }
  return re.test(text);
}

const codePoints = (s) => Array.from(s);
const head = (s, n) => codePoints(s).slice(0, n).join('');
const splitWords = (s) => strip(s).split(SPLIT_WS).filter((x) => x !== '');
const isUpper = (w) => w === w.toUpperCase() && w !== w.toLowerCase();

// ---------- non-STE words that need no dictionary ----------

function loadUnapproved() {
  const out = new Map();
  for (const raw of splitlines(readText(join(HERE, 'ste_unapproved.tsv')))) {
    if (strip(raw) === '' || raw.startsWith('#')) continue;
    const parts = raw.split('\t');
    const word = strip(parts[0]).toLowerCase();
    const alt = strip(parts[1] ?? '');
    const rule = parts.length > 2 ? strip(parts[2]) : '1.1';
    out.set(word, [alt, rule]);
    if (!word.includes(' ') && rule === '1.1') {
      const base = word.endsWith('e') ? word.slice(0, -1) : word;
      for (const form of [`${word}s`, `${word}es`, `${base}ed`, `${base}ing`, `${word}d`]) if (!out.has(form)) out.set(form, [alt, rule]);
    }
  }
  return out;
}

// ---------- word source: agent pack, word list, or neither ----------

function describeLexicon(lex) {
  if (lex.source === 'pack') return `pack (Issue 9: ${lex.nApproved} approved, ${lex.nUnapproved} unapproved) at ${lex.path}`;
  return `wordlist (${lex.nApproved} words) at ${lex.path}`;
}

function expandUser(p) {
  if (p === '~') return homedir();
  if (p.startsWith('~/')) return join(homedir(), p.slice(2));
  return p;
}

function findAgentPack() {
  const cands = [];
  const env = process.env.STE_AGENT_PACK;
  if (env) cands.push(purePath(expandUser(env)));
  cands.push(PACK_DEFAULT);
  for (const c of cands) {
    for (const p of [c, join(c, PACK_DIR_NAME)]) {
      const d = join(p, 'dictionary');
      if (exists(join(d, 'approved-words.json')) && exists(join(d, 'unapproved-words.json'))) return p;
    }
  }
  return null;
}

function techCategories() {
  const spec = process.env.STE_TECH_CATEGORIES;
  if (!spec) return DEFAULT_TECH_CATEGORIES();
  const out = new Map([['tn', new Set()], ['tv', new Set()]]);
  for (const part of spec.replaceAll(';', ' ').split(SPLIT_WS).filter(Boolean)) {
    const i = part.indexOf(':');
    if (i < 0) continue;
    const k = strip(part.slice(0, i)).toLowerCase();
    const v = part.slice(i + 1);
    if (out.has(k)) out.set(k, new Set(v.split(',').filter((x) => /^\d+$/.test(strip(x))).map((x) => Number(strip(x)))));
  }
  return out;
}

/** Example words from technical-categories.json. The lists mix in description fragments; keep only short terms. */
function categoryWords(pack) {
  const words = new Set();
  const index = new Map();
  const p = join(pack, 'rules', 'technical-categories.json');
  if (!exists(p)) return [words, index];
  let data;
  try {
    data = JSON.parse(readText(p));
  } catch {
    return [words, index];
  }
  const allowed = techCategories();
  for (const [kind, key] of [['tn', 'technical_noun_categories'], ['tv', 'technical_verb_categories']]) {
    for (const cat of data[key] ?? []) {
      const num = Math.trunc(Number(cat.number ?? 0));
      const title = String(cat.title ?? '');
      for (const ex of cat.examples ?? []) {
        const t = stripChars(strip(String(ex)), '.,;:').toLowerCase();
        if (t === '' || splitWords(t).length > 3 || !/^[a-z][a-z' -]*$/.test(t) || t.startsWith('terms ') || /^[a-z]\) /.test(t)) continue;
        if (!index.has(t)) index.set(t, []);
        if (!index.get(t).some(([k, n, ti]) => k === kind && n === num && ti === title)) index.get(t).push([kind, num, title]);
        if (allowed.get(kind)?.has(num)) {
          words.add(t);
          for (const tok of splitWords(t)) if (codePoints(tok).length > 2) words.add(tok);
        }
      }
    }
  }
  return [words, index];
}

const norm = (v) => strip(String(v ?? '').toLowerCase());

function loadPack(pack) {
  const lex = { source: 'pack', path: pack, approved: new Set(), unapproved: new Map(), phrases: new Map(), technical: new Set(), entries: new Map(), categories: new Map(), nApproved: 0, nUnapproved: 0 };
  const d = join(pack, 'dictionary');
  const approved = JSON.parse(readText(join(d, 'approved-words.json')));
  const unapproved = JSON.parse(readText(join(d, 'unapproved-words.json')));
  const push = (map, key, e) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(e);
  };
  for (const e of approved) {
    const w = norm(e.word);
    if (w === '') continue;
    push(lex.entries, w, e);
    lex.approved.add(w);
    for (const f of e.forms ?? []) lex.approved.add(norm(f));
    const pos = e.pos;
    if (pos === 'n') {
      lex.approved.add(`${w}s`);
      lex.approved.add(`${w}es`);
      if (w.endsWith('y')) lex.approved.add(`${w.slice(0, -1)}ies`);
    }
    if (pos === 'adj') {
      lex.approved.add(`${w}ly`);
      if (w.endsWith('y')) lex.approved.add(`${w.slice(0, -1)}ily`);
      if (w.endsWith('le')) lex.approved.add(`${w.slice(0, -1)}y`);
    }
  }
  for (const e of unapproved) {
    const w = norm(e.word);
    if (w === '') continue;
    push(lex.entries, w, e);
    push(w.includes(' ') ? lex.phrases : lex.unapproved, w, e);
  }
  lex.nApproved = approved.length;
  lex.nUnapproved = unapproved.length;
  [lex.technical, lex.categories] = categoryWords(pack);
  const wl = join(d, 'approved-wordforms.txt');
  if (exists(wl)) for (const x of splitlines(readText(wl))) if (strip(x) !== '') lex.approved.add(strip(x).toLowerCase());
  return lex;
}

function loadWordlist(p) {
  const words = new Set();
  for (const w of splitlines(readText(p))) if (strip(w) !== '' && !w.startsWith('#')) words.add(strip(w).toLowerCase());
  return { source: 'wordlist', path: p, approved: words, unapproved: new Map(), phrases: new Map(), technical: new Set(), entries: new Map(), categories: new Map(), nApproved: words.size, nUnapproved: 0 };
}

function loadLexicon() {
  const pack = findAgentPack();
  if (pack !== null) return loadPack(pack);
  const p = process.env.STE_DICTIONARY;
  if (p && exists(p)) return loadWordlist(purePath(p));
  return null;
}

/** Candidate base forms of a token, for the unapproved-word lookup. */
function stems(lt) {
  const out = [lt];
  for (const [suf, rep] of [['ies', 'y'], ['ied', 'y'], ['es', ''], ['s', ''], ['ed', ''], ['ed', 'e'], ['ing', ''], ['ing', 'e'], ['ly', ''], ['er', ''], ['est', '']]) {
    if (lt.endsWith(suf) && lt.length - suf.length >= 3) out.push(lt.slice(0, lt.length - suf.length) + rep);
  }
  return out;
}

/** 'MAKE SURE (v)' becomes 'make sure'; 'FILTER (TN)' becomes 'filter'. */
const altWord = (alt) => strip(alt.replace(new RegExp(`${S}*\\([^)]*\\)${S}*$`, 'u'), '')).toLowerCase();

function uniqueFrom(entries, key) {
  const out = [];
  for (const e of entries) for (const a of e[key] ?? []) if (!out.includes(a)) out.push(a);
  return out;
}
const alts = (entries) => uniqueFrom(entries, 'alternatives');
const helps = (entries) => uniqueFrom(entries, 'help');

// ---------- text preparation ----------

const INLINE_STEPS = [
  [/`[^`\n]+`/g, ' CODE '],
  [/!\[[^\]]*\]\([^)]*\)/g, ' IMAGE '],
  [/\[([^\]]+)\]\([^)]*\)/g, '$1'],
  [new RegExp(`https?://${NS}+|www\\.${NS}+`, 'gu'), ' URL '],
  [new RegExp(`(?<!${W})(?:\\.{0,2}/)?[\\p{L}\\p{N}_.-]+(?:/[\\p{L}\\p{N}_.-]+)+(?::${D}+)?`, 'gu'), ' PATH '],
  [new RegExp(`\\[\\^[\\p{L}\\p{N}_-]+\\]`, 'gu'), ''],
  [new RegExp(`\\*\\*|__|(?<!${W})[*_](?=${W})|(?<=${W})[*_](?!${W})`, 'gu'), ''],
  [/<[^>\n]+>/g, ' '],
];

/** Replace exempt inline regions with single placeholder tokens. */
function stripInline(text) {
  let t = text;
  for (const [re, rep] of INLINE_STEPS) t = t.replace(re, rep);
  return t;
}

/** Rules 8.4 to 8.7: parentheses = 1, hyphenated = 1, number+unit = 1, code/path/url = 1. */
function countWords(sentence) {
  let s = sentence.replace(/\([^)]*\)/g, ' PAREN ');
  s = s.replace(/"[^"]*"|\u201c[^\u201d]*\u201d/g, ' QUOTE ');
  const toks = strip(s).split(SPLIT_WS).filter((t) => t !== '' && new RegExp(W, 'u').test(t));
  let n = 0;
  let i = 0;
  while (i < toks.length) {
    const t = stripChars(toks[i], '.,;:!?');
    if (NUM_RE.test(t) && i + 1 < toks.length && UNIT_RE.test(stripChars(toks[i + 1], '.,;:!?'))) i += 2;
    else i += 1;
    n += 1;
  }
  return n;
}

function splitSentences(par) {
  const p = strip(par.replace(WS_RUN, ' '));
  if (p === '') return [];
  return p.split(SENT_SPLIT_RE).filter((s) => strip(s) !== '');
}

/** Prose blocks with their first line number, and waivers keyed by the line they protect. */
function markdownBlocks(body, startLine, proceduralDoc) {
  const blocks = [];
  const waivers = new Map();
  const lines = splitlines(body);
  let inFence = false;
  let fenceMark = '';
  let inHtml = false;
  let para = [];
  let paraLine = 0;
  const flush = () => {
    if (para.length) blocks.push({ line: paraLine, text: para.join(' '), procedural: proceduralDoc, kind: 'para' });
    para = [];
    paraLine = 0;
  };
  lines.forEach((raw, idx) => {
    const ln = startLine + idx;
    let st = strip(raw);
    for (const m of raw.matchAll(WAIVER_RE)) {
      if (!waivers.has(ln + 1)) waivers.set(ln + 1, new Set());
      waivers.get(ln + 1).add(m[1]);
    }
    if (inHtml) {
      if (raw.includes('-->')) inHtml = false;
      return;
    }
    if (st.startsWith('<!--') && !st.includes('-->')) {
      inHtml = true;
      flush();
      return;
    }
    if (st.startsWith('<!--')) return;
    const fm = /^(`{3,}|~{3,})/.exec(st);
    if (fm) {
      if (!inFence) {
        inFence = true;
        fenceMark = fm[1][0].repeat(3);
      } else if (st.startsWith(fenceMark)) inFence = false;
      flush();
      return;
    }
    if (inFence) return;
    if (st === '' || HEADING_RE.test(raw) || st.startsWith('---') || st.startsWith('[^') || TABLE_RULE_RE.test(st)) {
      flush();
      return;
    }
    if (st.startsWith('>')) {
      st = strip(st.replace(/^[> ]+/, ''));
      if (st === '') {
        flush();
        return;
      }
    }
    if (st.startsWith('|')) {
      flush();
      for (const cell of stripChars(st, '|').split('|')) {
        const c = strip(cell);
        if (c !== '' && !CELL_RULE_RE.test(c)) blocks.push({ line: ln, text: c, procedural: proceduralDoc, kind: 'cell' });
      }
      return;
    }
    if (ORDERED_RE.test(raw)) {
      flush();
      blocks.push({ line: ln, text: strip(raw.replace(ORDERED_RE, '')), procedural: true, kind: 'item' });
      return;
    }
    if (UNORDERED_RE.test(raw)) {
      flush();
      blocks.push({ line: ln, text: strip(raw.replace(UNORDERED_RE, '')), procedural: proceduralDoc, kind: 'item' });
      return;
    }
    if ((raw.startsWith(' ') || raw.startsWith('\t')) && blocks.length && blocks[blocks.length - 1].kind === 'item' && !para.length) {
      blocks[blocks.length - 1].text += ' ' + st;
      return;
    }
    if (!para.length) paraLine = ln;
    para.push(st);
  });
  flush();
  return [blocks, waivers];
}

function stripTags(s) {
  let t = s.replace(new RegExp(`<see(?:also)?${S}+[^>]*/>`, 'gu'), ' CODE ');
  t = t.replace(/<[^>]+>/g, ' ');
  t = t.replace(new RegExp(`@${W}+${S}+${NS}+`, 'gu'), ' ');
  t = t.replace(new RegExp(`${WB}(See|See also):${S}*${NS}+`, 'gu'), ' ');
  return t;
}

const PY_DOCSTRING_RE = new RegExp(`(?:def |class )[^\\n]*\\n${S}*(?:"""|''')([\\s\\S]*?)(?:"""|''')`, 'gdu');

/** Doc comments from source, as descriptive prose blocks. */
function sourceBlocks(path, lang) {
  const text = readText(path);
  const lines = splitlines(text);
  const blocks = [];
  if (lang === 'cs' || lang === 'cpp' || lang === 'ts') {
    let i = 0;
    const isDoc = (l) => strip(l).startsWith('///') || strip(l).startsWith('//!');
    while (i < lines.length) {
      const st = strip(lines[i]);
      if (st.startsWith('///') || st.startsWith('//!')) {
        const start = i;
        const buf = [];
        while (i < lines.length && isDoc(lines[i])) {
          buf.push(lines[i].replace(new RegExp(`^${S}*//[/!]${S}?`, 'u'), ''));
          i += 1;
        }
        blocks.push({ line: start + 1, text: buf.map(stripTags).join(' '), procedural: false, kind: 'para' });
        continue;
      }
      if (st.startsWith('/**')) {
        const start = i;
        const buf = [];
        while (i < lines.length) {
          buf.push(stripTags(lines[i].replace(new RegExp(`^${S}*/?\\*+/?${S}?`, 'u'), '')));
          if (lines[i].includes('*/')) break;
          i += 1;
        }
        blocks.push({ line: start + 1, text: buf.join(' '), procedural: false, kind: 'para' });
      }
      i += 1;
    }
  } else if (lang === 'py') {
    for (const m of text.matchAll(PY_DOCSTRING_RE)) {
      const ln = (text.slice(0, m.indices[1][0]).match(/\n/g) ?? []).length + 1;
      blocks.push({ line: ln, text: strip(m[1].replace(WS_RUN, ' ')), procedural: false, kind: 'para' });
    }
  }
  return blocks.filter((b) => strip(b.text) !== '');
}

// ---------- checks ----------

function newReport(lex) {
  return { findings: [], waivers: 0, sentences: 0, dictionary: lex !== null, source: lex ? lex.source : 'none', unknown: new Map() };
}
const add = (rep, path, line, kind, rule, msg) => rep.findings.push({ path, line, kind, rule, msg });
const inTerms = (lw, terms) => [...terms].some((t) => splitWords(t).includes(lw));

function checkBlock(b, path, rep, unapproved, glossaryTerms, glossaryUnapproved, lex, waivers) {
  const text = stripInline(b.text);
  const sentences = splitSentences(text);
  const allowed = waivers.get(b.line) ?? new Set();
  const blockReported = new Set();

  const skip = (rule) => {
    if (allowed.has('all') || allowed.has(rule) || [...allowed].some((a) => a.endsWith('.') && rule.startsWith(a))) {
      rep.waivers += 1;
      return true;
    }
    return false;
  };

  if (b.kind === 'para' && sentences.length > PARA_CAP && !skip('6.6')) add(rep, path, b.line, 'M', '6.6', `paragraph has ${sentences.length} sentences (max ${PARA_CAP})`);
  const cap = b.procedural ? PROC_CAP : DESC_CAP;
  const ruleLen = b.procedural ? '5.1' : '6.1';
  sentences.forEach((s, si) => {
    rep.sentences += 1;
    const n = countWords(s);
    if (n > cap && !skip(ruleLen)) add(rep, path, b.line, 'M', ruleLen, `${n} words (max ${cap}): "${head(s, 70)}..."`);
    if (s.includes(';') && !skip('8.1')) add(rep, path, b.line, 'M', '8.1', 'semicolon; write two sentences');
    let m = CONTRACTION_RE.exec(s);
    if (m && !skip('4.2')) add(rep, path, b.line, 'M', '4.2', `contraction "${m[0]}"`);
    m = LATIN_RE.exec(s);
    if (m && !skip('GR-6')) add(rep, path, b.line, 'M', 'GR-6', `Latin abbreviation "${m[0]}"`);
    const low = s.toLowerCase();
    const pack = lex !== null && lex.source === 'pack' ? lex : null;
    const flagged = new Set();
    // glossary unapproved synonyms (1.11) and built-in non-STE list (1.1)
    for (const [syn, term] of glossaryUnapproved) {
      if (hasWord(syn, low) && !skip('1.11')) add(rep, path, b.line, 'M', '1.11', `"${syn}" is not the approved technical noun; use "${term}"`);
    }
    const phrases = [...unapproved.keys()].filter((k) => k.includes(' ')).sort((a, c) => codePoints(c).length - codePoints(a).length);
    for (const w of phrases) {
      if (hasWord(w, low) && !glossaryTerms.has(w) && !skip(unapproved.get(w)[1])) {
        flagged.add(w);
        add(rep, path, b.line, 'M', unapproved.get(w)[1], `"${w}": write "${unapproved.get(w)[0]}"`);
      }
    }
    // multi-word unapproved phrases from the agent pack (1.1)
    if (pack !== null) {
      for (const [ph, ents] of pack.phrases) {
        if (flagged.has(ph) || glossaryTerms.has(ph) || !low.includes(ph)) continue;
        if (hasWord(ph, low) && !skip('1.1')) {
          flagged.add(ph);
          const a = alts(ents);
          add(rep, path, b.line, 'M', '1.1', `"${ph}" is not approved; write ${a.length ? a.join(', ') : helps(ents).join('; ') || 'a different construction (9.1)'}`);
        }
      }
    }
    const words = s.match(WORD_RE) ?? [];
    const seen = new Set();
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const lw = stripChars(w.toLowerCase(), "'-");
      if (seen.has(lw) || lw === '') continue;
      seen.add(lw);
      if (glossaryTerms.has(lw)) continue;
      if (unapproved.has(lw) && !lw.includes(' ')) {
        flagged.add(lw);
        if (!skip(unapproved.get(lw)[1])) add(rep, path, b.line, 'M', unapproved.get(lw)[1], `"${w}": write "${unapproved.get(lw)[0]}"`);
        continue;
      }
      if (lex === null) continue;
      if (lex.source === 'wordlist') {
        // STE_DICTIONARY word list: the pre-pack behavior, unchanged
        if (i > 0 && !/[A-Z]/.test(w[0]) && !lex.approved.has(lw) && !skip('1.1')) {
          if (!inTerms(lw, glossaryTerms) && !PLACEHOLDERS.has(lw)) add(rep, path, b.line, 'M', '1.1', `"${w}" is not in the STE dictionary or the glossary`);
        }
        continue;
      }
      // agent pack: full dictionary with alternatives
      if (PLACEHOLDERS.has(lw) || lw.length < 2 || lw.includes("'") || isUpper(w) || (i > 0 && /[A-Z]/.test(w[0]))) continue;
      if (inTerms(lw, glossaryTerms) || [...flagged].some((ph) => ph.includes(' ') && splitWords(ph).includes(lw))) continue;
      if (lex.approved.has(lw) || lex.technical.has(lw)) continue;
      const cands = stems(lw);
      if (cands.some((c) => glossaryTerms.has(c))) continue;
      if (cands.some((c) => lex.approved.has(c) || lex.technical.has(c))) continue;
      const hit = lex.unapproved.has(lw) ? lw : cands.find((c) => lex.unapproved.has(c));
      if (hit !== undefined) {
        if (flagged.has(hit) || flagged.has(lw) || blockReported.has(hit)) continue;
        flagged.add(hit);
        blockReported.add(hit);
        const ents = lex.unapproved.get(hit);
        const a = alts(ents);
        const poses = [...new Set(ents.map((e) => String(e.pos ?? '')))].sort().join('/');
        const selfTech = a.some((x) => altWord(x) === hit && (x.includes('(TN)') || x.includes('(TV)')));
        if (selfTech) {
          if (!skip('1.7')) add(rep, path, b.line, 'H', '1.7', `"${w}" is not approved as ${poses}; the dictionary permits it only as a technical noun or verb (glossary it if the project uses it that way)`);
        } else if (!skip('1.1')) {
          const altTxt = a.length ? a.join(', ') : helps(ents).join('; ') || 'no alternative listed; change the construction (9.1)';
          add(rep, path, b.line, 'M', '1.1', `"${w}" is not approved (${poses}); write ${altTxt}`);
        }
        continue;
      }
      // unknown to the dictionary: a technical-noun or technical-verb candidate. Reported once per file (1.5, 1.12).
      if (!rep.unknown.has(path)) rep.unknown.set(path, new Map());
      if (!rep.unknown.get(path).has(lw)) rep.unknown.get(path).set(lw, b.line);
    }
    // heuristics
    m = PASSIVE_RE.exec(s);
    if (m && !skip('3.6')) add(rep, path, b.line, 'H', '3.6', `possible passive voice: "${m[0]}"`);
    m = PROGRESSIVE_RE.exec(s);
    if (m && !skip('3.4')) add(rep, path, b.line, 'H', '3.4', `progressive tense: "${m[0]}"`);
    m = PERFECT_RE.exec(s);
    if (m && !skip('3.4')) add(rep, path, b.line, 'H', '3.4', `perfect tense: "${m[0]}"`);
    for (const w of words) {
      const lw = w.toLowerCase();
      const packIng = pack !== null && (pack.approved.has(lw) || pack.technical.has(lw));
      if (lw.endsWith('ing') && lw.length > 5 && !APPROVED_ING.has(lw) && !packIng && !glossaryTerms.has(lw) && !inTerms(lw, glossaryTerms)) {
        if (!skip('3.5')) add(rep, path, b.line, 'H', '3.5', `"-ing" form "${w}" (allowed only as a technical noun)`);
        break;
      }
    }
    m = PHRASAL_RE.exec(s);
    if (m && !glossaryTerms.has(m[0].toLowerCase()) && !skip('9.3')) add(rep, path, b.line, 'H', '9.3', `phrasal verb "${m[0]}"`);
    let run = [];
    let best = [];
    for (const w of [...words, '.']) {
      const lw = w.toLowerCase();
      if (/^[a-z]+$/.test(lw) && !FUNCTION_WORDS.has(lw) && !PLACEHOLDERS.has(lw)) run.push(w);
      else {
        if (run.length > best.length) best = run;
        run = [];
      }
    }
    if (best.length >= 4 && !glossaryTerms.has(best.join(' ').toLowerCase()) && !skip('2.1')) add(rep, path, b.line, 'H', '2.1', `possible noun cluster of ${best.length} words: "${best.join(' ')}"`);
    if (b.kind === 'item' && b.procedural) {
      const first = words.length ? words[0].toLowerCase() : '';
      if (si === 0 && words.length && !IMPERATIVE_SET.has(first) && !STEP_OK_STARTS.some((p) => low.startsWith(p)) && !skip('5.3')) {
        add(rep, path, b.line, 'H', '5.3', `step does not start with an imperative verb: "${head(s, 50)}"`);
      }
      if (TWO_INSTRUCTIONS_RE.test(low) && !skip('5.2')) add(rep, path, b.line, 'H', '5.2', 'two instructions in one sentence');
    }
    if (BARE_THIS_RE.test(strip(s)) && !skip('GR-4')) add(rep, path, b.line, 'H', 'GR-4', `sentence starts with a bare "${splitWords(s)[0]}"; name the noun`);
  });
}

function checkPath(p, rep, unapproved, lex, glossaryCache) {
  const docsRoot = findDocsRoot(p);
  if (!glossaryCache.has(docsRoot)) {
    const g = loadGlossaries(docsRoot);
    glossaryCache.set(docsRoot, [g.approved, g.unapproved]);
    const gpath = g.projectPath ?? g.orgPath ?? join(docsRoot, PROJECT_GLOSSARY_NAME);
    for (const c of g.conflicts) add(rep, gpath, 1, 'M', '1.8', `glossary conflict: ${c}`);
    // Notices are about the project file. With no _glossary.json, the only notice is the leftover 1.x YAML file.
    const npath = g.projectPath ?? g.legacyProjectPath ?? gpath;
    for (const n of g.notices) add(rep, npath, 1, 'H', '1.8', `glossary: ${n}`);
  }
  const [terms, glUnapproved] = glossaryCache.get(docsRoot);
  const name = basename(p);   // native separators: "/" everywhere, and "\" too on Windows
  const suffix = fileSuffix(name).toLowerCase();
  let blocks;
  let waivers;
  if (suffix === '.md') {
    const { fm, body, bodyStartLine } = readDoc(p);
    if (name === 'index.md' || name === 'log.md') return;
    const diataxis = valueText(fm.has('diataxis') ? fm.get('diataxis') : 'explanation').toLowerCase();
    const procedural = ['how-to', 'howto', 'tutorial'].includes(diataxis);
    [blocks, waivers] = markdownBlocks(body, bodyStartLine, procedural);
  } else if (SOURCE_EXT.has(suffix)) {
    blocks = sourceBlocks(p, SOURCE_EXT.get(suffix));
    waivers = new Map();
  } else return;
  for (const b of blocks) checkBlock(b, p, rep, unapproved, terms, glUnapproved, lex, waivers);
}

// ---------- reports ----------

const out = [];
const print = (s = '') => out.push(s);
const eprint = (s) => process.stderr.write(s + '\n');
const pad4 = (n) => String(n).padStart(4);

function glossaryReport(root) {
  const g = loadGlossaries(root);
  const terms = g.approved;
  const used = new Map();
  for (const p of sortPaths(rglobAll(root).filter((x) => x.endsWith('.md')))) {
    const { body } = readDoc(p);
    for (const m of body.matchAll(/`([^`\n]+)`/g)) {
      const k = strip(m[1]).toLowerCase();
      used.set(k, (used.get(k) ?? 0) + 1);
    }
  }
  const nOrg = [...terms].filter((t) => ['org', 'both'].includes(g.origin.get(t))).length;
  const nProj = [...terms].filter((t) => ['project', 'both'].includes(g.origin.get(t))).length;
  print(`org glossary: ${g.orgPath ?? 'none'} (${nOrg} terms)`);
  print(`project glossary: ${g.projectPath ?? 'none'} (${nProj} terms)`);
  print(`effective glossary terms: ${terms.size}`);
  for (const c of g.conflicts) print(`  CONFLICT: ${c}`);
  for (const n of g.notices) print(`  notice: ${n}`);
  const unused = [...terms].filter((t) => (used.get(t) ?? 0) === 0 && g.origin.get(t) === 'project').sort();
  print(`project terms no doc names in a code span: ${unused.length}`);
  for (const t of unused) print(`  ${t}`);
  // Highest count first. Ties sort alphabetically: 1.x left them in directory-scan order, which changes between machines.
  const ranked = [...used.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const cands = ranked.filter(([k]) => !terms.has(k) && new RegExp(`^[A-Za-z][\\p{L}\\p{N}_ .:-]*$`, 'u').test(k));
  print('code-span names not in the glossary (top 40 by count):');
  for (const [k, v] of cands.slice(0, 40)) print(`  ${pad4(v)}  ${k}`);
}

function status(lex) {
  const org = findOrgGlossary();
  if (org) {
    const n = new Set(parseGlossaryFile(org, 'org').map((e) => e.term)).size;
    print(`org glossary: ${org} (${n} terms; approved in every repo that runs this skill)`);
  } else print(`org glossary: none (create ${ORG_GLOSSARY_DEFAULT_STR} or set STE_ORG_GLOSSARY)`);
  if (lex === null) {
    print('STE word source: none. Rule 1.1 runs on the built-in non-STE list only (1.1 partial).');
    print(`Install the ASD-STE100 agent pack at ${PACK_DEFAULT} or set STE_AGENT_PACK=/path/to/pack.`);
    print('Without the pack, STE_DICTIONARY=/path/to/words.txt (one approved word per line) enables a word-list check.');
    print('See INSTALL.md, section "Add the ASD-STE100 agent pack".');
    return;
  }
  print(`STE word source: ${describeLexicon(lex)}`);
  if (lex.source === 'pack') {
    const cats = techCategories();
    const shown = [...cats].filter(([, v]) => v.size).map(([k, v]) => `${k} ${[...v].sort((a, b) => a - b).join(',')}`).join('; ');
    print(`technical categories permitted without a glossary entry: ${shown} (${lex.technical.size} example words). Override with STE_TECH_CATEGORIES.`);
    print(`multi-word unapproved phrases checked: ${lex.phrases.size}`);
  } else {
    print('This is a plain word list (STE_DICTIONARY). Any word not in it fails 1.1. The agent pack gives alternatives and technical-noun warnings instead.');
  }
}

function lookup(lex, words) {
  if (lex === null || lex.source !== 'pack') {
    eprint('ste_check --lookup needs the ASD-STE100 agent pack. Run ste_check.mjs --status.');
    return 2;
  }
  const catText = (cat) => cat.map(([k, n, t]) => `${k.toUpperCase()} ${n} ${t}`).join('; ');
  for (const raw of words) {
    const q = strip(raw).toLowerCase();
    let found = [...new Set(stems(q))].filter((c) => lex.entries.has(c));
    if (!found.length && q.includes(' ')) found = lex.entries.has(q) ? [q] : [];
    print(`== ${raw}`);
    if (!found.length) {
      const cat = lex.categories.get(q);
      if (cat) {
        print(`  not a dictionary word. Listed as an example in: ${catText(cat)}`);
        print('  Permitted as a technical noun (1.5) or technical verb (1.12) in that category. Add it to docs/_glossary.json.');
      } else {
        print('  not in the dictionary. Permitted only as a technical noun (1.5) or technical verb (1.12).');
        print('  If the project uses it, add it to docs/_glossary.json. Otherwise write an approved word.');
      }
      continue;
    }
    for (const base of found) {
      for (const e of lex.entries.get(base)) {
        const pos = e.pos ?? '?';
        if ('meanings' in e || 'forms' in e) {
          const forms = (e.forms ?? []).join(', ');
          print(`  ${e.word} (${pos}): approved.` + (forms ? ` Forms: ${forms}.` : ''));
          for (const m of e.meanings ?? []) {
            const isObj = m !== null && typeof m === 'object' && !Array.isArray(m);
            const mt = isObj ? m.meaning : String(m);
            if (mt) print(`    meaning: ${mt}`);
            if (isObj) for (const h of m.help ?? []) print(`    help: ${h}`);
          }
          for (const h of e.help ?? []) print(`    help: ${h}`);
        } else {
          const a = alts([e]);
          print(`  ${e.word} (${pos}): NOT approved.` + (a.length ? ` Write: ${a.join(', ')}.` : ''));
          for (const h of e.help ?? []) print(`    help: ${h}`);
        }
      }
      const cat = lex.categories.get(base);
      if (cat) print(`  Also listed as a technical-category example in: ${catText(cat)}`);
    }
  }
  return 0;
}

function main(argv) {
  if (!argv.length || argv[0] === '-h' || argv[0] === '--help') {
    print(USAGE);
    return 2;
  }
  if (argv[0] === '--glossary-report') {
    glossaryReport(purePath(argv[1] ?? 'docs'));
    return 0;
  }
  if (argv[0] === '--status') {
    status(loadLexicon());
    return 0;
  }
  if (argv[0] === '--lookup') {
    if (argv.length < 2) {
      eprint('usage: ste_check.mjs --lookup WORD...');
      return 2;
    }
    return lookup(loadLexicon(), argv.slice(1));
  }
  const unapproved = loadUnapproved();
  const lex = loadLexicon();
  const rep = newReport(lex);
  const files = [];
  const extOk = (x) => {
    const s = fileSuffix(basename(x)).toLowerCase();
    return s === '.md' || SOURCE_EXT.has(s);
  };
  for (const a of argv) {
    const p = purePath(a);
    if (isDir(p)) files.push(...sortPaths(rglobAll(p).filter((x) => isFile(x) && extOk(x) && !pathParts(x).includes('tickets'))));
    else if (exists(p)) files.push(p);
    else {
      eprint(`ste_check: no such path ${a}`);
      return 2;
    }
  }
  const cache = new Map();
  for (const f of files) checkPath(f, rep, unapproved, lex, cache);
  for (const [path, words] of rep.unknown) { // one heuristic finding per file for the technical-noun candidates
    const ordered = [...words.keys()].sort((a, b) => words.get(a) - words.get(b) || (a < b ? -1 : a > b ? 1 : 0));
    const shown = ordered.slice(0, 40).join(', ') + (ordered.length > 40 ? `, +${ordered.length - 40} more` : '');
    add(rep, path, Math.min(...words.values()), 'H', '1.5', `${ordered.length} words not in the STE dictionary (technical-noun or technical-verb candidates: glossary them or replace them): ${shown}`);
  }
  const mech = rep.findings.filter((f) => f.kind === 'M');
  const heur = rep.findings.filter((f) => f.kind === 'H');
  const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
  for (const f of [...rep.findings].sort((x, y) => cmpPath(x.path, y.path) || x.line - y.line || cmp(x.kind, y.kind))) print(`${f.path}:${f.line}: [${f.kind}] ${f.rule}: ${f.msg}`);
  const byRule = new Map();
  for (const f of heur) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1);
  const heurSummary = [...byRule.entries()].sort((x, y) => cmp(x[0], y[0])).map(([r, n]) => `${r}=${n}`).join(', ');
  print(`\nste_check: ${files.length} files, ${rep.sentences} sentences, ${mech.length} mechanical, ${heur.length} heuristic` + (heurSummary ? ` (${heurSummary})` : '') + `, ${rep.waivers} waived, dictionary=${rep.dictionary ? rep.source : 'no (1.1 partial)'}`);
  if (mech.length) {
    print(`Docs-STE: fail(${mech.length} mechanical)`);
    return 1;
  }
  print('Docs-STE: ' + (heur.length ? `warn(${heur.length} heuristic)` : 'pass') + (rep.dictionary ? '' : ' (1.1 partial)'));
  return 0;
}

// Findings sort by path string (not path segments), as the 1.x tuple sort did.
const cmpPath = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

let code;
try {
  code = main(process.argv.slice(2));
} catch (e) {
  // Any error stops the run with exit 2, after the findings collected so far (see docs_check.mjs).
  if (e instanceof GlossaryError || e instanceof FileReadError) {
    eprint(`ste_check: ${e.message}`);
  } else {
    eprint(`ste_check: unexpected error: ${e?.message ?? e}`);
    eprint(`${e?.stack ?? e}`);
  }
  code = 2;
}
process.stdout.write(out.length ? out.join('\n') + '\n' : '');
process.exitCode = code;
