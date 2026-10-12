// Branch coverage for _migrate.mjs: the link rewrite edge cases, the back-link forms, the leftover report filters,
// describePlan for every status, the log helpers, and the git fallback. Every test writes its own files with LF line
// endings, so the result does not depend on how the fixture was checked out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, describePlan, logWithEntry, planMigration } from '../../skills/anchored-docs/scripts/_migrate.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'fixtures', 'repo-legacy');

/** Runs fn on a fresh copy of the 2.0 fixture, then removes the copy. */
function withLegacyCopy(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-migb-'));
  try {
    const repo = join(td, 'repo');
    cpSync(FIXTURE, repo, { recursive: true });
    return fn(repo);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

const write = (repo, rel, text) => {
  mkdirSync(dirname(join(repo, rel)), { recursive: true });
  writeFileSync(join(repo, rel), text);
};
const read = (repo, rel) => readFileSync(join(repo, rel), 'utf8');

/** A skill concept doc: it has a type and a sources list, so it moves with the bundle. */
const concept = (title, body) => `---\ntype: Flow\ntitle: ${title}\ndescription: A test doc.\nsources:\n  - id: a\n    resource: src/Orders/OrderService.cs\n---\n${body}`;

const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

test('files without an extension are neither rewritten nor scanned for leftovers', () => {
  withLegacyCopy((repo) => {
    write(repo, 'Makefile', 'docs: docs/flows/ingest.md\n');
    write(repo, 'docs/guides/NOTES', 'plain notes\n');
    const plan = planMigration(repo);
    assert.equal(plan.status, 'ready');
    assert.ok(plan.stays.includes('docs/guides/NOTES'));
    assert.ok(!plan.leftovers.some((l) => l.startsWith('Makefile:')), plan.leftovers.join('\n'));
    applyPlan(plan, '2026-10-11');
    assert.equal(read(repo, 'Makefile'), 'docs: docs/flows/ingest.md\n');
  });
});

test('a file with LF line endings is written back with LF line endings', () => {
  withLegacyCopy((repo) => {
    write(repo, 'README.md', '# Repo\n\nSee [it](docs/flows/ingest.md).\n');
    applyPlan(planMigration(repo), '2026-10-11');
    assert.equal(read(repo, 'README.md'), '# Repo\n\nSee [it](docs/anchored-docs/flows/ingest.md).\n');
  });
});

test('external links and bundle-root links in files outside docs/ are left alone', () => {
  withLegacyCopy((repo) => {
    const text = '[web](https://example.com/docs/flows/ingest.md) [mail](mailto:a@b.c) [call](tel:123) [root](/flows/index.md)\n';
    write(repo, 'README.md', text);
    const plan = planMigration(repo);
    assert.equal(plan.status, 'ready');
    assert.ok(!plan.edits.has(join(repo, 'README.md')));
    applyPlan(plan, '2026-10-11');
    assert.equal(read(repo, 'README.md'), text);
  });
});

test('a moved doc keeps bundle-root links inside the bundle, and makes a link to a staying file relative', () => {
  withLegacyCopy((repo) => {
    write(
      repo,
      'docs/flows/links.md',
      concept('Links', '# Links\n\n[in](/flows/ingest.md) [out](/guides/deploy.md) [here](.) [dir](./) [pic](pic.png)\n'),
    );
    applyPlan(planMigration(repo), '2026-10-11');
    const text = read(repo, join('docs', 'anchored-docs', 'flows', 'links.md')).replace(/\r\n/g, '\n');
    assert.ok(text.includes('[in](/flows/ingest.md)'), text);
    assert.ok(text.includes('[out](../../guides/deploy.md)'), text);
    assert.ok(text.includes('[here](.)'), text);
    assert.ok(text.includes('[dir](./)'), text);
    assert.ok(text.includes('[pic](../../flows/pic.png)'), text);
  });
});

test('back-links in source files: relative, deep repo-relative, unknown, unmoved, and without a docs path', () => {
  withLegacyCopy((repo) => {
    write(
      repo,
      'src/Orders/Extra.cs',
      [
        '/// <seealso href="../../docs/flows/ingest.md"/>',
        '/// <seealso href="some/prefix/docs/flows/ingest.md"/>',
        '/// <seealso href="docs/missing.md"/>',
        '/// <seealso href="docs/guides/deploy.md"/>',
        '/// @see OtherThing',
        'public class Extra { }',
        '',
      ].join('\n'),
    );
    const plan = planMigration(repo);
    assert.equal(plan.status, 'ready');
    applyPlan(plan, '2026-10-11');
    assert.equal(
      read(repo, join('src', 'Orders', 'Extra.cs')),
      [
        '/// <seealso href="../../docs/anchored-docs/flows/ingest.md"/>',
        '/// <seealso href="docs/anchored-docs/flows/ingest.md"/>',
        '/// <seealso href="docs/missing.md"/>',
        '/// <seealso href="docs/guides/deploy.md"/>',
        '/// @see OtherThing',
        'public class Extra { }',
        '',
      ].join('\n'),
    );
  });
});

test('the leftover report lists a moved path in a plain text file, and skips other file kinds', () => {
  withLegacyCopy((repo) => {
    write(repo, 'notes/todo.txt', 'See docs/flows/ingest.md for details\n');
    write(repo, 'assets/logo.png', 'docs/flows/ingest.md\n');
    write(repo, 'tools/_map.json', '{"path":"docs/flows/ingest.md"}\n');
    const plan = planMigration(repo);
    assert.ok(plan.leftovers.includes('notes/todo.txt:1: See docs/flows/ingest.md for details'), plan.leftovers.join('\n'));
    assert.ok(!plan.leftovers.some((l) => l.startsWith('assets/logo.png:')), plan.leftovers.join('\n'));
    assert.ok(plan.leftovers.some((l) => l.startsWith('tools/_map.json:1:')), plan.leftovers.join('\n'));
    assert.ok(!plan.leftovers.some((l) => l.startsWith('docs/_map.json:')), plan.leftovers.join('\n'));
  });
});

test('a map already in the bundle folder is not a leftover, and its destination is a conflict', () => {
  withLegacyCopy((repo) => {
    write(repo, 'docs/anchored-docs/_map.json', '{"path":"docs/flows/ingest.md"}\n');
    const plan = planMigration(repo);
    assert.equal(plan.status, 'conflict');
    assert.deepEqual(plan.conflicts, ['docs/anchored-docs/_map.json']);
    assert.ok(!plan.leftovers.some((l) => l.startsWith('docs/anchored-docs/_map.json:')), plan.leftovers.join('\n'));
  });
});

test('describePlan reports a repository with no docs folder, and a docs folder with nothing to move', () => {
  withLegacyCopy((repo) => {
    rmSync(join(repo, 'docs'), { recursive: true, force: true });
    assert.deepEqual(describePlan(planMigration(repo), false), ['migrate: no docs/ folder. Nothing to move.']);
    mkdirSync(join(repo, 'docs'));
    write(repo, 'docs/guide.md', '# Guide\n');
    assert.deepEqual(describePlan(planMigration(repo), true), [
      'migrate: nothing to move. The bundle is already in docs/anchored-docs/, or docs/ has none.',
    ]);
  });
});

test('describePlan lists the conflicts and stops', () => {
  withLegacyCopy((repo) => {
    write(repo, 'docs/anchored-docs/flows/ingest.md', '# Someone else\n');
    const lines = describePlan(planMigration(repo), true);
    assert.deepEqual(lines, [
      'migrate: docs/ -> docs/anchored-docs/',
      'migrate: stopped. These destinations already exist, so nothing was moved:',
      '  docs/anchored-docs/flows/ingest.md',
      'Resolve the conflicts by hand, then run again.',
    ]);
  });
});

test('describePlan lists the leftovers, and names the move method when it applies', () => {
  withLegacyCopy((repo) => {
    write(repo, 'notes/todo.txt', 'See docs/flows/ingest.md for details\n');
    const plan = planMigration(repo);
    assert.equal(plan.status, 'ready');
    const dry = describePlan(plan, false);
    assert.ok(dry.includes('still names a moved path, check by hand (1):'), dry.join('\n'));
    assert.ok(dry.includes('  notes/todo.txt:1: See docs/flows/ingest.md for details'), dry.join('\n'));
    assert.equal(dry.at(-1), 'dry run: nothing changed. Run again with --apply.');
    assert.equal(describePlan({ ...plan, git: false }, true).at(-1), 'git: not a git work tree; files are renamed.');
    assert.equal(describePlan({ ...plan, git: true }, true).at(-1), 'git: files move with git mv, so history follows them.');
  });
});

test('logWithEntry appends a group to a log that has no dated group yet', () => {
  assert.equal(
    logWithEntry('# Docs update log\n', 'Moved.', '2026-10-11'),
    '# Docs update log\n\n## 2026-10-11\n\n* **Update**: Moved.\n',
  );
});

test('apply creates the log when the bundle has none', () => {
  withLegacyCopy((repo) => {
    rmSync(join(repo, 'docs', 'log.md'));
    const plan = planMigration(repo);
    assert.equal(plan.status, 'ready');
    assert.equal(plan.moves.length, 9);
    assert.equal(applyPlan(plan, '2026-10-11'), 9);
    const log = read(repo, join('docs', 'anchored-docs', 'log.md'));
    assert.ok(!log.includes('\r'));
    assert.ok(log.startsWith('# Docs update log\n\n## 2026-10-11\n\n* **Update**: Moved 9 bundle file(s)'), log);
  });
});

test('files that git does not track are renamed when git mv fails', { skip: !hasGit && 'git is not installed' }, () => {
  withLegacyCopy((repo) => {
    // The repository exists, but nothing is added to it, so git mv rejects every file.
    const init = spawnSync('git', ['-C', repo, 'init', '-q'], { encoding: 'utf8' });
    assert.equal(init.status, 0, init.stderr);
    const plan = planMigration(repo);
    assert.equal(plan.git, true);
    assert.equal(applyPlan(plan, '2026-10-11'), 10);
    assert.ok(existsSync(join(repo, 'docs', 'anchored-docs', 'flows', 'ingest.md')));
    assert.ok(!existsSync(join(repo, 'docs', 'flows')));
  });
});
