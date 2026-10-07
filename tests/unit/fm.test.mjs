// _fm.mjs must match the recorded 1.2.0 frontmatter and glossary results on every case, and report bad glossaries clearly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, sep } from 'node:path';
import {
  splitFrontmatter, parseYamlSubset, readDoc, loadGlossaries, parseGlossaryFile, findDocsRoot, GlossaryError, ORG_GLOSSARY_DEFAULT,
} from '../../skills/anchored-docs/scripts/_fm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');
const golden = JSON.parse(readFileSync(join(HERE, '..', 'golden', 'fm-1.2.0.json'), 'utf8'));

function norm(v) {
  if (v instanceof Map) return { __map: [...v.entries()].map(([k, x]) => [k, norm(x)]) };
  if (Array.isArray(v)) return v.map(norm);
  return v;
}

function withTemp(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-fm-'));
  try {
    return fn(td);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

const dumpEntry = (e) => ({ term: e.term, kind: e.kind, origin: e.origin, file: basename(e.source), meaning: e.meaning, unapproved: e.unapproved });
function dumpGlossary(g) {
  return {
    approved: [...g.approved].sort(),
    unapproved: [...g.unapproved.entries()],
    origin: [...g.origin.entries()],
    entries: [...g.entries.entries()].map(([k, v]) => [k, v.map(dumpEntry)]),
    conflicts: g.conflicts,
    notices: g.notices,
    hasOrg: g.orgPath !== null,
    hasProject: g.projectPath !== null,
  };
}

test('parseYamlSubset matches the 1.2.0 fallback parser on every captured case', () => {
  for (const c of golden.yamlSubset) assert.deepEqual(norm(parseYamlSubset(c.input)), c.output, c.name);
});

test('splitFrontmatter matches split_frontmatter', () => {
  for (const c of golden.splitFrontmatter) {
    const r = splitFrontmatter(c.input);
    assert.deepEqual([r.frontmatter, r.body, r.bodyStartLine], c.output, JSON.stringify(c.input));
  }
});

test('readDoc matches read_doc on fixtures, templates, and newline cases', () => {
  withTemp((td) => {
    const p = join(td, 'doc.md');
    for (const c of golden.readDoc) {
      writeFileSync(p, Buffer.from(c.inputBase64, 'base64'));
      const r = readDoc(p);
      assert.deepEqual(norm(r.fm), c.fm, `${c.name} frontmatter`);
      assert.equal(r.body, c.body, `${c.name} body`);
      assert.equal(r.bodyStartLine, c.start, `${c.name} start line`);
      assert.equal(r.text, c.text, `${c.name} text`);
    }
  });
});

test('loadGlossaries matches load_glossaries on every scenario', () => {
  withTemp((td) => {
    for (const s of golden.glossary) {
      const root = join(td, s.name);
      mkdirSync(join(root, 'docs'), { recursive: true });
      const orgFile = join(root, 'org-glossary.json');
      if (s.org) {
        writeFileSync(orgFile, JSON.stringify(s.org));
        process.env.STE_ORG_GLOSSARY = orgFile;
      } else {
        process.env.STE_ORG_GLOSSARY = join(root, 'missing-org.json');
      }
      if (s.project) writeFileSync(join(root, 'docs', '_glossary.json'), JSON.stringify(s.project));
      assert.deepEqual(dumpGlossary(loadGlossaries(join(root, 'docs'))), s.result, s.name);
    }
  });
  delete process.env.STE_ORG_GLOSSARY;
});

test('loadGlossaries matches load_glossaries on the parity-corpus glossaries', () => {
  process.env.STE_ORG_GLOSSARY = join(FIXTURES, 'glossary', 'org-glossary.json');
  for (const f of golden.fixtureGlossary) {
    assert.deepEqual(dumpGlossary(loadGlossaries(join(FIXTURES, f.repo, 'docs'))), f.result, f.repo);
  }
  delete process.env.STE_ORG_GLOSSARY;
});

test('findDocsRoot matches find_docs_root, relative paths included', () => {
  const cwd = process.cwd();
  try {
    for (const c of golden.docsRoot) {
      withTemp((td) => {
        for (const f of c.files) {
          const fp = join(td, f.replace('_glossary.yaml', '_glossary.json'));
          mkdirSync(dirname(fp), { recursive: true });
          writeFileSync(fp, 'x\n');
        }
        process.chdir(td);
        try {
          // The golden was captured on POSIX; the function returns native separators.
          assert.equal(findDocsRoot(c.start.split('/').join(sep)).split(sep).join('/'), c.output, JSON.stringify(c));
        } finally {
          process.chdir(cwd);   // Windows cannot delete the current directory
        }
      });
    }
  } finally {
    process.chdir(cwd);
  }
});

test('the shipped org glossary parses and has no active terms', () => {
  assert.deepEqual(parseGlossaryFile(ORG_GLOSSARY_DEFAULT, 'org'), []);
});

// ---------- behavior that is new in 2.0: clear errors for hand-edited JSON ----------

test('a glossary with a JSON syntax error names the file and says JSON', () => {
  withTemp((td) => {
    const p = join(td, 'bad.json');
    writeFileSync(p, '{ "technical_nouns": [ { "term": "a", } ] }');
    assert.throws(() => parseGlossaryFile(p, 'project'), (e) => e instanceof GlossaryError && e.message.includes(p) && e.message.includes('not valid JSON'));
  });
});

test('a glossary written in YAML is rejected with a JSON message, not parsed as nothing', () => {
  withTemp((td) => {
    const p = join(td, 'old.yaml');
    writeFileSync(p, 'technical_nouns:\n  - term: queue\n');
    assert.throws(() => parseGlossaryFile(p, 'org'), (e) => e instanceof GlossaryError && e.message.includes('JSON'));
  });
});

test('wrong shapes are reported by name', () => {
  withTemp((td) => {
    const cases = [
      ['[]', 'top level'],
      ['{"technical_nouns": {"term": "a"}}', '"technical_nouns" must be an array'],
      ['{"technical_nouns": [{"term": "a", "unapproved": "b"}]}', '"unapproved" for "a" must be an array'],
    ];
    for (const [text, expect] of cases) {
      const p = join(td, 'g.json');
      writeFileSync(p, text);
      assert.throws(() => parseGlossaryFile(p, 'project'), (e) => e instanceof GlossaryError && e.message.includes(expect), text);
    }
  });
});

test('a missing section is fine and a missing file is a GlossaryError', () => {
  withTemp((td) => {
    const p = join(td, 'g.json');
    writeFileSync(p, '{"technical_verbs": ["Ingest"]}');
    assert.deepEqual(parseGlossaryFile(p, 'project').map((e) => [e.term, e.kind]), [['ingest', 'verb']]);
    assert.throws(() => parseGlossaryFile(join(td, 'nope.json'), 'project'), GlossaryError);
  });
});

test('a 1.x _glossary.yaml with no _glossary.json produces a notice instead of being ignored silently', () => {
  withTemp((td) => {
    mkdirSync(join(td, 'docs'));
    writeFileSync(join(td, 'docs', '_glossary.yaml'), 'technical_nouns:\n  - term: queue\n');
    process.env.STE_ORG_GLOSSARY = join(td, 'none.json');
    const g = loadGlossaries(join(td, 'docs'));
    delete process.env.STE_ORG_GLOSSARY;
    assert.equal(g.projectPath, null);
    assert.equal(g.notices.length, 1);
    assert.match(g.notices[0], /_glossary\.yaml.*_glossary\.json/);
  });
});

test('no notice appears when both files exist or neither does', () => {
  withTemp((td) => {
    mkdirSync(join(td, 'docs'));
    process.env.STE_ORG_GLOSSARY = join(td, 'none.json');
    assert.deepEqual(loadGlossaries(join(td, 'docs')).notices, []);
    writeFileSync(join(td, 'docs', '_glossary.yaml'), 'x\n');
    writeFileSync(join(td, 'docs', '_glossary.json'), '{}');
    assert.deepEqual(loadGlossaries(join(td, 'docs')).notices, []);
    delete process.env.STE_ORG_GLOSSARY;
  });
});
