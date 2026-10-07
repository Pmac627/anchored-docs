// A reader that closes the pipe early, as `| head` does, must not make a script crash or change its exit code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPTS = join(HERE, '..', '..', 'skills', 'anchored-docs', 'scripts');
const ENV = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STE_')));

/** Runs the script, reads one chunk of stdout, then closes the pipe. Resolves with the exit code and stderr. */
function runAndCloseEarly(script, args, cwd) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [join(SCRIPTS, script), ...args], { cwd, env: ENV });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    child.stdout.once('data', () => child.stdout.destroy());
    child.on('close', (code) => done({ code, err }));
  });
}

test('docs_check and ste_check exit normally, with no stack trace, when stdout closes early', async () => {
  const td = mkdtempSync(join(tmpdir(), 'ad-pipe-'));
  try {
    // Enough findings for the report to be larger than a pipe buffer.
    mkdirSync(join(td, 'docs', 'flows'), { recursive: true });
    for (let i = 0; i < 3000; i++) writeFileSync(join(td, 'docs', 'flows', `a-long-file-name-so-the-report-fills-the-pipe-${i}.md`), 'The data was created by the job.\n');

    for (const [script, args] of [['docs_check.mjs', ['okf', 'docs']], ['ste_check.mjs', ['docs']]]) {
      const full = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { cwd: td, env: ENV, encoding: 'utf8', maxBuffer: 1 << 28 });
      assert.ok(full.stdout.length > 1 << 17, `${script} output is too small to fill a pipe`);
      const r = await runAndCloseEarly(script, args, td);
      assert.doesNotMatch(r.err, /EPIPE|Unhandled|\n\s+at /, script);
      assert.equal(r.code, full.status, script);
    }
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
});
