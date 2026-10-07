---
name: anchored-docs
description: Keep a repository's living developer documentation in docs/ true to the code, written in ASD-STE100 Simplified Technical English, stored as an OKF (Open Knowledge Format) bundle, and verified with ripwire. Use this whenever you finish a code change, prepare a commit or pull request, write an implementation plan, or are asked to document, update docs, refresh the wiki, check docs for drift, or bootstrap docs for a repo. Treat updating the affected documentation as part of the definition of done for every code change in a repo that has a docs/ folder, unless the user says not to. Triggers even when the user does not say "documentation", for example after "add a field to the order request", "refactor the ingest pass", "open a PR for this", or "is this doc still right". Also use it to rewrite any docs/ prose into STE, or to run the docs lint.
metadata:
  version: "2.0.1"
---

# anchored-docs

This skill keeps `docs/` correct, so that an agent can read the docs and not read all of the code again. The code is the source of correct data. You keep the docs. Three tools let a person or an agent check the docs. A fourth tool is optional. The fourth tool helps to find the subjects that the docs do not have.

- **ripwire** compares the doc anchors with the code (`--doc-drift`). Ripwire finds the docs that a changed symbol touches (`--mentions`). Ripwire gives the changed symbols of a diff (`--pr-context`). The skill must have ripwire. Read `references/ripwire.md`.
- **OKF v0.2** frontmatter records the code that each doc comes from (`sources`). The frontmatter records the author and the persons who examined the doc (`generated`, `verified`). The frontmatter also records if the doc is current (`status`, `stale_after`). Read `references/okf.md`.
- **ASD-STE100 Issue 9** is the writing standard for each sentence of prose in `docs/`. `scripts/ste_check.mjs` is the gate. Read `references/ste-rules.md` before you write. When the ASD-STE100 agent pack is in `references/asd-ste100-agent-pack/`, the checker and you use the official rules and dictionary of the pack. Without the pack, the checker and you use the short rules in `references/ste-rules.md` and the word list in the checker.
- **qmd** (optional, https://github.com/tobi/qmd) is a local search engine for the docs bundle. The qmd tool finds subjects and connections that the symbol index of ripwire and `_map.json` cannot find, because it compares meaning, not anchors. The qmd tool does not make sure that a doc is correct. The skill can operate without it. Bootstrap mode uses it at the end, and a missing qmd does not stop the task. Delta mode uses it only when the user tells you to use it. Read `references/qmd.md`.

The scripts in `scripts/` are Node.js ES modules (`.mjs`). The scripts use Node.js 22 or a higher version, and they have no packages to install. The data files of the skill (`_glossary.json`, `_map.json`, `org-glossary.json`) are JSON. The frontmatter of a doc stays YAML, because OKF tells you to use YAML.

This skill is the procedure for a rule in CLAUDE.md or AGENTS.md. The rule is: after a code change, update the docs that the change touches. Do this before you say that the work is complete.

## Rule 1: read the code, never assume

Before you write or update a doc, open the source files of the subject. Also open them before you write a plan for a code change, and before you answer a question about the behavior of the code. Do not get the behavior from file names, symbol names, your memory, or the current docs. The current docs can be stale. An incorrect doc that looks sure makes the next agent incorrect too.

Show that you read the code: give the files and symbols that you opened in `Files-Read` in the self-report. If you did not read the code for a statement, do not write that statement.

## Rule 2: make every claim checkable

Ripwire can only check a statement that has a checkable shape. Write each statement so that `--doc-drift` can test it:

- Write the symbol in backticks, as a bare identifier: `SubmitAsync`, `rankGraphTeleport`. Ripwire indexes bare names, so write `` `SubmitAsync` on `OrderService` ``, not `` `OrderService.SubmitAsync` ``. When a name in backticks is no longer in the code, ripwire shows it as drift.
- Put a second name from the repository on the same line as each symbol: the type, the file, or a caller. Ripwire does not check a name that is alone on its line. Such a name can be the name of a library item, not of an item in this repository. Ripwire checks `` `LegacySubmit` in `OrderService` was removed ``, but not `` `LegacySubmit` was removed ``.
- Give a location as `path:line` **and** write the name of the symbol on that line adjacent to it. A `path:line` alone is a weak anchor. A `path:line` adjacent to a symbol in backticks is a strong anchor.
- Write constants as `` `kMaxRetries` = 5 `` and array sizes as `` `kSlots[16]` ``. Ripwire compares the number with the declaration.
- A count in the prose ("the pipeline has five parts") must come from a list in the same doc, or from a symbol. Use the symbol if possible.

Ripwire does not check fenced code blocks, because they are examples, not statements. Do not put a statement only in a fenced code block.

## Rule 3: write in STE

Each sentence of prose in `docs/` follows ASD-STE100. The primary rules are:

- Use approved words with one meaning each, and the technical nouns and verbs of the project glossary.
- Use the active voice and simple tenses. Write one instruction in each sentence.
- Write no more than 20 words in a procedural sentence and no more than 25 in a descriptive sentence. Write no more than 6 sentences in a paragraph.
- Do not use semicolons, contractions, or phrasal verbs.

Code spans, paths, commands, the output of commands, and headings are technical nouns. The rules do not apply to them.

Use the checker before you report:

```bash
node <skill>/scripts/ste_check.mjs docs/                # whole tree
node <skill>/scripts/ste_check.mjs docs/flows/x.md      # one doc
```

The skill does not contain the STE dictionary. ASD gives the dictionary at no cost, but you must not give copies to other persons. The checker gets its words from the first of these sources that it finds:

1. The **agent pack** in `references/asd-ste100-agent-pack/`, or at `STE_AGENT_PACK`. The check of rule 1.1 is complete. An unapproved word gives a failure with the alternatives from the dictionary. A word that is not in the dictionary gives one warning in each file, as a candidate technical noun (1.5, 1.12). The words in the computer and engineering categories of the standard are approved. `ste_check.mjs --lookup WORD` shows the dictionary entry when you replace a word.
2. `STE_DICTIONARY=/path/to/words.txt`, with one approved word on each line. A word that is not in the file gives a failure of rule 1.1.
3. No source: the checker uses only its own list of words that are not STE. The summary shows `(1.1 partial)`.

`ste_check.mjs --status` shows the source that the checker uses. Do not add this to the self-report. When the pack is not there, `Docs-STE` shows `(1.1 partial)`. `INSTALL.md` tells how to get the pack.

With the pack, some usual software words give failures, because they are not approved words of the dictionary (`run`, `build`, `log`, `call`, `return`, `request`, `option`, `setting`). When the project uses such a word as a technical noun or verb, add it to the project glossary. Do not waive it.

The exit code of the checker shows the result:

- Exit 0: the text agrees with the mechanical rules.
- Exit 1: a mechanical failure (length, semicolon, contraction, Latin abbreviation, a word that is not STE). Correct each one before you write `Docs-Updated: yes`.
- Exit 2: the check did not complete. The cause is an incorrect command, a glossary file that is not correct JSON, or a file that the script cannot read. The last line gives the cause. Correct it and do the check again.

Heuristic findings give warnings: passive voice, `-ing` words, complex tenses, phrasal verbs, long noun clusters, and two instructions in one sentence. Write again the sentences that you can. Count the remaining warnings in `Docs-STE`. When the checker does not read a correct sentence correctly, put `<!-- ste-ok: 3.6 agent unknown -->` on the line before it. Do not use this to save time.

## Rule 4: ripwire first, and it must be there

Make sure that ripwire is available before you do other work. The `ripwire` tool must be on `PATH` (or at `RIPWIRE_BIN`, or at `./build/ripwire`), or the `ripwire` MCP server must answer `ping`. On Windows, ripwire operates in WSL, and you get access to it through `wsl -e` or the MCP server (`references/ripwire.md`, Windows section).

If you cannot get access to ripwire, stop and tell the user. This skill does not operate without ripwire, because without it nobody checked the doc anchors. Do not use grep as an alternative to ripwire and then say that the result is correct. Record the result in `Ripwire:` in the self-report.

## Keep the code's own doc comments current

The documentation has two connected layers: the Markdown in `docs/`, and the doc comments in the source. The comment on the primary symbols of a flow gives the path of the flow doc, so a reader can go from code to doc. The symbols in backticks and the `sources` of the doc go from doc to code, and `--mentions` makes sure that this connection is correct.

When you change code, update the comment on the public symbols that the change touches, in the same work. Use the format of the language: C# XML `<seealso href>`, C++ `/// See: docs/...`, Python docstring `See also:`, TypeScript JSDoc `@see`. `references/conventions.md` gives the formats of the tags. Comments must have the same quality as the Markdown: read the code, keep the comments correct, and write them in STE.

## Configuration documentation

Each repository that gets configuration from a source that is not the code keeps two different documents. These documents record *what* configuration is possible and *how* it gets to the application. They do not record the values of a deployed system.

- `docs/configuration-providers.md` tells how configuration gets to the application. The document gives the providers that the code adds, the order of precedence, and the location in the source where the code adds each provider. This document is necessary only when the code adds providers. The document changes only a small number of times.
- `docs/configuration.md` tells what configuration the application uses. The document gives all of the keys in the configuration files. The document also shows the keys that the code uses and the keys that the code does not use. This document is necessary when the repository has a configuration file or code that reads configuration. The document changes when a configuration file, a binding class, or the code that reads configuration changes.

The two documents are not connected. Each document has its own conditions for an update. When the providers change, the key list can stay the same. When the keys change, the providers can stay the same.

### Provider detection (`docs/configuration-providers.md`)

Examine `Program.cs`, `Startup.cs`, and each file with `Host`, `Builder`, or `Configuration` in its name. Find the code that adds providers.

**C#**: the `Add*` methods on `IConfigurationBuilder` or `WebApplicationBuilder.Configuration`. Usual providers: `AddJsonFile`, `AddYamlFile`, `AddXmlFile`, `AddEnvironmentVariables`, `AddUserSecrets`, `AddAzureKeyVault`, `AddSecretsManager`, `AddConsul`, `AddVault`, `AddKeyPerFile`.

**Other languages**: the code that adds a provider or a loader in that language. Find these patterns in bootstrap mode. Record them in `references/conventions.md`, in the `config-provider-patterns` section, so that the next delta tasks can find them.

For each provider that you find, record:

- The type of provider, for example `AzureKeyVault`, `EnvironmentVariables`, or `JsonFile`.
- The location where the code adds it: `path:line` adjacent to the method name in backticks. Ripwire can check this type of reference.
- Its position in the order of precedence. The order of precedence is the order in which the code adds the providers. Also write how the language uses this order.
- What the provider supplies: default values, values for one environment, or secrets.

The document starts with a **Providers** section. This section gives all of the providers in the order of precedence, before the key list. Example:

```markdown
## Configuration Providers

The application gets its configuration from these sources. The list starts with the lowest precedence.

1. `appsettings.json`: the default values. The repository contains this file.
2. `appsettings.{Environment}.json`: the values for one environment. The repository contains this file.
3. Environment variables: the values that the deployed system supplies (`AddEnvironmentVariables` at `Program.cs:18`).
4. Azure Key Vault: the secrets. This provider has the highest precedence (`AddAzureKeyVault` at `Program.cs:22`).

The configuration files in the repository do not contain the keys from providers 3 and 4.
```

When the code adds no provider, `Docs-Config-Providers: absent (no providers found)` is the correct result. Do not make the file in that condition.

### Key inventory (`docs/configuration.md`)

Collect keys from three sources. Then compare the three sources and give each key a category.

**Step 1: collect config files.**
Find all configuration files with these patterns:

| Format | Patterns |
|---|---|
| JSON | `appsettings*.json`, `config.json`, `*.json` in `config/` or `Configuration/` |
| YAML | `appsettings*.yaml`, `appsettings*.yml`, `config.yaml`, `config.yml` |
| XML | `Web.config`, `App.config`, `appsettings.xml`, `*.config` |

Go through the structure of each file and get the full key tree as paths with colons (`Section:Subsection:Key`). Each leaf is a candidate key. In XML, each `<appSettings>` entry gives a flat key, and a custom configuration section gives nested paths. Do not record values.

**Step 2: collect typed bindings.**
Find all classes that the code uses as typed options. In C#, find `Configure<T>`, `AddOptions<T>`, `Bind(`, and `Get<T>()` on an `IConfigurationSection`. Connect the section path of the argument to the class. Then use each public property of the class as a bound key.

Ripwire can check each property name and its class name. Write them as symbols in backticks in the doc.

For other languages, record the patterns of that language in `references/conventions.md` in bootstrap mode.

**Step 3: collect raw consumers (two-stage).**

*Stage 1: collect candidates.* Find the code that reads configuration directly.

C# candidates: `IConfiguration[`, `IConfiguration.GetValue<`, `IConfiguration.GetSection(`, `IConfigurationSection[`, `IConfigurationSection.GetValue<`, `GetEnvironmentVariable(`.

Do not think that each `GetValue<T>` reads configuration. The method name alone does not show that the code reads configuration. ORM query builders, JSON parsers, HTTP response handlers, and other code also use it. Stage 2 makes sure of the receiver before you accept a candidate.

*Stage 2: examine the receiver.* For each candidate from stage 1, make sure that the receiver is related to configuration. These signs show it in C#:

- The type of the variable is `IConfiguration`, `IConfigurationSection`, or `IConfigurationRoot`.
- The name of the variable is a usual name: `_configuration`, `configuration`, `_config`, `config`, `builder.Configuration`, `app.Configuration`, `context.Configuration`.
- The constructor of the class gets an `IConfiguration` parameter.
- The file contains `using Microsoft.Extensions.Configuration`.

When no sign applies, discard the candidate. When the signs do not agree, or the file does not show the receiver, mark the candidate as **unresolved**. Do not add an unresolved candidate to `configuration.md` as a known consumer. Report it in `Docs-Config-Keys`, so that a person can examine it. Unresolved candidates alone do not stop `Docs-Updated: yes`, but you must report their number.

**Step 4: classify each key.**

Compare the three sources. Give a category to each key that you found in one or more of the sources:

| Category | In config file | Code consumer | Provider in code | Marker in doc |
|---|---|---|---|---|
| 1 | Yes | Typed binding | Yes or no | none (ripwire checks it) |
| 2 | Yes | Raw, checked | Yes or no | none (grep checks it) |
| 3 | Yes | None found | — | `⚠️ NO CODE CONSUMER` |
| 4 | No | Raw, checked | Found | `provider: <name>` |
| 5 | No | Raw, checked | None found | `⚠️ SOURCE UNKNOWN` |

Find the cause of each category 3 key before you close the work. Possibly nothing uses the key. The key can also be a feature flag with no code path at this time, or a key for work in the future. Record what you find in the entry for that key.

A category 5 key stops `Docs-Updated: yes` until you know its source. When code uses a secret, and no configuration file or provider supplies it, you must find the source. Do not keep this work for a different task.

**Document format.**

Use the same tree as the configuration file. Use section headings with colons. Give each leaf key an entry. Example:

```markdown
## Payments

`PaymentsOptions` (`src/Config/PaymentsOptions.cs`) gets the values of this section.

### `Payments:ApiKey`
- **Provider:** `keyvault`
- **Type:** `string`
- **Required:** yes
- **Default:** none — must be injected at deploy time
- **Access**
  - Typed: `ApiKey` on `PaymentsOptions`
  - Raw: `LegacyPaymentService` (`src/Services/LegacyPaymentService.cs:47`)
- The key for the payment gateway. The application sends it with each payment.

### `Payments:TimeoutSeconds`
- **Provider:** `appsettings.json`
- **Type:** `int`
- **Required:** no
- **Default:** `30`
- **Access**
  - Typed: `TimeoutSeconds` on `PaymentsOptions`
- The maximum number of seconds that the application waits for a response from the payment gateway.

### `FeatureFlags:LegacyExport` ⚠️ NO CODE CONSUMER
- **Provider:** `appsettings.json`
- **Type:** `bool`
- **Default:** `false`
- **Access:** none found
- `appsettings.json` contains this key, but no code uses it.
  Find out if nothing uses this key, or if it is for a planned feature.
```

The `Default` field records the default value from the source code: a named constant, or a value in the binding class. The field does not record a value from a deployed configuration file. If only the deployed system can supply the value, write `none — must be injected`.

Ripwire checks the property names and class names in backticks on the `Access: Typed` lines (`--doc-drift`). The key strings on the `Access: Raw` lines are prose, and ripwire does not check them. Check them with this command:

```bash
grep -rEn 'configuration\["|GetValue<|GetSection\("|GetEnvironmentVariable\(' src/
```

Compare the output of grep with the `Access: Raw` entries in `docs/configuration.md`. When the output of grep has a key that the doc does not have, you must add that key.

### Delta triggers

**`docs/configuration-providers.md`**: update this document when a changed file contains code that adds a provider (an `Add*` method on an `IConfigurationBuilder`). `references/conventions.md` gives the provider patterns of the project.

**`docs/configuration.md`**: update this document when a changed file agrees with one of these patterns:

- Config file patterns: `appsettings*.json`, `appsettings*.yaml`, `appsettings*.yml`, `*.config`, `Web.config`, `App.config`.
- Binding class patterns: a class with a name that ends in `Options` or `Settings`.
- Consumer patterns: a file with code that reads configuration, after stage 2 of step 3.

When a trigger applies, always add the related document to the candidate docs. Then do the steps of the key inventory on the sections that the change touches.

## Decide the mode

1. Use **bootstrap mode** when there is no `docs/` folder. Also use it when the user tells you to bootstrap or to make docs for all of the code. Read `references/bootstrap.md`.
2. Use **delta mode** in all other conditions. A code change occurred, or will occur, and you update only the docs that it touches. Read `references/delta-maintenance.md`. Delta mode is the usual mode.
3. Use **lint mode** when the user tells you to check the health of the docs. A drift report and an STE check of the current docs also use lint mode. Read `references/lint.md`.

Read `references/conventions.md` in each mode. That file gives the layout of the bundle, the frontmatter, the stale marker, and the glossary. That file also gives the derived map, the scratch area for tickets, and the configuration patterns for each language.

## Delta mode in brief

1. Make sure that ripwire is available. Get the changes: `ripwire . --pr-context` (or `--pr-context=main`), and `git diff --name-only`. Then look for configuration changes:
   - When a changed file adds a provider, add `docs/configuration-providers.md` to the candidate docs.
   - When a changed file agrees with a configuration file pattern, a binding class, or a consumer pattern, add `docs/configuration.md` to the candidate docs.
2. For each changed symbol, use `ripwire . --mentions=SYM`. Add the docs that `docs/_map.json` gives for the changed paths. The result is the full set of candidate docs.
3. Read the changed code. Then read the candidate docs.
4. Update each doc that the change touches: the prose, the Mermaid diagrams, the anchors in backticks, and `sources`. Update the comments on the public symbols that the change touches. Keep one Diataxis type in each doc (`diataxis:`). For the configuration docs, do the steps of the key inventory in the Configuration documentation section above.
5. Do not guess. When you cannot make a doc agree with the code, add `stale_after: <now>` and keep its `status`. Also add the `STATUS: STALE` callout to the body.
6. Use `ripwire . --doc-drift` on the docs that you changed. Correct what it shows in your docs. Give the `at=` sha.
7. Use `node <skill>/scripts/ste_check.mjs` on the docs that you changed. Correct the mechanical failures. With the agent pack, use `--lookup WORD` to find the approved alternative. Add the project technical nouns and verbs from the `1.5` candidate list to `docs/_glossary.json`. Do not waive them.
8. Update `verified` on each doc when you read the code that it covers. Add an entry to `log.md`. When `sources` changed, make `_map.json` again. Add a line to the index for each new doc.
9. Write the self-report block.

## Bootstrap mode in brief

Bootstrap mode examines all of the code, one time. Do it in this sequence:

- Do the configuration inventory first. Examine all configuration files to get the full key tree. Find the providers, the typed bindings, and the raw consumers, and do the two-stage check. Write `docs/configuration-providers.md` (if you found providers) and `docs/configuration.md` (if there is configuration).
- Use `ripwire . --report` and `--communities` to see the shape of the code.
- Then do one flow at a time: use `--for=<flow>`, read the code, and write the doc from `assets/templates/flow.md`. Add the back-links in the code.
- Make `docs/index.md`, `overview.md`, `architecture.md`, `flows/`, `decisions/`, `_glossary.json`, `_map.json`, and `log.md`.
- Make the glossary first. With the agent pack, the `1.5` candidate list of the checker on your first docs shows the project words that the glossary does not have.
- Each doc starts with `status: draft` and one agent entry in `verified`. A person adds `human:<id>` after the review of the doc.
- If qmd is available, do the coverage check at the end (`references/qmd.md`). A missing qmd does not stop the task.

`references/bootstrap.md` gives the full procedure.

## Required output: the self-report block

At the end of each task that changed code or docs, write this block. Write the keys with no change:

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

- `Skill-Version` always gives the version from the frontmatter of this file. Thus a reviewer knows which version of the skill did the task.
- `n/a` is correct only when the change touches no documented behavior: only comments, only tests, or only formatting. Write why in `Docs-Skipped-Reason`.
- `no` is correct only when the user told you not to update the docs in this task. The value `no` applies only to this task.
- `Files-Read` gives the files that you opened in this session. An empty `Files-Read` with `Docs-Updated: yes` is not possible. Read the code to correct it.
- `Docs-Updated: yes` is correct only with `Docs-STE: pass` or `warn(...)`, not with `fail(...)` or `not-run`. `Docs-Drift` must also show zero live drift on the docs that you changed.
- `Ripwire: absent` means that the task stopped. Write this in `Docs-Skipped-Reason`.
- `Docs-Config-Providers: absent (no providers found)` is a correct result. Do not make the file in that condition.
- `Docs-Config-Keys: unresolved(N)` does not stop `Docs-Updated: yes`, but you must report it. A person must examine the unresolved candidates before the next task closes them.
- A category 5 key (`⚠️ SOURCE UNKNOWN`) without a known source stops `Docs-Updated: yes`. Report it in `Docs-Config-Keys: gap(unknown-source=<K>)` and in `Docs-Skipped-Reason`.
- `Docs-Coverage-QMD` applies only to bootstrap mode. Use `not-run` in delta mode and lint mode. This key does not stop the work, with or without qmd.
- `Docs-Candidates-QMD` applies only to delta mode. Use `not-run` in bootstrap mode and lint mode. Also use it in a usual delta task when the user did not tell you to use qmd. This key does not stop `Docs-Updated: yes`. A result from qmd is not a checkable anchor.

## Honest limits

You follow these instructions, but no gate makes you follow them. You can trust the parts that a person can see and check. These parts are the self-report in the PR and the `STATUS: STALE` markers in the diff. They also include the `verified` entries, the sha of ripwire, and the exit code of the checker.

Ripwire checks anchors, not prose. Ripwire cannot tell you that a paragraph is incorrect. Ripwire can only tell you that a name, a line, or a number in the doc is no longer correct. The STE checker proves the mechanical rules, and it only shows possible problems for the other rules. A doc with zero drift and a clean STE result can be incorrect. Only the code that you read makes a doc correct.

The configuration inventory uses grep. The inventory does not do an analysis of the code. The two-stage check of the receiver decreases the number of incorrect candidates, but some can stay. A person must examine the unresolved candidates and the category 3 keys. The doc is a start for that review. The doc does not replace the review.

## Changelog

### 2.0.1
- Corrected: the version of the skill is in `metadata.version` in the frontmatter. Before this change, it was a top-level `version` key. The Agent Skills specification does not let a skill use that key, and strict validators such as `skills-ref validate` refuse it.
- Corrected: `INSTALL.md` gives the frontmatter keys of the skill correctly.
- Corrected: when the `--repo` folder was not there, a `sources` pattern that starts with `**` found a file. After this change, it finds no file, as in 1.2.0.
- Corrected: `ste_check.mjs` did not expand `~\` at the start of `STE_AGENT_PACK`. After this change, `~\` and `~/` go to the home folder, as in `STE_ORG_GLOSSARY`.
- Corrected: a command such as `head` can close the output pipe before the end of the report. Then the two scripts showed a Node.js error and stopped with exit code 1. After this change, they stop with the exit code of the checks and show no error.
- Corrected: a long line of dots or dashes made `ste_check.mjs` slow. With 80,000 dots, the check used 4 seconds. The time increased with the square of the length. After this change, the time increases with the length only, and the findings do not change.

### 2.0.0
Breaking changes:
- The scripts are Node.js ES modules. The scripts use Node.js 22 or a higher version and have no packages to install. The skill does not use Python. Each command changes from `python3 <skill>/scripts/NAME.py` to `node <skill>/scripts/NAME.mjs`.
- `_glossary.yaml`, `_map.yaml`, and `org-glossary.yaml` changed to JSON files: `_glossary.json`, `_map.json`, `org-glossary.json`. The frontmatter of a doc stays YAML, because OKF tells you to use YAML. `INSTALL.md`, section "Upgrading from 1.x", gives the steps.

Behavior:
- The output is the same as the output of 1.2.0 on a set of 41 tests, apart from the new file names. The Node.js scripts also give the same results as the Python scripts on 2.5 MB of prose and source comments.
- Corrected: `docs_check.mjs links` did not read `.mjs` files. Thus it found no code back-links in a Node.js repository with ES modules. After this change, it reads the same source files as `ste_check.mjs`.
- New: `ste_check.mjs` and `docs_check.mjs` also read `.cjs`, `.mts`, and `.cts` files. The two scripts check the doc comments and the back-links in these files with the JavaScript and TypeScript rules.
- Corrected: the scan for code back-links did not read the source files when a parent folder of the repository had a special name. These names are `build`, `bin`, `obj`, `dist`, `node_modules`, `third_party`, and `.git`. At this time the scan examines only the folders in the repository.
- Corrected: `docs_check.mjs affected` compared capital letters and small letters as different on Linux and macOS, and as the same on Windows. At this time it compares them as different on all systems. The `okf` check of `sources` globs also compares them as different on Windows and macOS.
- Corrected before the release: on Windows, `ste_check.mjs` checked `index.md` and `log.md`. The script does not check them on all systems, as in 1.2.0.
- Corrected before the release: a long sequence of spaces or `|` characters in a line made `ste_check.mjs` very slow. At this time, the time increases only as much as the length of the line.
- Corrected before the release: `docs_check.mjs stale --days` accepted values such as `1.0`, `1e3`, `0x10`, and an empty value. The option accepts only an integer, as in 1.2.0. The option accepts only the digits 0 to 9.
- New: when a script cannot read a file, the script stops with exit 2 and a message that names the file. Examples are a folder with the name `x.md`, a broken file link, and a file that the user cannot read. The script prints the findings that it found before the stop. In 1.2.0 the script stopped with a traceback and exit 1.
- Corrected before the release: `ste_check.mjs` showed the notice for a remaining `_glossary.yaml` on the organization glossary file. The script shows the notice on the `_glossary.yaml` file.
- Corrected: the output does not change when PyYAML is installed. With PyYAML, some messages showed the time in a different format.
- Corrected: `ste_check.mjs --glossary-report` gives names with the same count in alphabetical sequence. Before this change, the sequence came from the folder scan and was different on different computers. `docs_check.mjs links` also gives the code back-links in the same sequence each time.
- New: a glossary file or a map file that is not correct JSON stops the script with a message that names the file. When a remaining `_glossary.yaml` or `_map.yaml` has no JSON file, the script gives a notice. Before this change, the script ignored that file.
- Removed: rule 3.2 from the help text. The checker did not show rule 3.2.
- Added `references/glossary.md`. That file contains the comments from the YAML glossary files, because JSON has no comments.
- Corrected the OKF link in `references/okf.md`. The specification is at https://github.com/GoogleCloudPlatform/open-knowledge-format.

### 1.2.0
- Added the optional qmd integration (https://github.com/tobi/qmd). The qmd tool finds docs by meaning, not by anchors. Read `references/qmd.md`.
- Bootstrap mode: added a coverage check as step 9. The check operates only when qmd is available, and it does not stop the task. The check compares the `--communities` clusters with the subjects of the new bundle.
- Delta mode: the qmd tool operates only when the user tells you to use it. The qmd tool is not a default search. `--mentions` and `_map.json` are the only default signals for candidate docs.
- Added `Docs-Coverage-QMD` and `Docs-Candidates-QMD` to the self-report block. These keys do not stop `Docs-Updated: yes`, with or without qmd.

### 1.1.0
- Added the configuration documentation: `docs/configuration-providers.md` and `docs/configuration.md`. The two files are different documents. Each document has its own conditions for an update.
- Added the inventory of configuration files in the JSON, YAML, and XML formats.
- Added the detection of typed bindings and the two-stage detection of raw consumers. The check of the receiver decreases the number of incorrect results from usual method names.
- Added the five categories for keys. A category 5 key (SOURCE UNKNOWN) stops `Docs-Updated: yes`.
- Added `Skill-Version`, `Docs-Config-Providers`, and `Docs-Config-Keys` to the self-report block.
- Added the `version` field to the frontmatter, and this changelog.
- Added the detection of configuration changes to step 1 of delta mode.
- Added the configuration inventory to the start of bootstrap mode.
- Added the limits of the configuration inventory to the honest limits.

### 1.0.0
- First release.
