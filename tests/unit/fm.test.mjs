import { mock } from 'node:test';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { homedir } from 'node:os';
// _fm.mjs must match the recorded 1.2.0 frontmatter and glossary results on every case, and report bad glossaries clearly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename, sep } from 'node:path';
import {
  splitFrontmatter, parseYamlSubset, parseYamlSubsetDetailed, readDoc, loadGlossaries, parseGlossaryFile, findDocsRoot, GlossaryError, ORG_GLOSSARY_DEFAULT, isBundleFolder, expandUser, findOrgGlossary,
} from '../../skills/anchored-docs/scripts/_fm.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES = join(HERE, '..', 'fixtures');
// Recorded frontmatter cases, from the 1.2.0 parser. The expected values are the behavior this port keeps.
const cases = {
  yamlSubset: [
    {"name":"empty","input":"","output":{"__map":[]}},
    {"name":"only-blank-lines","input":"\n\n  \n","output":{"__map":[]}},
    {"name":"scalars","input":"a: hello\nb: 'single'\nc: \"double\"\nd: ~\ne: null\nf: true\ng: False\nh: 42\ni: 2026-01-10T10:00:00Z\n","output":{"__map":[["a","hello"],["b","single"],["c","double"],["d",null],["e",null],["f",true],["g",false],["h","42"],["i","2026-01-10T10:00:00Z"]]}},
    {"name":"empty-value-no-block","input":"a:\nb: x\n","output":{"__map":[["a",{"__map":[]}],["b","x"]]}},
    {"name":"empty-value-then-end","input":"a:\n","output":{"__map":[["a",{"__map":[]}]]}},
    {"name":"single-char-quote","input":"a: \"\nb: '\n","output":{"__map":[["a","\""],["b","'"]]}},
    {"name":"quoted-with-colon-and-hash","input":"a: \"x: y # z\"\nb: 'p # q'\n","output":{"__map":[["a","x: y # z"],["b","p # q"]]}},
    {"name":"comment-forms","input":"# full line\na: 1 # trailing\nb: x#notcomment\nc: \"q#q\" # after\n","output":{"__map":[["a","1"],["b","x#notcomment"],["c","q#q"]]}},
    {"name":"apostrophe-swallows-hash","input":"title: Don't # stop\nnext: ok\n","output":{"__map":[["title","Don't # stop"],["next","ok"]]}},
    {"name":"inline-list","input":"a: [x, y, \"z, w\"]\nb: []\nc: [ ]\nd: [[1, 2], [3]]\n","output":{"__map":[["a",["x","y","z, w"]],["b",[]],["c",[]],["d",[["1","2"],["3"]]]]}},
    {"name":"inline-map","input":"g: { by: claude/1.0, at: 2026-01-10T10:00:00Z }\nh: {}\ni: { a: 1, b: [x, y], c: { d: 2 } }\n","output":{"__map":[["g",{"__map":[["by","claude/1.0"],["at","2026-01-10T10:00:00Z"]]}],["h",{"__map":[]}],["i",{"__map":[["a","1"],["b",["x","y"]],["c",{"__map":[["d","2"]]}]]}]]}},
    {"name":"inline-map-quoted-comma","input":"g: { by: \"a, b\", at: 'c: d' }\n","output":{"__map":[["g",{"__map":[["by","a, b"],["at","c: d"]]}]]}},
    {"name":"inline-map-part-without-colon","input":"g: { orphan, a: 1 }\n","output":{"__map":[["g",{"__map":[["a","1"]]}]]}},
    {"name":"block-list-scalars","input":"items:\n  - one\n  - two words\n  - \"three\"\n","output":{"__map":[["items",["one","two words","three"]]]}},
    {"name":"block-list-maps","input":"sources:\n  - id: a\n    resource: src/a/**\n  - id: b\n    resource: src/b.cs\n","output":{"__map":[["sources",[{"__map":[["id","a"],["resource","src/a/**"]]},{"__map":[["id","b"],["resource","src/b.cs"]]}]]]}},
    {"name":"block-list-flow-maps","input":"verified:\n  - { by: human:pat, at: 2099-01-01T00:00:00Z }\n  - { by: claude/1.0, at: 2026-01-10T10:00:00Z }\n","output":{"__map":[["verified",[{"__map":[["by","human:pat"],["at","2099-01-01T00:00:00Z"]]},{"__map":[["by","claude/1.0"],["at","2026-01-10T10:00:00Z"]]}]]]}},
    {"name":"block-list-mixed","input":"x:\n  - plain\n  - id: a\n    r: 1\n  - [p, q]\n  - { k: v }\n","output":{"__map":[["x",["plain",{"__map":[["id","a"],["r","1"]]},["p","q"],{"__map":[["k","v"]]}]]]}},
    {"name":"block-list-dash-only","input":"x:\n  -\n  - a\n","output":{"__map":[["x",["a"]]]}},
    {"name":"block-list-not-indented","input":"sources:\n- id: a\n  resource: b\n- id: c\n","output":{"__map":[["sources",[{"__map":[["id","a"],["resource","b"]]},{"__map":[["id","c"]]}]]]}},
    {"name":"block-list-colon-in-value","input":"x:\n  - see: http://example.com/a\n  - url: https://x.y/z\n","output":{"__map":[["x",[{"__map":[["see","http://example.com/a"]]},{"__map":[["url","https://x.y/z"]]}]]]}},
    {"name":"block-map","input":"meta:\n  a: 1\n  b: two\n","output":{"__map":[["meta",{"__map":[["a","1"],["b","two"]]}]]}},
    {"name":"block-map-then-key","input":"meta:\n  a: 1\nafter: z\n","output":{"__map":[["meta",{"__map":[["a","1"]]}],["after","z"]]}},
    {"name":"block-empty-between-keys","input":"a:\n\n\nb:\n  - x\n","output":{"__map":[["a",{"__map":[]}],["b",["x"]]]}},
    {"name":"tabs","input":"x:\n\t- a\n\t- b\n","output":{"__map":[["x",["a","b"]]]}},
    {"name":"crlf-input","input":"a: 1\r\nb:\r\n  - x\r\n  - y\r\n","output":{"__map":[["a","1"],["b",["x","y"]]]}},
    {"name":"cr-only-input","input":"a: 1\rb: 2\r","output":{"__map":[["a","1"],["b","2"]]}},
    {"name":"unicode-line-separator","input":"a: one b: two\n","output":{"__map":[["a","one"],["b","two"]]}},
    {"name":"form-feed-separator","input":"a: one\fb: two\n","output":{"__map":[["a","one"],["b","two"]]}},
    {"name":"key-forms","input":"stale-after: x\nunder_score: y\nCamel: z\n9digit: no\nKey With Spaces: no\n-lead: no\n","output":{"__map":[["stale-after","x"],["under_score","y"],["Camel","z"]]}},
    {"name":"unicode-keys-and-values","input":"título: café\nclaveñ: ü\néclair: no\n","output":{"__map":[["título","café"],["claveñ","ü"]]}},
    {"name":"key-without-space","input":"a:b\nhttp://x.y\n","output":{"__map":[["a","b"],["http","//x.y"]]}},
    {"name":"trailing-spaces","input":"a:    value   \nb:\t tab\t\n","output":{"__map":[["a","value"],["b","tab"]]}},
    {"name":"top-level-list","input":"- a\n- b\n","output":{"__map":[]}},
    {"name":"duplicate-keys","input":"a: 1\na: 2\nb: 3\n","output":{"__map":[["a","2"],["b","3"]]}},
    {"name":"indented-top-level-key","input":"  a: 1\nb: 2\n","output":{"__map":[["b","2"]]}},
    {"name":"nbsp-and-bom-whitespace","input":"a: value \nb:﻿x\n","output":{"__map":[["a","value"],["b","﻿x"]]}},
    {"name":"value-with-brackets-not-list","input":"a: [x\nb: y]\nc: {x\n","output":{"__map":[["a","[x"],["b","y]"],["c","{x"]]}},
    {"name":"quote-mismatch","input":"a: \"open\nb: 'mixed\"\n","output":{"__map":[["a","\"open"],["b","'mixed\""]]}},
    {"name":"nested-list-in-item-unsupported","input":"m:\n  - code: src/**\n    docs:\n      - docs/a.md\n      - docs/b.md\n","output":{"__map":[["m",[{"__map":[["code","src/**"],["docs",null]]},"docs/a.md","docs/b.md"]]]}},
    {"name":"long-realistic-frontmatter","input":"type: Flow\ntitle: Order fulfillment\ndescription: How an order moves.\ndiataxis: explanation\nstatus: stable\nstale_after: 2026-02-01T00:00:00Z\nsources:\n  - id: service\n    resource: src/Orders/OrderService.cs\n  - id: area\n    resource: src/Orders/**\ngenerated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }\nverified:\n  - { by: claude/1.0, at: 2026-01-10T10:00:00Z }\n  - { by: human:pat, at: 2099-01-01T00:00:00Z }\n","output":{"__map":[["type","Flow"],["title","Order fulfillment"],["description","How an order moves."],["diataxis","explanation"],["status","stable"],["stale_after","2026-02-01T00:00:00Z"],["sources",[{"__map":[["id","service"],["resource","src/Orders/OrderService.cs"]]},{"__map":[["id","area"],["resource","src/Orders/**"]]}]],["generated",{"__map":[["by","claude/1.0"],["at","2026-01-10T10:00:00Z"]]}],["verified",[{"__map":[["by","claude/1.0"],["at","2026-01-10T10:00:00Z"]]},{"__map":[["by","human:pat"],["at","2099-01-01T00:00:00Z"]]}]]]}},
  ],
  splitFrontmatter: [
    {"input":"","output":[null,"",1]},
    {"input":"no frontmatter\n","output":[null,"no frontmatter\n",1]},
    {"input":"---\na: 1\n---\nbody\n","output":["a: 1","body\n",3]},
    {"input":"---\na: 1\n---","output":["a: 1","",3]},
    {"input":"---\na: 1\n---\n\nbody\n","output":["a: 1","\nbody\n",3]},
    {"input":"---\n---\nbody\n","output":[null,"---\n---\nbody\n",1]},
    {"input":"---\n\n---\nbody\n","output":["","body\n",3]},
    {"input":"---  \na: 1\n---  \nbody","output":["a: 1","body",3]},
    {"input":"---\r\na: 1\r\n---\r\nbody\r\n","output":[null,"---\r\na: 1\r\n---\r\nbody\r\n",1]},
    {"input":"--- \na: 1\n--- trailing\nbody\n","output":["a: 1","trailing\nbody\n",3]},
    {"input":"---\na: 1\nb: 2\nc: 3\n---\nline1\nline2\n","output":["a: 1\nb: 2\nc: 3","line1\nline2\n",5]},
    {"input":"text\n---\na: 1\n---\n","output":[null,"text\n---\na: 1\n---\n",1]},
    {"input":"---\na: 1\n----\nbody\n---\n","output":["a: 1","-\nbody\n---\n",3]},
    {"input":"﻿---\na: 1\n---\nbody\n","output":[null,"﻿---\na: 1\n---\nbody\n",1]},
  ],
  glossary: [
    {"name":"project-only","org":null,"project":{"technical_nouns":[{"term":"worker","meaning":"the process that reads the queue","unapproved":["consumer"]}],"technical_verbs":[{"term":"ingest"}]},"result":{"approved":["ingest","worker"],"unapproved":[["consumer","worker"]],"origin":[["worker","project"],["ingest","project"]],"entries":[["worker",[{"term":"worker","kind":"noun","origin":"project","file":"_glossary.json","meaning":"the process that reads the queue","unapproved":["consumer"]}]],["ingest",[{"term":"ingest","kind":"verb","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]]],"conflicts":[],"notices":[],"hasOrg":true,"hasProject":true}},
    {"name":"org-only","org":{"technical_nouns":[{"term":"gate","unapproved":["checkpoint"]}]},"project":null,"result":{"approved":["gate"],"unapproved":[["checkpoint","gate"]],"origin":[["gate","org"]],"entries":[["gate",[{"term":"gate","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":["checkpoint"]}]]],"conflicts":[],"notices":[],"hasOrg":true,"hasProject":false}},
    {"name":"self-consistency-conflict","org":null,"project":{"technical_nouns":[{"term":"a","unapproved":["b"]},{"term":"b"}]},"result":{"approved":["a","b"],"unapproved":[["b","a"]],"origin":[["a","project"],["b","project"]],"entries":[["a",[{"term":"a","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":["b"]}]],["b",[{"term":"b","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]]],"conflicts":["project glossary _glossary.json: \"b\" is an approved term and also an unapproved synonym of \"a\"","project glossary approves \"b\", which the org glossary lists as an unapproved synonym of \"a\""],"notices":[],"hasOrg":true,"hasProject":true}},
    {"name":"synonym-points-two-ways","org":{"technical_nouns":[{"term":"x","unapproved":["s"]}]},"project":{"technical_nouns":[{"term":"y","unapproved":["s"]}]},"result":{"approved":["x","y"],"unapproved":[["s","x"]],"origin":[["x","org"],["y","project"]],"entries":[["x",[{"term":"x","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":["s"]}]],["y",[{"term":"y","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":["s"]}]]],"conflicts":["synonym \"s\" points at \"x\" in one glossary and at \"y\" in the other"],"notices":[],"hasOrg":true,"hasProject":true}},
    {"name":"meaning-normalized-equal","org":{"technical_nouns":[{"term":"queue","meaning":"A  first-in   buffer."}]},"project":{"technical_nouns":[{"term":"queue","meaning":"a first-in buffer"}]},"result":{"approved":["queue"],"unapproved":[],"origin":[["queue","both"]],"entries":[["queue",[{"term":"queue","kind":"noun","origin":"org","file":"org-glossary.json","meaning":"a first-in buffer","unapproved":[]},{"term":"queue","kind":"noun","origin":"project","file":"_glossary.json","meaning":"a first-in buffer","unapproved":[]}]]],"conflicts":[],"notices":["project glossary repeats org term \"queue\" (redundant; delete it, or move its synonyms to the org glossary)"],"hasOrg":true,"hasProject":true}},
    {"name":"meaning-differs","org":{"technical_nouns":[{"term":"queue","meaning":"a buffer"}]},"project":{"technical_nouns":[{"term":"queue","meaning":"a line of people"}]},"result":{"approved":["queue"],"unapproved":[],"origin":[["queue","both"]],"entries":[["queue",[{"term":"queue","kind":"noun","origin":"org","file":"org-glossary.json","meaning":"a buffer","unapproved":[]},{"term":"queue","kind":"noun","origin":"project","file":"_glossary.json","meaning":"a line of people","unapproved":[]}]]],"conflicts":["project glossary redefines org term \"queue\" with a different meaning (org: \"a buffer\"; project: \"a line of people\"). Use a different name for the project's item."],"notices":[],"hasOrg":true,"hasProject":true}},
    {"name":"repeat-without-meaning","org":{"technical_nouns":[{"term":"queue","meaning":"a buffer"}]},"project":{"technical_nouns":[{"term":"queue"}]},"result":{"approved":["queue"],"unapproved":[],"origin":[["queue","both"]],"entries":[["queue",[{"term":"queue","kind":"noun","origin":"org","file":"org-glossary.json","meaning":"a buffer","unapproved":[]},{"term":"queue","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]]],"conflicts":[],"notices":["project glossary repeats org term \"queue\" (redundant; delete it, or move its synonyms to the org glossary)"],"hasOrg":true,"hasProject":true}},
    {"name":"project-approves-org-synonym","org":{"technical_nouns":[{"term":"ripwire","unapproved":["tripwire"]}]},"project":{"technical_nouns":[{"term":"tripwire"}]},"result":{"approved":["ripwire","tripwire"],"unapproved":[["tripwire","ripwire"]],"origin":[["ripwire","org"],["tripwire","project"]],"entries":[["ripwire",[{"term":"ripwire","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":["tripwire"]}]],["tripwire",[{"term":"tripwire","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]]],"conflicts":["project glossary approves \"tripwire\", which the org glossary lists as an unapproved synonym of \"ripwire\""],"notices":[],"hasOrg":true,"hasProject":true}},
    {"name":"project-lists-org-term-as-synonym","org":{"technical_nouns":[{"term":"gate"}]},"project":{"technical_nouns":[{"term":"checkpointer","unapproved":["gate"]}]},"result":{"approved":["checkpointer","gate"],"unapproved":[],"origin":[["gate","org"],["checkpointer","project"]],"entries":[["gate",[{"term":"gate","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":[]}]],["checkpointer",[{"term":"checkpointer","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":["gate"]}]]],"conflicts":["project glossary lists org term \"gate\" as an unapproved synonym of \"checkpointer\""],"notices":[],"hasOrg":true,"hasProject":true}},
    {"name":"case-and-string-entries","org":{"technical_nouns":["Queue","  Gate  "]},"project":{"technical_nouns":[{"term":"QUEUE"},{"term":"Valve","unapproved":["Tap","  "]}],"technical_verbs":["Ingest"]},"result":{"approved":["gate","ingest","queue","valve"],"unapproved":[["tap","valve"]],"origin":[["queue","both"],["gate","org"],["valve","project"],["ingest","project"]],"entries":[["queue",[{"term":"queue","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":[]},{"term":"queue","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]],["gate",[{"term":"gate","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":[]}]],["valve",[{"term":"valve","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":["tap"]}]],["ingest",[{"term":"ingest","kind":"verb","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]]],"conflicts":[],"notices":["project glossary repeats org term \"queue\" (redundant; delete it, or move its synonyms to the org glossary)"],"hasOrg":true,"hasProject":true}},
    {"name":"both-origin-synonyms","org":{"technical_nouns":[{"term":"a","unapproved":["s1"]}]},"project":{"technical_nouns":[{"term":"a","unapproved":["s2"]},{"term":"c","unapproved":["s1"]}]},"result":{"approved":["a","c"],"unapproved":[["s1","a"],["s2","a"]],"origin":[["a","both"],["c","project"]],"entries":[["a",[{"term":"a","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":["s1"]},{"term":"a","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":["s2"]}]],["c",[{"term":"c","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":["s1"]}]]],"conflicts":["synonym \"s1\" points at \"a\" in one glossary and at \"c\" in the other"],"notices":["project glossary repeats org term \"a\" (redundant; delete it, or move its synonyms to the org glossary)"],"hasOrg":true,"hasProject":true}},
  ],
  fixtureGlossary: [
    {"repo":"repo-flawed","result":{"approved":["checkpointer","gate","ingest","queue","reserve","ripwire","tripwire","worker"],"unapproved":[["tripwire","ripwire"],["checkpoint","gate"],["consumer","worker"]],"origin":[["ripwire","both"],["gate","org"],["queue","both"],["ingest","both"],["worker","project"],["tripwire","project"],["checkpointer","project"],["reserve","project"]],"entries":[["ripwire",[{"term":"ripwire","kind":"noun","origin":"org","file":"org-glossary.json","meaning":"the code-structure tool","unapproved":["tripwire"]},{"term":"ripwire","kind":"noun","origin":"project","file":"_glossary.json","meaning":"a different meaning for the same word","unapproved":[]}]],["gate",[{"term":"gate","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":["checkpoint"]}]],["queue",[{"term":"queue","kind":"noun","origin":"org","file":"org-glossary.json","meaning":"a first-in first-out buffer of messages","unapproved":[]},{"term":"queue","kind":"noun","origin":"project","file":"_glossary.json","meaning":"a first-in first-out buffer of messages","unapproved":[]}]],["ingest",[{"term":"ingest","kind":"verb","origin":"org","file":"org-glossary.json","meaning":"read data into a store","unapproved":[]},{"term":"ingest","kind":"verb","origin":"project","file":"_glossary.json","meaning":"read data into a store","unapproved":[]}]],["worker",[{"term":"worker","kind":"noun","origin":"project","file":"_glossary.json","meaning":"the process that reads the queue","unapproved":["consumer"]}]],["tripwire",[{"term":"tripwire","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]],["checkpointer",[{"term":"checkpointer","kind":"noun","origin":"project","file":"_glossary.json","meaning":null,"unapproved":["gate"]}]],["reserve",[{"term":"reserve","kind":"verb","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]]],"conflicts":["project glossary approves \"tripwire\", which the org glossary lists as an unapproved synonym of \"ripwire\"","project glossary lists org term \"gate\" as an unapproved synonym of \"checkpointer\"","project glossary redefines org term \"ripwire\" with a different meaning (org: \"the code-structure tool\"; project: \"a different meaning for the same word\"). Use a different name for the project's item."],"notices":["project glossary repeats org term \"queue\" (redundant; delete it, or move its synonyms to the org glossary)","project glossary repeats org term \"ingest\" (redundant; delete it, or move its synonyms to the org glossary)"],"hasOrg":true,"hasProject":true}},
    {"repo":"repo-clean","result":{"approved":["gate","ingest","queue","ripwire"],"unapproved":[["tripwire","ripwire"],["checkpoint","gate"]],"origin":[["ripwire","org"],["gate","org"],["queue","both"],["ingest","both"]],"entries":[["ripwire",[{"term":"ripwire","kind":"noun","origin":"org","file":"org-glossary.json","meaning":"the code-structure tool","unapproved":["tripwire"]}]],["gate",[{"term":"gate","kind":"noun","origin":"org","file":"org-glossary.json","meaning":null,"unapproved":["checkpoint"]}]],["queue",[{"term":"queue","kind":"noun","origin":"org","file":"org-glossary.json","meaning":"a first-in first-out buffer of messages","unapproved":[]},{"term":"queue","kind":"noun","origin":"project","file":"_glossary.json","meaning":"a first-in first-out buffer of messages","unapproved":[]}]],["ingest",[{"term":"ingest","kind":"verb","origin":"org","file":"org-glossary.json","meaning":"read data into a store","unapproved":[]},{"term":"ingest","kind":"verb","origin":"project","file":"_glossary.json","meaning":null,"unapproved":[]}]]],"conflicts":[],"notices":["project glossary repeats org term \"queue\" (redundant; delete it, or move its synonyms to the org glossary)","project glossary repeats org term \"ingest\" (redundant; delete it, or move its synonyms to the org glossary)"],"hasOrg":true,"hasProject":true}},
  ],
  docsRoot: [
    {"files":["docs/flows/a.md"],"start":"docs/flows/a.md","output":"docs"},
    {"files":["docs/flows/a.md"],"start":"docs/flows","output":"docs"},
    {"files":["docs/flows/a.md"],"start":"docs","output":"docs"},
    {"files":["proj/docs/a.md"],"start":"proj/docs/a.md","output":"proj/docs"},
    {"files":["src/Foo.cs","docs/_glossary.yaml"],"start":"src/Foo.cs","output":"docs"},
    {"files":["src/deep/Foo.cs","docs/_glossary.yaml"],"start":"src/deep/Foo.cs","output":"docs"},
    {"files":["src/Foo.cs"],"start":"src/Foo.cs","output":"src"},
    {"files":["wiki/index.md","wiki/flows/x.md","wiki/notes/n.md"],"start":"wiki/notes/n.md","output":"wiki"},
    {"files":["wiki/index.md","wiki/notes/n.md"],"start":"wiki/notes/n.md","output":"wiki/notes"},
    {"files":["site/_glossary.yaml","site/pages/p.md"],"start":"site/pages/p.md","output":"site"},
    {"files":["README.md"],"start":"README.md","output":"."},
    {"files":["a/b/c/d.md"],"start":"a/b/c/d.md","output":"a/b/c"},
    {"files":["docs/x.md"],"start":".","output":"."},
  ],
};

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

// Cases where 2.0.1 deliberately reads YAML as YAML does, not as the 1.2.0 parser did.
const M = (...entries) => ({ __map: entries });
const INTENDED = {
  // A quote opens a quoted scalar only where a value starts, so the apostrophe does not hide the comment.
  'apostrophe-swallows-hash': M(['title', "Don't"], ['next', 'ok']),
  // "a:b" and "http://x.y" have no space after the colon, so they are not keys (they are skipped lines).
  'key-without-space': M(),
  // A byte order mark is not whitespace, so "b:<BOM>x" is not a key either.
  'nbsp-and-bom-whitespace': M(['a', 'value']),
  // A list under a key inside a list item is that key's value.
  'nested-list-in-item-unsupported': M(['m', [M(['code', 'src/**'], ['docs', ['docs/a.md', 'docs/b.md']])]]),
};

test('parseYamlSubset matches the 1.2.0 fallback parser on every captured case, apart from the intended fixes', () => {
  const names = new Set(cases.yamlSubset.map((c) => c.name));
  for (const name of Object.keys(INTENDED)) assert.ok(names.has(name), `INTENDED names an unknown case: ${name}`);
  for (const c of cases.yamlSubset) assert.deepEqual(norm(parseYamlSubset(c.input)), INTENDED[c.name] ?? c.output, c.name);
});

test('a # after a quote inside a word starts a comment; a # inside a quoted value does not', () => {
  const cases = [
    ['title: "a # b"\n', 'a # b'],
    ["title: 'x' # note\n", 'x'],
    ['title: It\'s "here" # note\n', 'It\'s "here"'],
    ["title: Don't#stop\n", "Don't#stop"],
  ];
  for (const [input, want] of cases) assert.equal(parseYamlSubset(input).get('title'), want, input);
  assert.deepEqual(parseYamlSubset('tags: [ "a # b", \'c\' ] # note\n').get('tags'), ['a # b', 'c']);
  assert.deepEqual(parseYamlSubset('tags:\n  - "x # y" # note\n  - z\n').get('tags'), ['x # y', 'z']);
});

test('a list nested under a key is read in each layout YAML allows', () => {
  const docsOf = (text) => norm(parseYamlSubset(text).get('m'));
  const want = [M(['code', 'a'], ['docs', ['x', 'y']]), M(['code', 'b'], ['docs', ['z']])];
  // Indented under the key, and at the same column as the key.
  assert.deepEqual(docsOf('m:\n  - code: a\n    docs:\n      - x\n      - y\n  - code: b\n    docs:\n      - z\n'), want);
  assert.deepEqual(docsOf('m:\n  - code: a\n    docs:\n    - x\n    - y\n  - code: b\n    docs:\n    - z\n'), want);
  // The key on the line of the dash.
  assert.deepEqual(docsOf('m:\n  - docs:\n      - x\n    code: a\n'), [M(['docs', ['x']], ['code', 'a'])]);
  // A key with no list keeps a null value, as before.
  assert.deepEqual(docsOf('m:\n  - code: a\n    docs:\n  - code: b\n'), [M(['code', 'a'], ['docs', null]), M(['code', 'b'])]);
  // In a block map.
  assert.deepEqual(norm(parseYamlSubset('g:\n  by: x\n  tags:\n    - t1\n    - t2\n').get('g')), M(['by', 'x'], ['tags', ['t1', 't2']]));
});

test('lines outside the subset are reported with their line number, not dropped silently', () => {
  const { map, skipped } = parseYamlSubsetDetailed('title: T\nhttp://x.y\njust text\nm:\n  - a\n  stray words\n');
  assert.deepEqual(norm(map), M(['title', 'T'], ['m', ['a']]));
  assert.deepEqual(skipped, [{ line: 2, text: 'http://x.y' }, { line: 3, text: 'just text' }, { line: 6, text: 'stray words' }]);
});

test('splitFrontmatter matches split_frontmatter', () => {
  for (const c of cases.splitFrontmatter) {
    const r = splitFrontmatter(c.input);
    assert.deepEqual([r.frontmatter, r.body, r.bodyStartLine], c.output, JSON.stringify(c.input));
  }
});

test('loadGlossaries matches load_glossaries on every scenario', () => {
  withTemp((td) => {
    for (const s of cases.glossary) {
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
  for (const f of cases.fixtureGlossary) {
    assert.deepEqual(dumpGlossary(loadGlossaries(join(FIXTURES, f.repo, 'docs'))), f.result, f.repo);
  }
  delete process.env.STE_ORG_GLOSSARY;
});

test('findDocsRoot matches find_docs_root, relative paths included', () => {
  const cwd = process.cwd();
  try {
    for (const c of cases.docsRoot) {
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
      // An entry with no term would drop its synonyms with no message.
      ['{"technical_nouns": [{"term": null, "unapproved": ["x"]}]}', 'entry 1 of "technical_nouns" has no "term" text'],
      ['{"technical_verbs": ["ingest", {"unapproved": ["x"]}]}', 'entry 2 of "technical_verbs" has no "term" text'],
      ['{"technical_nouns": [{"term": "  "}]}', 'entry 1 of "technical_nouns" has no "term" text'],
      ['{"technical_nouns": [{"term": 7}]}', 'entry 1 of "technical_nouns" has no "term" text'],
      ['{"technical_nouns": ["a", 7]}', 'entry 2 of "technical_nouns" must be a term string or an object'],
      ['{"technical_nouns": [""]}', 'entry 1 of "technical_nouns" must be a term string or an object'],
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

test('isBundleFolder recognizes a root index.md with okf_version, and nothing else', () => {
  withTemp((td) => {
    writeFileSync(join(td, 'index.md'), '---\nokf_version: "0.2"\n---\n');
    assert.equal(isBundleFolder(td), true);
  });
  withTemp((td) => {
    writeFileSync(join(td, 'index.md'), '# Notes\n');
    assert.equal(isBundleFolder(td), false);
  });
  withTemp((td) => assert.equal(isBundleFolder(td), false));
});

test('a meaning that is only dots or spaces is no meaning', () => {
  withTemp((td) => {
    const root = join(td, 'docs');
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, '_glossary.json'), JSON.stringify({ technical_nouns: [{ term: 'queue', meaning: '...' }] }));
    process.env.STE_ORG_GLOSSARY = join(td, 'missing-org.json');
    try {
      assert.equal(loadGlossaries(root).entries.get('queue')[0].meaning, null);
    } finally {
      delete process.env.STE_ORG_GLOSSARY;
    }
  });
});

test('expandUser replaces a lone ~ with the home folder', () => {
  assert.equal(expandUser('~'), homedir());
});

test('findOrgGlossary returns null when the shipped default is missing', () => {
  const realExists = fs.existsSync;
  delete process.env.STE_ORG_GLOSSARY;
  mock.method(fs, 'existsSync', () => false);
  syncBuiltinESMExports();
  try {
    assert.equal(findOrgGlossary(), null);
  } finally {
    mock.restoreAll();
    syncBuiltinESMExports();
    assert.equal(fs.existsSync, realExists);
  }
});

test('a glossary that cannot be read names the file, even when the error has no code', () => {
  withTemp((td) => {
    const file = join(td, '_glossary.json');
    writeFileSync(file, '{}');
    mock.method(fs, 'readFileSync', () => {
      throw new Error('no code here');
    });
    syncBuiltinESMExports();
    try {
      assert.throws(() => parseGlossaryFile(file, 'project'), (e) => e instanceof GlossaryError && e.message.includes('no code here'));
    } finally {
      mock.restoreAll();
      syncBuiltinESMExports();
    }
  });
});
