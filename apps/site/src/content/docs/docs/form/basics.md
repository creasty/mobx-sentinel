---
title: "Form Basics"
description: "Get a Form for a model, nest forms, read the form's state and errors, and reset it."
sidebar:
  order: 1
---

`Form` is a reactive form management system built on MobX that tracks form state, validation, and submission lifecycle. It automatically manages dirty state, field-level tracking, and nested form hierarchies, making it easy to build complex forms with proper validation and user feedback.

It leverages `@mobx-sentinel/core` for dirty state tracking (`Watcher`) and validation (`Validator`).

## Getting a Form Instance

Use `Form.get()` to retrieve or create a form instance for an object:

```ts
const model = new MyModel();
const form = Form.get(model);
```

Form instances are cached. The same object always returns the same form instance:

```ts
const form1 = Form.get(model);
const form2 = Form.get(model);
// form1 === form2 (same instance)
```

A form observes its subject through MobX reactions, those of the subject's `Watcher` and of the form's fields, so it is garbage collected together with the subject only if everything they observe is too (see [Getting a Watcher Instance](/docs/core/watcher/#getting-a-watcher-instance)). In particular, a `@nested` object that outlives the subject keeps the subject and its forms alive through the watcher, unless the property is excluded with `@unwatch`. The fields of a form observe the validation state, that of nested objects included, only while a report waits for the validation to settle.

⚠️ **Note:** `Form.get()` starts change tracking immediately because it creates a `Watcher` instance as part of the form initialization process. See [Starting a Watcher](/docs/core/watcher/#starting-a-watcher) for details.

### Multiple Forms Per Subject

Use a symbol key to maintain multiple independent forms for the same object:

```ts
const editFormKey = Symbol('edit');
const previewFormKey = Symbol('preview');

const editForm = Form.get(model, editFormKey);
const previewForm = Form.get(model, previewFormKey);
// editForm !== previewForm (different instances)
```

## Nested/Array Forms

Forms automatically track sub-forms when using the `@nested` annotation:

```ts
class Address {
  @observable street = '';
  @observable city = '';
}

class User {
  @observable name = '';
  @nested @observable address = new Address();
  @nested @observable previousAddresses = [new Address()];
}

const user = new User();
const userForm = Form.get(user);

// Access sub-forms
const addressForm = Form.get(user.address);
const prevAddressForm = Form.get(user.previousAddresses[0]);

// Sub-forms are tracked in the parent
userForm.subForms.get('address'); // addressForm
userForm.subForms.get('previousAddresses.0'); // prevAddressForm
```

When sub-forms become dirty, parent forms automatically become dirty too. This allows validation and dirty checking to bubble up through the form hierarchy.

## Form State

Forms provide several reactive state properties:

```ts
// Dirty state - whether the form has changes
form.isDirty; // boolean

// Validation state
form.isValid; // boolean
form.invalidFieldCount; // number of invalid fields
form.invalidFieldPathCount; // includes nested forms
form.isValidating; // boolean - async validation in progress

// Submission state
form.isSubmitting; // boolean
form.isBusy; // true if submitting or validating

// Combined state
form.canSubmit; // true if ready to submit
```

### Submission Readiness

`canSubmit` checks if the form can be submitted based on:
- Not currently busy (submitting or validating)
- Valid (unless `allowSubmitInvalid` is enabled)

Whether the form is dirty doesn't matter, so a form with pre-filled values can be submitted as it is.

## Error Handling

The validator tracks errors from the start, but `form.getErrors()` and the bindings expose a field's errors only after they have been *reported*. See [Smart Error Reporting](/docs/form/error-reporting/) for when that happens.

```ts
// Field-specific errors
form.getErrors('email'); // Set<string> - empty until reported
form.getErrors('email', true); // include errors that have not been reported yet

// All errors including nested forms, regardless of reporting
form.getAllErrors(); // Set<string>
form.getAllErrors('address'); // errors for address field and nested address form

// First error message, regardless of reporting
form.firstErrorMessage; // string | null
```

Report errors to make them visible:

```ts
// Report errors on all fields and sub-forms
form.reportError();

// e.g., when a submission fails
form.addHandler('didSubmit', (succeed) => {
  if (!succeed) form.reportError();
});
```

## Managing State

```ts
// Mark form as dirty
form.markAsDirty();

// Reset form state (clears dirty, fields, sub-forms)
form.reset();

// Note: reset() does NOT clear validation errors
// Errors are managed by the Validator and remain until revalidation
```

`markAsDirty()`, `reset()` and `reportError()` take no parameters and are bound to the form, so they can be passed as event handlers as they are:

```tsx
<button onClick={form.reset}>Reset</button>
```
