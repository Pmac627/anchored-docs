# Glossaries

The STE checker reads two glossary files together. Each file lists technical nouns and technical verbs. A listed word is approved even when the official dictionary rejects it (STE rules 1.5, 1.8, 1.11, 1.12).

| Level | File | Who edits it |
| --- | --- | --- |
| Organization | `<skill>/references/org-glossary.json`, or the file at `STE_ORG_GLOSSARY` | Whoever ships the skill inside the organization. A project run reads it and never edits it. |
| Project | `docs/_glossary.json` in each repository | The agent, in bootstrap and delta runs. |

Both files are JSON. JSON has no comments, so this page holds the notes that 1.x kept as comments in the YAML files.

## Schema

The top level is an object with two optional arrays: `technical_nouns` and `technical_verbs`. An entry is one of:

- an object with a `term`, and optionally a `meaning` and an `unapproved` array
- a plain string, which is a term with no `meaning` and no synonyms

```json
{
  "technical_nouns": [
    {
      "term": "call graph",
      "meaning": "the directed graph of callers to callees that ripwire builds from the code",
      "unapproved": ["dependency graph", "reference graph"]
    },
    { "term": "gate", "unapproved": ["check script"] },
    "payload"
  ],
  "technical_verbs": [{ "term": "ingest" }, "rank"]
}
```

- Every `term` is an approved technical noun or technical verb. The checker compares in lowercase, so case does not matter.
- Every `unapproved` synonym is flagged, and the message names the approved term (rule 1.11).
- `meaning` is optional. Give one when the word could mean something else in another team's domain. It is how the checker tells "the same word for the same thing" (a harmless repeat) from "the same word for a different thing" (a conflict). Two meanings count as equal when they differ only in case, spacing, or a final period.

Write the file as strict JSON: double quotes, no comments, no trailing commas. If a glossary file is not valid JSON, the script stops and names the file and the position of the error. A glossary written in YAML stops the run with a message that says the file must be JSON.

## The rules between the two levels

There is no precedence. A project glossary may not contradict the organization glossary:

1. It may not list an organization term as `unapproved`.
2. It may not approve a word that the organization lists as an unapproved synonym.
3. It may not point a synonym at a different term than the organization does.
4. It may not give an organization term a different `meaning`.
5. A file may not list a word as a term and as an unapproved synonym of another term.

Each of these is a conflict. `node <skill>/scripts/docs_check.mjs glossary docs/` reports it and exits 1, and `ste_check.mjs` fails with a mechanical `1.8` finding. A project that needs a shared word for something else picks a different name. A project term that turns out to be shared moves up into the organization file, and you ship a new copy of the skill.

A project entry that only repeats an organization term is a notice. Delete the repeat, or move its extra synonyms up to the organization glossary.

## Keep the organization glossary outside the skill

Set `STE_ORG_GLOSSARY=/path/to/org-glossary.json` in the environment the agents run in. That path wins over the file in the skill. If the path does not exist, the file in the skill is used.

## Starter list for the organization glossary

With the ASD-STE100 agent pack installed, the official dictionary rejects these common software words. The checker fails them until a glossary lists them. Most organizations want them approved once, in the organization file, instead of in every project.

Copy the entries your organization uses as its own terms and delete the rest. Do not add a word only to silence sentences where an approved word says the same thing. The `dictionary says` column shows what the official dictionary prefers.

| Term | Kind | Dictionary says |
| --- | --- | --- |
| `build` | noun (meaning: the compiled artifact of a repository) | structure |
| `log` | noun | record |
| `request` | noun | (verb) tell, write |
| `anchor` | noun | (verb) attach |
| `job` | noun | work, task |
| `stage` | noun | step |
| `option` | noun | alternative |
| `setting` | noun | adjustment |
| `variable` | noun | (verb) change |
| `run` | verb (meaning: start a program or pipeline and let it complete) | operate |
| `build` | verb | assemble |
| `log` | verb | record |
| `call` | verb | tell |
| `return` | verb | go |
| `branch` | verb | divide |
| `render` | verb | make |
| `restart` | verb | start |

The same list as JSON:

```json
{
  "technical_nouns": [
    { "term": "build", "meaning": "the compiled artifact of a repository" },
    { "term": "log" },
    { "term": "request" },
    { "term": "anchor" },
    { "term": "job" },
    { "term": "stage" },
    { "term": "option" },
    { "term": "setting" },
    { "term": "variable" }
  ],
  "technical_verbs": [
    { "term": "run", "meaning": "start a program or pipeline and let it complete" },
    { "term": "build" },
    { "term": "log" },
    { "term": "call" },
    { "term": "return" },
    { "term": "branch" },
    { "term": "render" },
    { "term": "restart" }
  ]
}
```

The dictionary does not know some other words at all (`commit`, `merge`, `cache`, `queue`, `endpoint`, `payload`, `schema`, `pipeline`, `server`, `client`, `repository`). They only produce a warning. Add the ones your organization shares, so rule 1.11 holds them to one name everywhere.
