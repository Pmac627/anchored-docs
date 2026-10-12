# ASD-STE100 for developer documentation

ASD-STE100 Simplified Technical English, Issue 9 (2025-01-15), is the writing standard for all prose in `docs/anchored-docs/`. The standard has two parts: 53 writing rules in 9 sections, and a dictionary of about 900 approved words. Each word has one meaning and one `part of speech`. You can download the standard at no cost from https://www.asd-ste100.org. ASD holds the copyright, so you must not redistribute it. This file paraphrases the rules in this skill's own words and adapts them to software documentation. If this file and the official text are different, the official text controls.

Read this file before you write. Run `scripts/ste_check.mjs` after you write. The checker proves the mechanical rules. For the other rules, it gives only a warning (see "What the checker does" below).

## Table of contents

0. With the agent pack installed: what to read `instead`
1. Why STE for docs an agent `maintains`
2. Technical nouns and technical verbs in a software repo
3. What is `exempt`
4. Procedural or descriptive: which cap applies
5. The 53 rules, by section
6. General recommendations GR-1 to GR-8
7. `Common` non-STE words in `developer` prose
8. What the checker does, and the waiver marker

## 0. With the agent pack installed: what to read instead

The ASD-STE100 agent pack is a machine-readable derivation of the official Issue 9 PDF. The pack has the 53 rules with the spec's own explanations and Non-STE / STE example pairs. The pack also has the full dictionary as JSON and TSV, the technical categories, and an enforcement checklist. A tool makes the pack from a registered copy of the spec, and this skill does not include the pack. `INSTALL.md` says how to get it. When the pack is at `<skill>/references/asd-ste100-agent-pack/` (or at `STE_AGENT_PACK`), `ste_check.mjs --status` says `pack`.

With the pack, use the text of the pack and not the paraphrase in this file:

| Your question | Read in the pack | Alternative to |
| --- | --- | --- |
| The 53 rules, verbatim, before you write | `rules/ste-rules-summary.md` (about 1.7K tokens) | section 5 here |
| Hard checks and the limits table | `rules/enforcement-checklist.md` | section 8 here |
| The explanation and examples behind one rule | `rules/section-N-*.md` for that section only | nothing here has them |
| Is a word approved, and what is the alternative | `node <skill>/scripts/ste_check.mjs --lookup WORD`, or `dictionary/unapproved-lookup.tsv` | section 7 here |
| Can an unknown word be a technical noun or verb | `rules/technical-categories.md` | section 2 here |

Sections 2, 3, 4, and 7 of this file are the software adaptation and they also apply with the pack. Do not load the full `dictionary/ste-dictionary.json` (about 200K tokens). The checker queries it for you through `--lookup`. Without the pack, this file is the reference, and the checker does not do a full word check.

## 1. Why STE for docs an agent maintains

Non-native readers, agents, and translation systems read the docs. STE removes the three things that cost all of them. These are synonyms with drifting meanings, long sentences with buried conditions, and verb constructions that hide who does what. A flow doc in STE reads like a specification. This helps an agent to select if it can trust the doc and not the code.

## 2. Technical nouns and technical verbs in a software repo

STE rule 1.1 lets you use three types of word: words approved in the dictionary, technical nouns, and technical verbs. The dictionary does not list technical nouns and verbs, because each subject field has its own. Yours are in two files that the checker reads together. The first is the organization glossary in the skill (`references/org-glossary.json`) for shared vocabulary. The second is `docs/anchored-docs/_glossary.json` for the terms of this repository. `references/conventions.md`, "The glossary: two levels", has the rules that keep the two from contradicting each other.

**Technical nouns** (rule 1.5, category 19 "Computer science, information and communication technology", plus categories 6, 7, 15): components, flows, symbols, types, files, commands, flags, protocols, `products`, data formats, error names. `call graph`, PageRank, `OrderService`, `--doc-drift`, `CMake`, `OAuth 2.0`, `JSON`, `idempotency key`.

