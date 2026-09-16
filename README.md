# anchored-docs

`anchored-docs` is an agent-agnostic skill for keeping a repository's developer documentation true to its code.

It combines three required parts:

- [Ripwire](https://github.com/redhat-et/ripwire) checks documentation anchors against the repository and identifies the documentation affected by a code change.
- [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/) guides clear, controlled technical prose.
- [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) (OKF) frontmatter records each document's provenance, verification state, and current status.

An optional fourth part, [qmd](https://github.com/tobi/qmd), a local hybrid search engine over markdown, finds documentation gaps that Ripwire's symbol index cannot: areas the code clearly has but no doc discusses in any words. It never verifies anything and the skill runs fully without it. See "What it does" below.

The skill treats documentation as a maintained engineering artifact. It reads the code before it writes a claim, links documentation to concrete symbols and paths, checks those links, and reports what it verified.

## Agent-agnostic by design

The skill is designed to work with Codex, GitHub Copilot, Grok, Gemini, Claude, and other coding agents. Its core is a portable `SKILL.md` folder with plain Markdown, YAML, and scripts. It does not require a vendor-specific API, model, prompt syntax, or proprietary tool integration.

An agent host needs these capabilities:

- Read and update files in the target repository.
- Run local commands, including Python 3 and Ripwire.
- Load a local skill folder or accept the skill instructions as an attached artifact.

Ripwire can be called through its CLI or optional MCP server. The choice is an adapter for the host, not a change to the documentation workflow. See [anchored-docs-INSTALL.md](anchored-docs-INSTALL.md) for platform-specific installation locations and the Windows WSL setup.

## What it does

- Maintains living developer documentation in `docs/` as a description of the code, not a parallel source of guesses.
- Finds documentation affected by changed symbols and source paths.
- Checks backticked symbols, source locations, constants, and array extents for drift with Ripwire.
- Writes and checks prose against ASD-STE100 rules, with a project glossary for legitimate technical vocabulary.
- Records sources, verification evidence, and document state in OKF frontmatter.
- Marks a document `STATUS: STALE` when it cannot be reconciled with the code.
- Produces a self-report that states which files were read, what documentation changed, and the Ripwire and STE results.
- When [qmd](https://github.com/tobi/qmd) is installed, checks a freshly bootstrapped bundle for conceptual coverage gaps, and finds documentation for a change on request, beyond what Ripwire's symbol index and the declared source map cover.

## Contents

The distributable archive, [anchored-docs.skill](anchored-docs.skill), expands to this layout:

```text
anchored-docs/
|-- SKILL.md
|-- INSTALL.md
|-- assets/templates/
|-- references/
|-- scripts/
`-- .gitignore
```

`SKILL.md` contains the shared workflow. The `references/` directory holds the mode-specific guidance for bootstrap, delta-maintenance, linting, Ripwire, OKF, STE rules, and language conventions. The `scripts/` directory contains the documentation and STE checkers.

## Quick start

1. Install Ripwire and make it available on `PATH`, set `RIPWIRE_BIN`, or configure its MCP server.
2. Extract [anchored-docs.skill](anchored-docs.skill) and install the `anchored-docs/` folder where the selected agent discovers skills. Use [anchored-docs-INSTALL.md](anchored-docs-INSTALL.md) for known host locations.
3. Give the agent a task such as: `Use anchored-docs to update the documentation affected by this change.`
4. Let the agent read the relevant code, update only the affected documentation, run the checks, and return the skill's self-report.

For a host that cannot discover skills automatically, attach the archive or provide the contents of `SKILL.md` as the task instructions. The runtime workflow remains the same.

## Requirements

| Requirement | Purpose | Required |
| --- | --- | --- |
| Ripwire | Finds changed symbols and verifies documentation anchors. | Yes |
| Python 3 | Runs `docs_check.py` and `ste_check.py`. | Yes |
| ASD-STE100 agent pack | Provides the official dictionary and complete word checks. | Recommended |
| Project `docs/` directory | Target for normal delta maintenance. | Required for delta mode |
| [qmd](https://github.com/tobi/qmd) | Finds documentation coverage gaps by meaning, not declared anchors. | Optional |

Without the ASD-STE100 agent pack, the checker uses a limited built-in list and reports that rule 1.1 is partial. The skill can still run, but it cannot claim complete dictionary coverage.

Without qmd, the skill runs exactly as documented above; bootstrap mode skips its coverage check and delta mode's on-request lookup is simply unavailable. Neither affects Ripwire verification or the self-report's `Docs-Updated` result.

## ASD-STE100 content and terminology

ASD-STE100 is an ASD copyright and trademark. This repository provides workflow guidance and a checker integration. It does not include or redistribute the official specification, dictionary, or derived agent pack.

Obtain the official material from [ASD Simplified Technical English Maintenance Group](https://www.asd-ste100.org/). Generate a private pack with the [ASD-STE100 Generator Kit](https://github.com/Pmac627/ste-generator-kit). Keep the PDF and generated pack private, do not commit either to a public repository, and retain the archive's ignore rule for that content. See the installation guide for the expected pack location and setup procedure.

## Verification model

The skill has two distinct checks:

1. Ripwire verifies anchors, not whether every sentence accurately explains the system.
2. The STE checker enforces mechanical rules and flags likely style issues, but does not prove prose is clear or complete.

For that reason, the workflow requires the agent to read the relevant code before writing. When the code and document cannot be reconciled with confidence, the correct result is a visible stale marker, not an invented update.

qmd is not a third check. It finds candidate documentation by meaning, the way a search engine does, and never verifies a claim. A qmd result is a lead for the agent to read and confirm, exactly like a Ripwire mention; it carries no weight in `Docs-Updated`, `Docs-Drift`, or any pass/fail outcome.

## License recommendation

Use **Apache License 2.0** for this skill repository. It is a permissive license with an explicit patent grant, is widely understood in enterprise environments, and aligns with Ripwire's Apache-2.0 license. It does not grant rights to ASD-STE100 content, trademarks, or any separately obtained official materials.

The full license text is in [LICENSE](LICENSE). Add a copyright notice with the repository owner and year to source files or other suitable project materials before the first public release. It does not grant rights to ASD-STE100 content, trademarks, or any separately obtained official materials.
