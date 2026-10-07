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
