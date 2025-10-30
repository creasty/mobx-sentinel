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

Form instances are cached and automatically garbage collected with their subjects. The same object always returns the same form instance:

```ts
const form1 = Form.get(model);
const form2 = Form.get(model);
// form1 === form2 (same instance)
```

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

Get errors for specific fields or the entire form:

```ts
// Field-specific errors
form.getErrors('email'); // Set<string> - only if reported
form.getErrors('email', true); // include pre-reported

// All errors including nested forms
form.getAllErrors(); // Set<string>
form.getAllErrors('address'); // errors for address field and nested address form

// First error message
form.firstErrorMessage; // string | undefined
```

Report errors to make them visible:

```ts
// Report errors on all fields and sub-forms
form.reportError();

// Typically called when submit fails validation
if (!form.isValid) {
  form.reportError();
}
```

### Submitting Forms

Forms manage the complete submission lifecycle with three phases: `willSubmit`, `submit`, and `didSubmit`.

```ts
// Basic submission
await form.submit();

// Force submission even if not ready
await form.submit({ force: true });
```

#### Adding Submission Handlers

Handlers are executed in registration order:

```ts
// Pre-submission validation or preparation
const dispose1 = form.addHandler('willSubmit', async (abortSignal) => {
  console.log('Preparing to submit...');
  return true; // return false to cancel submission
});

// Main submission logic (executed serially)
const dispose2 = form.addHandler('submit', async (abortSignal) => {
  try {
    await api.saveUser(model);
    return true; // success
  } catch (error) {
    console.error(error);
    return false; // failure
  }
});

// Post-submission cleanup
const dispose3 = form.addHandler('didSubmit', (succeed) => {
  if (succeed) {
    console.log('Saved successfully!');
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

1. **`willSubmit`** - Called before submission starts. All handlers run in parallel. If any handler returns `false`, submission is cancelled.

2. **`submit`** - Main submission handlers. These are executed **serially** (one after another) in registration order. If any handler returns `false`, remaining handlers are skipped and submission fails.

3. **`didSubmit`** - Called after submission completes (success or failure). Receives a boolean indicating whether submission succeeded. These handlers run synchronously within a MobX action.

The submission can be cancelled mid-flight by calling `form.submit({ force: true })`, which aborts the current submission via the `AbortSignal` and starts a new one.

After successful submission, forms automatically reset (clearing dirty state and field states).

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

Fields distinguish between "intermediate" changes (typing in progress) and "final" changes (committed), decoupling validation timing from user input for optimal UX.

Mark changes as "intermediate" while the user is typing to delay validation and error reporting. Intermediate values automatically finalize after a delay (configurable via `autoFinalizationDelayMs`), or you can manually trigger `finalizeChangeIfNeeded()` to reflect changes immediately:

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
      id: this.config.id ?? this.field.id,
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
      id: this.config.id ?? this.field.id,
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

  @computed
  get firstFieldId() {
    return this.fields.at(0)?.id;
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
      htmlFor: this.config.htmlFor ?? this.firstFieldId,
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
      - Override with fallback: `this.config.id ?? this.field.id`
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
    - Generate and manage element IDs for connecting labels and inputs (e.g., `id` and `htmlFor`)
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
