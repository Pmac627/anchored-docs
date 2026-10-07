# Conventions

This file defines the `docs/` bundle, the metadata each doc carries, and the rules that keep the docs reliable. Read it in every mode.

## The bundle

`docs/` is an OKF v0.2 knowledge bundle (see `references/okf.md`). Every non-reserved `.md` file is a concept with YAML frontmatter. `index.md` and `log.md` are reserved and carry no frontmatter (except `okf_version` in the root index).

```
docs/
  index.md          Root catalog. OKF index: one section, one line and a link per child. Human and agent entry point.
  log.md            OKF log: date-grouped history of docs changes, newest first. Appended by this skill.
  overview.md       Business purpose and system context. type: Overview. diataxis: explanation.
  architecture.md   System shape at the C4 context and container level. type: Architecture.
  flows/
    index.md        Flat list of every flow doc with its one-line description.
    <flow>.md       One doc per end-to-end flow. type: Flow. Embeds its own Mermaid. sources point at the code.
  decisions/        Architecture Decision Records. type: Decision. Append-only, dated, immutable once accepted.
    index.md
    NNNN-title.md
  diagrams/         Optional. Only cross-cutting diagrams that no single flow owns.
  tickets/          Gitignored scratch for per-ticket agent notes. Never part of the living docs.
  _glossary.json    This repository's technical nouns and technical verbs (STE rules 1.5, 1.8, 1.11, 1.12). Read by ste_check.mjs together with the organization glossary in the skill.
  _map.json         Derived reverse index from code paths to docs. Regenerated from sources, not hand-edited.
```

Per-flow is the spine. A flow crosses modules and is the unit a change touches, so it gives one obvious doc to update per behavioral change. Keep module-by-module narration to a minimum: it mirrors the code layout and drifts with every refactor.

Co-locate a flow's Mermaid diagram in the flow doc as a fenced ```mermaid block. The diagram and its explanation change together.

There is no `reference/` folder. The doc comments in the code are the API reference, surfaced by the IDE and by ripwire (`--expand`, `--lego`, `--comment-coherence`). Do not hand-maintain a parallel reference.

## Frontmatter schema

Every concept doc starts with OKF frontmatter. Required by OKF: `type`. Required by this skill: `title`, `description`, `diataxis`, `sources`, `generated`, `verified`, `status`.

```yaml
---
type: Flow                              # Flow | Overview | Architecture | Decision | Diagram | Runbook
title: Order fulfillment
description: How a submitted order becomes a persisted, acknowledged order.
diataxis: explanation                   # tutorial | how-to | reference | explanation (STE mode follows this, see below)
status: stable                          # draft | stable | deprecated
sources:                                # what this doc derives from: repo-relative code paths or globs
  - id: orders-src
    resource: src/Orders/**
  - id: orders-api
    resource: src/Api/Controllers/OrdersController.cs
generated: { by: claude-code/claude-fable-5-1, at: 2026-09-09T14:00:00Z }
verified:
  - { by: claude-code/claude-fable-5-1, at: 2026-09-09T14:00:00Z }
tags: [orders, idempotency]             # optional
---
```

Field rules:

- `sources[].resource` is the source of truth for which code a doc describes. Paths are relative to the **repository root**, not the bundle, because the code sits outside `docs/`. Globs are scope descriptors and are allowed. Keep it accurate: if you move the code a doc covers, update `sources` in the same change. Give each entry an `id` so body footnotes (`[^orders-src]`) can attribute a claim to it.
- `generated.at` is the last meaningful content change. `generated.by` is the actor that wrote it.
- `verified` is a list of `{ by, at }` events meaning "this actor read the code behind `sources` on this date and reconciled the doc". Add an entry only after you actually read that code. Never bump it for a cosmetic edit. An agent entry makes the doc *machine-confirmed*; a `human:<id>` entry makes it *human-reviewed*. Append; do not replace a human entry with an agent one.
- `status: draft` is bootstrap output awaiting human sign-off. `stable` is the normal state. `deprecated` keeps a doc for links and history when the behavior is gone.
- `diataxis` sets the STE mode: `how-to` and `tutorial` are **procedural** (20-word cap, imperative). `explanation` and `reference` are **descriptive** (25-word cap). Numbered steps inside any doc are always procedural.

Actor names follow OKF §7: `<producer>/<version>` for agents (use the model id you are running as), `human:<id>` for people, `process:<id>` for automation. Ask the user for their `human:` id once and reuse it.

