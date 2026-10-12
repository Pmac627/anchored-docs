// Behavior of the 2.1 bundle location and the migrate command: where the bundle lives, what moves, which links change.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, describePlan, logWithEntry, planMigration } from '../../skills/anchored-docs/scripts/_migrate.mjs';
import { findDocsRoot, resolveBundle } from '../../skills/anchored-docs/scripts/_fm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'fixtures', 'repo-legacy');

/** Runs fn on a fresh copy of the 2.0 fixture, then removes the copy. */
function withLegacyCopy(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-mig-'));
  try {
    const repo = join(td, 'repo');
    cpSync(FIXTURE, repo, { recursive: true });
    return fn(repo);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

const read = (repo, rel) => readFileSync(join(repo, rel), 'utf8');

test('a 2.0 bundle in docs/ is planned as one move into docs/anchored-docs/, with the human files left in place', () => {
  withLegacyCopy((repo) => {
    const plan = planMigration(repo);
    assert.equal(plan.status, 'ready');
    const moved = plan.moves.map((m) => m.from.slice(join(repo, 'docs').length + 1).split('\\').join('/')).sort();
    assert.deepEqual(moved, [
      '_glossary.json',
      '_map.json',
      'decisions/0001-use-queue.md',
      'decisions/index.md',
      'flows/index.md',
      'flows/ingest.md',
      'flows/order-fulfillment.md',
      'index.md',
      'log.md',
      'overview.md',
    ]);
    assert.deepEqual(plan.stays.sort(), ['docs/guides/deploy.md', 'docs/tickets/scratch.md']);
  });
});

test('a dry run changes nothing on disk', () => {
  withLegacyCopy((repo) => {
    const before = read(repo, 'README.md');
    const plan = planMigration(repo);
    const lines = describePlan(plan, false);
    assert.ok(lines.some((l) => l.startsWith('dry run: nothing changed')));
    assert.equal(read(repo, 'README.md'), before);
    assert.ok(existsSync(join(repo, 'docs', 'flows', 'ingest.md')));
    assert.ok(!existsSync(join(repo, 'docs', 'anchored-docs')));
  });
});

test('apply moves the bundle and rewrites every link that points at it', () => {
  withLegacyCopy((repo) => {
    const moved = applyPlan(planMigration(repo), '2026-10-11');
    assert.equal(moved, 10);
    assert.ok(existsSync(join(repo, 'docs', 'anchored-docs', 'flows', 'ingest.md')));
    assert.ok(!existsSync(join(repo, 'docs', 'flows')));
    // A README outside docs/ follows the bundle.
    assert.match(read(repo, 'README.md'), /\(docs\/anchored-docs\/flows\/ingest\.md\)/);
    assert.match(read(repo, 'README.md'), /\(docs\/guides\/deploy\.md\)/);
    // A human doc that stays keeps its place and points at the moved bundle.
    assert.match(read(repo, 'docs/guides/deploy.md'), /\(\.\.\/anchored-docs\/flows\/ingest\.md\)/);
    // A bundle-root link from a file outside the bundle becomes a relative one.
    assert.match(read(repo, 'docs/guides/deploy.md'), /\(\.\.\/anchored-docs\/flows\/index\.md\)/);
    // A moved doc's link to a file that stayed becomes relative from its new place.
    assert.match(read(repo, 'docs/anchored-docs/flows/order-fulfillment.md'), /\(\.\.\/\.\.\/guides\/deploy\.md\)/);
    // Links between moved docs stay valid without change.
    assert.match(read(repo, 'docs/anchored-docs/flows/order-fulfillment.md'), /\(\.\.\/decisions\/0001-use-queue\.md\)/);
    // Code back-links follow the bundle in both forms.
    assert.match(read(repo, 'src/Orders/OrderService.cs'), /href="docs\/anchored-docs\/flows\/order-fulfillment\.md"/);
    assert.match(read(repo, 'src/tools/ingest.py'), /# See: docs\/anchored-docs\/flows\/ingest\.md/);
  });
});

test('apply writes a dated log entry at the top of the newest-first groups', () => {
  withLegacyCopy((repo) => {
    applyPlan(planMigration(repo), '2026-10-11');
    const log = read(repo, 'docs/anchored-docs/log.md');
    assert.ok(log.startsWith('# Docs update log\n\n## 2026-10-11\n\n* **Update**: Moved 10 bundle file(s)'));
    assert.ok(log.indexOf('## 2026-10-11') < log.indexOf('## 2026-01-10'));
  });
});

test('a second run finds nothing to move and changes nothing', () => {
  withLegacyCopy((repo) => {
    applyPlan(planMigration(repo), '2026-10-11');
    const readme = read(repo, 'README.md');
    const plan = planMigration(repo);
    assert.equal(plan.status, 'nothing');
    assert.equal(read(repo, 'README.md'), readme);
  });
});

test('an existing destination stops the plan before anything moves', () => {
  withLegacyCopy((repo) => {
    mkdirSync(join(repo, 'docs', 'anchored-docs', 'flows'), { recursive: true });
    writeFileSync(join(repo, 'docs', 'anchored-docs', 'flows', 'ingest.md'), '# Someone else\n');
    const plan = planMigration(repo);
    assert.equal(plan.status, 'conflict');
    assert.deepEqual(plan.conflicts, ['docs/anchored-docs/flows/ingest.md']);
    assert.throws(() => applyPlan(plan), /not ready; nothing was changed/);
    assert.ok(existsSync(join(repo, 'docs', 'flows', 'ingest.md')));
    assert.ok(existsSync(join(repo, 'docs', 'index.md')));
  });
});

test('a repository with no docs folder has nothing to move', () => {
  withLegacyCopy((repo) => {
    rmSync(join(repo, 'docs'), { recursive: true, force: true });
    assert.equal(planMigration(repo).status, 'none');
  });
});

test('a docs folder with no skill files is left alone', () => {
  withLegacyCopy((repo) => {
    rmSync(join(repo, 'docs'), { recursive: true, force: true });
    mkdirSync(join(repo, 'docs'));
    writeFileSync(join(repo, 'docs', 'guide.md'), '# Guide\n');
    assert.equal(planMigration(repo).status, 'nothing');
  });
});

test('CRLF line endings survive the rewrite', () => {
  withLegacyCopy((repo) => {
    writeFileSync(join(repo, 'README.md'), '# Repo\r\n\r\nSee [it](docs/flows/ingest.md).\r\n');
    applyPlan(planMigration(repo), '2026-10-11');
    assert.equal(read(repo, 'README.md'), '# Repo\r\n\r\nSee [it](docs/anchored-docs/flows/ingest.md).\r\n');
  });
});

test('resolveBundle prefers docs/anchored-docs, falls back to a 2.0 bundle in docs/, and defaults to the new place', () => {
  withLegacyCopy((repo) => {
    assert.deepEqual(resolveBundle(repo), { path: join(repo, 'docs'), legacy: true });
    applyPlan(planMigration(repo), '2026-10-11');
    assert.deepEqual(resolveBundle(repo), { path: join(repo, 'docs', 'anchored-docs'), legacy: false });
  });
  withLegacyCopy((repo) => {
    rmSync(join(repo, 'docs'), { recursive: true, force: true });
    assert.deepEqual(resolveBundle(repo), { path: join(repo, 'docs', 'anchored-docs'), legacy: false });
  });
});

test('findDocsRoot treats docs/anchored-docs as the bundle, even before it has a glossary', () => {
  withLegacyCopy((repo) => {
    const nested = join(repo, 'docs', 'anchored-docs');
    mkdirSync(join(nested, 'flows'), { recursive: true });
    writeFileSync(join(nested, 'flows', 'new.md'), '# New\n');
    assert.equal(findDocsRoot(join(nested, 'flows', 'new.md')), nested);
  });
});

test('logWithEntry starts a log when there is none, and inserts above the older groups', () => {
  assert.equal(logWithEntry(null, 'Moved.', '2026-10-11'), '# Docs update log\n\n## 2026-10-11\n\n* **Update**: Moved.\n');
  const old = '# Docs update log\n\n## 2026-01-01\n\n* **Update**: Old.\n';
  assert.equal(
    logWithEntry(old, 'Moved.', '2026-10-11'),
    '# Docs update log\n\n## 2026-10-11\n\n* **Update**: Moved.\n\n## 2026-01-01\n\n* **Update**: Old.\n',
  );
});
