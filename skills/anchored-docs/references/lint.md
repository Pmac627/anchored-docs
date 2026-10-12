# Lint

A health check of the bundle. Run it on request or from time to time. Do not run it as part of a delta run. By default it checks the docs that changed since the last lint, with their link neighbors. A full scan is an occasional cleanup that the user must request. It costs much, because you read each page against each other page.

## The cheap checks first

These checks cost no model context. Run them and read the output before you open a doc.

```bash
ripwire . --doc-drift=docs/anchored-docs/                     # anchors that no longer hold, worst doc first, at=<sha>
ripwire . --doc-drift=docs/anchored-docs/ --with-history      # deleted vs never-existed for the symbol lane
ripwire . --doc-drift=docs/anchored-docs/ --gateability       # which live docs are really records that should carry a date:

node <skill>/scripts/docs_check.mjs okf docs/anchored-docs/     # frontmatter conformance, required keys, actor format
node <skill>/scripts/docs_check.mjs links docs/anchored-docs/   # internal links, index completeness, orphans, code back-links, tickets contamination
node <skill>/scripts/docs_check.mjs map docs/anchored-docs/ --check   # _map.json matches sources (add --check to compare, omit to regenerate)
node <skill>/scripts/docs_check.mjs stale docs/anchored-docs/   # every STATUS: STALE doc, every stale_after in the past, every verified older than the threshold
node <skill>/scripts/docs_check.mjs glossary docs/anchored-docs/   # organization and project glossary levels, contradictions between them (exit 1), redundant repeats
node <skill>/scripts/ste_check.mjs --status       # which STE word source is in use: pack, word list, or built-in only
node <skill>/scripts/ste_check.mjs docs/anchored-docs/          # mechanical STE failures and heuristic counts per doc

grep -rl "STATUS: STALE" docs/anchored-docs/                       # the one-line version of `stale`
```

## What to check

- **Drift**: each `drift=` row from `--doc-drift`. Correct the anchor or mark the doc stale. `dated=` rows are records, not work, unless the record must be a live doc.
- **Records without a date**: `--gateability` lists docs with failing rows that become records with a `date:` key. Add the key only to docs that are snapshots (an audit, a capture, a decision). Do not date a live flow doc to hide rot.
- **Orphans**: pages with no inbound link from an `index.md` or a different doc.
- **Broken links**: internal links with a target that is not there.
- **Dangling sources**: `sources[].resource` globs that find no file on disk. The code moved or was deleted. The doc is stale or incorrect.
- **Back-links**: `seealso`, `See:`, `See also:`, `@see` targets in source that are not in `docs/anchored-docs/`.
- **Stale metadata**: `verified` entries that have an age of more than 90 days (the default threshold) go to a human for re-review. `stale_after` dates that are before today go to a human. A `status: draft` of more than 30 days goes to a human for sign-off.
- **Tickets contamination**: a committed doc that links into `docs/tickets/`.
- **STE**: mechanical failures in the tree (the count must be zero, because delta runs gate on them), and the heuristic counts for each doc so that the human can select the worst pages to rewrite.
- **Glossary levels**: `docs_check.mjs glossary docs/anchored-docs/` reports a project glossary that contradicts the organization glossary. To correct it, give the project item a different name, or the human moves the term up a level. It also reports project entries that only give an organization term again. Delete them.
- **Glossary drift**: `ste_check.mjs --glossary-report docs/anchored-docs/` lists terms in docs that are not in the organization glossary or the project glossary. It also lists project terms that no doc uses. With the agent pack, the `1.5` finding on each doc lists the words that the dictionary does not know. A word in many docs is a glossary term that is missing. A word in many repositories is an organization term that is missing. Put it in the lint report as a proposal.
- **Contradictions**: in the in-scope subgraph, claims in one doc that conflict with a different doc. This is the only check that is not easy for a model. Keep it in the subgraph. `ripwire . --verify="CLAIM"` gives the result for a structural claim without more reading.

## Scope

Default scope: the docs that changed since the last lint (`git log --since` on `docs/anchored-docs/`) and their first- and second-degree link neighbors. A contradiction can occur only between pages that share a concept or a link. Run a full scan only on request or after a large change. Tell the user in the output that it was a full scan.

## Output

Report findings grouped by category, with file paths. Make the report a list that a human can use, headed by the `at=` sha that the drift report used. Do not auto-fix contradictions. Show them to the user.

You can auto-fix mechanical issues (a broken link to a renamed file, a missing index entry, a regenerated `_map.json`, a semicolon) and list what you corrected. Append a `**Lint**` entry to `docs/anchored-docs/log.md`. End with the self-report block. Write `Docs-Updated: yes` only if you changed docs.
