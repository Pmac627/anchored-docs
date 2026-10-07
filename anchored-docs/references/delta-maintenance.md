# Delta maintenance

The common case. A code change happened or is about to, and you update only the docs the change affects. Read `references/conventions.md` first. Have `references/ste-rules.md` open while you write.

## Procedure

### 1. Confirm ripwire, get the changed set

```bash
ripwire --version                                  # stop if absent; see references/ripwire.md
ripwire . --pr-context                              # or --pr-context=main for a branch
git diff --name-only origin/main...HEAD             # the same set as paths (staged: --cached; unstaged: plain)
```

Take the changed files and the `<changed-symbols>` names from `--pr-context`. Note the `at=` sha.

### 2. Find the candidate docs

Two lookups, then the union:

- Symbols: `ripwire . --mentions=SYM` for each changed symbol. Every listed doc is a candidate.
- Paths: match the changed paths against `docs/_map.json` (`node <skill>/scripts/docs_check.mjs affected docs/ <changed files...>` does the glob match and prints the docs).

If a changed file matches nothing, decide honestly: it affects a documented flow whose `sources` is missing an entry (fix the entry), or it introduces behavior that deserves a new doc (create one from `assets/templates/flow.md`), or it genuinely affects no documented behavior (record `n/a` in the self-report with the reason).

These two lookups are the default and, on a bundle that follows Rule 2 and keeps `sources` current, are normally sufficient. Do not add a qmd query here as a matter of course. If the user explicitly asks whether something is documented or asks for a more thorough check than usual, see `references/qmd.md`, "Delta: on request only" — but that is a distinct, requested step, not part of this procedure.

### 3. Read the code, then the docs

Open the changed source files and read what changed. `ripwire . --around=SYM` and `--expand=SYM` give the neighborhood and the body cheaply. Then open the candidate docs. Do not update a doc from the diff alone or from the doc's own prior text.

### 4. Update each affected doc

For each:
- Correct the prose so it matches the code now. Write in STE.
- Update the embedded Mermaid so the sequence or structure matches.
- Update the anchors: symbol names in backticks, `path:line` refs beside their symbols, `= N` constants, `[N]` extents. This is what `--doc-drift` will check in step 6.
- Keep `diataxis` pure. Do not turn an explanation page into a change log; the change log is `log.md`.
- Update `sources` if the code moved. Set `generated` to now with your actor id.
- Prefer editing the existing structure over rewriting the page.

Update the code-side comments in the same pass: the changed public surface gets an accurate doc comment in STE, with the language's back-link to the flow doc (`references/conventions.md`, "Two coupled layers"). `ripwire . --comment-coherence` on a large change shows comments that only restate the name.

### 5. Mark, do not guess

If you cannot fully reconcile a doc, mark it stale: `stale_after: <now>` in frontmatter plus the `> **STATUS: STALE** - reason` callout under the H1. A clearly flagged stale doc is correct. A confident guess is not.

### 6. Verify the anchors

```bash
ripwire . --doc-drift=docs/flows/order-fulfillment.md      # each doc you touched; or --doc-drift=docs/
```

Fix every `drift=` row on the docs you touched. Rows on docs you did not touch are not your task, but list them for the human if they are in the same flow. Quote the `at=` sha in the self-report.

### 7. Run the STE checker

```bash
node <skill>/scripts/ste_check.mjs docs/flows/order-fulfillment.md src/Orders/OrderService.cs
```

The checker also reads doc comments in source files you pass. Fix mechanical failures (exit 1). Rewrite the heuristic warnings you can. Waive only misreads, with `<!-- ste-ok: rule reason -->`. With the agent pack installed, a failure names the dictionary's alternatives; `ste_check.mjs --lookup WORD` shows the full entry when the alternative does not fit the meaning. A word the dictionary rejects but the codebase uses as its own term goes in a glossary, not in a waiver: in `docs/_glossary.json` if it is this repository's term, or, if it is shared vocabulary that the organization glossary in the skill does not yet have (`run`, `build`, `log`), in your run summary as a proposal, since you do not edit the organization glossary from a project run. Without the pack, the summary line carries `(1.1 partial)`.

### 8. Keep the metadata, indexes, map, and log honest

- Append a `verified` entry to each doc whose covered code you actually read and reconciled. Not on docs you only glanced at.
- New doc: add its line to the folder's `index.md` and, for a top-level doc, to `docs/index.md`.
- `sources` changed or a doc added: `node <skill>/scripts/docs_check.mjs map docs/` to regenerate `_map.json`.
- Append a dated group to `docs/log.md` naming the docs you changed and the change that caused it (commit subject or ticket).
- `node <skill>/scripts/docs_check.mjs okf docs/` to confirm the frontmatter still conforms.

### 9. Emit the self-report block

Close with the block from SKILL.md. `Files-Read` lists what you opened in step 3. `Docs-Drift` and `Docs-STE` come from steps 6 and 7.

## Scope discipline

Touch the docs for the code that changed, their indexes, the map, and the log. Do not sweep the whole tree, do not rewrite unrelated pages, do not run a full lint as part of a delta run. Lint is its own occasional pass (`references/lint.md`).

## Worked example

Change: a new `CorrelationKey` field on `OrderRequest` in `src/Orders/OrderRequest.cs`, consumed in `src/Orders/OrderService.cs`.

1. `ripwire . --pr-context` lists both files, changed symbols `OrderRequest`, `SubmitAsync`, `at="3f2a9c1+dirty"`.
2. `--mentions=SubmitAsync` returns `docs/flows/order-fulfillment.md`. `_map.json` maps `src/Orders/**` to the same doc. Candidate set: one doc.
3. Read both files. The field makes a retried submission safe: `SubmitAsync` deduplicates on the key before it saves.
4. In `order-fulfillment.md`, add one Key-behavior bullet: "`SubmitAsync` on `OrderService` deduplicates a retried submission on `CorrelationKey` before it saves the order." (15 words, descriptive cap 25.) Add the step to the Mermaid sequence. Update the XML doc comment on `SubmitAsync` and on the new property. Make sure that the `<seealso href>` on the service points at this flow doc. `generated` to now.
5. Fully reconciled, no stale marker.
6. `--doc-drift=docs/flows/order-fulfillment.md`: `drift="0"`. The new backticked names resolve.
7. `ste_check.mjs`: pass (the agent pack is installed, so no `(1.1 partial)`).
8. `verified` entry appended. `sources` unchanged, so no map regeneration. `log.md` gets `* **Update**: [Order fulfillment](flows/order-fulfillment.md) gained the CorrelationKey idempotency step (feat: idempotent submit).`
9. Self-report:

```
Docs-Updated: yes
Docs-Files: docs/flows/order-fulfillment.md, docs/log.md
Code-Comments: src/Orders/OrderService.cs, src/Orders/OrderRequest.cs
Files-Read: src/Orders/OrderRequest.cs, src/Orders/OrderService.cs
Docs-Stale-Markers: none
Ripwire: 1.9.0 at=3f2a9c1+dirty
Docs-Drift: drift=0 dated=0 on docs/flows/order-fulfillment.md
Docs-STE: pass
```
