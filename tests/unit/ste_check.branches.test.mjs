// Branch coverage for ste_check.mjs: the paths that the golden cases and ste_check.test.mjs do not reach.
// Every pack, glossary, and doc here is invented. No test reads the real ASD agent pack or the network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = join(HERE, '..', '..', 'skills', 'anchored-docs', 'scripts', 'ste_check.mjs');
const ORG_DEFAULT = join(HERE, '..', '..', 'skills', 'anchored-docs', 'references', 'org-glossary.json');

// A preload module lets a test change what the script sees (Node version, the unapproved list, the org glossary file)
// without a change to production code. TEST_PRELOAD holds a space-separated list of modes.
const SCRATCH = mkdtempSync(join(tmpdir(), 'ad-ste-br-'));
const PRELOAD = join(SCRATCH, 'preload.cjs');
writeFileSync(PRELOAD, [
  "const fs = require('node:fs');",
  "const Module = require('node:module');",
  "const modes = (process.env.TEST_PRELOAD || '').split(' ');",
  "if (modes.includes('old-node')) {",
  "  Object.defineProperty(process, 'versions', { value: { ...process.versions, node: '20.1.0' } });",
  '}',
  "if (modes.includes('tsv')) {",
  '  const orig = fs.readFileSync;',
  '  fs.readFileSync = function (p, ...rest) {',
  '    const buf = orig.call(this, p, ...rest);',
  "    if (typeof p === 'string' && p.endsWith('ste_unapproved.tsv')) {",
  "      return Buffer.concat([buf, Buffer.from('\\nsolo\\npair\\tswap\\n')]);",
  '    }',
  '    return buf;',
  '  };',
  '}',
  "if (modes.includes('no-org')) {",
  '  const orig = fs.existsSync;',
  "  fs.existsSync = (p) => (String(p).endsWith('org-glossary.json') ? false : orig(p));",
  '}',
  "if (modes.includes('throw-undefined')) {",
  '  const orig = JSON.parse;',
  '  JSON.parse = (t, ...rest) => {',
  "    if (String(t).includes('THROW_MARKER')) {",
  '      throw undefined;',
  '    }',
  '    return orig(t, ...rest);',
  '  };',
  '}',
  'Module.syncBuiltinESMExports();',
  '',
].join('\n'));

after(() => {
  rmSync(SCRATCH, { recursive: true, force: true });
});

function cleanEnv(extra = {}) {
  const base = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('STE_') && k !== 'TEST_PRELOAD'));
  return { ...base, ...extra };
}

