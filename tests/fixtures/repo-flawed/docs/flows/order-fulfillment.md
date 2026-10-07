---
type: Flow
title: Order fulfillment
description: How an order moves from the client to the warehouse.
diataxis: explanation
status: stable
sources:
  - id: service
    resource: src/Orders/OrderService.cs
  - id: area
    resource: src/Orders/**
generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }
verified:
  - { by: human:pat, at: 2099-01-01T00:00:00Z }
---
# Order fulfillment

This flow moves an order from the client to the warehouse. The client calls `SubmitAsync` on `OrderService`. The service validates the order. The service reserves stock. The queue sends the order to the warehouse.

## Key behavior

The order is submitted by the client and the service will have been running for several hours before the first message is sent to the warehouse queue worker.

Submitting the order starts the flow. This is slow. The order fulfillment queue worker timeout value is 30 seconds.

<!-- ste-ok: 8.1 the semicolon is part of an example -->
The service does not retry; the client must resend the order.

The system, which is utilized by the web client, can be leveraged prior to checkout; it doesn't retry failed requests, i.e. the client must resend them, etc.

Set up the queue and turn on the worker.

The consumer reads the checkpoint log. The packet holds the order.

The code is in `src/Orders/OrderService.cs:12` (`SubmitAsync`) and in the file at src/Orders/OrderValidator.cs.

The service checks the order. The service reserves the stock. The service writes the record. The service sends the message. The queue holds the message. The worker reads the message. The worker ships the order.

```mermaid
sequenceDiagram
  Client->>Service: SubmitAsync
```

| Step | Result |
| --- | --- |
| Validate | The order is checked. |
| Reserve | The stock is held for the order. |
