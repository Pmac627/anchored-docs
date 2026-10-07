// Text rules shared by the anchored-docs scripts.
//
// The output text depends on exact rules for whitespace, line breaks, newline handling in file reads, and the
// format of lists and mappings in messages. These rules are fixed by the 1.x output, so reports and the parity
// tests stay stable across versions.
// These helpers keep the 2.0 output identical, so the self-report and the parity tests stay stable.

import { readFileSync } from 'node:fs';

// The whitespace set for every strip and split in the scripts. JavaScript's trim() differs (it also strips U+FEFF
// and does not strip U+001C to U+001F or U+0085).
export const WHITESPACE = ' \\t\\n\\r\\f\\v\\x1c-\\x1f\\x85\\xa0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000';
const WS_CHAR = new RegExp(`^[${WHITESPACE}]$`);

// Index scans, not a [ws]+$ regex: that regex retries from every start position of an inner whitespace
// run, which is quadratic on long runs. Every whitespace character is in the BMP, so one code unit is enough.
function endOfText(s) {
  let end = s.length;
  while (end > 0 && WS_CHAR.test(s[end - 1])) end--;
  return end;
}

export function strip(s) {
  const end = endOfText(s);
  let start = 0;
  while (start < end && WS_CHAR.test(s[start])) start++;
  return s.slice(start, end);
}

export const stripEnd = (s) => s.slice(0, endOfText(s));

/** Removes the given BMP characters from both ends, in linear time. */
export function stripChars(s, chars) {
  let start = 0;
  let end = s.length;
  while (start < end && chars.includes(s[start])) start++;
  while (end > start && chars.includes(s[end - 1])) end--;
  return s.slice(start, end);
}

const LINE_BREAK = /\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/;

/** Splits on every line-break character (not only \n). No empty last element when the text ends with a line break. */
export function splitlines(text) {
  const parts = text.split(LINE_BREAK);
  if (parts.length > 0 && parts[parts.length - 1] === '') parts.pop();
  return parts;
}

/**
 * Reads a file as UTF-8 with replacement characters, and with CRLF and lone CR changed to LF.
 * A byte order mark is kept.
 */
export function readText(path) {
  let buf;
  try {
    buf = readFileSync(path);
  } catch (e) {
    throw new FileReadError(path, e);
  }
  return buf.toString('utf8').replace(/\r\n?/g, '\n');
}

/** A file the scripts need could not be read (a directory, a broken link, no permission). The message names the file. */
export class FileReadError extends Error {
  constructor(path, cause) {
    super(`${path}: cannot read (${cause.code ?? cause.message})`, { cause });
    this.name = 'FileReadError';
    this.code = cause.code;
  }
}

/**
 * Writes the report to stdout. A reader that closes the pipe early, such as `| head`, is not an error: the
 * rest of the report is dropped and the exit code stays the one the checks gave.
 */
export function writeReport(text) {
  process.stdout.on('error', (e) => {
    if (e.code !== 'EPIPE') throw e;
  });
  process.stdout.write(escapeControls(text));
}

// C0 and C1 controls other than tab and line feed, DEL, and the bidirectional overrides and isolates.
const CONTROL = /[\x00-\x08\x0b-\x1f\x7f-\x9f‪-‮⁦-⁩]/g;

/**
 * Shows each control character as an escape (ESC becomes "\x1b", U+202E becomes "‮"). The reports
 * repeat text from docs and code; a raw escape sequence there could change the terminal, or hide or reorder
 * text, for the person or agent that reads the report.
 */
export function escapeControls(text) {
  return text.replace(CONTROL, (c) => {
    const n = c.charCodeAt(0);
    return n <= 0xff ? `\\x${n.toString(16).padStart(2, '0')}` : `\\u${n.toString(16).padStart(4, '0')}`;
  });
}

const NON_PRINTABLE = /[\p{C}\p{Zl}\p{Zp}\p{Zs}]/u;

