# Bootstrap

A one-time, whole-codebase pass that creates the `docs/` bundle from existing code. Run it once per repo. After it, every run is delta maintenance. Read `references/conventions.md` first.

Treat all bootstrap output as `status: draft` with only an agent `verified` entry until a human reviews it. Everything downstream inherits the accuracy of these pages.

## Procedure

### 1. Confirm ripwire and map the codebase before you write

```bash
ripwire --version
ripwire . --report                 # size, languages, top-ranked symbols, hotspots
ripwire . --communities            # call-graph clusters: your candidate flows
ripwire . --deps                   # module dependency shape, for architecture.md
ripwire . --owners                 # who owns what, for overview.md
```

Then read the entry points the language gives you:
- **C# / .NET**: the `.sln`, the `.csproj` files, `Program.cs`, DI registration, controllers or minimal-API endpoints, hosted services, the main domain namespaces.
- **C / C++**: `CMakeLists.txt` targets, `main`, the CLI or argument parser, the public headers.
- **Python**: `pyproject.toml` entry points, `__main__`, the package `__init__` surfaces.
- **TypeScript**: `package.json` scripts and `main`/`exports`, route tables, the top-level `index.ts`.

Identify the flows: the meaningful end-to-end paths (submit an order, rotate a key, ingest a file, rank a graph). Flows, not folders, are the unit of documentation. `--communities` suggests them; the code confirms them.

### 2. Build the glossary first

Start with what the organization already approves: `node <skill>/scripts/docs_check.mjs glossary docs/ --terms` lists the organization glossary that ships inside the skill. Those terms are approved here and must not be repeated or contradicted (`references/conventions.md`, "The glossary: two levels"). Then create `docs/_glossary.json` from `assets/templates/_glossary.json` for this repository's own terms, before you write prose. Take technical nouns from the code's own names (types, modules, flags) and the README. Take technical verbs from the domain's operations. Where two names exist for one thing, choose the code's and list the other as unapproved. Every doc you write next uses these terms and the STE checker enforces them. With the agent pack installed, run `ste_check.mjs` on your first two or three drafts and read the `1.5` line: it lists every word the official dictionary does not know. Add the ones that are this repository's terms before you write the rest, so the later docs use one name for each thing. A word that is plainly shared across the organization's repositories (a platform name, `run`, `build`, `log`) goes in your bootstrap summary as a candidate for the organization glossary, not in the project file.

### 3. Work area by area, not all at once

Pick one flow. `ripwire . --for="<the flow in words>"` gives its ranked building blocks; `--around=SYM` and `--expand=SYM` give the neighborhood and bodies. Read the code. Write the doc. Move to the next flow. This keeps each pass small enough to read the code properly and keeps context lean. If subagents are available, let one read and summarize an area, then write the doc yourself from that summary plus a direct read of the key files.

### 4. Create the scaffold

From `assets/templates/`:
- `docs/index.md` from `index.md`: `okf_version: "0.2"`, then one flat catalog section linking every page with its description.
- `docs/overview.md` from `overview.md`: business purpose, users, system context (C4 context Mermaid), boundaries.
- `docs/architecture.md` from `architecture.md`: C4 container view with Mermaid (`ripwire . --mermaid` is a starting point to trim). Shape, not per-method detail.
- `docs/flows/<flow>.md` from `flow.md`, one per flow: `sources` pointing at the code, a Mermaid sequence or flowchart, Key behavior anchored to symbols, failure modes read from the code.
- `docs/decisions/index.md` and ADRs from `adr.md`, only for decisions the code or history clearly supports (`git log`, the README's rationale, a CONTRIBUTING rule). Do not invent decisions. ADRs carry a `date:` key so ripwire treats them as dated records.
- `docs/log.md` from `log.md` with one `**Initialization**` entry.
- `docs/_map.json`: generated in step 6, never hand-written.

As you document each area, add or repair the code-side doc comments on that area's public surface and add the back-link to the flow doc (`references/conventions.md`, "Two coupled layers"). If large parts of the public surface have no comments, list that for the human as a separate backfill rather than rewrite every file in this pass.

### 5. Verify and check

```bash
ripwire . --doc-drift=docs/                     # every anchor you wrote, against the code you read
node <skill>/scripts/ste_check.mjs docs/      # every sentence you wrote
node <skill>/scripts/docs_check.mjs okf docs/ # frontmatter conformance
node <skill>/scripts/docs_check.mjs links docs/ # code-side back-links resolve
```

Fix every drift row and every mechanical STE failure before you report. A bootstrap with drift on day one is a bootstrap that was written from names, not code.

### 6. Build the map, set status and dates

```bash
node <skill>/scripts/docs_check.mjs map docs/
```

Every generated doc: `status: draft`, `generated` and one agent `verified` entry at now. The draft status says a human has not yet confirmed these pages.

### 7. Confirm the gitignore

Make sure `docs/tickets/` is in `.gitignore`. Add it if not.

### 8. Report

Summarize: the flows you identified, the docs you wrote, the project glossary terms you chose and any you propose for the organization glossary, anything you could not confidently document (say so; do not guess), and the self-report block with `Files-Read` listing the code you read and `Ripwire`/`Docs-Drift`/`Docs-STE` from step 5.

### 9. Coverage check, if qmd is available

Optional and never blocking. If qmd (https://github.com/tobi/qmd) is installed, use it to check the bundle you just wrote for conceptual gaps that `--communities` found structurally but no doc ended up covering. Read `references/qmd.md`, "Bootstrap: the coverage check". If qmd is not available, skip this step and say so in the report; do not tell the user to install it more than once.

## Scope and honesty

Document what the code does, not what it should do. Where the code is unclear or a flow seems incomplete, say so in the doc and leave it `draft`, or mark it stale, rather than fill the gap with a plausible guess. The value of the bundle depends on being trustworthy from the start.
