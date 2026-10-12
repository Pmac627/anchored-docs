# Conventions

This file gives the `docs/anchored-docs/` bundle, the metadata that each doc has, and the rules that keep the docs reliable. Read it in all modes.

## The bundle

`docs/anchored-docs/` is an OKF v0.2 knowledge bundle (see `references/okf.md`). Each non-reserved `.md` file is a concept with YAML frontmatter. `index.md` and `log.md` are reserved and have no frontmatter. The root index has `okf_version` as its only frontmatter.

```
docs/anchored-docs/
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
  _glossary.json    This repository's technical nouns and technical verbs (STE rules 1.5, 1.8, 1.11, 1.12). Read by ste_check.mjs together with the organization glossary in the skill.
  _map.json         Derived reverse index from code paths to docs. Regenerated from sources, not hand-edited.
```

`docs/tickets/` is adjacent to the bundle and not in it. It holds the project's scratch notes, and it is gitignored. See "The tickets scratch area" below.

Per-flow is the spine. A flow connects many modules and is the unit that a change touches, so it gives one obvious doc to update for each behavioral change. Keep module-by-module narration to a minimum: it mirrors the code layout and drifts with each refactor.

Co-locate a flow's Mermaid diagram in the flow doc as a fenced ```mermaid block. The diagram and its explanation change together.

There is no `reference/` folder. The doc comments in the code are the API reference, surfaced by the IDE and by ripwire (`--expand`, `--lego`, `--comment-coherence`). Do not hand-maintain a parallel reference.

## Frontmatter schema

Each concept doc starts with OKF frontmatter. Necessary in OKF: `type`. Necessary in this skill: `title`, `description`, `diataxis`, `sources`, `generated`, `verified`, `status`.

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

- `sources[].resource` is the source of truth for the code that a doc gives information about. Paths are relative to the **repository root**, not the bundle, because the code is not in `docs/anchored-docs/`. You can use globs, which are scope descriptors. Keep it accurate: if you move the code that a doc is about, update `sources` in the same change. Give each entry an `id` so body footnotes (`[^orders-src]`) can attribute a claim to it.
- `generated.at` is the last meaningful content change. `generated.by` is the actor that wrote it.
- `verified` is a list of `{ by, at }` entries. Each entry means "this actor read the code behind `sources` on this date and reconciled the doc". Add an entry only after you read that code. Do not change it for a cosmetic edit. An agent entry makes the doc *machine-confirmed*. A `human:<id>` entry makes it *human-reviewed*. Append an entry. Do not replace a human entry with an agent one.
- `status: draft` is bootstrap output that waits for human sign-off. `stable` is the normal value. `deprecated` keeps a doc for links and history when the behavior is gone.
- `diataxis` sets the STE mode: `how-to` and `tutorial` are **procedural** (20-word cap, written as commands). `explanation` and `reference` are **descriptive** (25-word cap). Numbered steps in all docs are always procedural.

Actor names follow OKF §7: `<producer>/<version>` for agents (use the model id of the model that you operate as), `human:<id>` for a person, `process:<id>` for automation. Get the `human:` id from the user one time. Use the same id each time after that.

Ripwire reads a labelled self-date only when nothing but punctuation is between the label and an ISO date. Thus the OKF fields above (`generated: { by: ..., at: ... }`) keep a doc classified as **live**, so its stale anchors count as drift. That is what you want for flow docs. For a record that must not count as rot (an ADR, a capture, an audit), add a top-level `date: YYYY-MM-DD` key in the first 12 lines. See `references/ripwire.md`.

## The stale marker

When you cannot fully reconcile a doc with the code (out of your scope, unclear intent, a human decision is necessary), do not guess. Do not let the doc stay incorrect without a mark. Mark it in two parts:

1. Frontmatter: add `stale_after: <now, ISO 8601>`. OKF consumers then calculate `now >= stale_after` as stale. Do not change `status`.
2. Body: put this callout as the first line after the H1.

```markdown
> **STATUS: STALE** - <one sentence: what no longer matches and why you could not fix it>
```

