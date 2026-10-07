---
name: anchored-docs
version: 2.0.0
description: Keep a repository's living developer documentation in docs/ true to the code, written in ASD-STE100 Simplified Technical English, stored as an OKF (Open Knowledge Format) bundle, and verified with ripwire. Use this whenever you finish a code change, prepare a commit or pull request, write an implementation plan, or are asked to document, update docs, refresh the wiki, check docs for drift, or bootstrap docs for a repo. Treat updating the affected documentation as part of the definition of done for every code change in a repo that has a docs/ folder, unless the user says not to. Triggers even when the user does not say "documentation", for example after "add a field to the order request", "refactor the ingest pass", "open a PR for this", or "is this doc still right". Also use it to rewrite any docs/ prose into STE, or to run the docs lint.
---

# anchored-docs

Keep `docs/` a description of the system that an agent can trust instead of re-reading the code. The code is the source of truth. You maintain the docs. Three tools make the docs checkable rather than merely plausible, and a fourth, optional one helps find what is missing:

- **ripwire** verifies the doc anchors against the live code (`--doc-drift`), finds the docs a changed symbol touches (`--mentions`), and gives the changed symbols of a diff (`--pr-context`). It is **required**. Read `references/ripwire.md`.
- **OKF v0.2** frontmatter records what each doc derives from (`sources`), who wrote it and who confirmed it (`generated`, `verified`), and whether it is current (`status`, `stale_after`). Read `references/okf.md`.
- **ASD-STE100 Issue 9** is the writing standard for every sentence of prose in `docs/`. `scripts/ste_check.mjs` is the gate. Read `references/ste-rules.md` before you write. When the ASD-STE100 agent pack is installed at `references/asd-ste100-agent-pack/`, the checker and you both use the official rules and dictionary from it. Without the pack, both fall back to the paraphrase in `references/ste-rules.md` and the built-in word list.
- **qmd** (optional, https://github.com/tobi/qmd) is a local search engine over the docs bundle. It finds conceptual gaps and undeclared connections that ripwire's symbol index and `_map.json` cannot, because it searches meaning instead of declared anchors. It never verifies anything and is not required. Used automatically, non-blocking, at the end of bootstrap; used in delta mode only when explicitly requested. Read `references/qmd.md`.

The scripts in `scripts/` are Node.js ES modules (`.mjs`). They need Node.js 22 or newer and have no packages to install. The skill's own data files (`_glossary.json`, `_map.json`, `org-glossary.json`) are JSON. Doc frontmatter stays YAML, because OKF requires it.

This skill is the procedure behind a rule that lives in CLAUDE.md or AGENTS.md: after any code change, update the documentation the change affects before you say the work is done.

## Rule 1: read the code, never assume

Before you write or update a doc, before you produce an implementation plan, and before you answer a question about behavior, open the source files involved. Do not infer behavior from file names, symbol names, your memory, or the existing docs. The existing docs are the thing that may be stale. A confident wrong doc makes the next agent confidently wrong too.

Make this verifiable: list the files and symbols you opened in `Files-Read` in the self-report. If you did not read the code behind a claim, do not make the claim.

## Rule 2: make every claim checkable

Ripwire can only verify what a doc states in a checkable shape. Write claims so that `--doc-drift` can test them:

- Name the symbol in backticks, as a bare identifier: `SubmitAsync`, `rankGraphTeleport`. Ripwire indexes bare names, so write `` `SubmitAsync` on `OrderService` ``, not `` `OrderService.SubmitAsync` ``. A backticked name that no longer exists in the code is reported as drift.
- Corroborate every mention: put at least one other name the repo defines on the same line (the type, the file, a caller). Ripwire abstains on a lone name, because a lone name reads as an external identifier. `` `LegacySubmit` in `OrderService` was removed `` is checked; `` `LegacySubmit` was removed `` is not.
- Cite a location as `path:line` **and** name the symbol on that line beside it. A bare `path:line` is a weak anchor; a `path:line` next to a backticked symbol is a strong one.
- Write constants as `` `kMaxRetries` = 5 `` and array extents as `` `kSlots[16]` ``. Ripwire compares the number against the declaration.
- Prose counts ("the pipeline has five stages") must come from an enumeration the doc also shows, or from a symbol. Prefer the symbol.

Fenced code blocks are illustrations, not claims; ripwire skips them. Do not hide a claim in one.

## Rule 3: write in STE

Every sentence of prose in `docs/` follows ASD-STE100. The short form: approved words with one meaning each, technical nouns and verbs from the project glossary, active voice, simple tenses, one instruction per sentence, no more than 20 words in a procedural sentence, no more than 25 in a descriptive one, no more than 6 sentences in a paragraph, no semicolons, no contractions, no phrasal verbs. Code spans, paths, commands, quoted output, and headings are technical nouns and are exempt.

Run the checker before you report:

```bash
node <skill>/scripts/ste_check.mjs docs/                # whole tree
node <skill>/scripts/ste_check.mjs docs/flows/x.md      # one doc
```

The checker does not ship the STE dictionary (free to obtain, not free to redistribute). It resolves a word source in this order:

1. The **agent pack** at `references/asd-ste100-agent-pack/`, or at `STE_AGENT_PACK`. Rule 1.1 is complete: an unapproved word fails with the dictionary's own alternatives, an unknown word warns once per file as a technical-noun candidate (1.5, 1.12), and words the standard lists in the computer and engineering categories pass. `ste_check.mjs --lookup WORD` shows the entry when you replace a word.
2. `STE_DICTIONARY=/path/to/words.txt`, one approved word per line. Any word not in it fails 1.1.
3. Neither: the built-in non-STE list only. The summary says `(1.1 partial)`.

`ste_check.mjs --status` shows which source is in use. Record nothing extra in the self-report; `Docs-STE` already carries `(1.1 partial)` when the pack is absent. `INSTALL.md` says how to get the pack. Expect the pack to fail common software words the dictionary does not approve (`run`, `build`, `log`, `call`, `return`, `request`, `option`, `setting`). The project glossary is where those go, when the project uses them as technical nouns or verbs. Do not waive them.

Exit 0 means the mechanical rules pass. Exit 1 means a mechanical failure (length, semicolon, contraction, Latin abbreviation, non-STE word) that you must fix before `Docs-Updated: yes`. Exit 2 means the check did not run to the end: a usage error, a glossary file that is not valid JSON, or a file that the script cannot read. The last line names the cause. Fix it and run the check again. Heuristic findings (passive voice, `-ing` forms, complex tenses, phrasal verbs, long noun clusters, two instructions in one sentence) are warnings: rewrite the ones you can, count the rest in `Docs-STE`. Waive a correct sentence the checker misreads with an inline `<!-- ste-ok: 3.6 agent unknown -->` on the line before it. Do not waive to save time.

## Rule 4: ripwire first, and it must be there

Confirm ripwire before anything else. Either the `ripwire` binary is on `PATH` (or at `RIPWIRE_BIN`, or `./build/ripwire`), or the `ripwire` MCP server answers `ping`. On Windows, ripwire runs under WSL and is reached through `wsl -e` or the MCP server (`references/ripwire.md`, Windows section). If neither, stop and tell the user: this skill does not run without it, because without it the doc anchors are unverified prose. Do not fall back to grep and call the result verified. Record the outcome in `Ripwire:` in the self-report.

## Keep the code's own doc comments current

Documentation has two coupled layers: the Markdown in `docs/`, and the doc comments in the source. The comment on a flow's main symbols names the flow doc, so a reader can go code → doc; the doc's backticked symbols and `sources` go doc → code, and `--mentions` proves the edge. When you change code, update the comment on the affected public surface in the same pass, in the language's own form: C# XML `<seealso href>`, C++ `/// See: docs/...`, Python docstring `See also:`, TypeScript JSDoc `@see`. The tag formats are in `references/conventions.md`. Hold comments to the same standard as the Markdown: read the code, keep them true, write them in STE.

## Configuration documentation

Every repository that loads external configuration maintains two separate documents. These documents record *what* configuration is possible and *how* it arrives. They never record actual deployed values.

- `docs/configuration-providers.md` — how configuration reaches the app: which providers are registered, in what precedence order, and where each is registered in source. Conditional: required only when provider registrations are found. Changes rarely.
- `docs/configuration.md` — what configuration the app defines and consumes: the full key inventory across all config files, which keys have code consumers, and which do not. Required whenever any config file or config consumer exists. Changes when config files, binding classes, or consumer code changes.

These are independent documents with independent delta triggers. A change to provider registration does not require updating the key inventory, and vice versa.

### Provider detection (`docs/configuration-providers.md`)

Scan `Program.cs`, `Startup.cs`, and any file whose name contains `Host`, `Builder`, or `Configuration` for provider registration calls.

**C#**: `Add*` methods on `IConfigurationBuilder` or `WebApplicationBuilder.Configuration`. Common providers: `AddJsonFile`, `AddYamlFile`, `AddXmlFile`, `AddEnvironmentVariables`, `AddUserSecrets`, `AddAzureKeyVault`, `AddSecretsManager`, `AddConsul`, `AddVault`, `AddKeyPerFile`.

**Other languages**: equivalent loader or provider registration patterns. Identify them at bootstrap time and record them in `references/conventions.md` under `config-provider-patterns` so future delta runs can detect them.

For each detected provider, record:
- Provider type (e.g., `AzureKeyVault`, `EnvironmentVariables`, `JsonFile`)
- Registration call site: `path:line` next to the backticked method name — a ripwire-verifiable anchor
- Precedence position (registration order; note the language's own precedence semantics)
- Responsibility: what this provider supplies (base defaults, environment overrides, secrets)

The document opens with a **Providers** section listing all registered providers in precedence order before the key inventory. Example:

```markdown
## Configuration Providers

Configuration loads from the following sources, in precedence order (lowest first):

1. `appsettings.json` — base defaults; committed to source
2. `appsettings.{Environment}.json` — environment overrides; committed to source
3. Environment variables — deployment-time injection (`AddEnvironmentVariables` at `Program.cs:18`)
4. Azure Key Vault — secrets; highest precedence (`AddAzureKeyVault` at `Program.cs:22`)

Keys from providers 3 and 4 do not appear in committed config files.
```

`Docs-Config-Providers: absent (no providers found)` is valid when no provider registrations exist. Do not create the file in that case.

### Key inventory (`docs/configuration.md`)

Collect keys from three source sets, then classify every key by cross-referencing all three.

**Step 1: collect config files.**
Find all configuration files by pattern:

| Format | Patterns |
|---|---|
| JSON | `appsettings*.json`, `config.json`, `*.json` under `config/` or `Configuration/` |
| YAML | `appsettings*.yaml`, `appsettings*.yml`, `config.yaml`, `config.yml` |
| XML | `Web.config`, `App.config`, `appsettings.xml`, `*.config` |

Walk each file's structure and extract the full key tree as colon-joined paths (`Section:Subsection:Key`). Every leaf is a candidate key. For XML: `<appSettings>` entries produce flat keys; custom config sections produce nested paths. Do not record values at any point.

**Step 2: collect typed bindings.**
Find all classes registered as typed options. For C#: search for `Configure<T>`, `AddOptions<T>`, `Bind(`, and `Get<T>()` called on an `IConfigurationSection`. Map the section path argument to the class, then enumerate the class's public properties as bound keys. Each bound property name and its class name are ripwire-verifiable anchors; write them as backticked symbols in the doc.

For other languages: record equivalent patterns in `references/conventions.md` at bootstrap time.

**Step 3: collect raw consumers (two-stage).**

*Stage 1 — candidate collection.* Search source for raw config access patterns.

C# candidates: `IConfiguration[`, `IConfiguration.GetValue<`, `IConfiguration.GetSection(`, `IConfigurationSection[`, `IConfigurationSection.GetValue<`, `GetEnvironmentVariable(`.

Do not treat a bare `GetValue<T>` as a config access. The method name alone is not sufficient — it appears in ORM query builders, JSON parsers, HTTP response handlers, and other contexts. Stage 2 confirms the receiver before accepting any candidate.

*Stage 2 — receiver verification.* For each Stage 1 candidate, confirm the receiver is configuration-related. Confirmation signals (C#):
- The variable is explicitly typed as `IConfiguration`, `IConfigurationSection`, or `IConfigurationRoot`
- The variable name matches a conventional name: `_configuration`, `configuration`, `_config`, `config`, `builder.Configuration`, `app.Configuration`, `context.Configuration`
- The enclosing class accepts `IConfiguration` as a constructor parameter
- The file contains `using Microsoft.Extensions.Configuration`

Discard a candidate when none of the above apply. Mark a candidate **unresolved** when signals are mixed or the receiver is not visible in the file. Do not add unresolved candidates to `configuration.md` as confirmed consumers. Report them in `Docs-Config-Keys` for manual review. Do not block `Docs-Updated: yes` on unresolved candidates alone, but do report the count.

**Step 4: classify every key.**

Cross-reference the three source sets to assign a category to every key found in any of them:

| Category | In config file | Code consumer | Provider registered | Marker in doc |
|---|---|---|---|---|
| 1 | Yes | Typed binding | any | none — ripwire anchored |
| 2 | Yes | Raw, verified | any | none — grep-verifiable |
| 3 | Yes | None found | — | `⚠️ NO CODE CONSUMER` |
| 4 | No | Raw, verified | detected | `provider: <name>` |
| 5 | No | Raw, verified | none detected | `⚠️ SOURCE UNKNOWN` |

Category 3 keys require confirmation before closing: the key may be dead configuration, a feature flag with no current code path, or a planned future key. Record what you find in the doc entry.

Category 5 keys block `Docs-Updated: yes` until investigated. A secret consumed by code with no traceable source in config files or registered providers is a gap that must be resolved, not deferred.

**Document format.**

Mirror the config file hierarchy. Use colon-joined section headings. Each leaf key gets an entry. Example:

```markdown
## Payments

Bound to `PaymentsOptions` (`src/Config/PaymentsOptions.cs`).

### `Payments:ApiKey`
- **Provider:** `keyvault`
- **Type:** `string`
- **Required:** yes
- **Default:** none — must be injected at deploy time
- **Access**
  - Typed: `ApiKey` on `PaymentsOptions`
  - Raw: `LegacyPaymentService` (`src/Services/LegacyPaymentService.cs:47`)
- Description in STE. One or two sentences on what this key controls.

### `Payments:TimeoutSeconds`
- **Provider:** `appsettings.json`
- **Type:** `int`
- **Required:** no
- **Default:** `30`
- **Access**
  - Typed: `TimeoutSeconds` on `PaymentsOptions`
- The maximum number of seconds to wait for a payment gateway response.

### `FeatureFlags:LegacyExport` ⚠️ NO CODE CONSUMER
- **Provider:** `appsettings.json`
- **Type:** `bool`
- **Default:** `false`
- **Access:** none found
- This key exists in `appsettings.json`. No consumer was found in source.
  Confirm whether this is dead configuration or a planned feature.
```

The `Default` field records the literal default from source — a named constant, a hardcoded literal in the binding class — not a value from a deployed config file. If the default can only be injected at runtime, write `none — must be injected`.

Backticked property names and class names on `Access: Typed` lines are ripwire anchors verified by `--doc-drift`. Raw string key literals on `Access: Raw` lines are prose; verify them with:

```bash
grep -rEn 'configuration\["|GetValue<|GetSection\("|GetEnvironmentVariable\(' src/
```

Cross-reference grep output against the `Access: Raw` entries in `docs/configuration.md`. Any key in the grep output that is absent from the doc is a required addition.

### Delta triggers

**`docs/configuration-providers.md`** is triggered when any changed file contains a provider registration call (`Add*` on a configuration builder). Read `references/conventions.md` for the project's registered provider patterns.

**`docs/configuration.md`** is triggered when any changed file matches:
- Config file patterns: `appsettings*.json`, `appsettings*.yaml`, `appsettings*.yml`, `*.config`, `Web.config`, `App.config`
- Binding class patterns: any class whose name ends in `Options` or `Settings`
- Consumer patterns: any file containing a confirmed config consumer call (after Stage 2 verification)

When triggered, add the relevant doc to the candidate doc set unconditionally and apply the inventory steps above to the affected sections.

## Decide the mode

1. No `docs/` folder, or the user asks to bootstrap, initialize, or generate docs for the whole codebase → **bootstrap mode**. Read `references/bootstrap.md`.
2. Otherwise → **delta mode**: a code change happened or is about to, and you update only the docs it affects. Read `references/delta-maintenance.md`. This is the common case.
3. The user asks for a health check, a drift report, or an STE pass over existing docs → **lint mode**. Read `references/lint.md`.

Read `references/conventions.md` in every mode. It defines the bundle layout, the frontmatter, the stale marker, the glossary, the derived map, the tickets scratch area, and the per-language config consumer patterns.

## Delta mode in brief

1. Confirm ripwire. Get the changed set: `ripwire . --pr-context` (or `--pr-context=main`), and `git diff --name-only`. Check for config touches: if any changed file contains a provider registration call, add `docs/configuration-providers.md` to the candidate set; if any changed file matches a config file pattern, binding class, or confirmed consumer pattern, add `docs/configuration.md` to the candidate set.
2. For each changed symbol, `ripwire . --mentions=SYM`. Union with `docs/_map.json` matches on the changed paths. That is the full candidate doc set.
3. Read the changed code. Then read the candidate docs.
4. Update each affected doc: prose, embedded Mermaid, backticked anchors, `sources`. Update the code-side comments on the changed public surface. Keep Diataxis `diataxis:` pure. For configuration docs, apply the inventory steps in the Configuration documentation section above.
5. Mark, do not guess: a doc you cannot reconcile gets `status`-preserving `stale_after: <now>` plus the `STATUS: STALE` body callout.
6. `ripwire . --doc-drift` on the docs you touched. Fix what it reports on your docs. Quote the `at=` sha.
7. `node <skill>/scripts/ste_check.mjs` on the docs you touched. Fix mechanical failures. With the agent pack, use `--lookup WORD` for the approved alternative, and add project technical nouns and verbs from the `1.5` candidate list to `docs/_glossary.json` instead of waiving them.
8. Update `verified` on each doc whose covered code you read; append a `log.md` entry; regenerate `_map.json` if `sources` changed; add index lines for new docs.
9. Emit the self-report block.

## Bootstrap mode in brief

One-time, whole-codebase pass. Run the configuration inventory first: scan all config files to build the full key tree, scan for provider registrations, scan for typed bindings and raw consumers, apply two-stage verification, and produce initial `docs/configuration-providers.md` (if providers found) and `docs/configuration.md` (if any config exists). Then `ripwire . --report` and `--communities` to see the shape, then one flow at a time: `--for=<flow>`, read the code, write the doc from `assets/templates/flow.md`, add the code-side back-links. Create `docs/index.md`, `overview.md`, `architecture.md`, `flows/`, `decisions/`, `_glossary.json`, `_map.json`, `log.md`. Build the glossary first; with the agent pack, the checker's `1.5` candidate list on your first drafts tells you which project words it still needs. Everything starts `status: draft` with only an agent `verified` entry; a human adds `human:<id>` on sign-off. If qmd is available, finish with the non-blocking coverage check (`references/qmd.md`). Full procedure in `references/bootstrap.md`.

## Required output: the self-report block

End every run that touched code or docs with this block, verbatim keys:

```
Skill-Version: <version from frontmatter>
Docs-Updated: yes | no | n/a
Docs-Files: <comma-separated doc paths, or none>
Code-Comments: <comma-separated source files where you added or updated doc comments, or none>
Files-Read: <comma-separated source files/symbols you actually opened, or none>
Docs-Stale-Markers: <comma-separated doc paths you marked STATUS: STALE, or none>
Ripwire: <version> at=<sha[+dirty]> | absent
Docs-Drift: drift=<N> dated=<M> on <docs checked>, or not-run
Docs-STE: pass | fail(<N> mechanical) | warn(<N> heuristic) | not-run
Docs-Config-Providers: pass | updated | absent (no providers found) | not-triggered | not-run
Docs-Config-Keys: pass | added(<N> keys) | gap(consumers=<N> dead=<M> unknown-source=<K>) | unresolved(<N> candidates need review) | not-triggered | not-run
Docs-Coverage-QMD: <N> gap(s) found | none found | absent | not-run
Docs-Candidates-QMD: requested and found(<N>) | requested, none found | absent | not-run
Docs-Skipped-Reason: <only if Docs-Updated is no or n/a>
```

Rules for the block:
- `Skill-Version` always reflects the version field in this file's frontmatter. It is how a reviewer knows which version of the skill produced a given run.
- `n/a` is only correct when the change affects no documented behavior (comment-only, test-only, formatting). Say why in `Docs-Skipped-Reason`.
- `no` is only correct when the user told you not to update docs in this task. It applies to this task only.
- `Files-Read` lists files you opened in this session. Empty `Files-Read` with `Docs-Updated: yes` is a contradiction. Fix it by reading the code.
- `Docs-Updated: yes` requires `Docs-STE: pass` or `warn(...)`, never `fail(...)` or `not-run`, and requires `Docs-Drift` to show zero live drift on the docs you touched.
- `Ripwire: absent` means the run stopped. Say so in `Docs-Skipped-Reason`.
- `Docs-Config-Providers: absent (no providers found)` is valid; do not create the file in that case.
- `Docs-Config-Keys: unresolved(N)` does not block `Docs-Updated: yes` but must be reported. The unresolved candidates require manual review before the next run closes them.
- Any Category 5 (`⚠️ SOURCE UNKNOWN`) key found and not resolved blocks `Docs-Updated: yes`. Report it in `Docs-Config-Keys: gap(unknown-source=<K>)` and in `Docs-Skipped-Reason`.
- `Docs-Coverage-QMD` applies to bootstrap mode only; use `not-run` in delta and lint mode. It never blocks completion, present or absent.
- `Docs-Candidates-QMD` applies to delta mode only; use `not-run` in bootstrap and lint mode, and `not-run` in ordinary delta runs where qmd was not requested. It never blocks `Docs-Updated: yes`, and a qmd hit is never itself a checkable anchor.

## Honest limits

You follow these instructions; they are not an enforced gate. The reliable parts are the ones a human can see and check: the self-report in the PR, the `STATUS: STALE` markers in the diff, the `verified` entries, the ripwire sha stamp, and the checker exit code. Ripwire verifies anchors, not prose: it cannot tell you a paragraph is wrong, only that a name, line, or number it cites no longer holds. The STE checker proves the mechanical rules and only suspects the rest. A doc with zero drift and a clean STE run can still be wrong. Reading the code is what makes it right.

The configuration inventory is grep-assisted, not statically analyzed. Two-stage receiver verification reduces false positives but does not eliminate them. Unresolved candidates and Category 3 keys require human judgment. The doc is a starting point for that judgment, not a replacement for it.

## Changelog

### 2.0.0
Breaking changes:
- The scripts are Node.js ES modules. They need Node.js 22 or newer and have no dependencies. Python is no longer used. Every command changes from `python3 <skill>/scripts/NAME.py` to `node <skill>/scripts/NAME.mjs`.
- `_glossary.yaml`, `_map.yaml`, and `org-glossary.yaml` are now JSON: `_glossary.json`, `_map.json`, `org-glossary.json`. Doc frontmatter stays YAML, as OKF requires. `INSTALL.md`, section "Upgrading from 1.x", gives the steps.

Behavior:
- Output matches 1.2.0 on a 41-case parity corpus, apart from the renamed files. The Node scripts also match the Python scripts on 2.5 MB of unrelated prose and source comments.
- Fixed: `docs_check.mjs links` did not read `.mjs` files, so it found no code back-links in a Node.js repository that uses ES modules. After this change, it reads the same source files as `ste_check.mjs`.
- New: `ste_check.mjs` and `docs_check.mjs` also read `.cjs`, `.mts`, and `.cts` files. They check the doc comments and the back-links in these files with the JavaScript and TypeScript rules.
- Fixed: the code back-link scan skipped every source file when the repository sat under a folder named `build`, `bin`, `obj`, `dist`, `node_modules`, `third_party`, or `.git`. It now looks only at folders inside the repository.
- Fixed: `docs_check.mjs affected` matched case-sensitively on Linux and macOS and case-insensitively on Windows. It is now case-sensitive everywhere. The `okf` check of `sources` globs is also case-sensitive on Windows and macOS now.
- Fixed in the port before release: on Windows, `ste_check.mjs` checked `index.md` and `log.md`. It skips them on every system, as 1.2.0 did.
- Fixed in the port before release: a long run of spaces or `|` characters inside a line made `ste_check.mjs` very slow. The time now grows in proportion to the length of the line.
- Fixed in the port before release: `docs_check.mjs stale --days` accepted values such as `1.0`, `1e3`, `0x10`, and an empty value. It accepts only a whole number, as 1.2.0 did. Digits other than 0 to 9 are not accepted.
- New: a file that a script cannot read (a folder named `x.md`, a broken link, a file with no read permission) stops the run with exit 2 and a message that names the file. The script prints the findings it found before the stop. In 1.2.0 the run stopped with a traceback and exit 1.
- Fixed in the port before release: `ste_check.mjs` reported the notice for a leftover `_glossary.yaml` on the organization glossary file. It reports it on the `_glossary.yaml` file.
- Fixed: output no longer depends on whether PyYAML was installed. With PyYAML, some messages printed timestamps in a different form.
- Fixed: `ste_check.mjs --glossary-report` lists names with equal counts in alphabetical order. Before, the order followed the directory scan and changed between machines. `docs_check.mjs links` also reports code back-links in a stable order.
- New: a glossary or map file that is not valid JSON stops the run with a message that names the file. A leftover `_glossary.yaml` or `_map.yaml` with no JSON file produces a notice instead of being ignored.
- Removed: rule 3.2 from the usage text. The checker never reported it.
- Added `references/glossary.md`. The comments that were in the YAML glossary files live there, because JSON has no comments.
- Fixed the OKF link in `references/okf.md`. The specification moved to https://github.com/GoogleCloudPlatform/open-knowledge-format.

### 1.2.0
- Added optional qmd (https://github.com/tobi/qmd) integration for finding docs by meaning instead of declared anchors. Read `references/qmd.md`.
- Bootstrap mode: added a non-blocking coverage check as step 9, run only when qmd is available, comparing `--communities` clusters against what the freshly written bundle actually discusses.
- Delta mode: qmd is available only on explicit user request, never as a default lookup — `--mentions` and `_map.json` remain the only default candidate-doc signals.
- Added `Docs-Coverage-QMD` and `Docs-Candidates-QMD` to the self-report block. Neither blocks `Docs-Updated: yes`, present or absent.

### 1.1.0
- Added configuration documentation: `docs/configuration-providers.md` and `docs/configuration.md` as two distinct required documents with independent delta triggers.
- Added config file inventory covering JSON, YAML, and XML formats.
- Added typed binding detection and two-stage raw consumer detection with receiver verification to reduce false positives from generic method names.
- Added five-category key classification; Category 5 (SOURCE UNKNOWN) blocks `Docs-Updated: yes`.
- Added `Skill-Version`, `Docs-Config-Providers`, and `Docs-Config-Keys` to the self-report block.
- Added `version` field to frontmatter and this changelog.
- Extended delta mode step 1 with config-touch detection.
- Extended bootstrap mode with upfront config inventory step.
- Extended honest limits to cover configuration inventory limitations.

### 1.0.0
- Initial release.
