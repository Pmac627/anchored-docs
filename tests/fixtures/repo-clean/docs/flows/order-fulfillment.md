---
type: Flow
title: Order fulfillment
description: How an order moves from the client to the warehouse.
diataxis: explanation
status: stable
sources:
  - id: service
    resource: src/Orders/OrderService.cs
generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }
verified:
  - { by: human:pat, at: 2099-01-01T00:00:00Z }
---
# Order fulfillment

The client calls `Send` on `OrderService`. The service sends the order to the queue. The worker reads the queue. The worker sends the order to the warehouse.
