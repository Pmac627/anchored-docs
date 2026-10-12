# QMD in this skill

qmd (https://github.com/tobi/qmd) is a local hybrid search engine: BM25 keyword search, vector semantic search, and LLM reranking on a markdown collection. It also runs as an MCP server (`qmd mcp`).

qmd is **optional**. Use it for two tasks only: a coverage check at the end of bootstrap mode, and an on-request lookup in delta mode. It does not check and it does not gate.

Do not let a qmd result, or an installed or missing qmd, change `Docs-Updated` or `Docs-Drift`. Do not let it block a step. It answers one question that a call-graph tool cannot answer. Does the docs bundle discuss this area of the code in other words, not only in the words that ripwire indexes as symbols?

## Why not a step in ordinary delta mode

Delta mode finds candidate docs in two procedures: `ripwire --mentions=SYM` (the doc names the changed symbol) and `_map.json` (the declared `sources` of the doc cover the changed path). Rule 2 makes the claims of each doc name their symbols, and `sources` is a necessary, checked frontmatter field. On a doc bundle that follows the rules of this skill, those two lookups find what changed.

A third default lookup with qmd mostly finds docs with anchors again. It costs an index that you must keep current. It also costs a model download. qmd is of use for work with *no anchors* (bootstrap). It is also of use for a specific suspicion that something is undocumented (delta, on request).

Do not add a qmd step to the ordinary delta procedure in `references/delta-maintenance.md`.

## Detection

Run this only when a step below calls for qmd (end of bootstrap, or a user request in delta). Do not try to find qmd at the start of each run.

```bash
BIN="${QMD_BIN:-$(command -v qmd || true)}"
[ -n "$BIN" ] && "$BIN" status >/dev/null 2>&1
```

If you use the MCP server (`.mcp.json` with a `qmd` entry), call its `status` tool. If the binary and the server do not answer, write that qmd is missing: report it plainly and continue. Do not stop a run. Do not tell the user to install it, unless the user tells you to.

## Bootstrap: the coverage check (step 9)

Do this step one time, after you write the bundle and complete steps 1–8 of `references/bootstrap.md`, and only if qmd is installed. It is the last step of bootstrap, and it does not block the end of the work.

1. Index the new bundle as a collection: `qmd collection add docs/anchored-docs --name <repo>-docs && qmd embed`.
2. Do this for each `--communities` cluster and for each primary concept in the README or entry points. Use the concepts that you identified in step 1 of bootstrap. Run a structured `qmd query` on that collection to find out if the bundle discusses the concept:

   ```bash
   qmd query -c <repo>-docs --format json $'intent: Find any doc that discusses <cluster/concept name>, in any words.\nlex: <cluster/concept name and its main symbols>\nvec: <plain-language description of what this area of the code does>'
   ```

3. A cluster has missing coverage if it has no hit above a modest score. It also has missing coverage if it has only weak or tangential hits. The call graph found the area, but the bootstrap step did not make a doc for it. List these clusters in the bootstrap report as `possible coverage gaps qmd found`. Give the cluster name and the cause of the weak result. Do not make docs for them automatically. A human or a follow-up bootstrap step makes the decision if they must have a doc.
4. Write the qmd result in the report: `Docs-Coverage-QMD: <N> gap(s) found | none found | absent | not-run`.

If qmd is missing, bootstrap ends as `references/bootstrap.md` says, and the report says `Docs-Coverage-QMD: absent`. Tell the user one time that, if the user installs qmd, this step can check coverage more fully. Do not give the suggestion again in subsequent runs.

## Delta: on request only

Do not run qmd during ordinary delta maintenance. Run it only when the user tells you to find out if something is documented. Also run it when the user wants a fuller check than the standard candidate lookup, or says that a doc can be missing.

1. Make sure that qmd is installed, as in Detection above. If qmd is missing, say so and continue with `--mentions` and the map alone.
2. If the docs bundle is not indexed as a collection (`qmd collection list`), index it: `qmd collection add docs/anchored-docs --name <repo>-docs && qmd embed`. Run `qmd embed` again if the docs changed after the last index.
3. Query with structured fields. Use the changed symbol, its adjacent code, and the vocabulary of the bundle. Write the `intent:`/`lex:`/`vec:` fields and do not copy the sentence of the user:

   ```bash
   qmd query -c <repo>-docs --format json $'intent: Find any doc that discusses SYM or the behavior it changes, beyond ripwire --mentions and _map.json.\nlex: SYM <neighboring names>\nvec: <plain-language description of the changed behavior>'
   ```

4. Use each hit above a modest score as a candidate, with the hits that `--mentions` and the map found. A qmd hit is a clue, not an anchor that ripwire can check. Read the code. Read the doc. Then make a decision. `--doc-drift` does not check a qmd result.
5. Write the result in the report: `Docs-Candidates-QMD: <N> hit(s) requested and found | requested, none found | absent | not-run`. `not-run` is the default for ordinary delta runs when nobody tells you to use qmd.

## What qmd cannot see

- It has no notion of a symbol, a line, or a constant value. It cannot check what `--doc-drift` checks.
- It ranks by similarity to the query you wrote. A vague query returns vague hits.
- Its index is a snapshot as of the last `qmd embed`. A doc written or changed since then is invisible to it until the next embed.
- It has no concept of `sources`, OKF frontmatter, `diataxis`, or the reserved files. It searches prose, not bundle structure.

None of this decreases Rule 1 or Rule 2. qmd only narrows which docs, or which missing docs, you must read next.