Ripwire reads a labelled self-date only when nothing but punctuation sits between the label and an ISO date. The OKF forms above (`generated: { by: ..., at: ... }`) therefore leave a doc classified as **live**, so its stale anchors count as drift. That is what you want for flow docs. For a record that must not count as rot (an ADR, a capture, an audit), add a top-level `date: YYYY-MM-DD` key within the first 12 lines. See `references/ripwire.md`.

## The stale marker

When you cannot fully reconcile a doc with the code (out of your scope, unclear intent, needs a human decision), do not guess and do not leave it silently wrong. Mark it in two places:

1. Frontmatter: add `stale_after: <now, ISO 8601>`. OKF consumers then compute `now >= stale_after` as stale. Leave `status` as it was.
2. Body: insert this callout as the first line under the H1.

```markdown
> **STATUS: STALE** - <one sentence: what no longer matches and why you could not fix it>
```

Both carry the literal token `STATUS: STALE` (the frontmatter comment form `stale_after: 2026-09-09T14:00:00Z # STATUS: STALE` is fine), so one grep finds every stale doc:

```
grep -rl "STATUS: STALE" docs/
```

Clearing the marker: remove `stale_after`, remove the callout, add a `verified` entry. List every doc you mark stale in `Docs-Stale-Markers`.

## The glossary: two levels

STE rule 1.1 permits words that are approved in the dictionary, technical nouns, or technical verbs. In a software repo the technical nouns are the components, flows, symbols, products, and protocols; the technical verbs are the domain actions (`ingest`, `rank`, `serialize`, `deploy`). A glossary makes rules 1.8 (use the approved technical noun) and 1.11 (one technical noun per item) enforceable: `ste_check.mjs` treats every glossary term as approved and flags the listed unapproved synonyms. There are two glossaries, and the checker uses their union.

| Level | File | Holds | Who edits it |
| --- | --- | --- | --- |
| Organization | `<skill>/references/org-glossary.json`, or the file at `STE_ORG_GLOSSARY` | Vocabulary shared across the organization's repositories: platform names, product names, the common software words the STE dictionary rejects | Whoever ships the skill inside the organization. Not a project run. |
| Project | `docs/_glossary.json` | Only this repository's own terms | The agent, in bootstrap and delta runs |

Both files are JSON and have the same schema. `meaning` is optional; give one when the word could mean something else in another team's domain. `references/glossary.md` has the full schema, the matching rules, and a starter list.

```json
{
  "technical_nouns": [
    {
      "term": "call graph",
      "meaning": "the directed graph of callers to callees that ripwire builds from the code",
      "unapproved": ["dependency graph", "reference graph"]
    },
    { "term": "gate", "unapproved": ["check script", "test script"] }
  ],
  "technical_verbs": [{ "term": "ingest" }, { "term": "rank" }]
}
```

The organization level exists so that shared words are approved once and mean one thing everywhere. That gives three rules for the project glossary:

1. Do not repeat an organization term. It is already approved. `docs_check.mjs glossary docs/` reports a repeat as a notice; delete the project entry, or, if the project added synonyms, propose them for the organization glossary.
2. Do not contradict the organization glossary. A term it approves cannot appear in a project `unapproved` list. A synonym it rejects cannot be a project term. A synonym cannot point at one term there and another here. A term it defines with a `meaning` cannot carry a different `meaning` here. Each of these is a conflict: `docs_check.mjs glossary` exits 1 and `ste_check.mjs` reports it as a mechanical `1.8` failure on every run, because a contradictory glossary makes the word check unreliable.
3. There is no override. If this repository uses a shared word for a different thing, the repository's item gets a different name. Same word, one meaning, is the whole point of rule 1.11 across an organization.

Learn project terms from the code and the existing docs. Do not invent names. When two names exist for one thing, pick the one the code uses and list the other as unapproved. Before you add a term, run `docs_check.mjs glossary docs/ --terms` to see what the organization already approves. When a term you add is plainly shared vocabulary (it names something other repositories also have), say so in the run summary so a human can move it up a level. Never edit the organization glossary from a project run.

With the ASD-STE100 agent pack installed, the glossaries have a second job: they are the only way to permit a word the official dictionary rejects but the codebase uses as a technical noun or verb. The dictionary says `operate` for `run`, `record` for `log`, `tell` for `call`, `go` for `return`, `step` for `stage`. A pipeline that a developer runs, a log that a service writes, and a function that returns a value all need their words in a glossary, or the checker fails the sentence. These words are the same in every repository, so they belong in the organization glossary; its shipped skeleton has them as a commented starter list. List a word only when it is a technical noun or verb in the codebase. Where an approved word says the same thing (`must` for `should`, `can` for `may`, `before` for `prior to`), write the approved word.

