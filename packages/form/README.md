# mobx-sentinel/form

Form and bindings for MobX-based form management with validation and submission handling.

## Form

`Form` is a reactive form management system built on MobX that tracks form state, validation, and submission lifecycle. It automatically manages dirty state, field-level tracking, and nested form hierarchies, making it easy to build complex forms with proper validation and user feedback.

It leverages `@mobx-sentinel/core` for dirty state tracking (`Watcher`) and validation (`Validator`).

### Getting a Form Instance

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

A form observes its subject through MobX reactions, those of the subject's `Watcher` and of the form's fields, so it is garbage collected together with the subject only if everything they observe is too (see [Getting a Watcher Instance](../core/README.md#getting-a-watcher-instance)). In particular, a `@nested` object that outlives the subject keeps the subject and its forms alive through the watcher, unless the property is excluded with `@unwatch`. The fields of a form observe the validation state, that of nested objects included, only while a report waits for the validation to settle.

⚠️ **Note:** `Form.get()` starts change tracking immediately because it creates a `Watcher` instance as part of the form initialization process. See [Starting a Watcher](../core/README.md#starting-a-watcher) for details.

#### Multiple Forms Per Subject

Use a symbol key to maintain multiple independent forms for the same object:

```ts
const editFormKey = Symbol('edit');
const previewFormKey = Symbol('preview');

const editForm = Form.get(model, editFormKey);
const previewForm = Form.get(model, previewFormKey);
// editForm !== previewForm (different instances)
```

### Nested/Array Forms

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

### Form State

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

#### Submission Readiness

`canSubmit` checks if the form can be submitted based on:
- Not currently busy (submitting or validating)
- Valid (unless `allowSubmitInvalid` is enabled)
- Dirty (unless `allowSubmitNonDirty` is enabled)

### Error Handling

The validator tracks errors from the start, but `form.getErrors()` and the bindings expose a field's errors only after they have been *reported*. See [Smart Error Reporting](#smart-error-reporting) for when that happens.

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

### Submitting Forms

Forms manage the complete submission lifecycle with three phases, each with its own handlers: `willSubmit` decides whether to go ahead, `submit` does the work and reports whether it succeeded, and `didSubmit` reacts to the outcome.

```ts
// Basic submission (resolves `false` without running any handler unless `canSubmit` is true)
const succeed = await form.submit();

// Force submission even if not ready (cancels a submission in progress)
await form.submit({ force: true });
```

#### Adding Submission Handlers

Handlers are executed in registration order:

```ts
// Before submitting: veto or prepare the submission
const dispose1 = form.addHandler('willSubmit', async () => {
  console.log('Submitting...');
  return confirm('Save changes?'); // false stops the submission (it fails)
});

// Perform the submission and report whether it succeeded (executed serially)
const dispose2 = form.addHandler('submit', async (abortSignal) => {
  try {
    await api.saveUser(model, { signal: abortSignal }); // cancels the request when a newer submission replaces this one
    return true; // succeeded
  } catch (error) {
    console.error(error);
    return false; // failed
  }
});

// After submitting: react to the outcome
const dispose3 = form.addHandler('didSubmit', (succeed) => {
  if (succeed) {
    showToast('Saved successfully!');
  } else {
    form.reportError();
  }
});

// Remove handlers when done
dispose1();
dispose2();
dispose3();
```

#### Submission Lifecycle

The submission process executes handlers in three phases:

1. **`willSubmit`** - A veto or preparation step before anything is submitted, and a place to log the attempt. Handlers run **serially** (one after another) in registration order. If a handler returns `false` or throws, the remaining handlers and the `submit` phase are skipped and the submission fails.

2. **`submit`** - Performs the submission. Handlers run **serially** in registration order, and each returns whether the submission succeeded. If a handler returns `false` or throws, the remaining handlers are skipped and the submission fails.

3. **`didSubmit`** - Called once with the outcome (`true` if the submission succeeded) after a submission finishes, unless a newer submission cancelled it. Use it for what follows the submission, for example:
    - Showing a completion snackbar or toast
    - Closing a modal or drawer after submission
    - Syncing local state that lives outside the form or model (typically in the component)
    - Logging
    - Moving to the next UI state, or presenting another model that takes this form's result as input
    - Saving a snapshot after submission (e.g. for drafts or autosave)

    These handlers run synchronously within a MobX action.

After a successful submission, the form resets automatically (clearing dirty state and field states).

#### What a `submit` Handler Returns

The boolean a `submit` handler returns reports whether the submission succeeded. It becomes the outcome `didSubmit` handlers receive (with several `submit` handlers, `true` only if every one of them returns `true`), and the form resets automatically only when the outcome is `true`. It is meaningful even without any async work: return `false` whenever the submission did not go through, e.g. when the server rejects the data or a precondition does not hold.

The return value is not how a handler stops a cancelled submission; the form enforces cancellation itself (see [Cancelling a Submission](#cancelling-a-submission)). Fallback or cleanup specific to the request belongs in the handler's own `try`/`catch`, with `finally` for cleanup that must always run.

#### Passing a Result On

`didSubmit` handlers receive only the boolean. When the next step needs what the submission produced, such as the created record or its ID, have the `submit` handler store it where the `didSubmit` handler or the component can read it:

```ts
let createdUserId: string | null = null;

form.addHandler('submit', async (abortSignal) => {
  const user = await api.saveUser(model, { signal: abortSignal });
  createdUserId = user.id; // keep the result for the next step
  return true;
});

form.addHandler('didSubmit', (succeed) => {
  if (succeed && createdUserId) openUserPage(createdUserId);
});
```

#### Cancelling a Submission

Calling `form.submit({ force: true })` while a submission is in progress cancels it: its `AbortSignal` is aborted and a new submission starts. The cancelled submission invokes no further `willSubmit` or `submit` handlers, resolves `false` whatever its handlers return, and neither calls `didSubmit` handlers nor resets the form, while `isSubmitting` stays `true` until the latest submission settles. The latest submission reports the outcome, so `didSubmit` is called once for it, even if the cancelled submission settles later.

The handler that is running when the submission is cancelled is not interrupted, so pass the signal to its async work (e.g. `fetch(url, { signal })`) to cancel that work too. Since `didSubmit` is not called for a cancelled submission, release anything a handler acquired in a `finally` block inside that handler.

### Managing State

```ts
// Mark form as dirty
form.markAsDirty();

// Reset form state (clears dirty, fields, sub-forms)
form.reset();

// Note: reset() does NOT clear validation errors
// Errors are managed by the Validator and remain until revalidation
```

### Configuration

Configure forms globally or per-instance:

```ts
import { configureForm } from '@mobx-sentinel/form';

// Global configuration (affects all forms)
configureForm({
  autoFinalizationDelayMs: 2000, // delay before intermediate input is finalized
  allowSubmitNonDirty: true, // allow submitting unchanged forms
  allowSubmitInvalid: true, // allow submitting invalid forms
});

// Reset global configuration
configureForm(true);

// Per-form configuration (overrides global)
form.configure({
  autoFinalizationDelayMs: 5000,
  allowSubmitNonDirty: false,
});

// Reset per-form configuration
form.configure(true);

// Access current configuration
form.config; // Readonly<FormConfig>
```

## Smart Error Reporting

A form is usually invalid long before the user has done anything wrong: required fields start out empty, and an email address stays invalid until its last character is typed. Showing every error the moment it exists scolds users for steps they have not reached yet; holding every error back until submission leaves them guessing.

The form keeps two concerns apart:

- **Validation** belongs to the model. It runs reactively as the model changes, so `form.isValid`, `form.canSubmit`, `field.hasErrors` and `field.errors` are always up to date — enough to disable a submit button or skip an autosave without showing the user anything.
- **Reporting** belongs to the form. For each field, it decides *when* those errors are revealed, based on how the user has interacted with the field. `field.isErrorReported`, `form.getErrors()` and the `aria-invalid` attribute set by the bindings follow it.

### What the User Sees

The standard bindings of [`@mobx-sentinel/react`](../react) behave as follows. You can try each step in the [example app](https://example.mobx-sentinel.creasty.com).

| When the user... | They see |
| --- | --- |
| opens a form that starts out invalid | No errors. The submit button is disabled, but no field is marked invalid. |
| moves through fields without changing them | No errors. Focusing a field does not report it. |
| starts typing into a text field | No errors while typing. |
| leaves the field, or stops typing for 3 seconds | The errors of that field. |
| picks an option in a checkbox, radio button or select box | The errors of that field, right away. |
| keeps editing a field whose errors have been shown | Errors that follow the value: a fix clears the error as soon as validation confirms it, and a new mistake shows up the same way. |
| hovers the submit button, even while it is disabled | Every outstanding error of the form and its sub-forms. |
| then reveals another field or adds another item | No errors on the new field or item until the user works on it, or until the form reports again. |
| submits successfully, or the form is reset | No errors. Reporting starts over. |

### Intermediate and Final Changes

A text input cannot tell when the user is done, so `InputBinding` marks every keystroke as an **intermediate** change — a value that may still be incomplete, like `user@` in an email field — and reports nothing yet. The change becomes **final**, and the field's errors are reported, when either:

- the user leaves the field (`onBlur` calls `field.finalizeChangeIfNeeded()`), or
- the user stops typing for [`autoFinalizationDelayMs`](#configuration), 3 seconds by default. Every keystroke restarts the timer, so users who never leave the field, such as on the last field before a disabled submit button, still get feedback.

Checkboxes, radio buttons and select boxes cannot hold a partial value, so their bindings make a final change right away (`field.markAsChanged()`).

Focusing a field marks it as touched (`field.isTouched`) but reports nothing. Leaving a field without changing it reports nothing either, since `finalizeChangeIfNeeded()` only acts on a pending intermediate change. A user who tabs through the form to get an overview does not turn it red.

### Errors Follow the Value Once Shown

A reported field stays reported until the form is reset, and from then on its errors follow every change, intermediate ones included. When the user fixes a mistake, the error disappears as soon as validation confirms the fix, so users learn right away that they got it right instead of when they leave the field. A new mistake in that field shows up the same way, while the user is still typing.

### Reporting the Whole Form

`form.reportError()` reports every field of the form and, recursively, of its sub-forms. Call it when users need to see everything that stands in their way:

- `SubmitButtonBinding` calls it when the pointer moves over the button. The button is disabled while the form is invalid, so hovering it is exactly when users wonder why, and they get the answer before they try to click.
- A `didSubmit` handler can call it when a submission fails, for example after the errors returned by the server have been fed back into the model.

Reporting is an action, not a mode: it covers the fields and sub-forms that exist when it is called. A field exists once a binding, `form.getField()` or `form.getErrors()` has asked for it — in a React app, once it has been rendered. Anything that comes later starts unreported:

- a field revealed afterwards, e.g., a "Due date" input that appears when "Custom" payment terms are selected;
- a sub-form added afterwards, e.g., an invoice line added with "Add a line".

A line the user has just added therefore does not open with "Description is required". Its fields are reported by the user's own changes, or by the next `form.reportError()`, such as when the user hovers the submit button again.

### Nested and Array Forms

Each nested object and array element has its own form (`Form.get(invoice.billTo)`, `Form.get(invoice.lineItems[0])`) with its own reporting state. Nothing has to be passed between them: the parent finds its sub-forms through the `@nested` annotation of the model.

- **Reports travel downwards only.** `form.reportError()` on the parent reaches every sub-form, while reporting a sub-form, or finishing a change in one of its fields, leaves the parent and the sibling sub-forms untouched.
- **Sub-forms added later defer their reporting.** A sub-form that did not exist when the parent reported waits for its own report: the user's changes in it, or the parent's next `reportError()`.

### Waiting for Validation to Settle

Validation handlers are throttled (100 ms by default), and asynchronous handlers can take much longer. Reporting right away could flash a result computed for an older value: an error that is about to go away, or a clean state that a server-side check is about to overturn.

So when a field becomes reported, `field.isErrorReported` stays `undefined` until the validator of its form, including nested validators and asynchronous handlers, has settled. Only then does it show the result. After that, errors change only when new results arrive, so an error is not cleared while its revalidation is still running and does not blink off and on while the user types.

### Accessibility

`field.isErrorReported` is `undefined` until the field is reported, and `true` or `false` afterwards, which maps directly onto `aria-invalid`: the attribute is omitted until the field is reported. The standard bindings pass it through as is, so assistive technologies learn about an error at the same moment sighted users see it.

### Element IDs

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

The id is used as is, so nothing else on the page may use it. In React, `useFormSSR` from `@mobx-sentinel/react` assigns `useId()`, which guarantees that: no other call returns the same value, so nothing in the model has to be involved. It gives the form its own id back when the component unmounts. A key from your own data works too, as long as it is unique on the page. Assign it before binding: bindings read the stable id as they are called, and it is not reactive.

A sub-form is a separate instance with its own stable id. Assign it where the sub-form is rendered, so no component has to know what its ancestors did.

A field's stable id contains `:`, which is fine for `htmlFor`, `aria-*` attributes and `document.getElementById()`. In a CSS selector, escape it with `CSS.escape()`.

### Adjusting the Behavior

The behavior is split between the bindings and a few methods of `FormField`, so each part can be changed where it is needed:

- **The pause before intermediate input is reported:** `configureForm({ autoFinalizationDelayMs })` for all forms, or `form.configure({ autoFinalizationDelayMs })` for one form.
- **Reporting on every keystroke:** in a [custom binding](#creating-binding-classes), call `field.markAsChanged()` (a final change) in `onChange` instead of `field.markAsChanged('intermediate')`.
- **Reporting from your own code:** `field.reportError()` for one field, `form.reportError()` for the whole form.
- **Showing errors regardless of reporting:** `form.getErrors(fieldName, true)` or `field.errors`.
- **Starting over:** `form.reset()` clears the reporting state of every field and sub-form, and runs automatically after a successful submission. The validator keeps its errors; they stay hidden until they are reported again.
- **Letting keyboard users find out what is wrong:** revealing errors on hover needs a pointer, and a disabled button can't be focused with the keyboard. To keep the button enabled, allow invalid submissions and report the errors from a `willSubmit` handler that cancels the submission:

  ```ts
  form.configure({ allowSubmitInvalid: true });
  form.addHandler('willSubmit', async () => {
    if (form.isValid) return true;
    form.reportError();
    return false;
  });
  ```

### How It Differs from Other Libraries

Popular form libraries decide when an error appears in one of two ways. Some run validation on chosen events and show whatever the last run found: React Hook Form's `mode`, VeeValidate's `validateOn*` options, TanStack Form's per-event validators. Others validate on every change and leave the decision to a display condition that the app writes from flags such as `touched` or `submitFailed`: Formik, Final Form, Angular. mobx-sentinel validates continuously, like the latter, but makes the display decision itself and keeps it per field as `isErrorReported`.

Compared with the defaults and documented setups of those libraries (checked in September 2026 against React Hook Form 7, Formik 2, Final Form 5, TanStack Form 1, VeeValidate 4, Angular 22, mobx-react-form 7 and formstate):

- **Moving through a form is not a mistake.** When leaving a field is enough to show its errors, as with the `touched` conditions recommended by Formik, Final Form and Angular, VeeValidate's `<Field>`, React Hook Form's `onBlur` and `onTouched` modes, and mobx-react-form's defaults, tabbing past an empty required field flags it. Here, a field is reported only after its value has changed, or when the whole form is reported.
- **Typing is not finishing.** When errors follow `change`, an email address is flagged from its first keystroke; when they follow `blur`, users who stop typing without leaving the field get no feedback. The standard bindings report on whichever comes first: leaving the field, or a pause. React Hook Form's opt-in `delayError` comes closest, holding errors back for a set time and removing them instantly. Otherwise, the nearest options debounce validation itself, as formstate and mobx-react-form do, which holds back the validity along with the message.
- **Reporting is not a mode.** A submission often changes how the whole form behaves. React Hook Form validates on every change once the form has been submitted (`reValidateMode`), and TanStack Form's `revalidateLogic` switches to `modeAfterSubmission`. Display conditions built on form-wide flags, like Final Form's `submitFailed` or the `form.submitted` check in Angular Material's default error state matcher, show errors on fields that appear later, before the user has touched them. Formik's submit marks every key in `values` as touched, so a conditional field whose key is in `initialValues` shows its error the moment it appears. Here, `form.reportError()` covers what exists when it is called, and fields and sub-forms that appear later still wait for the user.
- **Errors don't blink while validation catches up.** A report waits for pending validation, asynchronous handlers and nested models included, and an error already on screen stays until its revalidation has finished. Elsewhere, an asynchronous error can vanish while its check is still running: Angular replaces errors with the synchronous result on every change, Final Form's field-level async validators clear the error on the next change, and mobx-react-form resets errors before each validation run by default.
- **A disabled submit button explains itself.** Libraries usually reveal hidden errors when a submission is attempted (Formik, for example, touches every field on submit), so the button has to stay clickable for users to find out what is wrong. `SubmitButtonBinding` keeps the button disabled until the form can be submitted and reports every error when the pointer moves over it. For keyboard users, see [Adjusting the Behavior](#adjusting-the-behavior).

These defaults follow widely cited guidance on inline validation: wait until users have finished with a field before showing its errors ([Nielsen Norman Group](https://www.nngroup.com/articles/errors-forms-design-guidelines/)), don't flag fields they have only tabbed through ([Smashing Magazine](https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux/)), and once an error is shown, update it as they correct the input ([Baymard Institute](https://baymard.com/blog/inline-form-validation)).

## Binding

Bindings connect form state to UI components. They encapsulate the logic for creating props that can be spread onto input elements.

The `@mobx-sentinel/form` package provides only the **API for creating bindings**—it does not include any pre-built binding implementations. You have two options:

1. **Use `@mobx-sentinel/react`** - Pre-built bindings for React components (InputBinding, CheckBoxBinding, SubmitButtonBinding, etc.)
2. **Build your own bindings** - Implement custom bindings for your framework or specific use cases

The examples below demonstrate how to create custom bindings. They are based on the actual implementations in [@mobx-sentinel/react](../react).

### Creating Binding Classes

A binding class implements the `FormBinding` interface and can bind to:
- A single field
- Multiple fields
- The entire form

Bindings encapsulate the logic for connecting form state to UI components, managing field state changes, and handling user interactions.

#### Working with Fields

Fields track individual input state and provide methods for managing user interactions:

```ts
const field = form.getField('email');

// Field state (all reactive)
field.isTouched; // user has focused the field
field.isChanged; // value has changed
field.isIntermediate; // typing in progress (partial input)

// Validation state
field.hasErrors; // boolean - has validation errors
field.errors; // Set<string> of error messages
field.isErrorReported; // undefined | false | true - for conditional display

// State management methods
field.markAsTouched(); // typically on focus
field.markAsChanged('intermediate'); // while typing
field.markAsChanged('final'); // on blur or enter
field.finalizeChangeIfNeeded(); // typically on blur
field.reportError(); // show errors to user
field.reset(); // clear all state
```

##### Intermediate vs Final Changes

Fields distinguish between "intermediate" changes (typing in progress) and "final" changes (committed), so that a field's errors are first reported once its input is complete, not on the first keystroke. See [Smart Error Reporting](#smart-error-reporting) for the behavior users experience.

Mark changes as "intermediate" while the user is typing to delay error reporting; validation itself keeps running as the model changes. Intermediate values automatically finalize after a delay (configurable via `autoFinalizationDelayMs`), or you can manually trigger `finalizeChangeIfNeeded()` to reflect changes immediately:

```ts
onChange={(e) => {
  model.email = e.target.value;
  field.markAsChanged('intermediate'); // Don't report errors yet
}}

onBlur={() => {
  field.finalizeChangeIfNeeded(); // Finalize and report errors
}}
```

#### Field Binding Example

Here's a real-world text input binding similar to the implementation in [@mobx-sentinel/react](../react):

```ts
import { FormBinding, FormField } from '@mobx-sentinel/form';
import { makeObservable, computed, action } from 'mobx';

class InputBinding implements FormBinding {
  constructor(
    private readonly field: FormField, // Accepting single field
    public config: {
      getter: () => string | null;
      setter: (value: string) => void;
      id?: string;
      onChange?: (e: React.ChangeEvent) => void;
      onFocus?: (e: React.FocusEvent) => void;
      onBlur?: (e: React.FocusEvent) => void;
    }
  ) {
    makeObservable(this);
  }

  @computed
  get value() {
    return this.config.getter() ?? ''; // Read the value from the model
  }

  @action
  onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.config.setter(e.currentTarget.value); // Update the value from the input
    this.field.markAsChanged('intermediate'); // While editing, delay error reporting
    this.config.onChange?.(e); // Support extending handlers via config
  };

  onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    this.field.finalizeChangeIfNeeded(); // Ensure to report errors when they left the input
    this.config.onBlur?.(e);
  };

  onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    this.field.markAsTouched();
    this.config.onFocus?.(e);
  };

  @computed
  get errorMessages() {
    if (!this.field.isErrorReported) return null; // Check whether to report errors
    return Array.from(this.field.errors).join(', ') || null;
  }

  // The outport props: the returned value is passed to the view component
  get props() {
    return {
      type: 'text',
      value: this.value,
      id: this.config.id ?? this.field.stableId,
      onChange: this.onChange,
      onFocus: this.onFocus,
      onBlur: this.onBlur,
      'aria-invalid': this.field.isErrorReported,
      'aria-errormessage': this.errorMessages ?? undefined,
    };
  }
}
```

#### Checkbox Binding Example

Checkboxes use immediate finalization since there's no intermediate state:

```ts
class CheckBoxBinding implements FormBinding {
  constructor(
    private readonly field: FormField, // Accepting single field
    public config: {
      getter: () => boolean;
      setter: (value: boolean) => void;
      id?: string;
      onChange?: (e: React.ChangeEvent) => void;
      onFocus?: (e: React.FocusEvent) => void;
    }
  ) {
    makeObservable(this);
  }

  @computed
  get checked() {
    return this.config.getter();
  }

  @action
  onChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    this.config.setter(e.currentTarget.checked);
    this.field.markAsChanged(); // Defaults to 'final'; No delay is needed for checkboxes
    this.config.onChange?.(e);
  };

  onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    this.field.markAsTouched();
    this.config.onFocus?.(e);
  };

  @computed
  get errorMessages() {
    if (!this.field.isErrorReported) return null;
    return Array.from(this.field.errors).join(', ') || null;
  }

  get props() {
    return {
      type: 'checkbox',
      id: this.config.id ?? this.field.stableId,
      checked: this.checked,
      onChange: this.onChange,
      onFocus: this.onFocus,
      'aria-invalid': this.field.isErrorReported,
      'aria-errormessage': this.errorMessages ?? undefined,
    };
  }
}
```

#### Multi-Field Binding Example

Bindings can work with multiple fields, useful for components like labels that need to aggregate state:

```ts
class LabelBinding implements FormBinding {
  constructor(
    private readonly fields: FormField[], // Accepting multiple fields
    public config: {
      htmlFor?: string;
    }
  ) {
    makeObservable(this);
  }

  // Not @computed: `stableId` is composed from a plain field on the form,
  // so while observed, a computed would keep the first id it saw
  get firstFieldStableId() {
    return this.fields.at(0)?.stableId;
  }

  @computed
  get firstErrorMessage() {
    for (const field of this.fields) {
      if (!field.isErrorReported) continue;
      for (const error of field.errors) {
        return error;
      }
    }
    return null;
  }

  get props() {
    return {
      htmlFor: this.config.htmlFor ?? this.firstFieldStableId,
      'aria-invalid': !!this.firstErrorMessage,
      'aria-errormessage': this.firstErrorMessage ?? undefined,
    };
  }
}
```

This binding aggregates error states from multiple fields, showing the first error message if any field has errors.

#### Form Binding Example

Bindings can also operate on the entire form, useful for submit buttons:

```ts
class SubmitButtonBinding implements FormBinding {
  constructor(
    private readonly form: Form<unknown>, // Accepting the form
    public config: {
      onClick?: (e: React.MouseEvent) => void;
      onMouseOver?: (e: React.MouseEvent) => void;
    }
  ) {
    makeObservable(this);
  }

  @computed
  get busy() {
    return this.form.isSubmitting || this.form.isValidating;
  }

  onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    this.form.submit().catch((e) => void e);
    this.config.onClick?.(e);
  };

  onMouseOver = (e: React.MouseEvent<HTMLButtonElement>) => {
    this.form.reportError(); // Show errors on hover (like attempting to click)
    this.config.onMouseOver?.(e);
  };

  get props() {
    return {
      onClick: this.onClick,
      onMouseOver: this.onMouseOver,
      disabled: !this.form.canSubmit,
      'aria-busy': this.busy,
      'aria-invalid': !this.form.isValid,
    };
  }
}
```

#### Best Practices

Follow these patterns when creating bindings:

1. Extending event handlers
    - Accept configuration handlers as optional (`onChange?: ...`)
    - Call configuration handlers AFTER internal logic (`this.config.onChange?.(e)`)
    - This allows users to extend behavior without overriding the binding's core functionality
1. Overriding/extending props
    - Accept props as optional (`id?: string`)
    - Use user-specified values in conjunction with default behavior:
      - Override with fallback: `this.config.id ?? this.field.stableId` (`stableId`, not `id` -- see [Element IDs](#element-ids))
      - Extend with combination: `this.config.disabled || this.disabled`
1. Normalizing problematic values
    - Provide sensible defaults for null/undefined values (e.g., `?? ""` for strings)
    - Handle special cases where `valueAsNumber` returns `NaN` or `valueAsDate` returns `null`
1. Field state management
    - Mark as touched on focus: `field.markAsTouched()`
    - Mark as changed with appropriate finalization (see [Intermediate vs Final Changes](#intermediate-vs-final-changes))
    - Finalize on blur for text inputs: `field.finalizeChangeIfNeeded()`
    - Check `field.isErrorReported` before showing errors
1. Accessibility
    - Generate and manage unique element IDs for connecting labels and inputs (using `id` on inputs and `htmlFor` on labels)
    - Include `aria-invalid` based on `field.isErrorReported`
    - Include `aria-errormessage` with error text, or `undefined` if no errors
    - For form-level bindings (submit buttons), use `aria-busy` to indicate loading states

### Using Bindings

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
