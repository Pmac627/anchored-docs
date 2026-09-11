# Installing anchored-docs

The skill is one folder, `anchored-docs/`, with `SKILL.md` at its root. Claude, Codex, and GitHub Copilot all read this Agent Skills layout. The frontmatter carries only `name` and `description`, so no tool rejects it.

Prerequisite in every tool: `ripwire` on `PATH` (or `RIPWIRE_BIN` set), and Python 3 for the scripts. Recommended: the ASD-STE100 agent pack, added after install (section "Add the ASD-STE100 agent pack" below). Without it the STE word check is partial.

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

## Add the ASD-STE100 agent pack

The skill checks every sentence in `docs/` against ASD-STE100 Issue 9. The official dictionary and rule text are free to obtain from ASD but may not be redistributed, so the skill ships without them and you add them once, after install. With the pack, `ste_check.py` fails an unapproved word with the dictionary's own alternatives, warns on unknown words as technical-noun candidates, and answers `--lookup WORD`. Without it, the checker uses a built-in list of about 100 common non-STE words and reports `(1.1 partial)`.

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
python3 <skill>/scripts/ste_check.py --status
```

It prints `STE word source: pack (Issue 9: 876 approved, 1318 unapproved)` when the pack is found.

### If you have the pack already

1. Install the skill (sections above).
2. Copy or unzip the pack into `references/asd-ste100-agent-pack/` of the installed skill, or set `STE_AGENT_PACK`.
3. Run `ste_check.py --status`.

### If you do not have the pack

1. Register at https://www.asd-ste100.org and request the specification through the site's official form. It is free of charge. ASD emails a link to the PDF (Issue 9, January 2025, 434 pages). Save it as `ASD-STE100_ISSUE9.pdf`.
2. Get the STE generator kit (`ste-generator-kit.zip`). It contains no content from the specification, only the extraction scripts and the handwritten checklist, conventions, and reference linter.
3. Generate the pack, on Linux or macOS with Python 3.10+:

   ```bash
   pip install pdfplumber
   unzip ste-generator-kit.zip && cd ste-generator-kit
   STE_PDF=/path/to/ASD-STE100_ISSUE9.pdf STE_WORK=/tmp/ste ./run_all.sh
   ```

   The run takes about a minute and writes the pack to `/tmp/ste/pack/`. Compare the printed counts with the table in the kit's `INSTRUCTIONS.md`, section 4.
4. Copy the result into the skill:

   ```bash
   cp -r /tmp/ste/pack/. <skill>/references/asd-ste100-agent-pack/
   python3 <skill>/scripts/ste_check.py --status
   ```

### Per tool

- Claude Code, Codex, Copilot: the skill is a plain folder on disk, so copy the pack into it at the path above.
- claude.ai (Save skill): the saved skill is not editable after upload. Either unzip `anchored-docs.skill`, add the pack at the path above, re-zip the `anchored-docs/` folder and attach that as your private copy; or attach the pack zip in a chat and set `STE_AGENT_PACK` to where it was unpacked. The fallback applies until you do one of these.

### License

The pack is derived from a copyrighted specification. Keep it in the environment that holds your registered copy of the PDF, do not publish it, and do not commit it to a shared or public repository. The skill's `.gitignore` excludes `references/asd-ste100-agent-pack/` for this reason; if you commit the skill into a repository, keep that rule unless every reader of the repository has registered for the specification. The pack's own `README.md` states the license posture.
