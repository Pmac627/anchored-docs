# Installing anchored-docs

The skill is one folder, `anchored-docs/`, with `SKILL.md` at its root. Claude, Codex, and GitHub Copilot all read this Agent Skills layout. The frontmatter carries only `name` and `description`, so no tool rejects it.

Prerequisite in every tool: `ripwire` on `PATH` (or `RIPWIRE_BIN` set), and Node.js 22 or newer for the scripts (they have no packages to install). Recommended: the ASD-STE100 agent pack, added after install (section "Add the ASD-STE100 agent pack" below). Without it the STE word check is partial. If you distribute the skill inside an organization, fill in the organization glossary before you do (section "Maintain the organization glossary").

Windows: ripwire is not a native Windows binary. Build and run it in WSL 2 and expose it to Windows-side agents through `wsl -e` (a `ripwire.cmd` wrapper, or the MCP server started as `wsl -e ripwire --mcp`). The full recipe is in `references/ripwire.md`, section "Windows: run ripwire under WSL".

## Claude

- claude.ai (UI): attach `anchored-docs.skill` in a chat and click Save skill.
- Claude Code (CLI): copy the folder to `~/.claude/skills/anchored-docs/` (personal) or `.claude/skills/anchored-docs/` (one repository). Claude Code discovers it on the next session.

## Codex

- CLI: copy the folder to `~/.agents/skills/anchored-docs/` (personal) or `.agents/skills/anchored-docs/` (one repository). Older Codex builds read `~/.codex/skills/` instead.

## GitHub Copilot (CLI, VS Code agent mode, cloud agent)

- Project: `.github/skills/anchored-docs/`, `.claude/skills/anchored-docs/`, or `.agents/skills/anchored-docs/` in the repository.
- Personal: `~/.copilot/skills/anchored-docs/`, `~/.claude/skills/anchored-docs/`, or `~/.agents/skills/anchored-docs/`.
- GitHub CLI: `gh skill` can install from a published location.

## One copy for all three in a repository

Put the folder at `.claude/skills/anchored-docs/` (Claude Code and Copilot both read it) and add a symlink or copy at `.agents/skills/anchored-docs/` for Codex. Commit both.

## Unpacking the .skill file

`anchored-docs.skill` is a zip archive. `unzip anchored-docs.skill` produces the `anchored-docs/` folder.

## Maintain the organization glossary

The skill checks docs prose against the STE dictionary plus a glossary of technical nouns and verbs. The glossary has two levels. The project level (`docs/_glossary.json` in each repository) is written by the agent. The organization level ships inside the skill, at `references/org-glossary.json`, and is yours to maintain: it approves shared vocabulary once, for every repository that runs this copy of the skill, so projects do not repeat it and cannot give it a different meaning.

If you distribute the skill inside an organization:

1. Open `references/org-glossary.json`. It ships empty, because JSON has no comments. `references/glossary.md` has a starter list of the common software words the STE dictionary rejects (`run`, `build`, `log`, `call`, `return`, and so on) as JSON you can paste in. Add the ones your organization uses as its own terms, and add your platform, product, and team vocabulary. Give a term a `meaning` when the word could mean something else in another team's domain; the checker uses it to tell a harmless repeat from a real conflict.
2. Package and distribute the skill with the file filled in. Every repository that installs this copy inherits it.
3. Confirm from any repository with `node <skill>/scripts/docs_check.mjs glossary docs/ --terms`, which lists both levels, and with `ste_check.mjs --status`, which names the organization glossary in use.

To keep the glossary outside the skill (one file for several skills, or a repository of its own), set `STE_ORG_GLOSSARY=/path/to/org-glossary.json` in the environment the agents run in. That path wins over the file in the skill.

Rules the checker enforces between the two levels, so that a word means one thing across the organization: a project glossary may not list an organization term as unapproved, may not approve a synonym the organization rejects, may not point a synonym at a different term, and may not give an organization term a different meaning. Any of these is a mechanical failure in every run on that repository until it is fixed. A project that repeats an organization term gets a warning to delete the repeat. There is no project-level override. When a project needs a shared word for something else, it uses a different name; when a project term turns out to be shared, move it up into this file and ship a new copy of the skill.

The organization glossary is your own content, not derived from the specification, so commit it with the skill. The `.gitignore` in the skill excludes only the agent pack.

## Upgrading from 1.x

Version 2.0 replaces Python with Node.js and moves the skill's own data files from YAML to JSON. Your documents do not change: their frontmatter stays YAML, as OKF requires.