**Technical verbs** (rule 1.12, category 2 "Computer processes and applications"). Examples are `boot`, `click`, `copy`, `debug`, `delete`, `deploy`, `disable`, `download`, `enable`, `encrypt`. More examples are `enter`, `filter`, `format`, `install`, `load`, `open`, `paste`, `press`, `print`, `process`, `reboot`. Other examples are `save`, `scroll`, `sort`, `store`, `type`, `update`, `upgrade`, `upload`, `validate`, `zoom in`. Add the operations of the domain to the glossary (`ingest`, `rank`, `serialize`, `migrate`, `rollback`).

Rules for these two types of word:
- Use the technical noun the code uses (1.8). One noun for each item, everywhere (1.11). Do not write "the store" in one paragraph and "the repository" in the next.
- Do not use a technical noun as a verb (1.7). Do not write "cache the result" if `cache` is your noun. Write "put the result in the cache". Do not use a technical verb as a noun (1.13).
- Keep a multi-word noun to three words (2.1). Write a longer official name in full one time. Then use a short name or an abbreviation (2.2). Hyphenate words that work as one unit (`read-only`, `call-graph edge`). A hyphenated word counts as one.
- No slang or jargon as technical nouns (1.10): not "brick", "nuke", "yak-shave", "bikeshed".
- Use a technical verb only when no approved verb says it (1.12). Use "find" and not `detect`, unless detection is the technical operation.

## 3. What is exempt

The checker skips these regions. You can write freely in them:

