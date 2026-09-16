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

```tsx
// Binding sets aria-invalid and aria-errormessage automatically
<input {...form.bindInput("email", { /* ... */ })} />

// Optionally display errors manually (empty until reported)
{Array.from(form.getErrors("email"), (error, i) => (
  <p className="error" key={i}>{error}</p>
))}
```