/** Runs ste_check with no STE_* variables from the caller, plus the given ones. */
function run(cwd, args, extra = {}, preload = '') {
  const env = cleanEnv(preload ? { ...extra, TEST_PRELOAD: preload } : extra);
  const r = spawnSync(process.execPath, ['--require', PRELOAD, SCRIPT, ...args], { cwd, env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

function withDir(fn) {
  const td = mkdtempSync(join(tmpdir(), 'ad-ste-t-'));
  try {
    const repo = join(td, 'proj');
    mkdirSync(join(repo, 'docs'), { recursive: true });
    return fn(repo, td);
  } finally {
    rmSync(td, { recursive: true, force: true });
  }
}

/** Writes an invented agent pack. A categories value of undefined writes no rules file; a string is written as it is. */
function makePack(td, { approved = [], unapproved = [], categories } = {}) {
  const pack = join(td, 'pack');
  mkdirSync(join(pack, 'dictionary'), { recursive: true });
  writeFileSync(join(pack, 'dictionary', 'approved-words.json'), typeof approved === 'string' ? approved : JSON.stringify(approved));
  writeFileSync(join(pack, 'dictionary', 'unapproved-words.json'), JSON.stringify(unapproved));
  if (categories !== undefined) {
    mkdirSync(join(pack, 'rules'), { recursive: true });
    writeFileSync(join(pack, 'rules', 'technical-categories.json'), typeof categories === 'string' ? categories : JSON.stringify(categories));
  }
  return pack;
}

/** Lines of the report for one file and line number. */
function at(out, file, line) {
  return out.split('\n').filter((l) => l.startsWith(`${file}:${line}: `));
}

const A_MD = join('docs', 'a.md');
const PASSIVE = 'The data was created by the job.';

test('an old Node version stops the run with exit 2 and a message', () => {
  withDir((repo) => {
    const r = run(repo, [], {}, 'old-node');
    assert.equal(r.code, 2);
    assert.equal(r.err, 'ste_check: Node 22 or newer is required.\n');
    assert.equal(r.out, '');
  });
});

test('an unapproved-list row with one or two columns gets an empty alternative and rule 1.1', () => {
  withDir((repo) => {
    writeFileSync(join(repo, 'docs', 'a.md'), 'Do the solo and pair work.\n');
    const r = run(repo, ['docs'], {}, 'tsv');
    assert.deepEqual(at(r.out, A_MD, 1).sort(), [
      `${A_MD}:1: [M] 1.1: "pair": write "swap"`,
      `${A_MD}:1: [M] 1.1: "solo": write ""`,
    ]);
    assert.equal(r.code, 1);
  });
});

test('with no org glossary file, the report, the status, and a check still run', () => {
  withDir((repo) => {
    writeFileSync(join(repo, 'docs', 'a.md'), 'Read the file.\n');
    const rep = run(repo, ['--glossary-report', 'docs'], {}, 'no-org');
    assert.match(rep.out, /^org glossary: none \(0 terms\)$/m);
    assert.match(rep.out, /^project glossary: none \(0 terms\)$/m);
    const st = run(repo, ['--status'], {}, 'no-org');
    assert.ok(st.out.includes(`org glossary: none (create ${ORG_DEFAULT} or set STE_ORG_GLOSSARY)`), st.out);
    const chk = run(repo, ['docs'], {}, 'no-org');
    assert.equal(chk.code, 0, chk.out);
  });
});

test('--lookup with no word prints a usage line and exits 2', () => {
  withDir((repo) => {
    const r = run(repo, ['--lookup']);
    assert.equal(r.code, 2);
    assert.equal(r.err, 'usage: ste_check.mjs --lookup WORD...\n');
  });
});

test('glossary report: code spans of equal count sort alphabetically', () => {
  withDir((repo) => {
    writeFileSync(join(repo, 'docs', 'a.md'), 'Use `gamma` and `alpha` and `beta` and `beta` and `delta`.\n');
    const r = run(repo, ['--glossary-report', 'docs']);
    assert.equal(r.code, 0);
    const lines = r.out.split('\n');
    const i = lines.indexOf('code-span names not in the glossary (top 40 by count):');
    assert.deepEqual(lines.slice(i + 1, i + 5), ['     2  beta', '     1  alpha', '     1  delta', '     1  gamma']);
  });
});

test('a path with an extension that ste_check does not read counts as a file and gives no finding', () => {
  withDir((repo) => {
    writeFileSync(join(repo, 'notes.txt'), `${PASSIVE}\n`);
    const r = run(repo, ['notes.txt']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /ste_check: 1 files, 0 sentences, 0 mechanical, 0 heuristic, 0 waived, dictionary=no \(1\.1 partial\)/);
  });
});

test('a path that does not exist stops the run with exit 2', () => {
  withDir((repo) => {
    const r = run(repo, [join('docs', 'missing.md')]);
    assert.equal(r.code, 2);
    assert.equal(r.err, `ste_check: no such path ${join('docs', 'missing.md')}\n`);
  });
});

test('markdown blocks: multi-line comments, empty quotes, list items, and indented lines', () => {
  withDir((repo) => {
    const items = [
      '  The data was created by the job.',                                 // 1: an indented first line starts a paragraph
      '',                                                                   // 2
      '<!--',                                                               // 3: a comment that runs on
      PASSIVE,                                                              // 4: inside the comment
      'the end -->',                                                        // 5
      '',                                                                   // 6
      '>',                                                                  // 7: a quote marker with no text
      '> ' + PASSIVE,                                                       // 8
      '',                                                                   // 9
      '- alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu', // 10
      '  xi omicron pi rho sigma tau upsilon phi chi psi omega aa bb',      // 11: joins line 10
      '- alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu', // 12
      '\txi omicron pi rho sigma tau upsilon phi chi psi omega aa bb',      // 13: a tab joins line 12
      '',                                                                   // 14
      '| cell |',                                                           // 15
      '   ' + PASSIVE,                                                      // 16: after a cell it starts a paragraph
      '',                                                                   // 17
      '- list item',                                                        // 18
      'plain text starts here',                                             // 19
      '  and the list item does not take this line',                        // 20: the paragraph is open, so it joins the paragraph
      '',                                                                   // 21
      '<br>',                                                               // 22: no words after the tags are removed
      '',                                                                   // 23
    ];
    writeFileSync(join(repo, 'docs', 'a.md'), items.join('\n'));
    const r = run(repo, ['docs']);
    assert.match(at(r.out, A_MD, 1).join('\n'), /\[H\] 3\.6/);
    assert.deepEqual(at(r.out, A_MD, 4), []);
    assert.deepEqual(at(r.out, A_MD, 5), []);
    assert.deepEqual(at(r.out, A_MD, 7), []);
    assert.match(at(r.out, A_MD, 8).join('\n'), /\[H\] 3\.6/);
    assert.match(at(r.out, A_MD, 10).join('\n'), /\[M\] 6\.1: 26 words \(max 25\)/);
    assert.match(at(r.out, A_MD, 12).join('\n'), /\[M\] 6\.1: 26 words \(max 25\)/);
    assert.match(at(r.out, A_MD, 16).join('\n'), /\[H\] 3\.6/);
    assert.deepEqual(at(r.out, A_MD, 18), []);
    assert.deepEqual(at(r.out, A_MD, 22), []);
  });
});

test('a number followed by a unit counts as one word', () => {
  withDir((repo) => {
    const word = 'alpha';
    writeFileSync(join(repo, 'docs', 'a.md'), [
      `${Array(24).fill(word).join(' ')} 5 ms.`,
      '',
      `${Array(25).fill(word).join(' ')} 5 ms.`,
      '',
    ].join('\n'));
    const r = run(repo, ['docs']);
    assert.deepEqual(at(r.out, A_MD, 1).filter((l) => l.includes('6.1')), []);
    assert.match(at(r.out, A_MD, 3).join('\n'), /\[M\] 6\.1: 26 words \(max 25\)/);
  });
});

test('an ordered step with no words is not a missing imperative', () => {
  withDir((repo) => {
    writeFileSync(join(repo, 'docs', 'a.md'), '1. 42\n');
    const r = run(repo, ['docs']);
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /Docs-STE: pass/);
    assert.doesNotMatch(r.out, /5\.3/);
  });
});

test('a waiver for a different rule does not hide the finding', () => {
  withDir((repo) => {
    writeFileSync(join(repo, 'docs', 'a.md'), `<!-- ste-ok: 6.1 -->\n${PASSIVE}\n`);
    const r = run(repo, ['docs']);
    assert.match(at(r.out, A_MD, 2).join('\n'), /\[H\] 3\.6/);
    assert.match(r.out, /, 0 waived,/);
  });
});

test('Python docstring lines are counted from the first line of the file', () => {
  withDir((repo) => {
    mkdirSync(join(repo, 'src'));
    writeFileSync(join(repo, 'src', 'a.py'), `def f():\n    """${PASSIVE}"""\n`);
    const r = run(repo, [join('src', 'a.py')]);
    assert.match(at(r.out, join('src', 'a.py'), 2).join('\n'), /\[H\] 3\.6/);
  });
});

// ---------- pack loading ----------

const BASE_APPROVED = [
  { word: 'the', pos: 'art' },
  { word: 'work', pos: 'v' },
  { word: 'with', pos: 'prep' },
  { word: 'and', pos: 'conj' },
];

test('pack loading: noun and adjective word forms, and entries with no word', () => {
  withDir((repo, td) => {
    const pack = makePack(td, {
      approved: [
        ...BASE_APPROVED,
        { word: 'entry', pos: 'n' },
        { word: 'happy', pos: 'adj' },
        { word: 'simple', pos: 'adj' },
        { word: 'big', pos: 'adj' },
        { pos: 'n' },
        { word: '   ', pos: 'n' },
      ],
      unapproved: [{ pos: 'v' }, { word: '  ' }],
      categories: {},
    });
    writeFileSync(join(repo, 'docs', 'a.md'), 'The entries work happily and simply with zorb.\n');
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack });
    assert.match(r.out, /\[H\] 1\.5: 1 words not in the STE dictionary .*: zorb$/m);
    const st = run(repo, ['--status'], { STE_AGENT_PACK: pack });
    assert.match(st.out, /STE word source: pack \(Issue 9: 10 approved, 2 unapproved\) at /);
    assert.match(st.out, /\(0 example words\)/);
    assert.match(st.out, /multi-word unapproved phrases checked: 0/);
  });
});

