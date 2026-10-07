---
type: Architecture
title: Architecture
description: The container view of the orders system.
diataxis: explanation
status: draft
sources:
  - id: orders
    resource: src/Orders/**
  - id: spec
    resource: https://example.com/spec
generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }
verified:
  - { by: claude/1.0, at: 2026-01-10T10:00:00Z }
---
# Architecture

The API sends each order to the queue. The worker reads the queue.

```mermaid
flowchart LR
  Api --> Queue --> Worker
```
