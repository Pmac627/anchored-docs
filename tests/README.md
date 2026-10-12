# Parity tests for anchored-docs 2.0

The 2.0 scripts replace the 1.2.0 scripts. These tests prove that 2.0 behaves the same.
The 1.2.0 package had no tests, so the recorded baseline here is the only definition of "the same".

Status at cutover: 41 of 41 scenarios agree. 77 of 77 findings in the list are covered.

38 unit tests succeed on Linux and Windows (Node 22.0.0 and 24). An audit also compared 2.0 with 1.2.0 on five production repositories, with and
without the ASD agent pack, and found byte-identical `ste_check` output.

## Layout

| Path | Purpose |
| --- | --- |
| `run-cases.mjs` | Zero-dependency harness: `run`, `compare`, `coverage`. |
| `cases.json` | 45 scenarios: all `docs_check` subcommands, all `ste_check` modes, and the paths for help text and exit codes. |
| `fixtures/repo-flawed/` | A repo built to trigger all findings. |
| `fixtures/repo-clean/` | A repo that has no structural findings. |
| `fixtures/repo-legacy/` | A repo with a 2.0 bundle in `docs/`, a manual for humans, a `docs/tickets/` note, and links in the two directions. |
| `fixtures/synthetic-pack/` | An invented agent pack in the file layout of the ASD pack. It has no ASD content, so it is safe to commit. |
| `fixtures/wordlist.txt` | An invented `STE_DICTIONARY` word list. |
| `fixtures/glossary/` | An invented organization glossary. |
| `golden/2.1.0/` | The baseline that CI compares with: the 2.1.0 output for all scenarios. |
| `golden/1.2.0/` | The recorded 1.2.0 output for all scenarios. Retired with the 1.x support end; see the plan to remove it. |
| `golden/fm-1.2.0.json` | Recorded 1.2.0 frontmatter results on 40 YAML scenarios, 14 split-frontmatter scenarios, 37 docs and templates from production, 11 glossary scenarios, and 13 directory layouts. |
| `golden/glob-1.2.0.json` | Recorded 1.2.0 pattern-matching, glob, date-parsing, and path-order results. |
| `unit/*.test.mjs` | `node:test` suites that hold `_compat.mjs`, `_fm.mjs`, and `_glob.mjs` to those records, and test the 2.0 behavior of `docs_check.mjs` and `ste_check.mjs`. `migrate.test.mjs` and `migrate-rules.test.mjs` test the bundle location and the `migrate` command, on a copy of `fixtures/repo-legacy/`. |
| `intended-differences.json` | Text changes that 2.0 makes on purpose (file renames). Applied to `golden/1.2.0` only. |
| `coverage-patterns.json` | 77 finding messages that the goldens must contain. `coverage` fails if the goldens miss one. |

`golden/2.1.0/` is the baseline from 2.1.0 on. It adds four scenarios for the bundle location and `migrate` (scenarios 42 to 45 in `cases.json`). Four of the first 41 scenarios are different from the 2.0.1 output on purpose (the 2.0.1 baseline is in git history, commit e4038ea). These are `dc-usage-no-args` and `dc-usage-bad-subcommand` (the help text names `migrate`), `ste-usage` (the `--glossary-report` example names `docs/anchored-docs/`), and `ste-lookup-pack` (its message no longer names `docs/_glossary.json`). The other 37 are the same.

a new baseline (`run --out tests/golden/<version>`), point CI at it, and give the cause in the changelog.

`golden/1.2.0/` does not change. Some text in it is different in 2.0 on purpose, for example the names of the 1.2.0 scripts and data files.
`intended-differences.json` rewrites this text before a compare or a coverage check. Frontmatter stays YAML in the two
versions because an OKF bundle must use it.

## Commands

```bash
# Check the scripts against the baseline
node tests/run-cases.mjs run --skill skills/anchored-docs --out /tmp/results
node tests/run-cases.mjs compare tests/golden/2.1.0 /tmp/results

# Prove the corpus still triggers every expected finding
node tests/run-cases.mjs coverage tests/golden/2.1.0
```

The harness copies each fixture to a temp directory, so `map` can write and the fixtures stay the same.
It replaces paths and dates with placeholders before it saves the results, so results are the same on all machines. On Windows
it also changes `\` to `/`, because the team recorded the goldens on POSIX. No fixture contains a backslash.
`stale` scenarios use dates in 2020 and 2099, so they do not change with the calendar.

## Unit tests

```bash
node --test "tests/unit/*.test.mjs"
```

`docs_check` has 24 `dc-` scenarios and `docs_check.test.mjs`. `glob.test.mjs` tests pattern-matching, glob, and date-parsing
against the recorded 1.2.0 results.

Each suite compares a module with the recorded 1.2.0 results. Thus a failure means that 2.0 drifted from 1.x. The team did a mutation check of the suite.
It used eight deliberate breakages.

They are the processing of comments, whitespace rules, and the processing of newlines. They are also key
characters, line numbers, the source of the glossary, relative paths, and the quotation of values. The tests caught each one.

For 2.0.1, the team tried 17 more breakages of the scripts, each against the unit tests alone. They are path-depth order, each
skipped vendor folder, the `--repo` argument, image links, `process:` actors, and the frontmatter start. They are also the Unicode
word boundary, `let's`, `ste-ok: all`, `.mjs` files, non-ASCII digits, blockquotes, and lettered lists. The tests
catch all of them but one.

