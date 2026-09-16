---
title: "Bindings"
description: "What bindings are, and how to use them in a view."
sidebar:
  order: 5
---

Bindings connect form state to UI components. They encapsulate the logic for creating props that can be spread onto input elements.

The `@mobx-sentinel/form` package provides only the **API for creating bindings**—it does not include any pre-built binding implementations. You have two options:

1. **Use `@mobx-sentinel/react`** - Pre-built bindings for React components (InputBinding, CheckBoxBinding, SubmitButtonBinding, etc.)
2. **Build your own bindings** - Implement custom bindings for your framework or specific use cases

The examples below demonstrate how to create custom bindings. They are based on the actual implementations in [@mobx-sentinel/react](/docs/react/).

## Using Bindings

Bindings are cached and reused. The same binding constructor with the same **binding key** returns the same instance. Configuration can be updated on subsequent calls while maintaining the same binding instance.

The binding key consists of three components:

- **Binding class** — e.g., InputBinding, LabelBinding, SubmitButtonBinding
- **Subject of binding** — a single field, multiple fields, or the entire form
- **User-specified key** (optional) — the `cacheKey` property in configuration

Use `form.bind()` to create binding props and spread them directly into components:

```tsx
const model = new User();
const form = Form.get(model);

{/* Bind to a single field */}
<input {...form.bind('email', InputBinding, {
  getter: () => model.email,
  setter: (value) => model.email = value,
})} />

{/* Bind with additional configuration */}
<input {...form.bind('password', InputBinding, {
  type: 'password',
  getter: () => model.password,
  setter: (value) => model.password = value,
})} />

{/* Bind to multiple fields */}
<label {...form.bind(['email', 'password'], LabelBinding)}>Credentials</label>

{/* Bind to the form */}
<button {...form.bind(SubmitButtonBinding)}>Submit</button>
```