test('technical categories: a missing file, bad JSON, and missing keys give no example words', () => {
  withDir((repo, td) => {
    const cases = [undefined, '{ not json', '{}'];
    cases.forEach((categories, n) => {
      const sub = join(td, `c${n}`);
      mkdirSync(sub);
      const pack = makePack(sub, { approved: BASE_APPROVED, categories });
      const st = run(repo, ['--status'], { STE_AGENT_PACK: pack });
      assert.equal(st.code, 0);
      assert.match(st.out, /\(0 example words\)/, String(categories));
    });
  });
});

test('technical categories: which examples count, and the STE_TECH_CATEGORIES override', () => {
  withDir((repo, td) => {
    const pack = makePack(td, {
      approved: BASE_APPROVED,
      categories: {
        technical_noun_categories: [
          { number: 6, title: 'Systems', examples: ['widget', '', 'one two three four', 'Bad1', 'terms of art', 'a) item', 'sprocket.', 'two words'] },
          { examples: ['nonumber'] },
          { number: 6, title: 'Systems', examples: ['widget'] },
          { number: 7, title: 'Other', examples: ['widget'] },
          { number: 3, title: 'Hardware', examples: ['bracket'] },
          { number: 6, title: 'No examples' },
        ],
      },
    });
    const st = run(repo, ['--status'], { STE_AGENT_PACK: pack });
    // widget, sprocket, "two words", "two", and "words". The tv key is missing in the file.
    assert.match(st.out, /technical categories permitted without a glossary entry: tn 6,7,15,19; tv 2 \(5 example words\)\. Override with STE_TECH_CATEGORIES\./);
    const ov = run(repo, ['--status'], { STE_AGENT_PACK: pack, STE_TECH_CATEGORIES: 'tn:6,x;xx:1 garbage tv:' });
    assert.match(ov.out, /technical categories permitted without a glossary entry: tn 6 \(5 example words\)\./);
    const none = run(repo, ['--status'], { STE_AGENT_PACK: pack, STE_TECH_CATEGORIES: 'tn:3' });
    assert.match(none.out, /entry: tn 3 \(1 example words\)\./);
  });
});

