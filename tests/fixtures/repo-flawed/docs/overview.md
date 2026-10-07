---
type: Overview
title: Orders system overview
description: What the orders system does and who uses it.
diataxis: explanation
status: stable
sources:
  - id: api
    resource: src/Api/**
generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }
verified:
  - { by: human:pat, at: 2099-01-01T00:00:00Z }
---
# Overview

The system accepts orders from customers. It reserves stock for each order. The queue sends the order to the warehouse.

See the [scratch notes](tickets/scratch.md) for the open questions.

The web client calls the `callApi` function in `src/web/client.ts`.
