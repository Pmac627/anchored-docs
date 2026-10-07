---
type: Overview
title: Overview
description: <One sentence: what this system is and who it is for.>
diataxis: explanation
status: draft
sources:
  - id: readme
    resource: README.md
  - id: entry
    resource: src/<Entry file>
generated: { by: <producer>/<version>, at: <YYYY-MM-DDThh:mm:ssZ> }
verified:
  - { by: <producer>/<version>, at: <YYYY-MM-DDThh:mm:ssZ> }
---

# Overview

## What this system is

<Two or three sentences in business terms. The problem it solves and for whom. No implementation detail.>

## Who uses it

<The actors and the systems that call it: end users, internal services, scheduled jobs, partners.>

## System context

```mermaid
C4Context
    title System context
    Person(user, "User", "Who uses the system")
    System(sys, "<This system>", "What it does")
    System_Ext(ext, "<External system>", "Dependency or partner")
    Rel(user, sys, "Uses")
    Rel(sys, ext, "Calls")
```

## Boundaries

<What is in scope and what is out of scope, so a reader knows where the responsibilities of this system end.>

## Where to go next

- [Architecture](architecture.md) for the internal shape.
- [Flows](flows/index.md) for end-to-end behavior.
