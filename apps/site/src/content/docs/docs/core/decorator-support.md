---
title: "Decorator Support"
description: "Which decorator implementations mobx-sentinel's annotations work with."
sidebar:
  order: 8
---

This library supports both stage-2 and stage-3 decorators.

- **Stage-2 (202112)**: The legacy decorator syntax supported by TypeScript with `"experimentalDecorators": true`
- **Stage-3 (202203)**: The standardized decorator syntax supported by modern TypeScript without experimental flags

You can use either decorator version depending on your TypeScript configuration. All decorators in this library work with both standards.
