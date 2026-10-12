---
type: Decision
date: 2026-01-10
title: "0001: use a queue"
description: Orders go through a queue.
diataxis: explanation
status: stable
sources:
  - id: evidence
    resource: src/Orders/OrderService.cs
generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }
verified:
  - { by: human:pat, at: 2099-01-01T00:00:00Z }
---
# 0001: use a queue

The team chose a queue. The queue holds the order until the worker is ready.
