---
title: "Configuration"
description: "Configure a form, or every form at once."
sidebar:
  order: 3
---

Configure forms globally or per-instance:

```ts
import { configureForm } from '@mobx-sentinel/form';

// Global configuration (affects all forms)
configureForm({
  autoFinalizationDelayMs: 2000, // delay before intermediate input is finalized
  allowSubmitInvalid: true, // allow submitting invalid forms
});

// Reset global configuration
configureForm(true);

// Per-form configuration (overrides global)
form.configure({
  autoFinalizationDelayMs: 5000,
  allowSubmitInvalid: false,
});

// Reset per-form configuration
form.configure(true);

// Access current configuration
form.config; // Readonly<FormConfig>
```
