# This folder holds the ASD-STE100 agent pack

The skill ships this folder empty apart from this file. The agent pack is derived from ASD's copyrighted
specification and cannot be redistributed with the skill, so you add it yourself.

When the pack is installed, this folder contains `README.md`, `rules/`, `dictionary/`, and `tools/`, and
`node <skill>/scripts/ste_check.mjs --status` says `pack`. Until then the checker falls back to
`STE_DICTIONARY` (a plain word list) and then to its built-in non-STE list, and reports `(1.1 partial)`.

How to get and install the pack: see `INSTALL.md` at the root of the skill, section
"Add the ASD-STE100 agent pack". You can leave this file in place after you install the pack.
