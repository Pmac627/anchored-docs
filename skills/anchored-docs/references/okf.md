# OKF v0.2 in this skill

The Open Knowledge Format (OKF) is a minimal convention for a corpus of markdown files with YAML frontmatter that agents write and keep: https://github.com/GoogleCloudPlatform/open-knowledge-format (v0.2, see `SPEC.md`). OKF puts four questions first. The first question is about the source of a doc (provenance). The second is about how much to trust the doc (trust). The third is about if the doc is correct at this time (freshness). The fourth is about if the doc is current (lifecycle).

`docs/anchored-docs/` is an OKF bundle. This file records which parts of the spec the skill uses and how the fields of the previous skill agree with them.

## Field mapping

| Previous skill | OKF v0.2 | Note |
| --- | --- | --- |
| `title` | `title` | same |
| `type` (Diataxis) | `diataxis` (extension key) | The OKF `type` is the concept type. Diataxis has its own key |
| none | `type` | OKF makes this key necessary. The values are `Flow`, `Overview`, `Architecture`, `Decision`, `Diagram`, `Runbook` |
| none | `description` | One sentence. Index generators use it |
| `covers` | `sources[].resource` | Repo-root-relative paths or globs. Give each an `id` |
| `last_reviewed` | `verified[]` | `{ by, at }` pairs. Agent entries are machine-confirmed. `human:` entries are human-reviewed |
| none | `generated` | `{ by, at }`: who last wrote the content and when |
| `status: current` | `status: stable` | the OKF default |
| `status: draft` | `status: draft` | same |
| `status: stale` | `stale_after: <instant>` + body callout | OKF has no stale status. A doc is stale when `now >= stale_after` |
| none | `status: deprecated` | kept for links and history |
| `_map.yaml` | `_map.json` | Made from `sources`. It is not an OKF file. JSON since skill 2.0 |
| none | `log.md` | OKF §9 update log, newest first |
| `index.md` | `index.md` | OKF §8 format: `* [Title](path) - description` |

## The families the skill writes

**Provenance (§5.1).** `sources` lists what a doc derives from. For a flow doc that is the code. OKF says that a `resource` can be a concrete path or a scope descriptor. A glob is a scope descriptor. Per-claim attribution uses a footnote keyed to a `sources[].id`:

```markdown
Idempotency is enforced by deduplicating on `CorrelationKey`.[^orders-src]

[^orders-src]: src/Orders/OrderService.cs
```

Use a footnote when a claim comes from one of some sources and the reader must know which source.

**Trust (§5.2, §5.3).** `generated` records the writer. `verified` records confirmations, independently.

The consumer finds the trust tier. A doc with no `verified` entry is unverified. A doc with only non-`human:` actors is machine-confirmed. A doc with a `human:<id>` entry is human-reviewed.

This skill writes an agent `verified` entry when it reads the code behind `sources`. It does not write a `human:` entry on its own. It does not remove an entry.

**Lifecycle (§5.4, §5.5).** `status` is `draft`, `stable`, or `deprecated`. `stale_after` is an absolute instant. The skill sets `stale_after` to the moment it marks a doc stale, so the doc is stale from then until someone clears it. See `references/conventions.md` for the paired body callout.

## Actor convention (§7)

- Agents and tools: `<producer>/<version>`. Use the client and model you run as: `claude-code/claude-fable-5-1`, `copilot/gpt-5`, `anchored-docs/1.0`.
- Humans: `human:<id>`. Tell the user to give the id they want one time for each repo (a username or an email local-part). Then use the same id again.
- Automation: `process:<id>`, for a CI task that checks the docs again.

Consumers find the trust level from the `human:` prefix. Thus do not write the confirmation of a person with an agent name.

## Reserved files

`index.md` (§8) has no frontmatter, but the bundle root has `okf_version: "0.2"`. Body: one or more sections, each a heading with `* [Title](path) - description` lines. Each entry has the `description` of the linked concept. Subdirectories get a line also: `* [Flows](flows/) - end-to-end paths through the system`.

`log.md` (§9) has no frontmatter. Body: `# Docs update log`, then `## YYYY-MM-DD` headings newest first, each with `* **Update**: ...`, `* **Creation**: ...`, `* **Deprecation**: ...` lines that link the docs that changed. This skill appends one dated group for each run that changed docs. Keep the log short. Replace the entries that have an age of more than 90 days with one summary line.

## Conformance (§11)

A bundle agrees with OKF when each non-reserved `.md` has parseable frontmatter with a non-empty `type`, and reserved files follow §8 and §9. Consumers must tolerate unknown `type` values, unknown keys, broken links, and missing optional fields. `scripts/docs_check.mjs okf docs/anchored-docs/` checks the keys that OKF makes necessary, and the keys that this skill makes necessary.

## Links (§6)

Bundle-relative links start with `/` and are relative to `docs/anchored-docs/`. Relative links are standard markdown. In `docs/anchored-docs/`, use relative links (`../flows/x.md`). The code-side `See:` comments also use relative paths, and one convention is easier to lint. OKF does not call a broken link malformed, but the lint of this skill reports it. In a docs tree, a broken link is almost always a moved file.

## Versioning (§12)

The root `docs/anchored-docs/index.md` declares `okf_version: "0.2"`. When OKF publishes 0.3, read its changes section before you edit this file. A small version change only adds items.
