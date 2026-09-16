---
title: "Hooks"
description: "Reset a form when its component mounts, prepare it for server-side rendering, and subscribe to form events."
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

## `useFormSSR(form)`

Prepares the form for server-side rendering, so the markup the server sends and the client render that hydrates it agree. A client-rendered app doesn't need it, and calling it there is harmless.

What it takes care of:

- **Element ids.** The ids the bindings render -- `id`, `htmlFor`, and a radio group's `name` -- build on React's `useId()` (see [Element IDs](/docs/form/bindings/#element-ids)). Without it they are unique but freshly generated in each process, and React reports a hydration mismatch. On unmount, the form gets its own id back, unless something else has assigned it another in the meantime.

```tsx
import { observer } from "mobx-react-lite";
import { useFormSSR } from "@mobx-sentinel/react";

const AddressForm = observer(({ model }) => {
  const form = Form.get(model);

  // Call it before any bind*()
  useFormSSR(form);

  return (
    <>
      <label {...form.bindLabel(["city"])}>City</label>
      <input {...form.bindInput("city", { getter: () => model.city, setter: (v) => (model.city = v) })} />
    </>
  );
});
```

It covers that one form. A sub-form is a separate instance, and the component that renders it calls the hook for itself -- so no component has to know whether an ancestor already did.

For ids of your own, such as an error message's, build on the field's: `` `${form.getField("city").stableId}:error` ``.

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
