---
type: Decision
date: <YYYY-MM-DD>
title: <NNNN: short decision title>
description: <One sentence: the decision.>
diataxis: explanation
status: stable
sources:
  - id: evidence
    resource: <path to the code or commit that shows this decision>
generated: { by: <producer>/<version>, at: <YYYY-MM-DDThh:mm:ssZ> }
verified:
  - { by: <producer>/<version>, at: <YYYY-MM-DDThh:mm:ssZ> }
---

# <NNNN: short decision title>

- Decision status: <proposed | accepted | superseded by NNNN>
- Date: <YYYY-MM-DD>

## Context

<The forces at play and the problem to decide. The constraints, requirements, or trade-offs that made a decision necessary.>

## Decision

<The decision, in the active voice. "We will ...".>

## Consequences

<What becomes easier and what becomes harder. Include the disadvantages.>

## Notes

<After acceptance, do not rewrite this record. If the decision changes, add a new ADR and set this one to "superseded by NNNN". The `date:` key above makes ripwire treat stale anchors in this file as a dated record, not live drift.>
