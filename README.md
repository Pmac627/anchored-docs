# anchored-docs

`anchored-docs` is an agent-agnostic skill. It keeps the technical documentation of a repository correct for its code.

It has three necessary parts:

- [Ripwire](https://github.com/redhat-et/ripwire) compares the documentation anchors with the repository. It also finds the documentation that is related to a code change.
- [ASD-STE100 Simplified Technical English](https://www.asd-ste100.org/) gives rules for clear, controlled technical prose.
- [Open Knowledge Format](https://github.com/GoogleCloudPlatform/open-knowledge-format) (OKF) frontmatter records the provenance, the verification condition, and the current status of each document.

An optional fourth part is [qmd](https://github.com/tobi/qmd). It is a local hybrid search engine for markdown. It finds missing documentation that the symbol index of Ripwire cannot find: areas that the code has, but that no doc discusses in words. It does not make sure that a claim is correct, and the skill runs fully without it. See "What it does" below.

The skill keeps the documentation as an engineering artifact. It reads the code before it writes a claim. It links the documentation to symbols and paths, checks those links, and reports the checks that it made.

## Agent-agnostic by design

The skill works with Codex, GitHub Copilot, Grok, Gemini, Claude, and other coding agents. Its core is a portable `SKILL.md` folder with plain Markdown, JSON data files, and Node.js scripts. The frontmatter of a document is YAML, because it is necessary for OKF. The skill works without a vendor-specific API, model, prompt syntax, or proprietary tool integration.

An agent host must have these functions:

- Read and update files in the target repository.
- Run local commands, with Node.js 22 or newer and Ripwire.
- Load a local skill folder or accept the skill instructions as an attached artifact.

A host can use Ripwire through its CLI or its optional MCP server. The selection is an adapter for the host. It does not change the documentation workflow. See [INSTALL.md](skills/anchored-docs/INSTALL.md) for platform-specific installation locations and the Windows WSL setup.

## What it does

- Keeps the living technical documentation in `docs/anchored-docs/` as a description of the code, not a parallel source of guesses.
- Finds the documentation that is related to changed symbols and source paths.
- Checks backticked symbols, source locations, constants, and array lengths for drift with Ripwire.
- Writes and checks prose against ASD-STE100 rules, with a project glossary for correct technical vocabulary.
- Records sources, verification proof, and document condition in OKF frontmatter.
- Marks a document `STATUS: STALE` when it cannot make the document agree with the code.
- Gives a self-report that tells which files the agent read, what documentation changed, and the Ripwire and STE results.
- When [qmd](https://github.com/tobi/qmd) is installed, the skill checks a new bundle for missing concepts. On request, it also finds documentation for a change. The symbol index of Ripwire and the declared source map do not find this documentation.

## Contents

The distributable archive, [anchored-docs.skill](https://github.com/Pmac627/anchored-docs/releases/latest/download/anchored-docs.skill), is attached to each [release](https://github.com/Pmac627/anchored-docs/releases). It expands to this layout:

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
2. Download [anchored-docs.skill](https://github.com/Pmac627/anchored-docs/releases/latest/download/anchored-docs.skill) from the latest release, unzip it, and install the `anchored-docs/` folder where the selected agent finds skills. With the GitHub CLI, `gh skill install Pmac627/anchored-docs anchored-docs` is an alternative that installs the folder from this repository. Use [INSTALL.md](skills/anchored-docs/INSTALL.md) for known host locations.
3. Give the agent a task such as: `Use anchored-docs to update the documentation affected by this change.`
4. Let the agent read the related code and update only the documentation for the change. Then let the agent run the checks and give the self-report of the skill.

For a host that cannot find skills automatically, attach the archive or supply the contents of `SKILL.md` as the task instructions. The runtime workflow stays the same.

## Requirements

| Requirement | Purpose | Necessary |
| --- | --- | --- |
| Ripwire | Finds changed symbols and makes sure that the documentation anchors are correct. | Yes |
| Node.js 22 or newer | Runs `docs_check.mjs` and `ste_check.mjs`. The scripts have no packages to install. | Yes |
| ASD-STE100 agent pack | Gives the official dictionary and complete word checks. | Recommended |
| Project `docs/anchored-docs/` bundle | Target for normal delta maintenance. Bootstrap makes it. | Necessary for delta mode |
| [qmd](https://github.com/tobi/qmd) | Finds missing documentation by meaning, not by declared anchors. | Optional |

Without the ASD-STE100 agent pack, the checker uses a limited built-in list and reports that rule 1.1 is not fully checked. The skill can run, but it cannot claim complete dictionary coverage.

Version 2.0 replaces Python with Node.js and moves the skill's own data files (`_glossary`, `_map`, `org-glossary`) from YAML to JSON. If you used 1.x, follow "Upgrading from 1.x" in [INSTALL.md](skills/anchored-docs/INSTALL.md).

Version 2.1 keeps the bundle in `docs/anchored-docs/`, so the project's own `docs/` folder is free for other files. A 2.0 bundle in `docs/` keeps working until you run `docs_check.mjs migrate <repo> --apply`. The migration moves the files, rewrites the links, and keeps the history. See [references/migrate.md](skills/anchored-docs/references/migrate.md).

Without qmd, the skill runs as documented above. Bootstrap mode skips its coverage check, and the on-request lookup of delta mode is not available. The Ripwire verification and the `Docs-Updated` result of the self-report stay the same.

## ASD-STE100 content and terminology

ASD-STE100 is an ASD copyright and trademark. This repository gives workflow guidance and a checker integration. It does not include or redistribute the official specification, dictionary, or derived agent pack.

Get the official material from [ASD Simplified Technical English Maintenance Group](https://www.asd-ste100.org/). Make a private pack with the [ASD-STE100 Generator Kit](https://github.com/Pmac627/ste-generator-kit). Keep the PDF and the pack private. Do not commit the PDF or the pack to a public repository. Keep the ignore rule of the archive for that content. See the installation instructions for the pack location and the setup procedure.

## Verification model

The skill has two checks:

1. Ripwire makes sure that the anchors are correct. It does not make sure that each sentence is a correct description of the system.
2. The STE checker applies the mechanical rules and flags likely style issues. It does not prove that the prose is clear or complete.

Thus, the workflow makes the agent read the related code before it writes. When the agent cannot make the code and the document agree with confidence, the correct result is a stale marker, not an invented update. A reader can see the marker.

qmd is not a third check. It finds candidate documentation by meaning, as a search engine does. It does not make sure that a claim is correct. A qmd result is a pointer for the agent to read and check. A result from Ripwire is the same. A qmd result has no weight in `Docs-Updated`, `Docs-Drift`, or a pass/fail outcome.

## License recommendation

Use **Apache License 2.0** for this skill repository. It is a permissive license with an explicit patent grant, is widely understood in enterprise environments, and aligns with Ripwire's Apache-2.0 license. The license does not grant rights to ASD-STE100 content, trademarks, or official materials that you get from a different source.

The full license text is in [LICENSE](LICENSE). Add a copyright notice with the repository owner and year to source files or other applicable project materials before the first public release. The license does not grant rights to ASD-STE100 content, trademarks, or official materials that you get from a different source.

## Development

`skills/anchored-docs/` is the skill source folder. The release workflow builds `anchored-docs.skill` from that folder. The archive is not committed. `tests/` proves that the scripts agree with the recorded behavior of 1.2.0, the version that they replaced.

```bash
node --test "tests/unit/*.test.mjs"                        # unit tests
node tests/run-cases.mjs run --skill skills/anchored-docs --out /tmp/out
node tests/run-cases.mjs compare tests/golden/2.1.0 /tmp/out   # 45 cases against the recorded baseline
node tools/build-skill.mjs build                           # build dist/anchored-docs.skill from the staged files
```

See [tests/README.md](tests/README.md) for what the baseline records and what it covers.


### Releases

CI (`.github/workflows/ci.yml`) runs the unit tests, the parity checks, and a build on Linux, Windows, and macOS. It does this for each pull request and for each push to `main`. To release, set `metadata.version` in `skills/anchored-docs/SKILL.md`, add a `### <version>` entry to its changelog, commit, and push a tag:

- `v2.1.0` publishes a release. The `releases/latest/download` link above then points at it.
- `v2.1.0-rc.1` publishes a pre-release of 2.1.0 for testing. `releases/latest` skips it.

`.github/workflows/release.yml` runs CI again. Then it builds the archive from the tagged commit. It attaches the archive to a GitHub release, with that changelog entry as the notes. The build stops if the tag does not agree with the version. The build also stops if the changelog entry is missing. It stops too if a file of the ASD-STE100 agent pack, other than `HOW-TO-INSTALL.md`, is in the git index.