function reprString(s) {
  const quote = s.includes("'") && !s.includes('"') ? '"' : "'";
  let out = quote;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (ch === quote || ch === '\\') out += '\\' + ch;
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (ch !== ' ' && NON_PRINTABLE.test(ch)) {
      if (cp <= 0xff) out += '\\x' + cp.toString(16).padStart(2, '0');
      else if (cp <= 0xffff) out += '\\u' + cp.toString(16).padStart(4, '0');
      else out += '\\U' + cp.toString(16).padStart(8, '0');
    } else out += ch;
  }
  return out + quote;
}

/** Formats a parsed value for a message: None, True, False, numbers, 'quoted' text, [lists], {mappings}, as 1.x printed them. */
export function formatValue(v) {
  if (v === null || v === undefined) return 'None';
  if (v === true) return 'True';
  if (v === false) return 'False';
  if (typeof v === 'number') return String(v);
  if (typeof v === 'string') return reprString(v);
  if (Array.isArray(v)) return '[' + v.map(formatValue).join(', ') + ']';
  if (v instanceof Set) return v.size ? '{' + [...v].map(formatValue).join(', ') + '}' : 'set()';
  const entries = v instanceof Map ? [...v.entries()] : Object.entries(v);
  return '{' + entries.map(([k, val]) => `${formatValue(k)}: ${formatValue(val)}`).join(', ') + '}';
}

/** A value as message text: a string stays as it is, every other value uses formatValue. */
export function valueText(v) {
  return typeof v === 'string' ? v : formatValue(v);
}

/** Pads with spaces to a width counted in code points, not UTF-16 units. */
export function padCodePoints(s, width) {
  const n = Array.from(s).length;
  return n >= width ? s : s + ' '.repeat(width - n);
}

const PATH_CHAR = /^[\p{L}\p{N}_.-]$/u;
const WORD_CHAR = /^[\p{L}\p{N}_]$/u;
const DIGIT_CHAR = /^\p{Nd}$/u;

/**
 * Replaces every path-like token with `rep`. The result is the same as
 *   text.replace(/(?<![\p{L}\p{N}_])(?:\.{0,2}\/)?[\p{L}\p{N}_.-]+(?:\/[\p{L}\p{N}_.-]+)+(?::\p{Nd}+)?/gu, rep)
 * but the time is linear. That regex starts again at every "." and "-" of a run and reads to the end of
 * the run each time, which is quadratic on a long run of dots or dashes.
 */
export function replacePaths(text, rep) {
  if (!text.includes('/')) return text;   // every match contains a "/"
  const cps = Array.from(text);
  const n = cps.length;
  const isPath = cps.map((c) => PATH_CHAR.test(c));

  // runEnd[i]: the first index at or after i that is not a path character.
  const runEnd = new Int32Array(n + 1);
  runEnd[n] = n;
  for (let i = n - 1; i >= 0; i--) runEnd[i] = isPath[i] ? runEnd[i + 1] : i;

  // A greedy [path]+ that starts at q always stops at runEnd[q], and "/" is not a path character, so the
  // rest of the pattern matches only when "/" and a path character come next. Returns the match end or -1.
  const matchFrom = (q) => {
    if (q >= n || !isPath[q]) return -1;
    let e = runEnd[q];
    if (!(cps[e] === '/' && isPath[e + 1])) return -1;
    while (cps[e] === '/' && isPath[e + 1]) e = runEnd[e + 1];
    if (cps[e] === ':' && e + 1 < n && DIGIT_CHAR.test(cps[e + 1])) {
      e++;
      while (e < n && DIGIT_CHAR.test(cps[e])) e++;
    }
    return e;
  };

  const out = [];
  let last = 0;
  let p = 0;
  while (p < n) {
    let end = -1;
    if (p === 0 || !WORD_CHAR.test(cps[p - 1])) {
      // The optional prefix \.{0,2}/ is greedy: try two dots, then one, then none, then no prefix.
      let dots = 0;
      while (dots < 2 && cps[p + dots] === '.') dots++;
      for (let j = dots; j >= 0 && end < 0; j--) {
        if (cps[p + j] === '/') end = matchFrom(p + j + 1);
      }
      if (end < 0) end = matchFrom(p);
    }
    if (end < 0) {
      p++;
      continue;
    }
    out.push(cps.slice(last, p).join(''), rep);
    last = p = end;
  }
  out.push(cps.slice(last).join(''));
  return out.join('');
}