test('--lookup prints every entry shape and the category-only note', () => {
  withDir((repo, td) => {
    const pack = makePack(td, {
      approved: [
        { word: 'alpha', pos: 'n', forms: ['alphas'], meanings: ['plain meaning', { meaning: 'object meaning', help: ['object help'] }, { help: ['only help'] }, null], help: ['top help'] },
        { word: 'beta', meanings: [{ meaning: 'beta meaning' }] },
        { word: 'gamma', pos: 'v', forms: ['gammas'] },
      ],
      unapproved: [{ word: 'delta', pos: 'v' }, { word: 'epsilon', pos: 'v', alternatives: ['use'], help: ['Write use.'] }],
      categories: { technical_noun_categories: [{ number: 6, title: 'Systems', examples: ['sprocket'] }] },
    });
    const r = run(repo, ['--lookup', 'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'sprocket', 'foo bar'], { STE_AGENT_PACK: pack });
    assert.equal(r.code, 0);
    assert.deepEqual(r.out.split('\n'), [
      '== alpha',
      '  alpha (n): approved. Forms: alphas.',
      '    meaning: plain meaning',
      '    meaning: object meaning',
      '    help: object help',
      '    help: only help',
      '    meaning: null',
      '    help: top help',
      '== beta',
      '  beta (?): approved.',
      '    meaning: beta meaning',
      '== gamma',
      '  gamma (v): approved. Forms: gammas.',
      '== delta',
      '  delta (v): NOT approved.',
      '== epsilon',
      '  epsilon (v): NOT approved. Write: use.',
      '    help: Write use.',
      '== sprocket',
      '  not a dictionary word. Listed as an example in: TN 6 Systems',
      '  Permitted as a technical noun (1.5) or technical verb (1.12) in that category. Add it to the project glossary (_glossary.json in the docs bundle).',
      '== foo bar',
      '  not in the dictionary. Permitted only as a technical noun (1.5) or technical verb (1.12).',
      '  If the project uses it, add it to the project glossary (_glossary.json in the docs bundle). Otherwise write an approved word.',
      '',
    ]);
  });
});

test('pack phrases: alternatives, help text, a different construction, and a waiver', () => {
  withDir((repo, td) => {
    const pack = makePack(td, {
      approved: BASE_APPROVED,
      unapproved: [
        { word: 'in the event of', pos: 'prep', alternatives: ['if', 'when'] },
        { word: 'at this point in time', pos: 'adv', help: ['Write now.', 'Or omit it.'] },
        { word: 'by means of', pos: 'prep' },
        { word: 'prior to', pos: 'prep', alternatives: ['before'] },
        { word: 'as well as', pos: 'conj', alternatives: ['and'] },
      ],
    });
    writeFileSync(join(repo, 'docs', 'a.md'), [
      'In the event of a fault, prior to the work.',                         // 1: the built-in list flags "prior to" first
      '',
      'At this point in time the work stops.',                               // 3
      '',
      'The work by means of the tool.',                                      // 5
      '',
      '<!-- ste-ok: 1.1 -->',
      'The work by means of the tool.',                                      // 8: waived
      '',
    ].join('\n'));
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack });
    assert.ok(at(r.out, A_MD, 1).includes(`${A_MD}:1: [M] 1.1: "in the event of" is not approved; write if, when`), r.out);
    assert.equal(at(r.out, A_MD, 1).filter((l) => l.includes('"prior to"')).length, 1);
    assert.ok(at(r.out, A_MD, 3).includes(`${A_MD}:3: [M] 1.1: "at this point in time" is not approved; write Write now.; Or omit it.`), r.out);
    assert.ok(at(r.out, A_MD, 5).includes(`${A_MD}:5: [M] 1.1: "by means of" is not approved; write a different construction (9.1)`), r.out);
    assert.deepEqual(at(r.out, A_MD, 8).filter((l) => l.includes('1.1')), []);
    assert.match(r.out, /, 1 waived,/);
  });
});

