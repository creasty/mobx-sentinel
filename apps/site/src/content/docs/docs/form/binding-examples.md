---
title: "Binding Examples"
description: "Worked examples of field, checkbox, multi-field and form bindings."
sidebar:
  order: 7
---

## Field Binding Example

Here's a real-world text input binding similar to the implementation in [@mobx-sentinel/react](/docs/react/):

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

## Checkbox Binding Example

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

## Multi-Field Binding Example

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

## Form Binding Example

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

## Best Practices

Follow these patterns when creating bindings:

1. Extending event handlers
    - Accept configuration handlers as optional (`onChange?: ...`)
    - Call configuration handlers AFTER internal logic (`this.config.onChange?.(e)`)
    - This allows users to extend behavior without overriding the binding's core functionality
1. Overriding/extending props
    - Accept props as optional (`id?: string`)
    - Use user-specified values in conjunction with default behavior:
      - Override with fallback: `this.config.id ?? this.field.stableId` (`stableId`, not `id` -- see [Element IDs](/docs/form/error-reporting/#element-ids))
      - Extend with combination: `this.config.disabled || this.disabled`
1. Normalizing problematic values
    - Provide sensible defaults for null/undefined values (e.g., `?? ""` for strings)
    - Handle special cases where `valueAsNumber` returns `NaN` or `valueAsDate` returns `null`
1. Field state management
    - Mark as touched on focus: `field.markAsTouched()`
    - Mark as changed with appropriate finalization (see [Intermediate vs Final Changes](/docs/form/custom-bindings/#intermediate-vs-final-changes))
    - Finalize on blur for text inputs: `field.finalizeChangeIfNeeded()`
    - Check `field.isErrorReported` before showing errors
1. Accessibility
    - Generate and manage unique element IDs for connecting labels and inputs (using `id` on inputs and `htmlFor` on labels)
    - Include `aria-invalid` based on `field.isErrorReported`
    - Include `aria-errormessage` with error text, or `undefined` if no errors
    - For form-level bindings (submit buttons), use `aria-busy` to indicate loading states
