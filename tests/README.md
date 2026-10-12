# Tests for anchored-docs

Two kinds of test run in CI on Linux, Windows, and macOS:

- **Unit tests** (`unit/*.test.mjs`) use `node:test` and check each module and each behavior directly.
- **Parity tests** (`run-cases.mjs`) run the scripts as child processes on 45 scenarios and compare the output with the recorded baseline in `golden/2.1.0/`.

The baseline is the output of 2.1.0. A change that alters a scenario's output needs a new baseline (`run --out tests/golden/<version>`), a point in CI that uses it, and the cause in the `SKILL.md` changelog.

## Layout

| Path | Purpose |
| --- | --- |
| `run-cases.mjs` | Zero-dependency harness: `run`, `compare`, `coverage`. |
| `cases.json` | 45 scenarios: all `docs_check` subcommands, all `ste_check` modes, and the help text and exit codes. |
| `fixtures/repo-flawed/` | A repo built to trigger all findings. |
| `fixtures/repo-clean/` | A repo with no structural findings. |
| `fixtures/repo-legacy/` | A repo with a 2.0 bundle in `docs/`, a manual for humans, a `docs/tickets/` note, and links in both directions. |
| `fixtures/synthetic-pack/` | An invented agent pack in the file layout of the ASD pack. It has no ASD content, so it is safe to commit. |
| `fixtures/wordlist.txt` | An invented `STE_DICTIONARY` word list. |
| `fixtures/glossary/` | An invented organization glossary. |
| `golden/2.1.0/` | The baseline that CI compares with: the 2.1.0 output for all scenarios. |
| `coverage-patterns.json` | 77 finding messages that the baseline must contain. `coverage` fails if one is missing. |
| `unit/*.test.mjs` | Unit suites for `_compat`, `_fm`, `_fs`, `_glob`, `_migrate`, `docs_check`, `ste_check`, and `build-skill`. |
| `unit/*.branches.test.mjs` | Branch-level suites for `docs_check`, `ste_check`, `_migrate`, and `build-skill`. |

Scenarios 42 to 45 cover the bundle location and `migrate`. Scenarios 1 to 41 match the 2.0.1 output, except four that change on purpose:

- `dc-usage-no-args` and `dc-usage-bad-subcommand`: the help text names `migrate`.
- `ste-usage`: the `--glossary-report` example names `docs/anchored-docs/`.
- `ste-lookup-pack`: the message no longer names `docs/_glossary.json`.

The 2.0.1 baseline is in git history at commit `e4038ea`.

## Commands

```bash
# Check the scripts against the baseline
node tests/run-cases.mjs run --skill skills/anchored-docs --out /tmp/results
node tests/run-cases.mjs compare tests/golden/2.1.0 /tmp/results

# Prove the corpus still triggers every expected finding
node tests/run-cases.mjs coverage tests/golden/2.1.0
```

The harness copies each fixture to a temp directory, so `map` can write and the fixtures stay the same. It replaces paths and dates with placeholders before it saves results, so results match on all machines. On Windows it also changes `\` to `/`, because the baseline was recorded on POSIX. No fixture contains a backslash. `stale` scenarios use dates in 2020 and 2099, so they do not change with the calendar.

## Unit tests

```bash
node --test "tests/unit/*.test.mjs"
```

The `docs_check` and `ste_check` suites run the scripts with all `STE_*` variables removed, so the glossary and pack settings of the machine do not change the result.

Tests for behavior that is new in 2.0 check it directly. Examples: a JSON syntax error names the file, a `_glossary.yaml` with no JSON twin gives a notice, and an unreadable file stops the run with exit 2 and a message that names it.

## Coverage

Coverage is measured with c8, wrapped around the unit tests and the parity run. The scripts run as child processes, so in-process coverage misses the CLI paths. CI runs this measurement on every platform and fails below 99% lines or branches. Run it locally from the repository root:

```bash
npx -y c8@10.1.3 --all --reporter=text --check-coverage --lines 99 --branches 99 --include="skills/anchored-docs/scripts/*.mjs" --include="tools/*.mjs" -- sh -c 'node --test "tests/unit/*.test.mjs" && node tests/run-cases.mjs run --skill skills/anchored-docs --out "${TMPDIR:-/tmp}/cov" && node tests/run-cases.mjs coverage tests/golden/2.1.0'
```

Result on Windows and WSL Linux: 100% statements, functions, and lines in every script except two guards, which are accepted as uncovered:

- `docs_check.mjs` lines 13-15: refuses to run on Node older than 22. The test runner always uses Node 22 or newer.
- `tools/build-skill.mjs` line 279: the same Node 22 guard for the build script.

Both guards run only on an older Node. No test reaches them without stubbing `process.versions`, and a stub would test the stub, not the guard.

## Behaviors 2.0 keeps on purpose

- **Value formatting in messages.** Messages embed `{'by': 'nobody', ...}`, `['explanation', 'how-to']`, and `stale_after=None`. `formatValue` in `_compat.mjs` produces this text.
- **Backslashes in changed-file arguments are normalized** before the scripts compare them (`dc-affected-backslash`).
- **Rule 3.2 is unreachable.** The help text lists it, but the code gives only 3.4, so no scenario tests it.
- **The shipped organization glossary has zero active terms.** `ste-status-none` and `dc-glossary-clean-default-org` depend on it.
- **The map file is read with a plain `JSON.parse`.** The 2.0 map is JSON.

## Deliberate differences from 1.x

2.0 corrects these behaviors and lists them in the `SKILL.md` changelog. The parity scenarios do not test all of them, so `unit/docs_check.test.mjs` and `unit/ste_check.test.mjs` pin them.

- The code back-link scan no longer skips all files when the repository is in a folder named `build`, `bin`, `dist`, and so on.
- The `affected` check and the `sources` globs are case-sensitive on all operating systems. 1.x was case-insensitive on Windows. Scenario `dc-affected-case` records the case-sensitive result.
- Equal entries in the glossary report and back-link findings come out in a stable order.
- A malformed glossary or map file stops the run with a message that names the file. A 1.x YAML file that stays in the bundle gives a notice.
- If the scripts cannot read a file, they stop the run with exit 2 and a message that names it, after the findings so far.

## Parser fixes in 2.0.1

- A quotation mark starts a text value only where a value starts (after `key: `, `- `, `[`, `{`, or `,`). Before, an apostrophe in a word did the same, so `title: Don't # note` kept the comment.
- A key must have whitespace or the end of the line after its colon, as in YAML. Before, `key:value` and `http://x.y` parsed as the keys `key` and `http`.
- A list in a key of a list item or a block map (`- code: x`, then `docs:`, then `- y`) is the list of that key. The list can be indented below the key or at the column of the key.
- A frontmatter line that is not in the subset gets a report: `docs_check okf` reports it as `frontmatter line N not understood`.
- A glossary entry with no term text (`"term": null`, a missing or empty term, or a value that is not a string or an object) stops the run with a message that names the entry.

## Real-pack runs stay local

Output from the ASD agent pack contains dictionary-derived text. Do not commit it. To check the scripts with the ASD pack, set `STE_AGENT_PACK` to your private copy and write results to a folder outside the repository.

## Doc drift check

The fixtures reuse source paths, so ripwire can resolve a reference in a fixture doc to the copy in another fixture. Run the drift check on the repository docs only:

```bash
ripwire . --doc-drift --exclude=tests/fixtures
```

On Windows, call `ripwire.cmd`, as `skills/anchored-docs/references/ripwire.md` describes. The check should report 0 drift.