- Fenced code blocks and inline code spans (`` ` ``). Ripwire uses names in backticks as symbol anchors, so the two tools agree.
- File paths, URLs, command lines, flags, environment variables, and tool output (rule 1.5 category 10, `quoted text`).
- Headings and list titles, where an `-ing` word is a technical noun (`Testing`, `Handling`).
- Frontmatter, Mermaid blocks, HTML comments, tables' code cells.
- Names of a `product`, an organization, a person, or a standard (8.6).

Everything else in the body is prose and follows the rules.

## 4. Procedural or descriptive: which cap applies

- `diataxis: how-to` or `tutorial` → the doc is **procedural**: 20 words for each sentence (5.1), instructions as commands (5.3), one instruction for each sentence (5.2).
- `diataxis: explanation` or `reference` → **descriptive**: 25 words for each sentence (6.1), 6 sentences for each paragraph (6.6), active voice, unless the doer is not known (3.6).
- In a doc, an ordered list of steps is procedural. An unordered list of facts is descriptive.
- Safety-style callouts (WARNING, CAUTION, NOTE) follow section 7.

## 5. The 53 rules, by section

Rule numbers are Issue 9. The checker does a mechanical check of a rule marked **[M]**. A rule marked **[H]** is a heuristic warning. A rule marked **[J]** is judgment only.

### Section 1: Words (1.1 to 1.14)

- **1.1 [M with the pack or a word list, H without]** Use only approved words, technical nouns, and technical verbs. With the agent pack, an unapproved dictionary word fails, and the checker shows its alternatives. An unknown word gives a warning as a technical-noun candidate (1.5, 1.12). Example words from the computer, engineering, and documentation categories are accepted. With only `STE_DICTIONARY`, each word that is not in the list fails. Without the pack and without `STE_DICTIONARY`, the checker uses only the built-in non-STE list.
- **1.2 [J]** Use an approved word only as its approved `part of speech`. `test` is a noun: "do a test", not "test the system".
- **1.3 [J]** Use an approved word only with its approved meaning. `follow` means "come after", so "obey the instructions", not "follow the instructions".
- **1.4 [J]** Use a verb or an adjective only as the dictionary lists it.
- **1.5, 1.6 [J]** You can use a word that is not approved only as a technical noun or part of one. The noun must be in one of the 22 categories. For software, categories 6, 7, 15, and 19 cover almost everything.
- **1.7 [J]** Do not use a technical noun as a verb.
- **1.8 [M through the glossary]** Use the technical nouns approved for this organization and this project. The checker reports a contradiction between the organization glossary and the project glossary for this rule.
- **1.9 [J]** When you must pick a technical noun, pick a short, clear one (three words or less).
- **1.10 [J]** Do not make a technical noun from slang, jargon, or a regional word.
- **1.11 [M through the glossary]** One technical noun for each item. The glossary's `unapproved` lists are the check.
- **1.12 [J]** You can use a technical verb if it names an operation of the domain. Prefer an approved verb when one says the same thing.
- **1.13 [J]** Do not use a technical verb as a noun.
- **1.14 [J]** American English spelling.

### Section 2: Multi-word nouns (2.1, 2.2)

- **2.1 [H]** No more than three words in a multi-word noun. "cache entry expiry time limit" becomes "time limit for the expiry of a cache entry". The checker flags runs of four or more non-function words.
- **2.2 [J]** Write a technical noun of more than three words in full one time. Then use a short name or an abbreviation, or hyphenate the words that work as a unit.

### Section 3: Verbs (3.1 to 3.7)

- **3.1 [J]** Use only the verbs as the dictionary gives them.
- **3.2 [H]** Use only these: `infinitive`, `imperative`, `simple present`, `simple past`, `simple future`, and the `past participle` as an adjective. Do not use `present perfect` ("has adjusted"), `past perfect`, or `progressive` ("is adjusting").
- **3.3 [J]** The `past participle` is an adjective that gives a condition: "the disassembled unit", "the unit is disassembled". That is not passive voice.
- **3.4 [H]** No auxiliary verbs in complex constructions. `The value can be adjusted` becomes `You can adjust the value`. `The seat is to be installed` becomes `Install the seat`.
- **3.5 [H]** Use an `-ing` word only in a technical noun: as the full noun, or as a word in front of one ("the routing table", "Testing" as a heading). Not as a verb: `while the job runs`, not `while the job is running`. Approved `-ing` words: lighting, opening, routing, servicing, mating, missing, remaining, something, during.
- **3.6 [H]** Active voice. In descriptive writing, passive is permitted only when the agent is unknown: "During transmission, the data was corrupted" is correct STE. The test is the question "by whom or by what". If the doc can answer, write the agent as the subject.
- **3.7 [J]** Describe a task with a verb, not a noun: "the service retries", not `the service does a retry attempt` (unless `retry attempt` is your technical noun).

### Section 4: Sentences (4.1 to 4.5)

- **4.1 [J]** Write short, clear sentences. One topic for each sentence.
- **4.2 [M]** Keep the words "a", "an", and "the", and all verbs. Do not use contractions to make a sentence shorter. Do not write `don't`, `can't`, or `it's`.
- **4.3 [J]** Use a vertical list for complex text: sequences, conditions, more than two items.
- **4.4 [J]** Use connecting words and phrases to connect sentences with related topics ("Then", "Thus", "But", "As a result").
- **4.5 [H]** Where applicable, put "a", "an", "the", or a demonstrative adjective before a noun. "Read the configuration", not "Read configuration".

### Section 5: Procedural writing (5.1 to 5.5)

- **5.1 [M]** Procedural sentences: 20 words maximum. Count them as section 8 says.
- **5.2 [H]** Write one instruction in each sentence, unless two steps occur at the same time. "Build the tree and then run the gates" is two sentences.
- **5.3 [H]** Write instructions as commands: "Run the gates in the foreground", not `The gates should be run`.
- **5.4 [J]** A condition before a command is divided from it with a comma: `If the build is stale, rebuild with --clean-first.`
- **5.5 [J]** A NOTE gives information only. Do not put an instruction in a NOTE.

### Section 6: Descriptive writing (6.1 to 6.6)

Issue 9 revised this section's wording. These summaries follow the official subject-to-rule index. The official text controls.

- **6.1 [M]** Descriptive sentences: 25 words maximum.
- **6.2 [J]** Connect related sentences with connecting words and key phrases, so the reader can see the logic.
- **6.3 [J]** Change the length and construction of the sentences, but stay in the limits. A run of sentences of the same short length is hard to read also.
- **6.4 [J]** Use paragraphs to show the reader the logic of the text. One topic for each paragraph.
- **6.5 [J]** Start each paragraph with its topic sentence, and put the key words at the start.
- **6.6 [M]** No more than six sentences in a paragraph.

### Section 7: Safety instructions (7.1 to 7.3)

Used for callouts that prevent data loss, exposure of secret data, or a broken build.

- **7.1 [J]** Use a word that identifies the level of risk: WARNING (injury or data loss), CAUTION (damage or corruption), NOTE (information).
- **7.2 [J]** Start a safety instruction with a clear command or condition: "Do not configure a dev tree with `-DCMAKE_BUILD_TYPE=Release`."
- **7.3 [J]** Then give the risk or result: `Release defines NDEBUG, which compiles the degrade paths out.`

### Section 8: Punctuation and word count (8.1 to 8.7)

- **8.1 [M]** Use all standard punctuation but not the semicolon. Write two sentences.
- **8.2 [J]** Hyphens connect words that work as one unit.
- **8.3 [J]** Parentheses are permitted, for an aside or an abbreviation on first use.
- **8.4 [M]** In a vertical list, a colon ends the sentence for the word count. Each item has its own count.
- **8.5 [M]** Text in parentheses counts as one word.
- **8.6 [M]** Each of these counts as one word: a number with its unit (`8 MB`), an abbreviation or acronym, a title. Each of these also counts as one word: a `proper noun`, a `quoted text`, a code span, a path, a URL.
- **8.7 [M]** A hyphenated word counts as one word.

### Section 9: Writing practices (9.1 to 9.4)

- **9.1 [J]** When word-for-word replacement does not work, change the sentence construction. `The valve is operable` becomes `The valve can operate`.
- **9.2 [J]** Use each approved word correctly (1.2 and 1.3 restated).
- **9.3 [H]** No phrasal verbs. `Start the job`, not `spin up the job`. "Remove", not `take out`. The checker flags a list of phrasal verbs.
- **9.4 [J]** Consistent style: the same wording for the same idea, in all the text.

## 6. General recommendations GR-1 to GR-8

- **GR-1** Keep the conjunction "that" after verbs like "make sure": "Make sure that the tree is clean."
- **GR-2** Use "with" for accompaniment or instrument, not as a loose connector.
- **GR-3** Use pronouns only when the noun they replace is clear and near. Write the noun again if you are not sure.
- **GR-4** Do not start a sentence with a bare "This". Write "This flag", "This check".
- **GR-5** Avoid `false friends` for translators (words that look like a word in a different language but mean something else).
- **GR-6 [M]** No Latin abbreviations: not `e.g.`, `i.e.`, `etc.`, `vs.`, `cf.`. Write "for example", "that is", "and so on", "against".
- **GR-7** Inclusive language. Use "they" or the role name.
- **GR-8** For possessives, prefer "the output of the tool" to "the tool's output" when the possessor is a thing. "The user's id" is correct for a person.

## 7. Common non-STE words in developer prose

The full substitution list is `scripts/ste_unapproved.tsv` (word, alternative, rule). A short sample, so you write STE from the start:

| Do not write | Write | Do not write | Write |
| --- | --- | --- | --- |
| `utilize` | use | `prior to` | before |
| `in order to` | to | `ensure`, `verify` | make sure that |
| `perform` | do | `commence`, `initiate` | start |
| `terminate` | stop | `retrieve`, `obtain`, `fetch` | get |
| `modify` | change | `indicate` | show |
| `require` | `need`, be necessary | `additionally` | also |
| `leverage` | use | `subsequently` | then |
| `approximately` | about | `attempt` | try |
| `currently` | `now` | `e.g.` / `i.e.` / `etc.` | for example / that is / and so on |
| `spin up` / `bring up` | start | `tear down` | remove, stop |
| `kick off` | start | `figure out` | find |

`check` and `test` are nouns in STE: "do a check", "do the leak test". `enter`, `enable`, `disable`, `delete`, `install`, `update`, `validate` are in the standard's computer-processes verb category and the checker accepts them. `detect` is not: the dictionary says `find`, so glossary `detect` only where detection is the technical operation.

The official dictionary rejects words that prose about software uses on each page. With the agent pack, each of these words is a mechanical failure. It stays a failure until `docs/anchored-docs/_glossary.json` lists it as a technical noun or verb, or you write the alternative:

| Word | Dictionary says | Word | Dictionary says |
| --- | --- | --- | --- |
| `run` | operate | `build (n, v)` | structure, assemble |
| `log (v)` | record | `call (v)` | tell |
| `return (v)` | go | `request (v)` | tell, write |
| `branch (v)` | divide | `anchor (v)` | attach |
| `job` | work, task | `stage` | step |
| `option` | alternative | `setting` | adjustment |
| `variable` | change (v) | `render` | make |
| `restart` | start | `should`, `would`, `may` | must, can, if |

Put in the glossary the words that the codebase uses as its own terms (`run` for a pipeline, `build` for the artifact, `log` for the log). Do this at the organization level when all repositories share them, which is normal for this table. Rewrite the ones that are only habit (`should` is `must` or a condition, `may` is `can`). Words that the dictionary does not know at all (`commit`, `merge`, `cache`, `queue`, `endpoint`, `payload`, `schema`, `pipeline`, `server`) give only a warning. But they belong in a glossary too. Then the warning goes away and rule 1.11 can hold them to one name.

## 8. What the checker does, and the waiver marker

`node <skill>/scripts/ste_check.mjs <path...>` reads each doc's `diataxis` to pick the limit, removes the regions that the checker skips, then checks.

Mechanical (exit 1 for a finding): a sentence longer than the limit, a paragraph of more than six sentences, a semicolon, or a contraction. Also a Latin abbreviation, a word or phrase on the built-in non-STE list, or a glossary `unapproved` synonym. The word source can add its own failures. With the agent pack, a dictionary word or phrase marked unapproved fails, and the checker reports it with the dictionary's alternatives. With `STE_DICTIONARY`, a word fails if it is not in the list, the glossary, or the code spans.

Heuristic checks (exit 0) give warnings with counts. The checks find passive voice, `-ing` words used as verbs, complex tenses, phrasal verbs, and noun clusters of four or more words. They also find two commands that "and" or "then" connect in one step. They find a step that does not start with a command verb, and a sentence that starts with a bare "This". With the pack, rule `1.5` gives one finding for each file that lists all the words the dictionary does not know (technical-noun candidates: glossary the ones the project uses). Also with the pack, rule `1.7` finds a word that the dictionary lets you use only as a technical noun or verb (`order`, `key`, `filter`).

Two helper commands work with the pack. `ste_check.mjs --status` prints the word source and the technical categories in force. `ste_check.mjs --lookup WORD...` prints the dictionary entry (approved meaning and word shapes, or the unapproved alternatives and help) and the technical category of an example word. Use `--lookup` before you replace a word, so that the replacement keeps the meaning (9.1).

Waive a sentence the checker misreads: put `<!-- ste-ok: <rule> <reason> -->` on the line before it. Example: `<!-- ste-ok: 3.6 agent unknown -->` before "During transmission, the data was corrupted." The checker skips that line for that rule and counts the waiver. Waive correct sentences, not slow rewrites.

The official dictionary is not shipped with this skill. The agent pack is necessary for the full word check (`INSTALL.md`, section "Add the ASD-STE100 agent pack"). A word list in `STE_DICTIONARY` (one approved word for each line, lowercase) is the weaker option, because it has no alternatives and no technical categories, so each unknown word fails. Without the pack and without `STE_DICTIONARY`, the checker checks rule 1.1 against the built-in list and the glossary only, and the self-report says `Docs-STE: pass (1.1 partial)`. The pack has its own `tools/ste_lint.mjs`, a reference tool for the hard checks. `ste_check.mjs` is the gate for this skill because it reads the OKF frontmatter, the glossary, the waivers, and source doc comments.
