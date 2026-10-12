# Bootstrap

The bootstrap makes the `docs/anchored-docs/` bundle from the code in the repo. It reads all of the codebase at one time. Do it one time for each repo. After it, all runs are delta maintenance. Read `references/conventions.md` first.

Mark all bootstrap output `status: draft` with only an agent `verified` entry, until a human reviews it. All downstream docs get their precision from these pages.

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
- **C# / .NET**: the `.sln`, the `.csproj` files, `Program.cs`, DI registration, controllers or minimal-API endpoints, hosted services, the primary domain namespaces.
- **C / C++**: `CMakeLists.txt` targets, `main`, the CLI or argument parser, the public headers.
- **Python**: `pyproject.toml` entry points, `__main__`, the package `__init__` surfaces.
- **TypeScript**: `package.json` scripts and `main`/`exports`, route tables, the top-level `index.ts`.

Find the flows: the meaningful end-to-end paths (send an order, turn a key, load a file, rank a graph). The unit of documentation is the flow, not the folder. `--communities` suggests flows. The code shows if they are correct.

### 2. Build the glossary first

Start with the approved terms of the organization. Run `node <skill>/scripts/docs_check.mjs glossary docs/anchored-docs/ --terms` to see the organization glossary that comes with the skill. These terms apply here. Do not write them again and do not contradict them (`references/conventions.md`, "The glossary: two levels"). Then make `docs/anchored-docs/_glossary.json` from `assets/templates/_glossary.json` for the terms of this repository. Do this before you write prose.

Get technical nouns from the names in the code (types, modules, flags) and from the README. Get technical verbs from the operations of the domain. If one thing has two names, select the name in the code and list the other name as unapproved. All docs that you write next use these terms, and the STE checker makes sure of it.

If you have the agent pack, run `ste_check.mjs` on your first two or three drafts and read the `1.5` line. It lists all words that the official dictionary does not know. Add the words that are terms of this repository before you write the other docs. Then the docs use one name for each thing.

Some words are plainly shared across the repositories of the organization (a platform name, `run`, `build`, `log`). Put them in your bootstrap summary as candidates for the organization glossary. Do not put them in the project file.

### 3. Work area by area, not all at once

Pick one flow. `ripwire . --for="<the flow in words>"` gives its ranked building blocks. `--around=SYM` and `--expand=SYM` give the neighborhood and bodies. Read the code. Write the doc. Then go to the next flow.

Each part stays small, so you can read the code correctly and the context stays lean. If subagents are available, let one subagent read and summarize an area. Then write the doc from that summary and from a read of the key files.

### 4. Create the scaffold

From `assets/templates/`:
- `docs/anchored-docs/index.md` from `index.md`: `okf_version: "0.2"`, then one flat catalog section that links each page with its description.
- `docs/anchored-docs/overview.md` from `overview.md`: business purpose, users, system context (C4 context Mermaid), boundaries.
- `docs/anchored-docs/architecture.md` from `architecture.md`: C4 container view with Mermaid (`ripwire . --mermaid` is a start that you can cut). Show the shape, not the instructions for each method.
- `docs/anchored-docs/flows/<flow>.md` from `flow.md`, for each flow. It has `sources` that point at the code and a Mermaid sequence or flowchart. It has Key behavior anchored to symbols and failure modes read from the code.
- `docs/anchored-docs/decisions/index.md` and ADRs from `adr.md`, only for decisions that the code or history clearly supports (`git log`, the README's rationale, a CONTRIBUTING rule). Do not invent decisions. ADRs have a `date:` key, so ripwire uses them as dated records.
- `docs/anchored-docs/log.md` from `log.md` with one `**Initialization**` entry.
- `docs/anchored-docs/_map.json`: made in step 6. Do not write it by hand.

<!-- ste-ok: 1.1 quoted heading name in conventions.md -->
As you document each area, add or repair the code-side doc comments on the public surface of that area. Add the back-link to the flow doc (`references/conventions.md`, "Two coupled layers"). If large parts of the public surface have no comments, give the human a list of them as a backfill. Do not rewrite all files in this task.

### 5. Verify and check

```bash
ripwire . --doc-drift=docs/anchored-docs/                     # every anchor you wrote, against the code you read
node <skill>/scripts/ste_check.mjs docs/anchored-docs/      # every sentence you wrote
node <skill>/scripts/docs_check.mjs okf docs/anchored-docs/ # frontmatter conformance
node <skill>/scripts/docs_check.mjs links docs/anchored-docs/ # code-side back-links resolve
```

Repair each drift row and each mechanical STE failure before you report. A bootstrap with drift on day one was written from names, not from code.

### 6. Build the map, set status and dates

```bash
node <skill>/scripts/docs_check.mjs map docs/anchored-docs/
```

For each doc that you make: `status: draft`, `generated`, and one agent `verified` entry at the time of writing. The draft status shows that a human has not checked these pages.

### 7. Confirm the gitignore

Make sure `docs/tickets/` is in `.gitignore`. Add it if not.

### 8. Report

Summarize these items. List the flows you identified and the docs you wrote. List the project glossary terms you selected, and the terms you propose for the organization glossary. List all parts that you could not document with confidence. Say so, and do not guess. Add the self-report block with `Files-Read` that lists the code you read, and `Ripwire`/`Docs-Drift`/`Docs-STE` from step 5.

### 9. Coverage check, if qmd is available

Optional. Do not let it stop the work. If qmd (https://github.com/tobi/qmd) is installed, use it to check the bundle for conceptual holes. `--communities` found these holes in the structure, but no doc covers them. 

Read `references/qmd.md`, "Bootstrap: the coverage check". If qmd is not available, skip this step and say so in the report. Do not tell the user to install it more than one time.

## Scope and honesty

Document what the code does, not what it must do. If the code is unclear or a flow is not complete, say so in the doc. Keep the doc at `draft`, or mark it stale. Do not fill the hole with a plausible guess.

The value of the bundle is its trust from the start.