## The derived map

`_map.json` is a reverse index from code paths to the docs that describe them, derived from `sources[].resource` across all docs. It exists so a delta run can find candidate docs by reading one small file. Regenerate it with `node <skill>/scripts/docs_check.mjs map docs/` whenever `sources` change. Do not hand-edit it. Ripwire's `--mentions` is the other half: the map covers paths, `--mentions` covers symbols.

## The tickets scratch area

`docs/tickets/` is in `.gitignore`. Write per-ticket plans, investigation logs, and scratch todo lists there freely. Three rules keep it from contaminating the living docs:

1. Never copy `tickets/` content into a committed doc. Committed docs are re-derived from the code.
2. A committed doc must never link into `tickets/`. Lint treats such a link as an error.
3. Use `ripwire . --note-add="SYM: text"` for a durable, provenance-stamped note tied to a symbol; that is the committed alternative to a scratch note.

## Checkable anchors

Ripwire's `--doc-drift` verifies four anchor shapes. Write docs so the important claims take one of them:

| Shape | Example | Ripwire verifies |
| --- | --- | --- |
| backticked symbol, bare, corroborated | `` `SubmitAsync` on `OrderService` `` | the name is still defined somewhere in the code |
| `path:line` beside a backticked symbol | `` `computeHeadSnapshot` in `src/quality.h:412` `` | the line is still inside that symbol |
| constant value | `` `kMaxRetries` = 5 `` | the declaration still says 5 |
| array extent | `` `kSlots[16]` `` | the declaration still has 16 |

Two rules the live tool enforces (verified on ripwire 0.5.0):
- Write bare identifiers, not dotted paths. `--mentions` and the symbol lane match `SubmitAsync`, not `OrderService.SubmitAsync`. Write the type beside it: `` `SubmitAsync` on `OrderService` ``.
- Corroborate: a backticked name on a line with no other repo-defined name is `unchecked r="uncorroborated"`, never drift. Put the type, file, or caller on the same line.

Prefer symbols over lines: a symbol survives a refactor, a line number does not. Every "Key behavior" bullet in a flow doc names the symbol the behavior lives in. Never put a claim only inside a fenced code block.

## Two coupled layers: Markdown and code-side doc comments

The Markdown gives the narrative and the flows. The doc comments give the next developer accurate IntelliSense at the call site and let ripwire's `--comment-coherence` measure them. The comment on a flow's main public symbols names the flow doc, so code → doc is one hop. Use the relative path from the source file. Write the comment in STE.

**C#** (XML doc comments):
```csharp
/// <summary>Submits an order request and applies idempotency on the request key.</summary>
/// <seealso href="../../docs/flows/order-fulfillment.md">Order fulfillment flow</seealso>
public Task<OrderResult> SubmitAsync(OrderRequest request)
```
Document public types and members. Use `<inheritdoc/>` on interface implementations unless the implementation needs its own note.

**C / C++** (line comments; ripwire's house style has no Doxygen):
```cpp
/// Ranks the graph with Personalized PageRank. Deterministic: fixed-block reductions in canonical order.
/// See: docs/flows/rank.md
void rankGraphTeleport( Graph& g, std::span<const float> seeds );
```
If the repo uses Doxygen, use `@see docs/flows/rank.md` instead. Keep the `See:` line as the last line of the comment.

**Python** (docstrings):
```python
def ingest(root: Path) -> Index:
    """Crawl root and extract symbols with tree-sitter.

    See also: docs/flows/ingest.md
    """
```

**TypeScript / JavaScript** (JSDoc):
```ts
/**
 * Resolves references into a call graph.
 * @see docs/flows/graph.md
 */
export function buildGraph(symbols: Symbol[]): Graph
```

`docs_check.mjs links` verifies that every `seealso href`, `See:`, `See also:`, and `@see` target that points into `docs/` exists. Keep the path correct for where the source file sits.

## Writing style

Follow `references/ste-rules.md`. Use the glossary's terms. Anchor non-obvious claims to a symbol. When you revise a doc, correct the existing structure rather than rewrite it wholesale, so nuance is not compressed out over successive edits. House style: no em dashes; use a comma, a colon, or a new sentence.
