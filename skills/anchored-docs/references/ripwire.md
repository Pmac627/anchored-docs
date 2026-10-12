# Ripwire in this skill

ripwire (https://github.com/redhat-et/ripwire) is a zero-dependency C++23 CLI that indexes a repository with tree-sitter (22 languages including C#, C++, Python, TypeScript, and Markdown), builds a call graph, and answers questions about it. It also runs as an MCP server (`ripwire --mcp`). This skill uses four of its functions: doc-anchor verification, the doc↔code reverse index, the changed-symbol set of a diff, and provenance records.

## The required check

Run this first in each mode:

```bash
BIN="${RIPWIRE_BIN:-$(command -v ripwire || command -v ripwire.cmd || echo ./build/ripwire)}"
"$BIN" --version
```

Git Bash on Windows does not find a `.cmd` file by its bare name, so `command -v ripwire` fails there. The lookup above also tries `ripwire.cmd`, which Git Bash runs when it is on `PATH`.

If you use the MCP server (`.mcp.json` with a `ripwire` entry), call its `ping` tool. If the binary and the server do not answer, stop. Report `Ripwire: absent` and `Docs-Skipped-Reason: ripwire not available`. Tell the user how to get it: `install.sh` in the ripwire repo, or `cmake -S . -B build && cmake --build build -j`. Do not replace ripwire with grep and then call the result correct.

## Windows: run ripwire under WSL

ripwire builds and runs on Linux and macOS, not natively on Windows. On Windows, run it in WSL 2 and let the Windows-side tools call across the boundary.

1. In WSL (Ubuntu): `sudo apt install build-essential cmake git`, clone ripwire, `cmake -S . -B build && cmake --build build -j`, then `cp build/ripwire ~/.local/bin/`.
2. Keep the repository you document on a path that the two sides can see. From WSL, `D:\projects\x` is `/mnt/d/projects/x`. Builds and gates run faster on the WSL filesystem, but the docs skill only reads, so `/mnt/d/...` is permitted.
3. Windows-native agents (Claude Code on Windows, Copilot CLI, Codex CLI) can use it in two procedures:
   - MCP, the cleanest: in `.mcp.json`, `{"mcpServers": {"ripwire": {"command": "wsl", "args": ["-e", "ripwire", "--mcp"]}}}`. The skill then uses the `doc_drift`, `mentions`, `situational_awareness`, and `ping` tools and does not use a shell.
   - CLI: put a wrapper on the Windows `PATH`, for example `ripwire.cmd` containing `@wsl -e ripwire %*`, and set `RIPWIRE_BIN=ripwire.cmd`. Give `.` as the repo root from the repository directory. `wsl -e` starts in the current directory, so relative paths work and absolute Windows paths do not.
4. Agents that run in WSL (Claude Code in a WSL terminal, or the repo opened with Visual Studio Code Remote WSL) do not have more steps. ripwire is a normal Linux binary there.

The check at the start of this file is for a POSIX shell. On Windows PowerShell, the equivalent is `& $env:RIPWIRE_BIN --version`. If the wrapper and the MCP server do not answer, the run stops, as on all other platforms.

Give the repo root as `<dir>` to each verb below (use `.`). The output is minified XML. A `<!-- -->` comment at the start tells the meaning of the attributes. Read it one time for each verb.

## The sha stamp

`--doc-drift`, `--pr-context`, `--test-gate`, `--quality-delta`, and `--map-diff` put `at="<sha>[+dirty][+shallow]"` on their root element. It is the commit that the numbers were measured against. Quote it in the self-report (`Ripwire: ... at=...`). `+dirty` means the working tree had uncommitted changes, so nobody can reproduce the numbers from the sha alone. `--mentions` and `--situ` do not give a sha. Record `git rev-parse --short HEAD` if you quote them.

## Verbs by mode

### Delta mode: find what a change touches

```bash
ripwire . --pr-context                 # working-tree diff: per changed file, its symbols, callers, blast radius, tests, owners
ripwire . --pr-context=main            # the branch's work since it forked from main (merge-base, not main's tip)
ripwire . --map-diff                   # only the symbols changed vs HEAD, ranked; the diff's footprint in one screen
ripwire . --situ                       # blast radius + tests + co-change partners not in the diff
```

Get the `<changed-symbols>` names from `--pr-context`. For each name:

```bash
ripwire . --mentions=SYM               # markdown files that name SYM in a backtick (doc↔code edge, file granularity)
ripwire . --mentions=file:SYM          # disambiguate a same-named symbol
```

SYM is the bare identifier (`SubmitAsync`). Do not give a name with a type prefix (ripwire refuses `OrderService.SubmitAsync` with "symbol not found"). The doc side can align with a backtick that has the prefix, so write `OrderService.SubmitAsync` in the doc and tell ripwire `SubmitAsync`. The full report is one line, so `grep` for a row does not work. Read the attributes with a parser, or use `sed 's/></>\n</g'` first.

```
```

Each doc in the list is a staleness candidate. Add the `_map.json` hits for the changed paths. `--mentions` sees symbols. The map sees paths. Only the map finds a doc that gives a flow without the names of its symbols, which is one more cause to name the symbols.

MCP equivalents: `situational_awareness`, `mentions`, `edit_check`, `impact`.

### Every mode: verify the anchors

```bash
ripwire . --doc-drift                          # every markdown file
ripwire . --doc-drift=docs/anchored-docs/flows/               # SUBSTR filters doc paths
ripwire . --doc-drift --with-history            # git history splits why="undefined" into "deleted" (with the commit) vs never-in-history
ripwire . --doc-drift --gateability             # per doc: how many live rows a date would reclassify
```

MCP equivalent: `doc_drift`.

How to read the report:

- Root:
  - `docs=` scanned, `clean=` docs with no failed anchor, `anchors=` total, `checked=` proved as correct or incorrect, `unchecked=` could not be proved (listed with a cause). Also `drift=` LIVE failures, `dated=` failures in author-dated records, `at=` sha.
- `<doc p=...>` rows are in order of live drift, worst first. Each `<a .../>` row has these attributes:
  - `k=` anchor type (file-line, symbol, const, array).
  - `l=`/`c=` line and column in the doc.
  - `why=` the verdict.
  - `ref=` what the doc wrote.
  - `got=` what the code says.
  - `tgt=` the code site.
- Verdicts: `missing-file`, `past-eof`, `line-moved` (the line is no longer in the symbol that the doc names with it, and `got=` names the squatter), `range-straddles`, `undefined` (the backticked name is not in the repo), `const-value`, `array-extent`.
- Read `undefined` with caution. It means the name is not in the repo, which is not the same as deleted. A plan or ADR that names unbuilt work can have `undefined` rows. Use `--with-history` to divide `deleted` from `never-in-history`.
- Each lane under-reports on purpose. `checked + unchecked = anchors` at all times. A doc with all anchors unchecked is `clean`. This means that ripwire found nothing rotten, not that it made sure that all is correct.
- The verb always exits 0. It is a report, not a gate. The gate is your rule: no live `drift=` on the docs you touched before `Docs-Updated: yes`.

Repair the row, not the report: update the symbol name, the line, or the number in the doc so that the anchor holds again. If the code moved and the claim of the doc is unknown at this time, mark the doc stale.

### Dated records versus live docs

A failed anchor in a doc that the author dated is a record, not rot, and counts in `dated=`. Ripwire reads a self-date only from a labelled line. These are the labels: `date`, `dated`, `written`, `generated`, `captured`, `recorded`, `reviewed`, `audited`, `authored`, and `pre-registered`. Only punctuation can be between the label and an ISO date. The line must be in the first 12 lines or before the first `##`.

Inception words (`opened`, `since`, `updated`, `revised`, `current`, `active`) do not mark a record. This is the result for the frontmatter of this skill:

- `generated: { by: ..., at: 2026-... }` and `verified: [...]` are NOT read as date marks. The `{ by:` text breaks the label-to-date rule, and `verified` is not a label. Flow docs stay live. Correct.
- `last_reviewed: 2026-...` from the previous skill is NOT a date mark. The underscore makes `last_reviewed` one identifier. This is correct, but this skill uses `verified`.
- ADRs and captures have a top-level `date: YYYY-MM-DD` key near the top of the frontmatter. That IS a date mark, so their stale anchors count as `dated=`, and `drift=` stays honest about live rot.

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

`c_coeff` high means that the comment mostly gives the symbol name again. Rewrite such comments to say what the name does not.

### Provenance and handoff

```bash
ripwire . --note-add="SYM: text"       # a committed, sorted, provenance-stamped field note in .ripwire_notes
ripwire . --notes                      # list them
ripwire . --verify="CLAIM"             # confirmed / refuted / not-established for a closed claim about the code
ripwire . --handoff                    # continuation packet: verified disk truth plus labelled heuristics
```

Use `--note-add` for the durable version of a `docs/tickets/` scratch note. Use `--verify` when a doc sentence makes a structural claim you can phrase in its claim language, before you write it.

## What ripwire cannot see

- Prose. It checks names, lines, and numbers. It does not check if a paragraph is correct.
- Claims in fenced code blocks (skipped as illustrations).
- A repo constant the grammar does not tag as a definition (a namespace-scope `constexpr` in C++, for one) is `unchecked r="not-a-definition"`, not drift.
- A lone backticked name with no other repo-defined name on its line is `uncorroborated`, not drift. Dotted `Type.Member` shapes are not edges for `--mentions`. Write the bare member name adjacent to the type.
- Library names are silent: a backticked name is stale only when it occurs nowhere in the code as an identifier.
- Its blast radius uses names. A high `amb=` edge is a guess.

None of that decreases Rule 1. Ripwire makes the area to read smaller. It does not read for you.
