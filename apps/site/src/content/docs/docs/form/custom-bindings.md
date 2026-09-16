---
title: "Creating Binding Classes"
description: "Write a binding class that connects form fields to a UI element."
sidebar:
  order: 6
---

A binding class implements the `FormBinding` interface and can bind to:
- A single field
- Multiple fields
- The entire form

Bindings encapsulate the logic for connecting form state to UI components, managing field state changes, and handling user interactions.

## Working with Fields

Fields track individual input state and provide methods for managing user interactions:

```ts
const field = form.getField('email');

// Field state (all reactive)
field.isTouched; // user has focused the field
field.isChanged; // value has changed
field.isIntermediate; // typing in progress (partial input)

// Validation state
field.hasErrors; // boolean - has validation errors
field.errors; // Set<string> of error messages
field.isErrorReported; // undefined | false | true - for conditional display

// State management methods
field.markAsTouched(); // typically on focus
field.markAsChanged('intermediate'); // while typing
field.markAsChanged('final'); // on blur or enter
field.finalizeChangeIfNeeded(); // typically on blur
field.reportError(); // show errors to user
field.reset(); // clear all state
```

### Intermediate vs Final Changes

Fields distinguish between "intermediate" changes (typing in progress) and "final" changes (committed), so that a field's errors are first reported once its input is complete, not on the first keystroke. See [Smart Error Reporting](/docs/form/error-reporting/) for the behavior users experience.

Mark changes as "intermediate" while the user is typing to delay error reporting; validation itself keeps running as the model changes. Intermediate values automatically finalize after a delay (configurable via `autoFinalizationDelayMs`), or you can manually trigger `finalizeChangeIfNeeded()` to reflect changes immediately:

```ts
onChange={(e) => {
  model.email = e.target.value;
  field.markAsChanged('intermediate'); // Don't report errors yet
}}

onBlur={() => {
  field.finalizeChangeIfNeeded(); // Finalize and report errors
}}
```