The two parts have the literal token `STATUS: STALE` (the frontmatter comment `stale_after: 2026-09-09T14:00:00Z # STATUS: STALE` is correct), so one grep finds all stale docs:

```
grep -rl "STATUS: STALE" docs/anchored-docs/
```

Clearing the marker: remove `stale_after`, remove the callout, add a `verified` entry. List all docs that you mark stale in `Docs-Stale-Markers`.

## The glossary: two levels

STE rule 1.1 lets you use words that are approved in the dictionary, technical nouns, or technical verbs. In a software repo the technical nouns are the names of components, flows, symbols, software, and protocols. The technical verbs are the domain operations (`ingest`, `rank`, `serialize`, `deploy`). A glossary makes rules 1.8 (use the approved technical noun) and 1.11 (one technical noun for each item) enforceable. `ste_check.mjs` accepts each glossary term as approved and flags the listed unapproved synonyms. There are two glossaries, and the checker uses their union.

| Level | File | Holds | Who edits it |
| --- | --- | --- | --- |
| Organization | `<skill>/references/org-glossary.json`, or the file at `STE_ORG_GLOSSARY` | Vocabulary that all repositories of the organization share: platform names, names of software, the usual software words that the STE dictionary rejects | The person who ships the skill in the organization. Not a project run. |
| Project | `docs/anchored-docs/_glossary.json` | Only this repository's own terms | The agent, in bootstrap and delta runs |

The two files are JSON and have the same schema. `meaning` is optional. Give one when the word can have a different meaning in the domain of a different team. `references/glossary.md` has the full schema, the rules for how terms are compared, and a starter list.

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

The organization level is for shared words. Each shared word has one approval and one meaning everywhere. That gives three rules for the project glossary:

1. Do not write an organization term again. The term is approved. `docs_check.mjs glossary docs/anchored-docs/` reports the second entry as a notice. Delete the project entry. If the project added synonyms, propose them for the organization glossary.
2. Do not contradict the organization glossary. A term that is approved there cannot be in a project `unapproved` list. A synonym that is rejected there cannot be a project term. A synonym cannot go to one term there and to a different term here. A term that has a `meaning` there cannot have a different `meaning` here. Each of these is a conflict. `docs_check.mjs glossary` exits 1. `ste_check.mjs` reports it as a mechanical `1.8` failure on each run, because a contradictory glossary makes the word check unreliable.
3. There is no override. If this repository uses a shared word for a different thing, the repository's item gets a different name. Same word, one meaning, is the purpose of rule 1.11 in an organization.

Learn project terms from the code and the current docs. Do not invent names. When two names are for one thing, pick the one that the code uses and list the other as unapproved. Before you add a term, run `docs_check.mjs glossary docs/anchored-docs/ --terms` to see the terms in the organization glossary. When a term you add is plainly shared vocabulary (it names something that other repositories also have), say so in the run summary so a human can move it up a level. Do not edit the organization glossary from a project run.

With the ASD-STE100 agent pack installed, the glossaries have a second function. Only a glossary can give approval to a word that the official dictionary rejects but the codebase uses as a technical noun or verb. The dictionary says `operate` for `run`, `record` for `log`, `tell` for `call`, `go` for `return`, `step` for `stage`. A pipeline that a person runs, a log that a service writes, and a function that returns a value are examples. The words for all of these must be in a glossary. If not, the checker fails the sentence.

These words are the same in all repositories, so they belong in the organization glossary. Its shipped skeleton has them as a commented starter list. List a word only when it is a technical noun or verb in the codebase. Where an approved word says the same thing (`must` for `should`, `can` for `may`, `before` for `prior to`), write the approved word.

## The derived map

`_map.json` is a reverse index from code paths to the docs that give information about them, derived from `sources[].resource` across all docs. It is there so a delta run can find candidate docs when it reads one small file. Regenerate it with `node <skill>/scripts/docs_check.mjs map docs/anchored-docs/` each time `sources` change. Do not hand-edit it. Ripwire's `--mentions` is the other half: the map is for paths, and `--mentions` is for symbols.

