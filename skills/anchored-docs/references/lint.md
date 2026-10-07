# Lint

A health check of the bundle. Run it on request or periodically, never as part of a delta run. By default it checks the docs touched since the last lint plus their link neighbors; a full sweep is an explicit, occasional cleanup because reading every page against every other is expensive.

## The cheap checks first

These cost no model context. Run them and read the output before you open a single doc.

```bash
ripwire . --doc-drift=docs/                     # anchors that no longer hold, worst doc first, at=<sha>
ripwire . --doc-drift=docs/ --with-history      # deleted vs never-existed for the symbol lane
ripwire . --doc-drift=docs/ --gateability       # which live docs are really records that should carry a date:

node <skill>/scripts/docs_check.mjs okf docs/     # frontmatter conformance, required keys, actor format
node <skill>/scripts/docs_check.mjs links docs/   # internal links, index completeness, orphans, code back-links, tickets contamination
node <skill>/scripts/docs_check.mjs map docs/ --check   # _map.json matches sources (add --check to compare, omit to regenerate)
node <skill>/scripts/docs_check.mjs stale docs/   # every STATUS: STALE doc, every stale_after in the past, every verified older than the threshold
node <skill>/scripts/docs_check.mjs glossary docs/   # organization and project glossary levels, contradictions between them (exit 1), redundant repeats
node <skill>/scripts/ste_check.mjs --status       # which STE word source is in use: pack, word list, or built-in only
node <skill>/scripts/ste_check.mjs docs/          # mechanical STE failures and heuristic counts per doc

grep -rl "STATUS: STALE" docs/                       # the one-line version of `stale`
```

## What to check

- **Drift**: every `drift=` row from `--doc-drift`. Fix the anchor or mark the doc stale. `dated=` rows are records, not work, unless the record should be a live doc.
- **Records without a date**: `--gateability` lists docs whose failing rows would become records with a `date:` key. Add the key only to docs that are genuinely snapshots (an audit, a capture, a decision). Never date a live flow doc to hide rot.
- **Orphans**: pages with no inbound link from any `index.md` or other doc.
- **Broken links**: internal links whose target does not exist.
- **Dangling sources**: `sources[].resource` globs that match no file on disk. The code moved or died; the doc is stale or wrong.
- **Back-links**: `seealso`, `See:`, `See also:`, `@see` targets in source that do not exist under `docs/`.
- **Stale metadata**: `verified` older than the threshold (default 90 days) surfaced for re-review; `stale_after` in the past; `status: draft` older than 30 days surfaced for human sign-off.
- **Tickets contamination**: any committed doc that links into `docs/tickets/`.
- **STE**: mechanical failures anywhere in the tree (these should be zero, because delta runs gate on them), and the heuristic counts per doc so the human can pick the worst pages to rewrite.
- **Glossary levels**: `docs_check.mjs glossary docs/` reports a project glossary that contradicts the organization glossary (fix it: the project item gets a different name, or the human moves the term up a level) and project entries that only repeat an organization term (delete them).
- **Glossary drift**: `ste_check.mjs --glossary-report docs/` lists terms used in docs that are not in either glossary and project terms no doc uses. With the agent pack, the `1.5` finding on each doc lists the words the dictionary does not know. A word that recurs across docs is a glossary term that is missing; a word that recurs across repositories is an organization term that is missing, and belongs in the lint report as a proposal.
- **Contradictions**: within the in-scope subgraph, claims in one doc that conflict with another. This is the only reasoning-heavy check; keep it bounded to the subgraph. `ripwire . --verify="CLAIM"` settles a structural claim without reading further.

## Scope

Default scope: the docs changed since the last lint (`git log --since` on `docs/`) plus their first- and second-degree link neighbors, because a contradiction can only exist between pages that share a concept or a link. Run a full sweep only on request or after a large change, and say in the output that it was a full sweep.

## Output

Report findings grouped by category, with file paths, as a list a human can act on, headed by the `at=` sha the drift report was measured against. Do not auto-fix contradictions; surface them. You may auto-fix mechanical issues (a broken link to a renamed file, a missing index entry, a regenerated `_map.json`, a semicolon) and list what you fixed. Append a `**Lint**` entry to `docs/log.md`. End with the self-report block; `Docs-Updated: yes` only if you changed docs.
