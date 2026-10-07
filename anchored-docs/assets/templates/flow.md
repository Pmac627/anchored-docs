---
type: Flow
title: <Flow name, for example Order fulfillment>
description: <One sentence: what this flow does, in business terms.>
diataxis: explanation
status: draft
sources:
  - id: <area-src>
    resource: src/<Area>/**
  - id: <entry-src>
    resource: src/<Entry file>
generated: { by: <producer>/<version>, at: <YYYY-MM-DDThh:mm:ssZ> }
verified:
  - { by: <producer>/<version>, at: <YYYY-MM-DDThh:mm:ssZ> }
tags: []
---

# <Flow name>

## Purpose

<One short paragraph: what this flow does and why it exists, in business terms. No steps here.>

## Entry points

<Where the flow starts, with the real symbol in backticks. For example: `POST /orders`, handled by `Submit` on `OrdersController`.>

## Sequence

```mermaid
sequenceDiagram
    actor Caller
    participant API as OrdersController
    participant Svc as OrderService
    participant Store as OrderRepository
    Caller->>API: Submit(request)
    API->>Svc: SubmitAsync(request)
    Svc->>Store: SaveAsync(order)
    Store-->>Svc: saved
    Svc-->>API: result
    API-->>Caller: 200 + result
```

## Key behavior

<One bullet per rule, each anchored to the symbol it lives in. For example: `SubmitAsync` on `OrderService` deduplicates a retried submission on `CorrelationKey`. Write a constant as `kName` = N so ripwire can compare it.>

## Failure modes

<The unhappy paths, read from the code: validation failures, retries, timeouts, partial failure. Name the symbol that handles each.>

## Decisions

<Links to ADRs in ../decisions/, if any.>

## Source references

<The main files and symbols this flow lives in, so a reader can check the doc against the code. For example: `src/Orders/OrderService.cs`, `src/Orders/OrderRequest.cs`.>
