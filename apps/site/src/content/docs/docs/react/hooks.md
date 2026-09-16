---
title: "Hooks"
description: "Reset a form when its component mounts, and subscribe to form events."
sidebar:
  order: 1
---

## `useFormAutoReset(form)`

Automatically resets the form when the component mounts and unmounts. This is useful for cleaning up form state when navigating between pages or showing/hiding form components.

```tsx
import { observer } from "mobx-react-lite";
import { useFormAutoReset } from "@mobx-sentinel/react";

const MyFormComponent = observer(({ model }) => {
  const form = Form.get(model);

  // Auto-resets form on mount/unmount
  useFormAutoReset(form);

  return <div>{/* your form fields */}</div>;
});
```

## `useFormHandler(form, event, handler)`

Adds a submission handler (`willSubmit`, `submit` or `didSubmit`) to the form with automatic cleanup. The handler is automatically removed when the component unmounts. No need to memoize the handler - it's stored in a ref internally and always uses the latest version.

It's just a wrapper for `form.addHandler()`. See [Submitting Forms](/docs/form/submission/#submitting-forms) for what each handler is for and what the `submit` handler's return value means.

```tsx
import { observer } from "mobx-react-lite";
import { useFormHandler } from "@mobx-sentinel/react";

const MyFormComponent = observer(({ model, onSuccess }) => {
  const form = Form.get(model);

  // No need to memoize - the hook handles it
  useFormHandler(form, "submit", async (abortSignal) => {
    await saveToAPI(model, abortSignal);
    return true; // The submission succeeded: didSubmit receives true and the form resets
  });

  // Receives the outcome once the submission finishes
  useFormHandler(form, "didSubmit", (succeed) => {
    if (succeed) onSuccess(); // Only on success, and always with the latest onSuccess callback
  });

  return <div>{/* your form fields */}</div>;
});
```
