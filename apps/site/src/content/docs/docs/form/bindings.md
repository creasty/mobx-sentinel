---
title: "Bindings"
description: "What bindings are, how to use them in a view, how to add them to forms as methods, and the element ids they render."
sidebar:
  order: 5
---

Bindings connect form state to UI components. They encapsulate the logic for creating props that can be spread onto input elements.

The `@mobx-sentinel/form` package provides only the **API for creating bindings**—it does not include any pre-built binding implementations. You have two options:

1. **Use `@mobx-sentinel/react`** - Pre-built bindings for React components (InputBinding, CheckBoxBinding, SubmitButtonBinding, etc.)
2. **Build your own bindings** - Implement custom bindings for your framework or specific use cases

[Creating Binding Classes](/docs/form/custom-bindings/) and [Binding Examples](/docs/form/binding-examples/) demonstrate how to create custom bindings. The examples are based on the actual implementations in [@mobx-sentinel/react](https://github.com/creasty/mobx-sentinel/tree/main/packages/react/src).

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

## Adding Bind Methods

`form.bind()` works with any binding class. To call a binding as a method of the form instead, as in `form.bindInput(fieldName, config)` from `@mobx-sentinel/react`, add it with `extendFormBinding()` and declare the methods on `Form`:

```ts
import { extendFormBinding, FormBindingMethods } from "@mobx-sentinel/form";

export const myBindings = extendFormBinding({
  bindDropdown: DropdownBinding,
  bindRating: RatingBinding,
});

declare module "@mobx-sentinel/form" {
  interface Form<T> extends FormBindingMethods<T, typeof myBindings> {}
}
```

```tsx
<Dropdown
  {...form.bindDropdown("country", {
    getter: () => model.country,
    setter: (v) => (model.country = v),
  })}
/>
```

Each method binds its class with `form.bind()`, so a method and a `form.bind()` call share a binding when the class, the fields and the `cacheKey` are the same. The type of the method comes from the binding class:

- **What it binds to**, from the constructor's first parameter: a method for a `FormField` takes a field name, one for `FormField[]` a list of field names, and one for the `Form` neither.
- **The config**, from the constructor's second parameter. It is optional when none of its keys is required, and an omitted config reaches the binding as `{}`.
- **The return type**, the binding's `props`.

The methods are added when the module calling `extendFormBinding()` is imported, and forms created earlier get them too. Every form shares them, like the methods of a class, so call them on the form: a method taken off it, as in `const { bindDropdown } = form`, has no form to bind to.

A method name is `bind` followed by a capital letter, which keeps it apart from `Form`'s own members. Adding a name again replaces its method on every form, as when a module is reloaded.

### Generic Bindings

A generic binding class loses its type parameters in the derived method: they fall back to their constraints. Write the method of such a class by hand, as the third type argument, as `@mobx-sentinel/react` does for `bindRadioGroup()` to type the options after the getter:

```ts
declare module "@mobx-sentinel/form" {
  interface Form<T>
    extends FormBindingMethods<
      T,
      typeof myBindings,
      {
        bindChoice: <V extends string>(
          fieldName: FormField.Name<T>,
          config: ChoiceBinding.Config<V> & FormBindingFunc.Config
        ) => ChoiceBinding<V>["props"];
      }
    > {}
}
```

The method written by hand is checked against the one derived from the class. It may differ only in having type parameters of its own, so another config, subject or return type fails to compile, and so does a looser one, such as `fieldName: string`. Write the config with the binding's own types, as `ChoiceBinding.Config<V>` above, so that it follows changes to the class.

## Element IDs

A label and its control find each other through an id, so every field carries one: `field.stableId`, which the standard bindings put in `id`, `htmlFor`, and a radio group's `name`. The form has one too, `form.stableId`.

A form's stable id starts as its own identity, `form.id`, and until it is assigned another, each field's is its own identity too, `field.id`: unique on the page, but different in every process. That is all a client-rendered app needs.

Server-side rendering needs more, because the markup is built in one process and hydrated in another. Assign the form a stable id that both arrive at, and its fields' stable ids build on it:

```ts
form.stableId = `invoice-form-${invoice.id}`;
form.getField('customerEmail').stableId; // "invoice-form-42:customerEmail"
```

| | Until assigned | After `form.stableId = id` |
| --- | --- | --- |
| `form.stableId` | `form.id` | `<id>` |
| `field.stableId` | `field.id` | `<id>:<field name>` |

For anything that reaches the DOM, use `stableId` rather than `id`, so it keeps matching once the form's stable id is assigned.

The id is used as is, so nothing else on the page may use it. In React, [`useFormSSR`](/docs/react/hooks/#useformssrform) from `@mobx-sentinel/react` assigns `useId()`, which guarantees that: no other call returns the same value, so nothing in the model has to be involved. It gives the form its own id back when the component unmounts. A key from your own data works too, as long as it is unique on the page. Assign it before binding: bindings read the stable id as they are called, and it is not reactive.

A sub-form is a separate instance with its own stable id. Assign it where the sub-form is rendered, so no component has to know what its ancestors did.

A field's stable id contains `:`, which is fine for `htmlFor`, `aria-*` attributes and `document.getElementById()`. In a CSS selector, escape it with `CSS.escape()`.
