// File-system helpers. Path order, suffixes, and directory walks behave as in 1.x.

import { existsSync, readdirSync, realpathSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

export function isDir(p) {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export const exists = existsSync;

/** Path.resolve(): follow symlinks for the part that exists, keep the rest as written. Never throws. */
export function resolvePath(p) {
  let cur = resolve(p);
  const rest = [];
  for (;;) {
    try {
      return rest.length ? join(realpathSync.native(cur), ...rest.reverse()) : realpathSync.native(cur);
    } catch {
      const parent = dirname(cur);
      if (parent === cur) return resolve(p);
      rest.push(basename(cur));
      cur = parent;
    }
  }
}

/** Path.parts for an absolute path, as separate segments. */
export function pathParts(p) {
  return p.split(sep).filter((s) => s !== '');
}

/** Orders paths by their segments, not by the joined string ("a/b" sorts before "a-b"). */
export function comparePaths(a, b) {
  const x = a.split(sep);
  const y = b.split(sep);
  for (let i = 0; i < Math.min(x.length, y.length); i++) {
    if (x[i] < y[i]) return -1;
    if (x[i] > y[i]) return 1;
  }
  return x.length - y.length;
}

export const sortPaths = (paths) => [...paths].sort(comparePaths);

/** Path.suffix: the text after the last dot, empty for dotfiles and trailing dots. */
export function fileSuffix(name) {
  const i = name.lastIndexOf('.');
  return i <= 0 || i === name.length - 1 ? '' : name.slice(i);
}

/**
 * Path.rglob(pattern) for a "*.ext" pattern: every file or symlink under dir whose name ends with the
 * extension. Symlinked directories are not entered. Unsorted.
 */
export function rglobExt(dir, ext) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      if (e.name.endsWith(ext)) out.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out;
}

export function listDir(dir) {
  try {
    return readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

/** Normalizes a path string: drops "." segments and repeated or trailing separators, keeps ".." as written. */
export function purePath(p) {
  if (p === '') return '.';
  const abs = p.startsWith('/') || p.startsWith(sep);
  const segs = p.split(sep === '\\' ? /[\\/]/ : '/').filter((s) => s !== '' && s !== '.');
  return (abs ? sep : '') + (segs.join(sep) || (abs ? '' : '.'));
}

/** Path.rglob("*"): every file and directory under dir, as dir joined with the relative path. Symlinked directories are not entered. */
export function rglobAll(dir) {
  const out = [];
  const walk = (d) => {
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const p = join(d, e.name);
      out.push(p);
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out;
}
