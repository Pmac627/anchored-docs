# Glossaries

The STE checker reads two glossary files together. Each file lists technical nouns and technical verbs. A listed word is approved. The official dictionary can reject the same word (STE rules 1.5, 1.8, 1.11, 1.12).

| Level | File | Who edits it |
| --- | --- | --- |
| Organization | `<skill>/references/org-glossary.json`, or the file at `STE_ORG_GLOSSARY` | The person who ships the skill in the organization. A project run reads it and does not edit it. |
| Project | `docs/anchored-docs/_glossary.json` in each repository | The agent, in bootstrap and delta runs. |

The two files are JSON. JSON has no comments, so this page holds the notes that 1.x kept as comments in the YAML files.

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

- Each `term` is an approved technical noun or technical verb. The checker compares in lowercase, so uppercase and lowercase letters are the same.
- Each entry is a term string, or an object with a `term` string. An entry with no term text stops the run. The message names the entry, so the `unapproved` synonyms of the entry stay in the file.
- Each `unapproved` synonym is flagged, and the message names the approved term (rule 1.11).
- `meaning` is optional. Give one when the word can have a different meaning in the domain of a different team. It is how the checker tells "the same word for the same thing" (a harmless copy) from "the same word for a different thing" (a conflict). Two meanings are equal when the only differences are uppercase or lowercase letters, spacing, or a period at the end.

Write the file as strict JSON: double quote marks, no comments, no trailing commas. If a glossary file is not valid JSON, the script stops and names the file. For most syntax errors, the message also gives the line and column of the error. An empty file, or a file that does not start as JSON, gives no position. A glossary written in YAML stops the run with a message that says the file must be JSON.

## The rules between the two levels

There is no precedence. A project glossary must not contradict the organization glossary:

1. It must not list an organization term as `unapproved`.
2. It must not list as a term a word that the organization lists as an unapproved synonym.
3. It must not point a synonym at a different term than the organization does.
4. It must not give an organization term a different `meaning`.
5. A file must not list a word as a term and as an unapproved synonym of a different term.

Each of these is a conflict. `node <skill>/scripts/docs_check.mjs glossary docs/anchored-docs/` reports it and exits 1, and `ste_check.mjs` fails with a mechanical `1.8` finding. A project that must use a shared word for a different thing picks a different name. A project term that turns out to be shared moves up into the organization file, and you ship a new copy of the skill.

A project entry that only gives an organization term again is a notice. Delete the entry, or move its other synonyms to the organization glossary.

## Keep the organization glossary outside the skill

Set `STE_ORG_GLOSSARY=/path/to/org-glossary.json` in the environment the agents run in. The checker uses that path and not the file in the skill. If the path is not valid, the checker uses the file in the skill.

## Starter list for the organization glossary

With the ASD-STE100 agent pack installed, the official dictionary rejects these software words that occur frequently. The checker fails them until a glossary lists them. Most organizations want them approved one time, in the organization file, and not in each project.

Copy the entries that your organization uses as its own terms and delete the remaining entries. Do not add a word only to stop a failure in sentences where an approved word gives the same meaning. The `dictionary says` column shows what the official dictionary prefers.

| Term | Type | Dictionary says |
| --- | --- | --- |
| `build` | noun (meaning: `the compiled artifact of a repository`) | structure |
| `log` | noun | record |
| `request` | noun | (verb) tell, write |
| `anchor` | noun | (verb) attach |
| `job` | noun | work, task |
| `stage` | noun | step |
| `option` | noun | alternative |
| `setting` | noun | adjustment |
| `variable` | noun | (verb) change |
| `run` | verb (meaning: `start a program or pipeline and let it complete`) | operate |
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

The dictionary does not know some other words at all (`commit`, `merge`, `cache`, `queue`, `endpoint`, `payload`, `schema`, `pipeline`, `server`, `client`, `repository`). They only cause a warning. Add the ones your organization shares, so rule 1.11 holds them to one name everywhere.
