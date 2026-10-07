# OKF v0.2 in this skill

The Open Knowledge Format (OKF) is a minimal convention for a corpus of markdown files with YAML frontmatter that agents write and maintain: https://github.com/GoogleCloudPlatform/open-knowledge-format (v0.2, see `SPEC.md`). It makes four questions first-class: what a doc was created from (provenance), how much to trust it (trust), whether it is still true (freshness), and whether it is current (lifecycle). `docs/` is an OKF bundle. This file records which parts of the spec the skill uses and how the old skill's fields map onto them.

## Field mapping

| Old skill | OKF v0.2 | Note |
| --- | --- | --- |
| `title` | `title` | same |
| `type` (Diataxis) | `diataxis` (extension key) | OKF's `type` is the concept kind; Diataxis moves to its own key |
| none | `type` | required by OKF; `Flow`, `Overview`, `Architecture`, `Decision`, `Diagram`, `Runbook` |
| none | `description` | one sentence; index generators use it |
| `covers` | `sources[].resource` | repo-root-relative paths or globs; give each an `id` |
| `last_reviewed` | `verified[]` | `{ by, at }` events; agent entries are machine-confirmed, `human:` entries are human-reviewed |
| none | `generated` | `{ by, at }`: who last wrote the content and when |
| `status: current` | `status: stable` | the OKF default |
| `status: draft` | `status: draft` | same |
| `status: stale` | `stale_after: <instant>` + body callout | OKF has no stale status; staleness is `now >= stale_after` |
| none | `status: deprecated` | kept for links and history |
| `_map.yaml` | `_map.json` | derived from `sources`, not an OKF file; JSON since skill 2.0 |
| none | `log.md` | OKF §9 update log, newest first |
| `index.md` | `index.md` | OKF §8 format: `* [Title](path) - description` |

## The families the skill writes

**Provenance (§5.1).** `sources` lists what a doc derives from. For a flow doc that is the code. OKF says a `resource` may be a concrete path or a scope descriptor; a glob is a scope descriptor. Per-claim attribution uses a footnote keyed to a `sources[].id`:

```markdown
Idempotency is enforced by deduplicating on `CorrelationKey`.[^orders-src]

[^orders-src]: src/Orders/OrderService.cs
```

Use a footnote when a claim comes from one source among several and a reader would want to know which.

**Trust (§5.2, §5.3).** `generated` records the writer. `verified` records confirmations, independently. Trust tier is derived by the consumer: no `verified` is unverified; only non-`human:` actors is machine-confirmed; any `human:<id>` entry is human-reviewed. This skill writes an agent `verified` entry when it has read the code behind `sources`. It never writes a `human:` entry on its own. It never removes an existing entry.

**Lifecycle (§5.4, §5.5).** `status` is `draft`, `stable`, or `deprecated`. `stale_after` is an absolute instant. The skill sets `stale_after` to the moment it marks a doc stale, so the doc is stale from then until someone clears it. See `references/conventions.md` for the paired body callout.

## Actor convention (§7)

- Agents and tools: `<producer>/<version>`. Use the client and model you run as: `claude-code/claude-fable-5-1`, `copilot/gpt-5`, `anchored-docs/1.0`.
- People: `human:<id>`. Ask the user for the id they want once per repo (a handle or an email local-part) and reuse it.
- Automation: `process:<id>`, for a CI job that re-verifies docs.

Consumers key trust off the `human:` prefix, so never write a person's confirmation under an agent name.

## Reserved files

`index.md` (§8) has no frontmatter except `okf_version: "0.2"` in the bundle root. Body: one or more sections, each a heading with `* [Title](path) - description` lines. Entries carry the linked concept's `description`. Subdirectories get a line too: `* [Flows](flows/) - end-to-end paths through the system`.

`log.md` (§9) has no frontmatter. Body: `# Docs update log`, then `## YYYY-MM-DD` headings newest first, each with `* **Update**: ...`, `* **Creation**: ...`, `* **Deprecation**: ...` lines that link the docs touched. This skill appends one dated group per run that changed docs. Keep the log short: roll entries older than 90 days into one summary line.

## Conformance (§11)

A bundle conforms when every non-reserved `.md` has parseable frontmatter with a non-empty `type`, and reserved files follow §8 and §9. Consumers must tolerate unknown `type` values, unknown keys, broken links, and missing optional fields. `scripts/docs_check.mjs okf docs/` checks the required set above plus this skill's own required keys.

## Links (§6)

Bundle-relative links start with `/` and are relative to `docs/`; relative links are standard markdown. Inside `docs/` prefer relative links (`../flows/x.md`) because the code-side `See:` comments also use relative paths and one convention is easier to lint. A broken link is not malformed in OKF, but this skill's lint reports it, because in a docs tree a broken link is almost always a moved file.

## Versioning (§12)

The root `docs/index.md` declares `okf_version: "0.2"`. When OKF publishes 0.3, read its changes section before you edit this file; minor versions are additive.
