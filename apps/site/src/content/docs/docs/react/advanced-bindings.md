---
title: "Advanced Bindings"
description: "Extend a binding's event handlers, set custom IDs, and display errors."
sidebar:
  order: 3
---

## Extending Event Handlers

All bindings support extending the default event handlers:

```tsx
<input
  {...form.bindInput("email", {
    getter: () => model.email,
    setter: (v) => (model.email = v),
    onChange: (e) => console.log("Changed:", e.currentTarget.value),
    onFocus: (e) => console.log("Focused"),
    onBlur: (e) => console.log("Blurred"),
  })}
/>

<input
  type="checkbox"
  {...form.bindCheckBox("terms", {
    getter: () => model.terms,
    setter: (v) => (model.terms = v),
    onChange: (e) => console.log("Checked:", e.currentTarget.checked),
  })}
/>
```

## Custom IDs

By default, bindings use auto-generated field IDs. You can override them:

```tsx
<input
  {...form.bindInput("username", {
    id: "custom-username-input",
    getter: () => model.username,
    setter: (v) => (model.username = v),
  })}
/>
```

## Error Display

`ErrorText` renders the errors of fields once they have been reported, as `form.getErrors()` returns them; see [Smart Error Reporting](/docs/form/error-reporting/) for when that happens. It renders a `<span data-error-text>` holding one `<span>` per message, and nothing while there are none. Style it through the attribute, or pass a `className`.

```tsx
import { ErrorText } from "@mobx-sentinel/react";

<input {...form.bindInput("email", { /* ... */ })} />
<ErrorText form={form} fields={["email"]} />

// One text for a row of fields
<ErrorText form={form} fields={["city", "region", "postalCode"]} />
```

The bindings set `aria-invalid`, but they don't point an input at its messages. To have assistive technologies read the messages with the input, give the text an `id` and reference it:

```tsx
<input aria-describedby="email-error" {...form.bindInput("email", { /* ... */ })} />
<ErrorText form={form} fields={["email"]} id="email-error" />
```
