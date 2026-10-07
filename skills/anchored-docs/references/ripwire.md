# Ripwire in this skill

ripwire (https://github.com/redhat-et/ripwire) is a zero-dependency C++23 CLI that indexes a repository with tree-sitter (22 languages including C#, C++, Python, TypeScript, and Markdown), builds a call graph, and answers questions about it. It also runs as an MCP server (`ripwire --mcp`). This skill depends on four of its capabilities: doc-anchor verification, the doc↔code reverse index, the changed-symbol set of a diff, and provenance stamps.

## The required check

Run this first in every mode:

```bash
BIN="${RIPWIRE_BIN:-$(command -v ripwire || echo ./build/ripwire)}"
"$BIN" --version
```

If the MCP server is configured instead (`.mcp.json` with a `ripwire` entry), call its `ping` tool. If neither answers, stop, report `Ripwire: absent` and `Docs-Skipped-Reason: ripwire not available`, and tell the user how to get it: `install.sh` in the ripwire repo, or `cmake -S . -B build && cmake --build build -j`. Do not substitute grep and call the result verified.

## Windows: run ripwire under WSL

ripwire builds and runs on Linux and macOS, not natively on Windows. On Windows, run it inside WSL 2 and let the Windows-side tools call across the boundary.

1. In WSL (Ubuntu): `sudo apt install build-essential cmake git`, clone ripwire, `cmake -S . -B build && cmake --build build -j`, then `cp build/ripwire ~/.local/bin/`.
2. Keep the repository you document on a path both sides can see. From WSL, `D:\projects\x` is `/mnt/d/projects/x`. Builds and gates run faster on the WSL filesystem, but the docs skill only reads, so `/mnt/d/...` is fine.
3. Windows-native agents (Claude Code on Windows, Copilot CLI, Codex CLI) reach it two ways:
   - MCP, the cleanest: in `.mcp.json`, `{"mcpServers": {"ripwire": {"command": "wsl", "args": ["-e", "ripwire", "--mcp"]}}}`. The skill then uses the `doc_drift`, `mentions`, `situational_awareness`, and `ping` tools and never needs a shell.
   - CLI: put a wrapper on the Windows `PATH`, for example `ripwire.cmd` containing `@wsl -e ripwire %*`, and set `RIPWIRE_BIN=ripwire.cmd`. Pass `.` as the repo root from inside the repository; `wsl -e` starts in the current directory, so relative paths work and absolute Windows paths do not.
4. Agents that run inside WSL (Claude Code in a WSL terminal, or the repo opened with VS Code Remote WSL) need nothing extra: ripwire is a normal Linux binary there.

The required check in this file is written for a POSIX shell. On Windows PowerShell, the equivalent is `& $env:RIPWIRE_BIN --version`. If neither the wrapper nor the MCP server answers, the run stops, as on any other platform.

Every verb below takes the repo root as `<dir>` (use `.`). Output is minified XML. A leading `<!-- -->` comment explains the attributes; read it once per verb.

## The sha stamp

`--doc-drift`, `--pr-context`, `--test-gate`, `--quality-delta`, and `--map-diff` stamp their root element `at="<sha>[+dirty][+shallow]"`: the commit the numbers were measured against. Quote it in the self-report (`Ripwire: ... at=...`). `+dirty` means the working tree had uncommitted changes, so nobody can reproduce the numbers from the sha alone. `--mentions` and `--situ` carry no stamp; record `git rev-parse --short HEAD` yourself if you quote them.

## Verbs by mode

### Delta mode: find what a change touches

```bash
ripwire . --pr-context                 # working-tree diff: per changed file, its symbols, callers, blast radius, tests, owners
ripwire . --pr-context=main            # the branch's work since it forked from main (merge-base, not main's tip)
ripwire . --map-diff                   # only the symbols changed vs HEAD, ranked; the diff's footprint in one screen
ripwire . --situ                       # blast radius + tests + co-change partners not in the diff
```

Take the `<changed-symbols>` names from `--pr-context`. For each:

```bash
ripwire . --mentions=SYM               # markdown files that name SYM in a backtick (doc↔code edge, file granularity)
ripwire . --mentions=file:SYM          # disambiguate a same-named symbol
```

SYM is the bare identifier (`SubmitAsync`), never a qualified name (`OrderService.SubmitAsync` is refused with "symbol not found"). The doc side still matches a qualified backtick, so write `OrderService.SubmitAsync` in the doc and ask for `SubmitAsync`. The whole report is one line, so `grep` for a row does not work: read the attributes with a parser, or `sed 's/></>\n</g'` first.

```
```

Every doc listed is a staleness candidate. Union with the `_map.json` hits for the changed paths. `--mentions` sees symbols; the map sees paths; a doc that describes a flow without naming its symbols is caught only by the map, which is one more reason to name the symbols.

MCP equivalents: `situational_awareness`, `mentions`, `edit_check`, `impact`.

### Every mode: verify the anchors

```bash
ripwire . --doc-drift                          # every markdown file
ripwire . --doc-drift=docs/flows/               # SUBSTR filters doc paths
ripwire . --doc-drift --with-history            # git history splits why="undefined" into "deleted" (with the commit) vs never-in-history
ripwire . --doc-drift --gateability             # per doc: how many live rows a date would reclassify
```

MCP equivalent: `doc_drift`.

How to read the report:

- Root: `docs=` scanned, `clean=` docs with no failed anchor, `anchors=` total, `checked=` proved either way, `unchecked=` could not be proved (listed with a reason), `drift=` LIVE failures, `dated=` failures inside author-dated records, `at=` sha.
- `<doc p=...>` rows are ordered by live drift, worst first. Each `<a .../>` row: `k=` anchor kind (file-line, symbol, const, array), `l=`/`c=` line and column in the doc, `why=` the verdict, `ref=` what the doc wrote, `got=` what the code says, `tgt=` the code site.
- Verdicts: `missing-file`, `past-eof`, `line-moved` (the line is no longer inside the symbol the doc names beside it; `got=` names the squatter), `range-straddles`, `undefined` (the backticked name is defined nowhere in the repo), `const-value`, `array-extent`.
- Read `undefined` precisely: it means the name exists nowhere, which is not the same as deleted. A plan or ADR that names unbuilt work is expected to have `undefined` rows. Use `--with-history` to separate `deleted` from `never-in-history`.
- Every lane under-reports on purpose. `checked + unchecked = anchors` always. A doc with all anchors unchecked is `clean`, which means nothing was found rotten, not that everything was verified.
- The verb always exits 0. It is a report, not a gate. The gate is your rule: zero live `drift=` on the docs you touched before `Docs-Updated: yes`.

Fix the row, not the report: update the symbol name, the line, or the number in the doc so that the anchor holds again. If the code moved and the doc's claim is now genuinely unknown, mark the doc stale.

### Dated records versus live docs

A failed anchor inside a doc the author dated is a record, not rot, and counts in `dated=`. Ripwire reads a self-date only from a labelled line (`date`, `dated`, `written`, `generated`, `captured`, `recorded`, `reviewed`, `audited`, `authored`, `pre-registered`) with nothing but punctuation between the label and an ISO date, within the first 12 lines or before the first `##`. Inception words (`opened`, `since`, `updated`, `revised`, `current`, `active`) never mark a record. Consequences for this skill's frontmatter:

- `generated: { by: ..., at: 2026-... }` and `verified: [...]` are NOT read as stamps (the `{ by:` text breaks the label-to-date rule; `verified` is not a label). Flow docs stay live. Correct.
- `last_reviewed: 2026-...` from the old skill is NOT a stamp either (the underscore makes `last_reviewed` one identifier). Correct, but this skill uses `verified` instead.
- ADRs and captures carry a top-level `date: YYYY-MM-DD` key near the top of the frontmatter. That IS a stamp, so their stale anchors count as `dated=`, and `drift=` stays honest about live rot.

### Bootstrap mode: see the shape before you write

```bash
ripwire . --report                     # one-screen orientation: size, languages, top symbols, hotspots
ripwire . --communities                # call-graph clusters: candidate flows and areas
ripwire . --for="<flow in words>"      # task-lens ranked inventory of the building blocks of a flow
ripwire . --around=SYM                 # one symbol's callers and callees
ripwire . --lego=TYPE                  # one interface's contract and every implementor
ripwire . --mermaid                    # a Mermaid graph you can trim into architecture.md
ripwire . --owners                     # bus factor per file, for the overview's "who" section
```

MCP equivalents: `analyze`, `explore`, `for`, `find_symbol`, `lego`, `owners`.

### The code-side comment layer

```bash
ripwire . --comment-coherence          # per documented function: does the comment restate the name (bad) or add information
ripwire . --expand=SYM                 # the symbol with its comment and body, to check the See: line
```

`c_coeff` high means the comment mostly repeats the symbol's name. Rewrite such comments to say what the name does not.

### Provenance and handoff

```bash
ripwire . --note-add="SYM: text"       # a committed, sorted, provenance-stamped field note in .ripwire_notes
ripwire . --notes                      # list them
ripwire . --verify="CLAIM"             # confirmed / refuted / not-established for a closed claim about the code
ripwire . --handoff                    # continuation packet: verified disk truth plus labelled heuristics
```

Use `--note-add` for the durable version of a `docs/tickets/` scratch note. Use `--verify` when a doc sentence makes a structural claim you can phrase in its claim language, before you write it.

## What ripwire cannot see

- Prose. It verifies names, lines, and numbers, never whether a paragraph is true.
- Claims inside fenced code blocks (skipped as illustrations).
- A repo constant the grammar does not tag as a definition (a namespace-scope `constexpr` in C++, for one) is `unchecked r="not-a-definition"`, not drift.
- A lone backticked name with no other repo-defined name on its line is `uncorroborated`, not drift. Dotted `Type.Member` forms are not mention edges; write the bare member name beside the type.
- Library names are silent: a backticked name is stale only when it occurs nowhere in the code as an identifier.
- Its blast radius is name-based. A high `amb=` edge was guessed.

None of that reduces Rule 1. Ripwire narrows where you must read. It does not read for you.
