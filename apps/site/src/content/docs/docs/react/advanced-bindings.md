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

All bindings automatically set ARIA attributes for accessibility. Like `form.getErrors()`, they expose a field's errors only once the errors have been reported; see [Smart Error Reporting](/docs/form/error-reporting/) for when that happens.

`ErrorText` shows the same errors on the page. It renders a `<span data-error-text>` holding a `<span>` for each field with errors, which holds a `<span>` per message, and nothing while there are none; style it through the attribute, or pass a `className`.

```tsx
import { ErrorText } from "@mobx-sentinel/react";

// Binding sets aria-invalid and aria-errormessage automatically
<input {...form.bindInput("email", { /* ... */ })} />
<ErrorText form={form} fields={["email"]} />

// One text for a row of fields
<ErrorText form={form} fields={["city", "region", "postalCode"]} />
```

While a field's errors are reported, the standard bindings point its form control at the field's `<span>` with `aria-describedby`, so assistive technologies read the messages with the control. A custom binding can do the same with `errorTextId(field)`, the `<span>`'s id. Show each field in one error text, so that the id stays unique on the page. An `aria-describedby` of your own goes to the binding, which puts the error text after it:

```tsx
<input {...form.bindInput("email", { /* ... */ "aria-describedby": "email-hint" })} />
```
