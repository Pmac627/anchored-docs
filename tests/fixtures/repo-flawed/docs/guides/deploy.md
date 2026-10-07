---
type: Guide
title: Deploy the worker
description: Steps to deploy the worker.
diataxis: how-to
status: stable
sources:
  - id: orders
    resource: src/Orders/**
generated: { by: claude/1.0, at: 2026-01-10T10:00:00Z }
verified:
  - { by: human:pat, at: 2099-01-01T00:00:00Z }
---
# Deploy the worker

## Steps

1. Open the file and then run the script and check the output.
2. The operator is going to click the button.
3. Stop the worker.
4. Do not utilize the old queue.
5. Start the worker.
6. Open the configuration file for the worker and change the value of the timeout setting so that it is larger than the time that the queue needs to hold a message.