## The tickets scratch area

`docs/tickets/` is in `.gitignore`. Write per-ticket plans, investigation logs, and scratch todo lists there freely. Three rules keep it from contaminating the living docs:

1. Do not copy `tickets/` content into a committed doc. Committed docs are re-derived from the code.
2. A committed doc must not have a link to `tickets/`. Lint reports such a link as an error.
3. Use `ripwire . --note-add="SYM: text"` for a durable, provenance-stamped note tied to a symbol. That note is the committed alternative to a scratch note.

## Checkable anchors

Ripwire's `--doc-drift` makes sure that four anchor shapes are correct. Write docs so that the important claims have one of these shapes:

| Shape | Example | Ripwire makes sure that |
| --- | --- | --- |
| backticked symbol, bare, corroborated | `` `SubmitAsync` on `OrderService` `` | the code continues to have a definition of the name |
| `path:line` adjacent to a backticked symbol | `` `splitlines` in `skills/anchored-docs/scripts/_compat.mjs:44` `` | the line continues to be in that symbol |
| constant value | `` `kMaxRetries` = 5 `` | the declaration continues to say 5 |
| array length | `` `kSlots[16]` `` | the declaration continues to have 16 |

Two rules that the live tool applies (made sure on ripwire 0.5.0):
- Write bare identifiers, not dotted paths. `--mentions` and the symbol lane find `SubmitAsync`, not `OrderService.SubmitAsync`. Write the type adjacent to it: `` `SubmitAsync` on `OrderService` ``.
- Corroborate: a backticked name on a line with no other repo-defined name is `unchecked r="uncorroborated"`, and is not drift. Put the type, file, or caller on the same line.

Prefer symbols to lines: a symbol survives a refactor, but a line number does not. Each "Key behavior" bullet in a flow doc names the symbol in which the behavior is. Do not put a claim only in a fenced code block.

## Two coupled layers: Markdown and code-side doc comments

The Markdown gives the narrative and the flows. The doc comments give accurate IntelliSense at the call site to the next person who reads the code, and let ripwire's `--comment-coherence` measure them. The comment on the primary public symbols of a flow names the flow doc, so code → doc is one hop. Use the relative path from the source file. Write the comment in STE.

**C#** (XML doc comments):
```csharp
/// <summary>Submits an order request and applies idempotency on the request key.</summary>
/// <seealso href="../../docs/anchored-docs/flows/order-fulfillment.md">Order fulfillment flow</seealso>
public Task<OrderResult> SubmitAsync(OrderRequest request)
```
Document public types and members. Use `<inheritdoc/>` on code that does an interface, unless that code must have its own note.

**C / C++** (line comments, because the style of ripwire has no Doxygen):
```cpp
/// Ranks the graph with Personalized PageRank. Deterministic: fixed-block reductions in canonical order.
/// See: docs/anchored-docs/flows/rank.md
void rankGraphTeleport( Graph& g, std::span<const float> seeds );
```
If the repo uses Doxygen, use `@see docs/anchored-docs/flows/rank.md` and not the `See:` line. Keep the `See:` line as the last line of the comment.

**Python** (docstrings):
```python
def ingest(root: Path) -> Index:
    """Crawl root and extract symbols with tree-sitter.

    See also: docs/anchored-docs/flows/ingest.md
    """
```

**TypeScript / JavaScript** (JSDoc):
```ts
/**
 * Resolves references into a call graph.
 * @see docs/anchored-docs/flows/graph.md
 */
export function buildGraph(symbols: Symbol[]): Graph
```

`docs_check.mjs links` makes sure that each `seealso href`, `See:`, `See also:`, and `@see` target that points to `docs/anchored-docs/` is a file. Keep the path correct for where the source file is.

## Writing style

Follow `references/ste-rules.md`. Use the glossary's terms. Anchor non-obvious claims to a symbol. When you revise a doc, correct the current structure. Do not rewrite all of it, so that nuance is not compressed out in successive edits. Style rule: no em dashes, so use a comma, a colon, or a new sentence.