1. Install Node.js 22 or newer. The scripts need no packages.
2. Replace every `python3 <skill>/scripts/NAME.py` with `node <skill>/scripts/NAME.mjs`. Check CI jobs and the instructions in `CLAUDE.md` or `AGENTS.md`.
3. In each repository, convert `docs/_glossary.yaml` to `docs/_glossary.json`. The keys are the same. For example, this YAML:

   ```yaml
   technical_nouns:
     - term: queue
       unapproved: [buffer]
   technical_verbs:
     - term: ingest
   ```

   becomes this JSON:

   ```json
   { "technical_nouns": [{ "term": "queue", "unapproved": ["buffer"] }], "technical_verbs": [{ "term": "ingest" }] }
   ```

   Until you convert it, the checker reports a notice and ignores the old file.
4. Run `node <skill>/scripts/docs_check.mjs map docs/` to create `docs/_map.json`. Then delete `docs/_map.yaml`.
5. If you keep your own organization glossary, convert it the same way and point `STE_ORG_GLOSSARY` at the new file. A YAML file at that path stops the run with a message that says the file must be JSON.

The checks and their messages are the same as in 1.2.0, except for the file names. The changelog in `SKILL.md` lists the few fixes.

## Add the ASD-STE100 agent pack

The skill checks every sentence in `docs/` against ASD-STE100 Issue 9. The official dictionary and rule text are free to obtain from ASD but may not be redistributed, so the skill ships without them and you add them once, after install. With the pack, `ste_check.mjs` fails an unapproved word with the dictionary's own alternatives, warns on unknown words as technical-noun candidates, and answers `--lookup WORD`. Without it, the checker uses a built-in list of about 100 common non-STE words and reports `(1.1 partial)`.

### Where it goes

Put the pack folder here, inside the installed skill:

```
anchored-docs/
  references/
    asd-ste100-agent-pack/
      README.md
      rules/
      dictionary/
      tools/
```

The checker looks for `references/asd-ste100-agent-pack/dictionary/approved-words.json`. If you unzip the pack's archive into `references/`, you get exactly this layout. If you unzip one level too deep (`asd-ste100-agent-pack/asd-ste100-agent-pack/...`), the checker still finds it.

To keep the pack somewhere else (one copy shared by several skills, or outside a repository), set `STE_AGENT_PACK=/path/to/asd-ste100-agent-pack` in the environment the agent runs in. That path wins over the folder.

Confirm with:

```bash
node <skill>/scripts/ste_check.mjs --status
```

It prints `STE word source: pack (Issue 9: 876 approved, 1318 unapproved)` when the pack is found.

### If you have the pack already

1. Install the skill (sections above).
2. Copy or unzip the pack into `references/asd-ste100-agent-pack/` of the installed skill, or set `STE_AGENT_PACK`.
3. Run `ste_check.mjs --status`.

### If you do not have the pack

1. Register at https://www.asd-ste100.org and request the specification through the site's official form. It is free of charge. ASD emails a link to the PDF (Issue 9, January 2025, 434 pages). Save it as `ASD-STE100_ISSUE9.pdf`.
2. Get the [STE Generator Kit](https://github.com/Pmac627/ste-generator-kit). It contains no content from the specification, only the extraction scripts and the handwritten checklist, conventions, and reference linter.
3. Make the pack with Node.js 22 or a higher version, on Windows, macOS, Linux, or WSL. The kit does not use Python or other software packages. Do this step one time, in a folder that is not in the skill.

   ```bash
   git clone https://github.com/Pmac627/ste-generator-kit.git && cd ste-generator-kit
   STE_PDF=/path/to/ASD-STE100_ISSUE9.pdf STE_WORK=/tmp/ste node run_all.mjs
   ```

   In PowerShell, set the two environment values before you start the kit: `$env:STE_PDF = 'C:\path\ASD-STE100_ISSUE9.pdf'; $env:STE_WORK = 'C:\ste'; node run_all.mjs`.

   The kit writes the pack to `$STE_WORK/pack/` in less than one minute. Compare the counts that the kit shows with the table in section 4 of the kit's `INSTRUCTIONS.md`.
4. Copy the result into the skill:

   ```bash
   cp -r /tmp/ste/pack/. <skill>/references/asd-ste100-agent-pack/
   node <skill>/scripts/ste_check.mjs --status
   ```

### Per tool

- Claude Code, Codex, Copilot: the skill is a plain folder on disk, so copy the pack into it at the path above.
- claude.ai (Save skill): the saved skill is not editable after upload. Either unzip `anchored-docs.skill`, add the pack at the path above, re-zip the `anchored-docs/` folder and attach that as your private copy; or attach the pack zip in a chat and set `STE_AGENT_PACK` to where it was unpacked. The fallback applies until you do one of these.

### License

The pack is derived from a copyrighted specification. Keep it in the environment that holds your registered copy of the PDF, do not publish it, and do not commit it to a shared or public repository. The skill's `.gitignore` excludes `references/asd-ste100-agent-pack/` for this reason; if you commit the skill into a repository, keep that rule unless every reader of the repository has registered for the specification. The pack's own `README.md` states the license posture.
