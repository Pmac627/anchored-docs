# QMD in this skill

qmd (https://github.com/tobi/qmd) is a local hybrid search engine: BM25 keyword search, vector semantic search, and LLM reranking over a markdown collection. It also runs as an MCP server (`qmd mcp`).

qmd is **optional** and used in exactly two places: a coverage check at the end of bootstrap mode, and an on-request lookup in delta mode. It verifies nothing and gates nothing. Never let qmd's presence, absence, or a qmd result change `Docs-Updated`, `Docs-Drift`, or block any step. It answers one question a call-graph tool cannot: does the docs bundle discuss this area of the code at all, in any words, not just in the words ripwire indexes as symbols.

## Why not a step in ordinary delta mode

Delta mode already finds candidate docs two ways: `ripwire --mentions=SYM` (the doc names the changed symbol) and `_map.json` (the doc's declared `sources` covers the changed path). Rule 2 exists to make every doc's claims name their symbols, and `sources` is a required, checked frontmatter field. On a doc bundle that follows this skill's own rules, those two lookups already find what changed. Adding qmd as a third default lookup mostly re-finds docs that are already anchored, at the cost of an index that must be kept current and a model download. Where qmd earns its keep is different: work with *no anchors yet* (bootstrap) or a specific, stated suspicion that something is undocumented (delta, on request). Do not add a qmd step to the ordinary delta procedure in `references/delta-maintenance.md`.

## Detection

Only run this when a step below actually calls for qmd (end of bootstrap, or a user request in delta). Do not probe for qmd at the start of every run.

```bash
BIN="${QMD_BIN:-$(command -v qmd || true)}"
[ -n "$BIN" ] && "$BIN" status >/dev/null 2>&1
```

If the MCP server is configured instead (`.mcp.json` with a `qmd` entry), call its `status` tool. If neither answers, treat qmd as absent: report it plainly and move on. Never stop a run, never fall back to telling the user to install it unless they ask.

## Bootstrap: the coverage check (step 9)

Runs once, after the bundle is written and verified (`references/bootstrap.md` steps 1–8), only if qmd is present. It is the last thing bootstrap does, and it never blocks completion.

1. Index the freshly written bundle as a collection: `qmd collection add docs --name <repo>-docs && qmd embed`.
2. For each `--communities` cluster and each major concept in the README or entry points identified in step 1 of bootstrap, run a structured `qmd query` against that collection asking whether the concept is discussed anywhere in the bundle:

   ```bash
   qmd query -c <repo>-docs --format json $'intent: Find any doc that discusses <cluster/concept name>, in any words.\nlex: <cluster/concept name and its main symbols>\nvec: <plain-language description of what this area of the code does>'
   ```

3. A cluster with no hit above a modest score, or only weak/tangential hits, is a coverage gap: an area the call-graph identified as structurally real but the bootstrap pass did not turn into a doc. List these in the bootstrap report as "possible coverage gaps qmd found" with the cluster name and why it looked thin. Do not create docs for them automatically — a human or a follow-up bootstrap pass decides whether they warrant one.
4. Note in the report whether qmd was used: `Docs-Coverage-QMD: <N> gap(s) found | none found | absent | not-run`.

If qmd is absent, bootstrap completes exactly as `references/bootstrap.md` describes, and the report says `Docs-Coverage-QMD: absent`. Tell the user, once, that installing qmd would let this pass check coverage more thoroughly — do not repeat the suggestion on later runs.

## Delta: on request only

Do not run qmd during ordinary delta maintenance. Run it only when the user explicitly asks whether something is documented, asks for a more thorough check than the standard candidate lookup, or says they suspect a doc is missing.

1. Confirm qmd per Detection above. If absent, say so and continue with `--mentions` and the map alone.
2. If the docs bundle is not yet indexed as a collection (`qmd collection list`), index it: `qmd collection add docs --name <repo>-docs && qmd embed`. Re-run `qmd embed` if the last index predates recent doc edits.
3. Query with structured fields, using the changed symbol, its neighboring code, and the bundle's own vocabulary — write `intent:`/`lex:`/`vec:` yourself rather than passing the user's sentence straight through:

   ```bash
   qmd query -c <repo>-docs --format json $'intent: Find any doc that discusses SYM or the behavior it changes, beyond ripwire --mentions and _map.json.\nlex: SYM <neighboring names>\nvec: <plain-language description of the changed behavior>'
   ```

4. Treat every hit above a modest score as a candidate, unioned with whatever `--mentions`/map already found. A qmd hit is a lead, not a checkable anchor: read the code, read the doc, decide. `--doc-drift` never verifies a qmd result.
5. Report it: `Docs-Candidates-QMD: <N> hit(s) requested and found | requested, none found | absent | not-run`. `not-run` is the default for ordinary delta runs where nobody asked.

## What qmd cannot see

- No notion of a symbol, a line, or a constant value. It cannot verify anything `--doc-drift` verifies.
- It ranks by similarity to the query you wrote. A vague query returns vague hits.
- Its index is a snapshot as of the last `qmd embed`. A doc written or changed since then is invisible to it until the next embed.
- No concept of `sources`, OKF frontmatter, `diataxis`, or the reserved files. It searches prose, not bundle structure.

None of this reduces Rule 1 or Rule 2. qmd only narrows which docs, or which missing docs, you consider next.
