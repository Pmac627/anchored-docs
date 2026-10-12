// _fs.mjs: the file tests and folder walks must treat a missing path as empty, not as an error.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { mock } from 'node:test';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { isFile, isDir, rglobExt, rglobAll, purePath, resolvePath } from '../../skills/anchored-docs/scripts/_fs.mjs';

function withTemp(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-fs-'));
  try {
    return fn(td);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

test('isFile is true for a file, and false for a folder or a missing path', () => {
  withTemp((td) => {
    const file = join(td, 'a.md');
    writeFileSync(file, 'x\n');
    mkdirSync(join(td, 'folder'));
    assert.equal(isFile(file), true);
    assert.equal(isFile(join(td, 'folder')), false);
    assert.equal(isFile(join(td, 'missing.md')), false);
    assert.equal(isDir(join(td, 'missing')), false);
  });
});

test('the folder walks return nothing for a folder that does not exist', () => {
  withTemp((td) => {
    const missing = join(td, 'missing');
    assert.deepEqual(rglobExt(missing, '.md'), []);
    assert.deepEqual(rglobAll(missing), []);
  });
});

test('purePath gives "." for empty or dot-only input, and the bare separator for a lone slash', () => {
  assert.equal(purePath(''), '.');
  assert.equal(purePath('.'), '.');
  assert.equal(purePath('/'), sep);
});

test('purePath drops "." segments, repeated separators, and a trailing separator', () => {
  assert.equal(purePath('a/./b//c/'), ['a', 'b', 'c'].join(sep));
});

test('resolvePath returns the path as given when the file system cannot resolve it', () => {
  const realNative = realpathSync.native;
  mock.method(realpathSync, 'native', () => {
    throw new Error('no file system');
  });
  try {
    const p = join('some', 'missing', 'path');
    assert.equal(resolvePath(p), resolve(p));
  } finally {
    mock.restoreAll();
    assert.equal(realpathSync.native, realNative);
  }
});
