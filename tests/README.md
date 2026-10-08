# Parity tests for anchored-docs 2.0

The 2.0 scripts replace the 1.2.0 scripts. These tests prove that 2.0 behaves the same.
The 1.2.0 package had no tests, so the recorded baseline here is the only definition of "the same".

Status at cutover: 41 of 41 cases identical, 77 of 77 expected findings covered, and 38 unit tests passing on
Linux and Windows (Node 22.0.0 and 24). An audit also compared 2.0 with 1.2.0 on five real repositories, with and
without the real agent pack, and found byte-identical `ste_check` output.

## Layout

| Path | Purpose |
| --- | --- |
| `run-cases.mjs` | Zero-dependency harness: `run`, `compare`, `coverage`. |
| `cases.json` | 41 cases: every `docs_check` subcommand, every `ste_check` mode, and the usage and exit-code paths. |
| `fixtures/repo-flawed/` | A repo built to trigger every finding. |
| `fixtures/repo-clean/` | A repo that passes the structural checks. |
| `fixtures/synthetic-pack/` | An invented agent pack in the real pack's file layout. It contains no ASD content, so it is safe to commit. |
| `fixtures/wordlist.txt` | An invented `STE_DICTIONARY` word list. |
| `fixtures/glossary/` | An invented organization glossary. |
| `golden/2.0.1/` | The baseline that CI compares with: the 2.0.1 output for every case. |
| `golden/1.2.0/` | The recorded 1.2.0 output for every case. 2.0.1 still matches it once the renames below are applied. |
| `golden/fm-1.2.0.json` | Recorded 1.2.0 frontmatter results on 40 YAML cases, 14 split cases, 37 real docs and templates, 11 glossary scenarios, and 13 directory layouts. |
| `golden/glob-1.2.0.json` | Recorded 1.2.0 pattern-matching, glob, date-parsing, and path-order results. |
| `unit/*.test.mjs` | `node:test` suites that hold `_compat.mjs`, `_fm.mjs`, and `_glob.mjs` to those records, and test the 2.0 behavior of `docs_check.mjs` and `ste_check.mjs`. |
| `intended-differences.json` | Text changes that 2.0 makes on purpose (file renames). Applied to `golden/1.2.0` only. |
| `coverage-patterns.json` | 77 expected finding messages. `coverage` fails if the goldens miss one. |

`golden/2.0.1/` is the baseline from 2.0.1 on. It was recorded from 2.0.1 after 2.0.1 matched `golden/1.2.0` on all
41 cases, so it holds the 1.x behavior with the 2.0 file names. When a later change alters output on purpose, record
a new baseline (`run --out tests/golden/<version>`), point CI at it, and give the reason in the changelog.

`golden/1.2.0/` does not change. Text in it that 2.0 changes on purpose, such as the old script and data file names,
is rewritten by `intended-differences.json` before a comparison or a coverage check. Frontmatter stays YAML in both
versions because OKF requires it.

## Commands

```bash
# Check the scripts against the baseline
node tests/run-cases.mjs run --skill skills/anchored-docs --out /tmp/results
node tests/run-cases.mjs compare tests/golden/2.0.1 /tmp/results

# Prove the corpus still triggers every expected finding
node tests/run-cases.mjs coverage tests/golden/2.0.1
```

The harness copies each fixture to a temp directory, so `map` can write without touching the fixtures.
It replaces paths and dates with placeholders before saving, so results are the same on any machine. On Windows
it also changes `\` to `/`, because the goldens were recorded on POSIX. No fixture contains a backslash.
`stale` cases use dates in 2020 and 2099, so they do not change with the calendar.

## Unit tests

```bash
node --test "tests/unit/*.test.mjs"
```

`docs_check` is covered by the 24 `dc-` cases plus `docs_check.test.mjs`; pattern matching, globbing, and date
parsing by `glob.test.mjs`, which compares against the recorded 1.2.0 results.

Each suite compares a module with the recorded 1.2.0 results, so a failure means 2.0 drifted from 1.x. The suite
was mutation-checked: eight deliberate breakages (comment handling, whitespace rules, newline handling, key
characters, line numbers, glossary origin, relative paths, value quoting) were each caught.

For 2.0.1, 17 more breakages of the scripts were tried, each against the unit tests alone: path-depth order, each
skipped vendor folder, the `--repo` argument, image links, `process:` actors, the frontmatter start, the Unicode
word boundary, `let's`, `ste-ok: all`, `.mjs` files, non-ASCII digits, blockquotes, and lettered lists. The tests
catch all of them but one. That one changes the `stale` limit from `>` to `>=`; the two differ only when a doc's age
equals the limit to the millisecond, so no test without a fake clock can see it.

