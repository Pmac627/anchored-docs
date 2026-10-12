# Installing anchored-docs

The skill is one folder, `anchored-docs/`, with `SKILL.md` at its root. Claude, Codex, and GitHub Copilot all read this Agent Skills layout. The frontmatter uses only keys from the Agent Skills specification (https://agentskills.io/specification): `name`, `description`, and `metadata`, which holds the skill version. Strict validators, such as `skills-ref validate`, accept it.

Prerequisite in each tool: `ripwire` on `PATH` (or `RIPWIRE_BIN` set), and Node.js 22 or newer for the scripts (they have no packages to install). Recommended: the ASD-STE100 agent pack, added after install (section "Add the ASD-STE100 agent pack" below). Without it the STE word check is not complete. If you supply the skill in an organization, fill in the organization glossary before you do (section "Maintain the organization glossary").

Windows: ripwire is not a native Windows binary. Build and run it in WSL 2 and give it to Windows-side agents through `wsl -e` (a `ripwire.cmd` wrapper, or the MCP server started as `wsl -e ripwire --mcp`). The full recipe is in `references/ripwire.md`, section `Windows: run ripwire under WSL`.

## Claude

- claude.ai (UI): attach `anchored-docs.skill` in a chat and click Save skill.
- Claude Code (CLI): copy the folder to `~/.claude/skills/anchored-docs/` (personal) or `.claude/skills/anchored-docs/` (one repository). Claude Code finds it on the next session.

## Codex

- CLI: copy the folder to `~/.agents/skills/anchored-docs/` (personal) or `.agents/skills/anchored-docs/` (one repository). Previous Codex builds read `~/.codex/skills/` as an alternative.

## GitHub Copilot (CLI, VS Code agent mode, cloud agent)

- Project: `.github/skills/anchored-docs/`, `.claude/skills/anchored-docs/`, or `.agents/skills/anchored-docs/` in the repository.
- Personal: `~/.copilot/skills/anchored-docs/`, `~/.claude/skills/anchored-docs/`, or `~/.agents/skills/anchored-docs/`.
- GitHub CLI: `gh skill install Pmac627/anchored-docs anchored-docs` installs the folder from the repository. Add `--agent claude-code` or `--scope user` to select the location.

## One copy for all three in a repository

Put the folder at `.claude/skills/anchored-docs/` (Claude Code and Copilot read it) and add a symlink or copy at `.agents/skills/anchored-docs/` for Codex. Commit the two copies.

## Unpacking the .skill file

`anchored-docs.skill` is a zip archive, attached to each release at https://github.com/Pmac627/anchored-docs/releases. `unzip anchored-docs.skill` makes the `anchored-docs/` folder.

## Maintain the organization glossary

The skill checks docs prose against the STE dictionary plus a glossary of technical nouns and verbs. The glossary has two levels. The project level (`docs/_glossary.json` in each repository) is written by the agent.

The organization level ships in the skill, at `references/org-glossary.json`. You keep this level. It gives approval for shared vocabulary one time, for each repository that runs this copy of the skill. Thus projects do not write the vocabulary again and cannot give it a different meaning.

If you supply the skill in an organization:

1. Open `references/org-glossary.json`. It ships empty, because JSON has no comments. `references/glossary.md` has a starter list of the software words that the STE dictionary rejects (`run`, `build`, `log`, `call`, `return`, and so on). The list is JSON that you can paste in. Add the ones your organization uses as its own terms, and add your platform, software, and team vocabulary. Give a term a `meaning` when the word can have a different meaning in the domain of a different team. The checker uses the `meaning` to find the difference between a harmless duplicate and a conflict.
2. Package the skill and supply it with the file filled in. Each repository that installs this copy inherits it.
3. Check with `node <skill>/scripts/docs_check.mjs glossary docs/ --terms` (it lists the two levels) and with `ste_check.mjs --status` (it names the organization glossary in use), from a repository.

To keep the glossary in a different location from the skill (one file for some skills, or a repository of its own), set `STE_ORG_GLOSSARY=/path/to/org-glossary.json` in the environment that the agents run in. The checker uses that path and not the file in the skill.

The checker applies rules between the two levels, so that a word means one thing across the organization. A project glossary must not list an organization term as unapproved. It must not give approval to a synonym that the organization rejects. It must not point a synonym at a different term. It must not give an organization term a different meaning.

Each of these is a mechanical failure in each run on that repository until you repair it. A project that writes an organization term again gets a warning to delete the duplicate. There is no project-level override. When a project must use a shared word for something else, it uses a different name. When a project term turns out to be shared, move it up into this file and ship a new copy of the skill.

The organization glossary is your own content, not derived from the specification, so commit it with the skill. The `.gitignore` in the skill lists only the agent pack.

## Upgrading from 2.0

Version 2.1 keeps the bundle in `docs/anchored-docs/`. A 2.0 bundle in `docs/` keeps working until you migrate it.

1. Run `node <skill>/scripts/docs_check.mjs migrate <repo>` and read the plan. It changes nothing.
2. Run `node <skill>/scripts/docs_check.mjs migrate <repo> --apply`.
3. Check the bundle and repair the lines that the script lists. The steps are in `references/migrate.md`.

## Upgrading from 1.x

Version 2.0 replaces Python with Node.js and moves the skill's own data files from YAML to JSON. Your documents do not change: their frontmatter stays YAML, as OKF makes it necessary.

1. Install Node.js 22 or newer. The scripts have no packages to install.
2. Replace each `python3 <skill>/scripts/NAME.py` with `node <skill>/scripts/NAME.mjs`. Check CI tasks and the instructions in `CLAUDE.md` or `AGENTS.md`.
3. In each repository, change `docs/_glossary.yaml` to `docs/_glossary.json`. The keys are the same. For example, this YAML:

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

   Until then, the checker reports a notice and ignores the YAML file.
4. Run `node <skill>/scripts/docs_check.mjs map docs/` to make `docs/_map.json`. Then delete `docs/_map.yaml`.
5. If you keep your own organization glossary, change it with the same steps and point `STE_ORG_GLOSSARY` at the new file. A YAML file at that path stops the run with a message that says the file must be JSON.

The checks and their messages are the same as in 1.2.0, but the file names are different. The changelog in `SKILL.md` lists the small number of changes.

## Add the ASD-STE100 agent pack

The skill checks each sentence in `docs/` against ASD-STE100 Issue 9. The official dictionary and rule text are free to get from ASD, but you must not redistribute them. Thus the skill ships without them, and you add them one time, after install. With the pack, `ste_check.mjs` fails an unapproved word and gives the alternatives of the dictionary. It gives a warning for unknown words as technical-noun candidates, and answers `--lookup WORD`. Without it, the checker uses a built-in list of about 100 non-STE words that writers use frequently and reports `(1.1 partial)`.

### Where it goes

Put the pack folder here, in the installed skill:

```
anchored-docs/
  references/
    asd-ste100-agent-pack/
      README.md
      rules/
      dictionary/
      tools/
```

The checker looks for `references/asd-ste100-agent-pack/dictionary/approved-words.json`. If you unzip the pack's archive into `references/`, you get this layout. If you unzip one level too deep (`asd-ste100-agent-pack/asd-ste100-agent-pack/...`), the checker also finds it.

To keep the pack somewhere else (one copy for some skills, or a copy that is not in a repository), set `STE_AGENT_PACK=/path/to/asd-ste100-agent-pack` in the environment that the agent runs in. The checker uses that path and not the folder.

Check with:

```bash
node <skill>/scripts/ste_check.mjs --status
```

It prints `STE word source: pack (Issue 9: 876 approved, 1318 unapproved)` when the pack is found.

### If you have the pack already

1. Install the skill (sections above).
2. Copy or unzip the pack into `references/asd-ste100-agent-pack/` of the installed skill, or set `STE_AGENT_PACK`.
3. Run `ste_check.mjs --status`.

### If you do not have the pack

1. Register at https://www.asd-ste100.org and request the specification through the official request page of the site. It is free of charge. ASD emails a link to the PDF (Issue 9, January 2025, 434 pages). Save it as `ASD-STE100_ISSUE9.pdf`.
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
- claude.ai (Save skill): the saved skill is not editable after upload. Use one of two options. Option 1: unzip `anchored-docs.skill`, add the pack at the path above, re-zip the `anchored-docs/` folder, and attach that as your private copy. Option 2: attach the pack zip in a chat and set `STE_AGENT_PACK` to the location of the unzipped pack. The fallback applies until you do one of these.

### License

The pack is derived from a copyrighted specification. Keep it in the environment that holds your registered copy of the PDF. Do not publish it. Do not commit it to a shared or public repository.

The `.gitignore` of the skill ignores `references/asd-ste100-agent-pack/` because of this. If you commit the skill into a repository, keep that rule. Remove it only if each reader of the repository has registered for the specification. The pack's own `README.md` tells the license posture.
