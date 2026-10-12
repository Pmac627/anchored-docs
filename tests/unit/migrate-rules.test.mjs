// Migrate rules that the main migrate suite does not cover: which docs move, the default repository root, the leftover
// report for CI calls, source-file glossary lookup, and the git rename path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyPlan, planMigration } from '../../skills/anchored-docs/scripts/_migrate.mjs';
import { findDocsRoot } from '../../skills/anchored-docs/scripts/_fm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'fixtures', 'repo-legacy');
const SCRIPT = join(HERE, '..', '..', 'skills', 'anchored-docs', 'scripts', 'docs_check.mjs');

function withLegacyCopy(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-migr-'));
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

/** Runs docs_check with no STE_* variables, so the result does not depend on the machine. */
function runCheck(cwd, ...args) {
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STE_')));
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout };
}

const hasGit = spawnSync('git', ['--version'], { encoding: 'utf8' }).status === 0;

test('a doc with a type and one of sources, generated, or verified moves, even with a finding', () => {
  withLegacyCopy((repo) => {
    // An empty verified list is an okf finding, not a reason to leave the doc behind.
    write(repo, 'docs/flows/flawed.md', '---\ntype: Flow\ntitle: Flawed\ndescription: Has a finding.\nsources:\n  - id: a\n    resource: src/Orders/OrderService.cs\nverified: []\n---\n# Flawed\n');
    // A page from another tool that uses type alone is not a skill doc.
    write(repo, 'docs/guides/post.md', '---\ntype: post\ntitle: A post\n---\n# Post\n');
    const plan = planMigration(repo);
    assert.ok(plan.moves.some((m) => m.from.endsWith(join('flows', 'flawed.md'))));
    assert.ok(plan.stays.includes('docs/guides/post.md'));
  });
});

test('the root log moves with the root index, even when its heading is not the update-log heading', () => {
  withLegacyCopy((repo) => {
    write(repo, 'docs/log.md', '# Log\n\n## 2026-01-10\n\n**Initialization**: made.\n');
    const plan = planMigration(repo);
    assert.ok(plan.moves.some((m) => m.from === join(repo, 'docs', 'log.md')));
  });
});

test('a root log with no heading and no moving index stays where it is', () => {
  withLegacyCopy((repo) => {
    rmSync(join(repo, 'docs', 'index.md'));
    write(repo, 'docs/log.md', '# Team notes\n');
    const plan = planMigration(repo);
    assert.ok(plan.stays.includes('docs/log.md'));
  });
});

test('the default repository root is two levels above a bundle at docs/anchored-docs/', () => {
  withLegacyCopy((repo) => {
    applyPlan(planMigration(repo), '2026-10-11');
    // Without --repo, every source path in the bundle must resolve. The root is the repository, not docs/.
    const check = runCheck(repo, 'okf', 'docs/anchored-docs');
    assert.equal(check.code, 0, check.out);
    assert.match(check.out, /0 findings/);
    // applyPlan moves the old map unchanged. The migrate command regenerates it, and so does this map step.
    assert.equal(runCheck(repo, 'map', 'docs/anchored-docs').code, 0);
    const map = JSON.parse(read(repo, 'docs/anchored-docs/_map.json'));
    const ingest = map.map.find((e) => e.code === 'src/tools/ingest.py');
    assert.deepEqual(ingest.docs, ['docs/anchored-docs/flows/ingest.md']);
  });
});

test('a CI call on a bare docs folder is listed for a person, not rewritten', () => {
  withLegacyCopy((repo) => {
    write(repo, '.github/workflows/ci.yml', 'steps:\n  - run: node skills/x/scripts/docs_check.mjs map docs --check\n');
    const plan = planMigration(repo);
    const hit = plan.leftovers.find((l) => l.startsWith('.github/workflows/ci.yml:2:'));
    assert.ok(hit, plan.leftovers.join('\n'));
    assert.match(hit, /script call on a bare docs folder/);
    assert.match(read(repo, '.github/workflows/ci.yml'), /map docs --check/);
  });
});

test('prose that names a script is not listed, but a command on a bare docs folder is', () => {
  withLegacyCopy((repo) => {
    write(repo, 'README.md', 'Run `node skills/x/scripts/docs_check.mjs migrate <repo>` to see the plan.\nThe checker reads docs_check.mjs output in docs/ folders.\n');
    write(repo, 'INSTALL.md', 'Then run node skills/x/scripts/docs_check.mjs glossary docs/ --terms.\n');
    const plan = planMigration(repo);
    assert.ok(!plan.leftovers.some((l) => l.startsWith('README.md:')), plan.leftovers.join('\n'));
    assert.ok(plan.leftovers.some((l) => l.startsWith('INSTALL.md:1:') && /bare docs folder/.test(l)));
  });
});

test('an agent file that names docs/ is listed, and its path is not changed', () => {
  withLegacyCopy((repo) => {
    write(repo, 'CLAUDE.md', 'Keep docs/ true to the code.\n');
    const plan = planMigration(repo);
    assert.ok(plan.leftovers.some((l) => l.startsWith('CLAUDE.md:1:') && /agent file names docs/.test(l)));
    applyPlan(plan, '2026-10-11');
    assert.equal(read(repo, 'CLAUDE.md'), 'Keep docs/ true to the code.\n');
  });
});

test('a source file finds the bundle at docs/anchored-docs/ for its project glossary', () => {
  withLegacyCopy((repo) => {
    write(repo, 'docs/_glossary.json', '{"technical_nouns":[]}\n');
    const src = join(repo, 'src', 'Orders', 'OrderService.cs');
    assert.equal(findDocsRoot(src), join(repo, 'docs'));
    applyPlan(planMigration(repo), '2026-10-11');
    assert.equal(findDocsRoot(src), join(repo, 'docs', 'anchored-docs'));
  });
});

test('git mv records the moves as renames, and the rewritten text is on disk', { skip: !hasGit && 'git is not installed' }, () => {
  withLegacyCopy((repo) => {
    const git = (...args) => spawnSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
    git('init', '-q');
    git('add', '-A');
    const commit = git('-c', 'user.name=test', '-c', 'user.email=test@example.com', 'commit', '-q', '-m', 'fixture');
    assert.equal(commit.status, 0, commit.stderr);
    const plan = planMigration(repo);
    assert.equal(plan.git, true);
    applyPlan(plan, '2026-10-11');
    const status = git('status', '--porcelain').stdout;
    assert.match(status, /^R {2}docs\/flows\/ingest\.md -> docs\/anchored-docs\/flows\/ingest\.md$/m);
    assert.match(read(repo, 'README.md'), /docs\/anchored-docs\/flows\/ingest\.md/);
  });
});