Two kinds of test sit outside that rule. Tests for new 2.0 behavior (a JSON syntax error names the file, a
1.x `_glossary.yaml` with no JSON twin produces a notice, an unreadable file stops the run with exit 2 and a
message that names it) have no 1.x counterpart by design. `docs_check.test.mjs` and `ste_check.test.mjs` run the
scripts with every `STE_*` variable removed, so the machine's own glossary and pack settings do not change the result.

## Which 1.2.0 output the baseline records

1.2.0 used an optional YAML library when it was installed, and a small built-in parser when it was not. The two
paths gave different text: with the library, an unquoted timestamp became a date object, so four cases differ.

- `dc-okf-flawed`, `dc-okf-repo-flag`: a malformed `verified` entry printed `datetime.datetime(2026, 1, 10, ...)` instead of the text the author wrote.
- `dc-stale-flawed`, `dc-stale-days`: `still draft (generated 2026-01-10 10:00:00+00:00)` instead of `2026-01-10T10:00:00Z`.

The baseline records the built-in-parser path. 2.0 has one parser, which matches that path and keeps the
author's own text.

## Behaviors 2.0 reproduces on purpose

- **Value formatting in messages.** Messages embed `{'by': 'nobody', ...}`, `['explanation', 'how-to']` and `stale_after=None`, as 1.x printed them. `formatValue` in `_compat.mjs` produces this text.
- **Backslashes in changed-file arguments are normalized** before matching (`dc-affected-backslash`).
- **Rule 3.2 is unreachable.** The 1.x usage text listed it, but the code only emits 3.4, so no case covers it.
- **The shipped organization glossary has zero active terms.** `ste-status-none` and `dc-glossary-clean-default-org` depend on that, so 2.0 ships an `org-glossary.json` with the same content at the same default path.
- **The map file was never read with a full YAML parser.** 1.x read `_map.yaml` with line regexes. The 2.0 map is JSON, so this is a plain `JSON.parse`.

## Deliberate differences from 1.2.0

These are fixed in 2.0 and listed in the `SKILL.md` changelog. The parity cases do not exercise all of them, so
`unit/docs_check.test.mjs` and `unit/ste_check.test.mjs` pin them.

- The code back-link scan no longer skips every file when the repository sits under a folder named `build`, `bin`, `dist`, and so on.
- `affected` matching and `sources` globs are case-sensitive on every operating system. 1.x matched case-insensitively on Windows; case `dc-affected-case` records the case-sensitive result.
- Glossary-report ties and back-link findings come out in a stable order.
- A malformed glossary or map file stops with a message that names the file, and a leftover 1.x YAML file produces a notice.
- A file that cannot be read stops the run with exit 2 and a message that names it, after the findings found so far.

## Parser quirks fixed in 2.0.1

2.0.0 reproduced these 1.x behaviors so the port could be proven equal first. 2.0.1 fixes them. `fm.test.mjs`
lists the four recorded 1.2.0 cases whose result changes (`INTENDED`) and tests the new behavior directly.

- A quote opens a quoted value only where a value starts (after `key: `, `- `, `[`, `{`, or `,`). Before, an apostrophe inside a word did, so `title: Don't # note` kept the comment.
- A key needs whitespace or the end of the line after its colon, as in YAML. Before, `key:value` and `http://x.y` parsed as the keys `key` and `http`.
- A list nested under a key in a list item or a block map (`- code: x`, then `docs:`, then `- y`) is read as that key's list, indented under the key or at its column. Before, it parsed wrongly.
- A frontmatter line outside the subset is no longer dropped silently. `docs_check okf` reports it as `frontmatter line N not understood`. On 20 local docs bundles, `okf` output did not change.
- A glossary entry with no term text (`"term": null`, a missing or blank term, or a value that is not a string or an object) stops the run with a message that names the entry. Before, it was skipped with its synonyms. 1.x turned a YAML null term into the term `none`.

## Real-pack runs stay local

Output produced with the real ASD agent pack contains dictionary-derived text and must not be committed.
To check the scripts with the real pack, run them with `STE_AGENT_PACK` set to your private copy and write the
results outside the repository.
