# mobx-sentinel/react

Utility hooks and standard bindings for React applications using `@mobx-sentinel/form`.

## Hooks

### `useFormAutoReset(form)`

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

### `useFormHandler(form, event, handler)`

Adds a lifecycle handler to the form with automatic cleanup. The handler is automatically removed when the component unmounts. No need to memoize the handler - it's stored in a ref internally and always uses the latest version.

It's just a wrapper for `form.addHandler()`.

```tsx
import { observer } from "mobx-react-lite";
import { useFormHandler } from "@mobx-sentinel/react";

const MyFormComponent = observer(({ model, onSuccess }) => {
  const form = Form.get(model);

  // No need to memoize - the hook handles it
  useFormHandler(form, "submit", async () => {
    await saveToAPI(model);
    return true; // Return true to indicate success
  });

  useFormHandler(form, "didSubmit", () => {
    onSuccess(); // This always uses the latest onSuccess callback
  });

  return <div>{/* your form fields */}</div>;
});
```

## Standard Form Bindings

These pre-built bindings are designed for native HTML form elements (`<input>`, `<select>`, `<button>`, `<label>`) with accessibility in mind.

All binding methods are called on the form instance and automatically handle:

- Two-way data binding between model and UI
- Change tracking and touched state
- Error state management
- ARIA attributes for accessibility

### Setup

To use the convenient `bindInput()`, `bindCheckBox()`, etc. methods, import the extension:

```tsx
import "@mobx-sentinel/react/dist/extension";
```

This extends the `Form` class with custom bind methods. Without the extension, you can still use the default `bind()` method with binding classes:

```tsx
// With extension
form.bindInput("username", config)

// Without extension
form.bind("username", InputBinding, config)
```

### Accessibility

All bindings provide built-in accessibility features:

- **Unique IDs** — Automatically generates unique `id` attributes for form elements, enabling proper label associations by `htmlFor`
- **Error states** — Sets `aria-invalid` when validation errors are present
- **Error messages** — Provides `aria-errormessage` linking to error text for screen readers

These features ensure forms are accessible to users of assistive technologies without additional configuration.

### Text Input: `form.bindInput(fieldName, config)`

Binds text, number, or date input fields. Handles intermediate values during typing and auto-finalizes on blur.

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

### Checkbox: `form.bindCheckBox(fieldName, config)`

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

### Radio Buttons: `form.bindRadioButton(fieldName, config)`

Binds radio button groups. The binding function returns a function that takes the value for each button.

**Additional accessibility:** Each radio button receives a proper `name` attribute for grouping, and error ARIA attributes are applied to all buttons in the group when errors occur.

```tsx
enum Role {
  ADMIN = "ADMIN",
  USER = "USER",
  GUEST = "GUEST",
}

const MyForm = observer(({ model }) => {
  const form = Form.get(model);
  const bindRole = form.bindRadioButton("role", {
    getter: () => model.role,
    setter: (v) => (model.role = v as Role),
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

### Select Box: `form.bindSelectBox(fieldName, config)`

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

### Submit Button: `form.bindSubmitButton(config?)`

Binds submit buttons with automatic state management. The button is automatically disabled when the form is invalid, submitting, or validating.

**Additional accessibility:** Sets `aria-busy` to indicate loading states during submission or validation. The `disabled` attribute prevents submission of invalid forms, providing clear feedback to assistive technologies about the form's current state.

```tsx
<button {...form.bindSubmitButton()}>
  Submit
</button>
```

### Label: `form.bindLabel(fieldNames, config?)`

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

### Extending Event Handlers

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

### Custom IDs

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

### Error Display

All bindings automatically set ARIA attributes for accessibility:

```tsx
// Binding sets aria-invalid and aria-errormessage automatically
<input {...form.bindInput("email", { /* ... */ })} />

// Optionally display errors manually
{Array.from(form.getErrors("email"), (error, i) => (
  <p className="error" key={i}>{error}</p>
))}
```