test('pack words: stems, repeats, alternatives, technical-only words, and waivers', () => {
  withDir((repo, td) => {
    const pack = makePack(td, {
      approved: [...BASE_APPROVED, { word: 'check', pos: 'v' }],
      unapproved: [
        { word: 'frobnicate', pos: 'v', alternatives: ['do'] },
        { word: 'quux' },
        { word: 'gizmo', pos: 'n', help: ['Write device.', 'Or part.'] },
        { word: 'wibble', pos: 'v', alternatives: ['WIBBLE (TV)'] },
        { word: 'wobble', pos: 'n', alternatives: ['WOBBLE (TN)'] },
        { word: 'wubble', pos: 'n', alternatives: ['WUBBLE (n)'] },
        { word: 'zap', pos: 'v', alternatives: ['ZOT (TN)'] },
      ],
    });
    writeFileSync(join(repo, 'docs', '_glossary.json'), JSON.stringify({ technical_nouns: ['sprocket'] }));
    writeFileSync(join(repo, 'docs', 'a.md'), [
      'The work frobnicate and frobnicates and checks the sprockets.',       // 1: one finding for frobnicate; checks and sprockets pass
      '',
      'Frobnicate it. Frobnicate it again.',                                 // 3: the second sentence is not reported again
      '',
      'The quux and gizmo.',                                                 // 5
      '',
      'The wibble and wobble.',                                              // 7
      '',
      'The wubble and zap.',                                                 // 9
      '',
      '<!-- ste-ok: 1.7 -->',
      'The wibble work.',                                                    // 12: waived
      '',
      '<!-- ste-ok: 1.1 -->',
      'The wubble work.',                                                    // 15: waived
      '',
    ].join('\n'));
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack });
    const l1 = at(r.out, A_MD, 1);
    assert.deepEqual(l1.filter((l) => l.includes('1.1')), [`${A_MD}:1: [M] 1.1: "frobnicate" is not approved (v); write do`]);
    assert.deepEqual(at(r.out, A_MD, 3).filter((l) => l.includes('1.1')), [`${A_MD}:3: [M] 1.1: "Frobnicate" is not approved (v); write do`]);
    const l5 = at(r.out, A_MD, 5).filter((l) => l.includes('1.1'));
    assert.ok(l5.includes(`${A_MD}:5: [M] 1.1: "quux" is not approved (); write no alternative listed; change the construction (9.1)`), r.out);
    assert.ok(l5.includes(`${A_MD}:5: [M] 1.1: "gizmo" is not approved (n); write Write device.; Or part.`), r.out);
    const tech = (w, pos) => `${A_MD}:7: [H] 1.7: "${w}" is not approved as ${pos}; the dictionary permits it only as a technical noun or verb (glossary it if the project uses it that way)`;
    const l7 = at(r.out, A_MD, 7);
    assert.ok(l7.includes(tech('wibble', 'v')), r.out);
    assert.ok(l7.includes(tech('wobble', 'n')), r.out);
    const l9 = at(r.out, A_MD, 9);
    assert.ok(l9.includes(`${A_MD}:9: [M] 1.1: "wubble" is not approved (n); write WUBBLE (n)`), r.out);
    assert.ok(l9.includes(`${A_MD}:9: [M] 1.1: "zap" is not approved (v); write ZOT (TN)`), r.out);
    assert.deepEqual(at(r.out, A_MD, 12).filter((l) => l.includes('1.7')), []);
    assert.deepEqual(at(r.out, A_MD, 15).filter((l) => l.includes('1.1')), []);
    assert.match(r.out, /, 2 waived,/);
  });
});

