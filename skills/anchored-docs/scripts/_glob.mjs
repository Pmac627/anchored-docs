// Shell-pattern matching and directory globbing, so that `sources` globs behave as they did in 1.x.
//
// Differences kept on purpose:
//   - Matching is always case-sensitive, for wildcard and literal segments, on every file system. 1.x matched
//     case-insensitively on Windows, and for literal segments on macOS.
//   - A trailing "**" matches directories only, as in 1.x.

import { join } from 'node:path';
import { isDir, exists, listDir } from './_fs.mjs';

const SYNTAX = new Set(['\\', '^', '$', '.', '*', '+', '?', '(', ')', '[', ']', '{', '}', '|', '/']);
const escapeChar = (c) => (SYNTAX.has(c) ? '\\' + c : c);

/** A shell pattern (*, ?, [set], [!set]) as a JavaScript regex source. "*" and "?" match any character, "/" included. */
export function fnmatchTranslate(pat) {
  const chars = Array.from(pat);
  const n = chars.length;
  const out = [];
  let i = 0;
  while (i < n) {
    const c = chars[i++];
    if (c === '*') {
      if (out[out.length - 1] !== '[\\s\\S]*') out.push('[\\s\\S]*');
    } else if (c === '?') {
      out.push('[\\s\\S]');
    } else if (c === '[') {
      let j = i;
      if (j < n && chars[j] === '!') j++;
      if (j < n && chars[j] === ']') j++;
      while (j < n && chars[j] !== ']') j++;
      if (j >= n) {
        out.push('\\[');
      } else {
        let stuff = chars.slice(i, j).join('');
        if (!stuff.includes('-')) {
          stuff = stuff.replaceAll('\\', '\\\\');
        } else {
          const chunks = [];
          let k = chars[i] === '!' ? i + 2 : i + 1;
          let start = i;
          for (;;) {
            k = chars.indexOf('-', k);
            if (k < 0 || k >= j) break;
            chunks.push(chars.slice(start, k).join(''));
            start = k + 1;
            k += 3;
          }
          const chunk = chars.slice(start, j).join('');
          if (chunk) chunks.push(chunk);
          else chunks[chunks.length - 1] += '-';
          for (let m = chunks.length - 1; m > 0; m--) {
            if (chunks[m - 1].slice(-1) > chunks[m][0]) {
              chunks[m - 1] = chunks[m - 1].slice(0, -1) + chunks[m].slice(1);
              chunks.splice(m, 1);
            }
          }
          stuff = chunks.map((s) => s.replaceAll('\\', '\\\\').replaceAll('-', '\\-')).join('-');
        }
        stuff = stuff.replaceAll(']', '\\]');
        i = j + 1;
        if (!stuff) out.push('(?!)');
        else if (stuff === '!') out.push('[\\s\\S]');
        else {
          if (stuff[0] === '!') stuff = '^' + stuff.slice(1);
          else if (stuff[0] === '^' || stuff[0] === '[') stuff = '\\' + stuff;
          out.push(`[${stuff}]`);
        }
      }
    } else {
      out.push(escapeChar(c));
    }
  }
  return out.join('');
}

const cache = new Map();

/** True when name matches the shell pattern, case-sensitively. */
export function fnmatchcase(name, pattern) {
  let re = cache.get(pattern);
  if (!re) {
    re = new RegExp(`^${fnmatchTranslate(pattern)}$`, 'u');
    cache.set(pattern, re);
  }
  return re.test(name);
}

const isWildcard = (seg) => seg.includes('*') || seg.includes('?') || seg.includes('[');

/** dir and every folder under it, or nothing when dir is not a folder. */
function subdirs(dir) {
  if (!isDir(dir)) return [];
  const out = [dir];
  const walk = (d) => {
    for (const e of listDir(d)) {
      if (e.isDirectory()) {
        const p = join(d, e.name);
        out.push(p);
        walk(p);
      }
    }
  };
  walk(dir);
  return out;
}

/** True when Path(root).glob(pattern) would yield at least one path. Absolute or empty patterns match nothing. */
export function globExists(root, pattern) {
  if (pattern.startsWith('/') || /^[A-Za-z]:[\\/]/.test(pattern)) return false;
  const segs = pattern.split('/').filter((s) => s !== '' && s !== '.');
  if (segs.length === 0) return false;
  const dirOnly = pattern.endsWith('/');
  const walk = (dir, idx) => {
    const seg = segs[idx];
    const last = idx === segs.length - 1;
    if (seg === '**') {
      for (const d of subdirs(dir)) {
        if (last || walk(d, idx + 1)) return true;
      }
      return false;
    }
    if (isWildcard(seg)) {
      for (const e of listDir(dir)) {
        if (!fnmatchcase(e.name, seg)) continue;
        const p = join(dir, e.name);
        if (last) {
          if (!dirOnly || isDir(p)) return true;
          continue;
        }
        if (isDir(p) && walk(p, idx + 1)) return true;
      }
      return false;
    }
    // Compare the name exactly instead of asking the file system, which ignores case on Windows and macOS.
    if (seg !== '..' && !listDir(dir).some((e) => e.name === seg)) return false;
    const p = join(dir, seg);
    if (!exists(p)) return false;
    return last ? !dirOnly || isDir(p) : isDir(p) && walk(p, idx + 1);
  };
  return walk(root, 0);
}

/** Parses an ISO 8601 date or date-time in extended form, or YYYYMMDD. Returns null for anything else. */
const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:([^])(\d{2})(?::(\d{2})(?::(\d{2})(?:[.,](\d+))?)?)?(?:([+-])(\d{2})(?::?(\d{2})(?::?(\d{2}))?)?)?)?$/u;

export function parseIso(text) {
  const t = text.replaceAll('Z', '+00:00');
  const basic = /^(\d{4})(\d{2})(\d{2})$/.exec(t);   // YYYYMMDD; other basic forms are not supported
  const m = ISO.exec(basic ? `${basic[1]}-${basic[2]}-${basic[3]}` : t);
  if (!m) return null;
  const [, Y, Mo, D, , h = '0', mi = '0', s = '0', frac = '', sign, th = '0', tm = '0', ts = '0'] = m;
  const y = +Y, mon = +Mo, d = +D, hh = +h, mm = +mi, ss = +s;
  if (y < 1 || mon < 1 || mon > 12 || d < 1 || hh > 23 || mm > 59 || ss > 59 || +th > 23 || +tm > 59 || +ts > 59) return null;
  const probe = new Date(0);
  probe.setUTCFullYear(y, mon - 1, d);
  if (probe.getUTCMonth() !== mon - 1 || probe.getUTCDate() !== d) return null;
  probe.setUTCHours(hh, mm, ss, Math.floor(Number(frac.padEnd(6, '0').slice(0, 6)) / 1000));
  const offset = sign ? (sign === '-' ? -1 : 1) * ((+th * 60 + +tm) * 60 + +ts) * 1000 : 0;
  return { ms: probe.getTime() - offset, date: `${Y}-${Mo}-${D}` };
}
