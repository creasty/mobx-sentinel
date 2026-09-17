---
title: "Standard Bindings"
description: "Bind inputs, text areas, checkboxes, radio groups, select boxes, submit buttons and labels to a form."
sidebar:
  order: 2
---

These pre-built bindings are designed for native HTML form elements (`<input>`, `<textarea>`, `<select>`, `<button>`, `<label>`) with accessibility in mind.

All binding methods are called on the form instance and automatically handle:

- Two-way data binding between model and UI
- Change tracking and touched state
- Error state management
- ARIA attributes for accessibility

## Setup

To use the convenient `bindInput()`, `bindCheckBox()`, etc. methods, import the extension:

```tsx
import "@mobx-sentinel/react/extension";
```

This extends the `Form` class with custom bind methods. Without the extension, you can still use the default `bind()` method with binding classes:

```tsx
// With extension
form.bindInput("username", config)

// Without extension
form.bind("username", InputBinding, config)
```

## Accessibility

All bindings provide built-in accessibility features:

- **Unique IDs** — Automatically generates unique `id` attributes for form elements, enabling proper label associations by `htmlFor` (see [Element IDs](/docs/form/bindings/#element-ids))
- **Error states** — Sets `aria-invalid` once a field's errors are reported (see [Smart Error Reporting](/docs/form/error-reporting/))
- **Error messages** — Provides `aria-errormessage` linking to error text for screen readers

These features ensure forms are accessible to users of assistive technologies without additional configuration.

## Text Input: `form.bindInput(fieldName, config)`

Binds text, number, or date input fields. Typing makes intermediate changes, which are finalized, and their errors reported, when the input loses focus or after a pause (`autoFinalizationDelayMs`).

**String inputs:**
```tsx
import { observer } from "mobx-react-lite";

const MyForm = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <input
      type="text"
      {...form.bindInput("username", {
        getter: () => model.username,
        setter: (v) => (model.username = v),
      })}
    />
  );
});
```

**Number inputs:**
```tsx
<input
  {...form.bindInput("age", {
    type: "number", // Optional: auto-detected from valueAs
    valueAs: "number",
    getter: () => model.age,
    setter: (v) => (model.age = v ?? 0),
  })}
/>

// Optional number field
<input
  {...form.bindInput("score", {
    valueAs: "number",
    getter: () => model.score,
    setter: (v) => (model.score = v), // null when empty
  })}
/>
```

**Date inputs:**
```tsx
<input
  {...form.bindInput("birthday", {
    type: "date", // Optional: auto-detected from valueAs
    valueAs: "date",
    // Getter must return formatted string
    getter: () => model.birthday.toISOString().split("T")[0],
    // Setter receives Date object
    setter: (v) => (model.birthday = v ?? new Date(0)),
  })}
/>

// Also supports: datetime-local, time, week, month
<input
  {...form.bindInput("appointmentTime", {
    type: "datetime-local",
    valueAs: "date",
    getter: () => model.time?.toISOString().slice(0, 16) ?? null,
    setter: (v) => (model.time = v),
  })}
/>
```

## Text Area: `form.bindTextArea(fieldName, config)`

Binds multi-line text fields. It reports errors the same way as a text input: typing makes intermediate changes, which are finalized when the text area loses focus or after a pause.

Attributes that only shape the element, such as `rows` and `placeholder`, go on the element itself.

```tsx
<textarea
  rows={4}
  placeholder="Anything else we should know"
  {...form.bindTextArea("notes", {
    getter: () => model.notes,
    setter: (v) => (model.notes = v),
  })}
/>

// Optional text field
<textarea
  {...form.bindTextArea("comment", {
    getter: () => model.comment,
    setter: (v) => (model.comment = v || null), // null rather than "" once emptied
  })}
/>
```

## Checkbox: `form.bindCheckBox(fieldName, config)`

Binds checkbox inputs for boolean values.

```tsx
<input
  {...form.bindCheckBox("subscribe", {
    getter: () => model.subscribe,
    setter: (v) => (model.subscribe = v),
  })}
/>

// Optional boolean field
<input
  {...form.bindCheckBox("agreedToTerms", {
    getter: () => model.agreedToTerms ?? false,
    setter: (v) => (model.agreedToTerms = v),
  })}
/>
```

## Radio Group: `form.bindRadioGroup(fieldName, config)`

Binds a group of radio buttons. The binding function returns a function that takes an option and returns the props of its radio button.

The type of the options is inferred from the getter, and the setter receives the option of the selected button as it is, so no cast is needed.

**Additional accessibility:** Each radio button receives a proper `name` attribute for grouping, and error ARIA attributes are applied to all buttons in the group when errors occur.

```tsx
enum Role {
  ADMIN = "ADMIN",
  USER = "USER",
  GUEST = "GUEST",
}

const MyForm = observer(({ model }) => {
  const form = Form.get(model);
  const bindRole = form.bindRadioGroup("role", {
    getter: () => model.role, // Role
    setter: (v) => (model.role = v), // v: Role
  });

  return (
    <div>
      {Object.values(Role).map((role) => (
        <label key={role}>
          <input {...bindRole(role)} />
          {role}
        </label>
      ))}
    </div>
  );
});

// With custom IDs for each button
<input {...bindRole(Role.ADMIN, { id: "role-admin" })} />
<input {...bindRole(Role.USER, { id: "role-user" })} />
```

**Other types of options:** Options can be strings, numbers, booleans or `null`. A button's `value` attribute is the string form of its option, but the setter receives the option itself.

```tsx
// An optional field with a button for null, which is checked while the model holds null
const bindPlan = form.bindRadioGroup("plan", {
  getter: () => model.plan, // Plan | null
  setter: (v) => (model.plan = v), // v: Plan | null
});
<input {...bindPlan(null)} />

// Booleans
const bindAgreed = form.bindRadioGroup("agreed", {
  getter: () => model.agreed, // boolean
  setter: (v) => (model.agreed = v), // v: boolean
});
<input {...bindAgreed(true)} />
<input {...bindAgreed(false)} />
```

**Rendering the options:** `renderRadioGroup()` renders a radio button for each option. It needs no variable for the binding, and no `key` for each option.

```tsx
import { renderRadioGroup } from "@mobx-sentinel/react";

{renderRadioGroup({
  binding: form.bindRadioGroup("role", {
    getter: () => model.role,
    setter: (v) => (model.role = v),
  }),
  options: Object.values(Role),
  renderOption: (role, bind, index) => (
    <label>
      <input {...bind({ id: index === 0 })} />
      {role}
    </label>
  ),
})}
```

## Select Box: `form.bindSelectBox(fieldName, config)`

Binds select elements for single or multiple selection.

**Additional accessibility:** For multiple selection, `aria-multiselectable` is automatically set. Ensure `<option>` elements have meaningful labels.

**Single selection:**
```tsx
<select
  {...form.bindSelectBox("country", {
    getter: () => model.country.code,
    setter: (v) => (model.country = findCountry(v)),
  })}
>
  {countries.map((c) => (
    <option key={c.code} value={c.code}>
      {c.name}
    </option>
  ))}
</select>
```

**Multiple selection:**
```tsx
<select
  {...form.bindSelectBox("tags", {
    multiple: true,
    getter: () => model.tags.map((t) => t.id),
    setter: (codes) => (model.tags = codes.map(findTag)),
  })}
>
  {availableTags.map((tag) => (
    <option key={tag.id} value={tag.id}>
      {tag.name}
    </option>
  ))}
</select>
```

## Submit Button: `form.bindSubmitButton(config?)`

Binds submit buttons with automatic state management. The button is automatically disabled when the form is invalid, submitting, or validating. Hovering it reports every error of the form, even while it is disabled, so users can see what keeps them from submitting (see [Smart Error Reporting](/docs/form/error-reporting/)).

**Additional accessibility:** Sets `aria-busy` to indicate loading states during submission or validation. The `disabled` attribute prevents submission of invalid forms, providing clear feedback to assistive technologies about the form's current state.

```tsx
<button {...form.bindSubmitButton()}>
  Submit
</button>
```

**Unchanged forms:** The button is enabled whether or not the form is dirty, so a form with pre-filled values can be submitted as it is. When submitting unchanged values makes no sense, as with the save button of an edit form, set `disableUnlessDirty` to keep the button disabled until the form is dirty:

```tsx
<button {...form.bindSubmitButton({ disableUnlessDirty: true })}>
  Save changes
</button>
```

- **It adds to the other conditions.** Once the form is dirty, the button is still disabled while the form is invalid, submitting, or validating.
- **The form becomes dirty** when its `Watcher` detects a change in the model or in a nested model (see [Basic Change Tracking](/docs/core/watcher/#basic-change-tracking)), or when `form.markAsDirty()` is called. Changes made inside [`unwatch()`](/docs/core/watching-changes/#temporarily-disable-tracking), such as loading saved data into the model, don't count. Changing a value back doesn't make the form clean again.
- **It becomes clean again** on `form.reset()`, which a successful submission also runs. The button is then disabled until the next change, so the same values aren't submitted twice.
- **Only the button waits.** `form.canSubmit` doesn't check whether the form is dirty, so calling `form.submit()` from your own code submits an unchanged form. A click that still reaches `onClick` while the button waits, for example on a component that ignores `disabled`, doesn't submit the form.
- **The option can change between renders.** Each call to `bindSubmitButton()` replaces the config, so a component shared by a create form and an edit form can pass `disableUnlessDirty: isEditing`.

## Label: `form.bindLabel(fieldNames, config?)`

Binds label elements to form fields with error state display. Can associate with single or multiple fields.

**Additional accessibility:** Automatically sets the `htmlFor` attribute to match the associated input's `id`, creating a proper semantic connection. This enables users to click the label to focus the input and ensures screen readers announce the label when the input receives focus.

```tsx
// Single field
<label {...form.bindLabel(["username"])}>
  Username
</label>

// Multiple fields (shows first error)
<label {...form.bindLabel(["firstName", "lastName"])}>
  Full Name
</label>

// Custom htmlFor
<label {...form.bindLabel(["email"], { htmlFor: "email-input" })}>
  Email Address
</label>
```
