# Migrate: from docs/ to docs/anchored-docs/

Anchored-docs 2.0 kept the bundle directly in `docs/`. Anchored-docs 2.1 keeps it in `docs/anchored-docs/`. This file tells you how to move a 2.0 bundle. The script does the moves and the link changes. You check the result.

## When to migrate

Migrate only when the user tells you to. A 2.0 bundle in `docs/` continues to operate with delta and lint modes. Thus the move is not necessary for maintenance. The sign of a 2.0 bundle, with no `docs/anchored-docs/` folder, is one of these:

- `docs/index.md` with an `okf_version` line in its frontmatter.
- `docs/_glossary.json`, or `docs/_map.json`.
- Concept docs in `docs/` with a `type`, and with one or more of `sources`, `generated`, or `verified`.

Work on a 2.0 bundle without a move, and read the paths in this skill as `docs/`. Do not bootstrap a second bundle in such a repository. A second bundle makes the docs disagree. Tell the user one time that migrate is available.

## What moves and what stays

The script selects the result from the content of each file. It does not use the folder names.

| File in `docs/` | Result |
| --- | --- |
| A concept doc with a `type`, and with one or more of `sources`, `generated`, or `verified`, at all depths | Moves to the same relative path in `docs/anchored-docs/`. A doc with a finding from `docs_check okf` also moves |
| `index.md` at the root, with `okf_version` | Moves |
| `index.md` in a subfolder, where a moved doc sits in the same folder | Moves with those docs |
| `log.md` at the root, when the root index moves or the log has the heading `# Docs update log` | Moves. A new log is made if there is none |
| `_glossary.json`, `_map.json` at the root | Move |
| Each other file, such as a human manual with no frontmatter | Stays in `docs/` |
| Each file in `docs/tickets/` | Stays in `docs/` |

A file that stays in `docs/` does not move. The script rewrites its links into the bundle to the new path.

## What the script rewrites

The script reads each text file in the repository, and it rewrites these link types when they point at a moved file or folder:

- Markdown links and images, in each `.md` file, including `README.md`, `CLAUDE.md`, and `AGENTS.md` at the root.
- A link that starts with `/` in `docs/`. That link type means "from the bundle root". After the move, the same link keeps its type if it stays in the bundle. If not, it becomes a relative link.
- Code back-links in source files: `seealso href`, `@see`, `See:`, and `See also:`. A target keeps its type. A target that is relative to the source file stays relative. A target that is repository-relative stays repository-relative.

A link between two moved files does not change. A link from a moved file to a file that stayed gets one more `../` where this is necessary.

The script does not change text that is not a link. After the rewrite, it lists each line that a person must check. Such a line names a moved path. It can also be a call to `docs_check.mjs` or `ste_check.mjs` on a bare `docs` folder (for example a CI step with `map docs --check`). It can also be a root `CLAUDE.md` or `AGENTS.md` line that names `docs/`.

Check each line by hand. Change it if it is a link or a back-link that the script did not know.

## Steps

1. Run the dry run. It changes nothing.

   ```bash
   node <skill>/scripts/docs_check.mjs migrate <repo>
   ```

2. Read the plan. Check these points:
   - The list of moves has each doc of the bundle, and no human file.
   - The list of stays has only the human files.
   - The list of lines that name a moved path after the rewrite is empty, or each line is one you understand.

3. If the plan says `conflict`, a destination file is at the new path. The script stops before it moves a file. Read the destination files and select the correct copy. Move or rename the other copy by hand. Then run the dry run again.

4. Apply the plan.

   ```bash
   node <skill>/scripts/docs_check.mjs migrate <repo> --apply
   ```

   In a git work tree, the script uses `git mv`. So `git log --follow` keeps the history of each file. Without git, it renames the files.

   The script then does these things:
   - It writes the rewritten text of each changed file.
   - It adds a dated group to the top of `docs/anchored-docs/log.md`.
   - It removes the folders that the moves emptied.
   - It regenerates `docs/anchored-docs/_map.json`.

5. Check the new bundle. The two commands must show no findings.

   ```bash
   node <skill>/scripts/docs_check.mjs okf docs/anchored-docs/
   node <skill>/scripts/docs_check.mjs links docs/anchored-docs/ --repo <repo>
   ```

<!-- ste-ok: 1.1 quoted script output -->
6. Change each line that the script listed under "still names a moved path".

7. Find the references external to the repository. A global `CLAUDE.md` or an agent rule file in the home folder can name `docs/`. The script cannot change these. Report them to the user, or update them if the user tells you to.

## Running it again

A second `--apply` finds no file to move. It prints `nothing to move` and changes nothing. A repository with no `docs/` folder gets `no docs/ folder`. A `docs/` folder with no skill files gets `nothing to move`.

## What the migration does not do

- It does not change the prose of a doc. Read the docs after the move only if a delta run tells you to.
- It does not add, remove, or make a check of a `verified` entry. The frontmatter stays as it was.
- It does not run ripwire or the STE check. Run them after the move, as part of delta mode, if the task calls for them.
- It does not move `docs/tickets/`. That folder stays adjacent to the bundle.
