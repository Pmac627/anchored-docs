# Delta maintenance

Use this procedure for a code change that occurred or will occur. Update only the docs that the change makes necessary. Read `references/conventions.md` first. Have `references/ste-rules.md` open while you write.

## Procedure

### 1. Confirm ripwire, get the changed set

```bash
ripwire --version                                  # stop if absent; see references/ripwire.md
ripwire . --pr-context                              # or --pr-context=main for a branch
git diff --name-only origin/main...HEAD             # the same set as paths (staged: --cached; unstaged: plain)
```

Get the changed files and the `<changed-symbols>` names from `--pr-context`. Note the `at=` sha.

### 2. Find the candidate docs

Do two lookups, then make the union:

- Symbols: `ripwire . --mentions=SYM` for each changed symbol. Each listed doc is a candidate.
- Paths: find the changed paths in `docs/anchored-docs/_map.json` (`node <skill>/scripts/docs_check.mjs affected docs/anchored-docs/ <changed files...>` applies the globs and prints the docs).

If a changed file has no candidate doc, select one of these results:

- The file is part of a documented flow, but `sources` has no entry for it. Correct the entry.
- The file adds behavior that is necessary in a new doc. Make the doc from `assets/templates/flow.md`.
- The file has no effect on documented behavior. Record `n/a` in the self-report with the cause.

These two lookups are the default. On a bundle that follows Rule 2 and keeps `sources` current, they usually find all the docs. Do not add a qmd query here as a usual step. If the user tells you to find out if something is documented, or to do a more complete check than usual, see `references/qmd.md`, "Delta: on request only". That is a different step that the user must request. It is not part of this procedure.

### 3. Read the code, then the docs

Open the changed source files and read what changed. `ripwire . --around=SYM` and `--expand=SYM` give the neighborhood and the body cheaply. Then open the candidate docs. Do not update a doc from the diff alone or from the prior text of the doc.

### 4. Update each affected doc

For each doc:
- Correct the prose to agree with the code. Write in STE.
- Update the embedded Mermaid to agree with the sequence or structure.
- Update the anchors: symbol names in backticks, `path:line` refs adjacent to their symbols, `= N` constants, `[N]` lengths. Step 6 checks these with `--doc-drift`.
- Keep `diataxis` pure. Do not change an explanation page into a change log. The change log is `log.md`.
- Update `sources` if the code moved. Set `generated` to the current time with your actor id.
- Edit the structure that is in the doc. Do not rewrite the page.

<!-- ste-ok: 1.1 name of a heading in another file -->
Update the code-side comments in the same pass. The changed public surface gets an accurate doc comment in STE, with the language back-link to the flow doc (`references/conventions.md`, "Two coupled layers"). On a large change, `ripwire . --comment-coherence` shows comments that only give the name again.

### 5. Mark, do not guess

If you cannot fully reconcile a doc, mark it stale: `stale_after: <now>` in frontmatter plus the `> **STATUS: STALE** - reason` callout below the H1. A doc with a stale flag is correct. A confident guess is not.

### 6. Verify the anchors

```bash
ripwire . --doc-drift=docs/anchored-docs/flows/order-fulfillment.md      # each doc you touched; or --doc-drift=docs/anchored-docs/
```

Correct each `drift=` row on the docs you touched. Rows on docs you did not touch are not your task. List them for the human if they are in the same flow. Quote the `at=` sha in the self-report.

### 7. Run the STE checker

```bash
node <skill>/scripts/ste_check.mjs docs/anchored-docs/flows/order-fulfillment.md src/Orders/OrderService.cs
```

The checker also reads doc comments in source files that you give it. Correct the mechanical failures (exit 1). Rewrite the heuristic warnings that you can. Waive only misreads, with `<!-- ste-ok: rule reason -->`. With the agent pack installed, a failure shows the alternatives from the dictionary. When the alternative does not agree with the meaning, `ste_check.mjs --lookup WORD` shows the full entry.

Sometimes the dictionary rejects a word but the codebase uses it as its own term. Put this word in a glossary and not in a waiver. If it is a term of this repository, put it in `docs/anchored-docs/_glossary.json`. If it is shared vocabulary that the organization glossary in the skill does not have (`run`, `build`, `log`), put it in your run summary as a proposal. You do not edit the organization glossary from a project run. Without the pack, the summary line has `(1.1 partial)`.

### 8. Keep the metadata, indexes, map, and log honest

- Append a `verified` entry to each doc if you read and reconciled the code that it covers. Do not append it to docs that you only looked at.
- New doc: add its line to the `index.md` of the folder and, for a top-level doc, to `docs/anchored-docs/index.md`.
- If `sources` changed or you added a doc, run `node <skill>/scripts/docs_check.mjs map docs/anchored-docs/` to regenerate `_map.json`.
- Append a dated group to `docs/anchored-docs/log.md`. Name the docs you changed and the change that caused it (commit subject or ticket).
- Run `node <skill>/scripts/docs_check.mjs okf docs/anchored-docs/` to make sure that the frontmatter agrees with OKF.

### 9. Emit the self-report block

Close with the block from SKILL.md. `Files-Read` lists what you opened in step 3. `Docs-Drift` and `Docs-STE` come from steps 6 and 7.

## Scope discipline

Touch the docs for the code that changed, their indexes, the map, and the log. Do not scan the full tree. Do not rewrite unrelated pages. Do not run a full lint as part of a delta run. Lint is a different task (`references/lint.md`).

## Worked example

Change: a new `CorrelationKey` field on `OrderRequest` in `src/Orders/OrderRequest.cs`, consumed in `src/Orders/OrderService.cs`.

1. `ripwire . --pr-context` lists the two files, changed symbols `OrderRequest`, `SubmitAsync`, `at="3f2a9c1+dirty"`.
2. `--mentions=SubmitAsync` returns `docs/anchored-docs/flows/order-fulfillment.md`. `_map.json` maps `src/Orders/**` to the same doc. Candidate set: one doc.
3. Read the two files. The field makes a retried submission safe: `SubmitAsync` deduplicates on the key before it saves.
4. In `order-fulfillment.md`, add one Key-behavior bullet: "`SubmitAsync` on `OrderService` deduplicates a retried submission on `CorrelationKey` before it saves the order." (15 words, descriptive limit 25.) Add the step to the Mermaid sequence. Update the XML doc comment on `SubmitAsync` and on the new property. Make sure that the `<seealso href>` on the service points at this flow doc. Set `generated` to the current time.
5. The doc is fully reconciled and has no stale marker.
6. `--doc-drift=docs/anchored-docs/flows/order-fulfillment.md` gives `drift="0"`. The new backticked names resolve.
7. `ste_check.mjs` gives `pass` (the agent pack is installed, so no `(1.1 partial)`).
8. The `verified` entry is appended. `sources` did not change, so no map regeneration is necessary. `log.md` gets `* **Update**: [Order fulfillment](flows/order-fulfillment.md) gained the CorrelationKey idempotency step (feat: idempotent submit).`
9. The self-report is:

```
Docs-Updated: yes
Docs-Files: docs/anchored-docs/flows/order-fulfillment.md, docs/anchored-docs/log.md
Code-Comments: src/Orders/OrderService.cs, src/Orders/OrderRequest.cs
Files-Read: src/Orders/OrderRequest.cs, src/Orders/OrderService.cs
Docs-Stale-Markers: none
Ripwire: 1.9.0 at=3f2a9c1+dirty
Docs-Drift: drift=0 dated=0 on docs/anchored-docs/flows/order-fulfillment.md
Docs-STE: pass
```