test('pack words: more than 40 unknown words in one file are summarized and sorted by line, then name', () => {
  withDir((repo, td) => {
    const pack = makePack(td, { approved: BASE_APPROVED });
    const names = [];
    for (let i = 0; i < 26; i++) {
      names.push(`zq${String.fromCharCode(97 + i)}`);
    }
    for (let i = 0; i < 16; i++) {
      names.push(`yq${String.fromCharCode(97 + i)}`);
    }
    // 42 unknown words. The first 26 are on line 1, in reverse order; the next 16 are on line 3.
    const first = names.slice(0, 26).reverse().join(' ');
    const second = names.slice(26).join(' ');
    writeFileSync(join(repo, 'docs', 'a.md'), `${first}\n\n${second}\n`);
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack });
    const line = r.out.split('\n').find((l) => l.includes('[H] 1.5:'));
    assert.ok(line.startsWith(`${A_MD}:1: [H] 1.5: 42 words not in the STE dictionary (`), line);
    const shown = names.slice(0, 26).sort().concat(names.slice(26).sort()).slice(0, 40).join(', ');
    assert.ok(line.endsWith(`: ${shown}, +2 more`), line);
  });
});

test('pack words: a word beside a project glossary entry by stem is not reported', () => {
  withDir((repo, td) => {
    const pack = makePack(td, { approved: BASE_APPROVED });
    writeFileSync(join(repo, 'docs', '_glossary.json'), JSON.stringify({ technical_nouns: ['sprocket'] }));
    writeFileSync(join(repo, 'docs', 'a.md'), 'The sprockets work.\n');
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack });
    assert.doesNotMatch(r.out, /1\.5/);
    assert.equal(r.code, 0, r.out);
  });
});

test('a sentence with no letters has no words to check', () => {
  withDir((repo, td) => {
    const pack = makePack(td, { approved: BASE_APPROVED });
    writeFileSync(join(repo, 'docs', 'a.md'), '42\n');
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /1 sentences/);
  });
});

// ---------- failures ----------

test('a pack file that is not valid JSON stops the run with an unexpected-error message and a stack', () => {
  withDir((repo, td) => {
    const pack = makePack(td, { approved: '{ not json' });
    writeFileSync(join(repo, 'docs', 'a.md'), 'Read the file.\n');
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack });
    assert.equal(r.code, 2);
    assert.match(r.err, /^ste_check: unexpected error: .+\n/);
    assert.match(r.err, /\n\s+at /);
  });
});

test('an error with no message or stack is reported as the thrown value', () => {
  withDir((repo, td) => {
    const pack = makePack(td, { approved: [{ word: 'THROW_MARKER', pos: 'n' }] });
    writeFileSync(join(repo, 'docs', 'a.md'), 'Read the file.\n');
    const r = run(repo, ['docs'], { STE_AGENT_PACK: pack }, 'throw-undefined');
    assert.equal(r.code, 2);
    assert.equal(r.err, 'ste_check: unexpected error: undefined\nundefined\n');
  });
});
