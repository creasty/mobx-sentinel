---
title: "Creating Binding Classes"
description: "Write a binding class that connects form fields to a UI element."
sidebar:
  order: 6
---

A binding class implements the `FormBinding` interface and can bind to:
- A single field
- Multiple fields
- The entire form

Bindings encapsulate the logic for connecting form state to UI components, managing field state changes, and handling user interactions.

## Working with Fields

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

The methods that take no parameters are bound to the field, so they can be passed as event handlers as they are, as in `onFocus={field.markAsTouched}`. `markAsChanged()` is not: an event handler would receive the event in place of the change type.

### Intermediate vs Final Changes

Fields distinguish between "intermediate" changes (typing in progress) and "final" changes (committed), so that a field's errors are first reported once its input is complete, not on the first keystroke. See [Smart Error Reporting](/docs/form/error-reporting/) for the behavior users experience.

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

## Working with Configuration

`form.bind()` constructs a binding once per [binding key](/docs/form/bindings/#using-bindings), and every call assigns its configuration to the binding's `config`. A binding always holds the configuration of the latest call: its functions, and whatever those close over, such as a component's props and state.

Read `config` in plain getters, and use `@computed` only for members that read nothing but observables:

```ts
class InputBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: {
      getter: () => string;
      setter: (value: string) => void;
    }
  ) {
    makeObservable(this);
  }

  // Reads the configuration: a plain getter
  get value() {
    return this.config.getter();
  }

  // Reads only observables: a computed
  @computed
  get errorMessages() {
    if (!this.field.isErrorReported) return null;
    return Array.from(this.field.errors).join(', ') || null;
  }
}
```

### Why Not `@computed`

While something observes a computed value, as an `observer` component rendering the props does, the computed returns its cached value, and recomputes only once an observable it read changes. Neither assigning `config` nor a change to a component's props or state is observable, so a computed `value` would keep what an earlier render's getter returned. Take a getter that depends on a prop:

```tsx
const PriceInput = observer(({ item, currency }: { item: Item; currency: string }) => {
  const form = Form.get(item);
  return (
    <input
      {...form.bind('price', InputBinding, {
        getter: () => formatPrice(item.price, currency),
        setter: (value) => (item.price = parsePrice(value, currency)),
      })}
    />
  );
});
```

When `currency` changes, the component renders again with a new getter. A computed `value` would not call it, and would keep showing the price in the old currency until `item.price` changes. A plain getter calls the new one.

No reactivity is lost: the observables a getter reads are tracked by whatever reads the props, so the component still renders again when `item.price` changes.

In exchange, `config.getter` runs whenever the props are read, typically once per render, so keep getters cheap. To cache an expensive value, make it a `@computed` on the model and have the getter return it.