That one changes the `stale` limit from `>` to `>=`. The two are different only when the age of a doc
is the same as the limit to the millisecond. Thus no test without a fake clock can see it.

Two types of test are not part of that rule. Tests for new 2.0 behavior have no 1.x counterpart by design. They check that a JSON syntax error names the file. They check that a 1.x `_glossary.yaml` with no JSON twin gives a notice. They check that an unreadable file stops the run with exit 2 and a message that names it.

The second type is `docs_check.test.mjs` and `ste_check.test.mjs`. They run the
scripts with all `STE_*` variables removed, so the glossary and pack settings of the machine do not change the result.

## Which 1.2.0 output the baseline records

1.2.0 used an optional YAML library when the machine had it, and a small built-in parser when it did not. The two
paths gave different text. With the library, an unquoted timestamp became a date object. Thus four scenarios are different.

- `dc-okf-flawed`, `dc-okf-repo-flag`: a malformed `verified` entry printed `datetime.datetime(2026, 1, 10, ...)` and not the text that the author wrote.
- `dc-stale-flawed`, `dc-stale-days`: `still draft (generated 2026-01-10 10:00:00+00:00)` and not `2026-01-10T10:00:00Z`.

The baseline records the built-in-parser path. 2.0 has one parser. The parser agrees with that path and keeps the
text of the author.

## Behaviors 2.0 reproduces on purpose

- **Value formatting in messages.** Messages embed `{'by': 'nobody', ...}`, `['explanation', 'how-to']` and `stale_after=None`, as 1.x printed them. `formatValue` in `_compat.mjs` makes this text.
- **Backslashes in changed-file arguments are normalized** before the scripts compare them (`dc-affected-backslash`).
- **Rule 3.2 is unreachable.** The help text of 1.x listed it, but the code gives only 3.4, so no scenario tests it.
- **The shipped organization glossary has zero active terms.** `ste-status-none` and `dc-glossary-clean-default-org` work only with that glossary, so 2.0 ships an `org-glossary.json` with the same content at the same default path.
- **1.x did not read the map file with a full YAML parser.** It read `_map.yaml` with line regexes. The 2.0 map is JSON, so the read is a plain `JSON.parse`.

## Deliberate differences from 1.2.0

2.0 corrects these differences and lists them in the `SKILL.md` changelog. The parity scenarios do not test all of them, so
`unit/docs_check.test.mjs` and `unit/ste_check.test.mjs` pin them.

- The code back-link scan no longer skips all files when the repository is in a folder named `build`, `bin`, `dist`, and so on.
- The `affected` check and the `sources` globs are case-sensitive on all operating systems. 1.x was case-insensitive on Windows. Scenario `dc-affected-case` records the case-sensitive result.
- Equal entries in the glossary report and back-link findings come out in a stable sequence.
- A malformed glossary or map file stops the run with a message that names the file. A 1.x YAML file that stays in the bundle gives a notice.
- If the scripts cannot read a file, they stop the run with exit 2 and a message that names it, after the findings so far.

## Parser quirks fixed in 2.0.1

2.0.0 reproduced these 1.x behaviors. Thus the team could first prove that the new scripts are equal. 2.0.1 corrects them. `fm.test.mjs`
lists four recorded 1.2.0 scenarios with a different result (`INTENDED`) and tests the new behavior directly.

- A quotation mark starts a text value only where a value starts (after `key: `, `- `, `[`, `{`, or `,`). Before, an apostrophe in a word did the same, so `title: Don't # note` kept the comment.
- A key must have whitespace or the end of the line after its colon, as in YAML. Before, `key:value` and `http://x.y` parsed as the keys `key` and `http`.
- A list in a key of a list item or a block map (`- code: x`, then `docs:`, then `- y`) is the list of that key. The list can be indented below the key or at the column of the key. Before, the parser read it incorrectly.
- A frontmatter line that is not in the subset gets a report. `docs_check okf` reports it as `frontmatter line N not understood`. Before, the parser dropped it without a message. On 20 local docs bundles, `okf` output did not change.
- A glossary entry with no term text (`"term": null`, a missing or empty term, or a value that is not a string or an object) stops the run with a message that names the entry. Before, the parser skipped it with its synonyms. 1.x turned a YAML null term into the term `none`.

## Real-pack runs stay local

Output from the ASD agent pack has dictionary-derived text. Do not commit it.
To check the scripts with the ASD pack, run them with `STE_AGENT_PACK` set to your private copy. Write the
results in a folder that is not in the repository.

## Doc drift check

The fixtures reuse source paths, so ripwire can resolve a reference in a fixture doc to the copy in another fixture. Run the drift check on the repository docs only:

```bash
ripwire . --doc-drift --exclude=tests/fixtures
```

On Windows, call `ripwire.cmd`, as the skill reference in `skills/anchored-docs/references/ripwire.md` describes. The check should report 0 drift.
