---
title: "Overview"
description: "What mobx-sentinel does, shown on a condensed version of the example invoice editor."
sidebar:
  order: 1
---

:::caution
This library is in an early stage of development. Its interface may change without notice.
:::

[apps/example/](https://github.com/creasty/mobx-sentinel/tree/main/apps/example) is a working invoice editor — cross-field rules, a throttled CRM lookup, nested and repeated sub-forms, server-reported conflicts, dirty tracking and autosave. It is deployed at [example.mobx-sentinel.creasty.com](https://example.mobx-sentinel.creasty.com). The code below is condensed from it.

## Model

Your model stays a model: plain MobX classes that own the data, the derived values and the rules. The library adds two things — an annotation that lets it see through to nested objects, and validation handlers declared next to the data they constrain.

```typescript
import { action, computed, makeObservable, observable } from "mobx";
import { makeValidatable, nested, unwatch } from "@mobx-sentinel/core";

export class Invoice {
  @observable customerEmail = "";
  @observable issuedOn = startOfToday();
  @observable paymentTerms: PaymentTerms = "NET_30";
  @observable customDueOn: Date | null = null;

  // Nested and dynamic models are tracked through the `@nested` annotation.
  // Objects, arrays, sets, maps and boxed observables all work.
  @nested @observable billTo = new PostalAddress();
  @nested @observable lineItems = [new LineItem()];

  constructor() {
    makeObservable(this);

    // 'Reactive validation' is implemented here.
    makeValidatable(this, (b) => {
      if (!EMAIL_PATTERN.test(this.customerEmail)) {
        b.invalidate("customerEmail", "Enter a valid email address");
      }
      // Cross-field rules are ordinary code — no resolver, no schema gymnastics.
      if (this.paymentTerms === "CUSTOM" && this.customDueOn && this.customDueOn < this.issuedOn) {
        b.invalidate("customDueOn", "The due date cannot precede the issue date");
      }
      // And rules that span the children belong to the parent, where they can see all of them.
      if (this.total <= 0) {
        b.invalidate("lineItems", "The invoice total must be greater than zero");
      }
    });

    // Asynchronous rules compose on top of the synchronous ones.
    // The Validator throttles the calls; a keystroke made while a request is in
    // flight is checked after that request settles. The signal is aborted when
    // the validator is reset or the handler is removed.
    makeValidatable(
      this,
      () => this.customerEmail,
      async (email, b, abortSignal) => {
        const response = await fetch(`/api/customers/${email}`, { signal: abortSignal });
        if (!response.ok) {
          b.invalidate("customerEmail", "No customer in the CRM uses this address");
        }
      },
      { initialRun: false }
    );
  }

  // Derived amounts are business logic, not form state.
  // `@unwatch` keeps them out of change detection, so the change report below
  // shows what the user edited rather than everything that recomputed.
  @unwatch
  @computed
  get total(): number {
    return this.lineItems.reduce((sum, item) => sum + item.amount * (1 + item.taxRate), 0);
  }

  @action.bound
  addLineItem() {
    this.lineItems.push(new LineItem());
  }
}
```

## Change detection and validation

Both are available on any model, with or without a form — which is what makes them usable for autosave, sync, navigation guards and server round-trips.

```typescript
import { reaction, runInAction } from "mobx";
import { unwatch, Validator, Watcher } from "@mobx-sentinel/core";

const invoice = new Invoice();
const watcher = Watcher.get(invoice);
const validator = Validator.get(invoice);

runInAction(() => {
  invoice.customerEmail = "ap@northwind.example";
  invoice.lineItems[0].quantity = 3;
});

// What changed — through nested models and arrays alike.
watcher.changed //=> true
watcher.changedKeyPaths //=> Set ["customerEmail", "lineItems.0.quantity"]

// What is wrong — aggregated from every nested validator.
await validator.waitForValidation();
validator.isValid //=> false
validator.invalidKeyPaths //=> Set ["billTo.postalCode", "lineItems.0.unitPrice"]
validator.firstErrorMessage //=> "ZIP code is required"

// `changedTick` is the hook an autosave, an undo stack or a sync loop needs.
reaction(
  () => watcher.changedTick,
  () => saveDraft(invoice)
);

// ...and `unwatch()` is how you write to the model without it counting as an edit.
unwatch(() => invoice.restoreDraft(draft));
watcher.changed //=> false — the invoice is populated, the form is still pristine
```

## Form

The form layer is the last mile: it knows when to show an error, when the submit button may be pressed, and how to attach a value to an input. It holds no data of its own.

```tsx
import "@mobx-sentinel/react/extension";

import { observer } from "mobx-react-lite";
import { Form } from "@mobx-sentinel/form";
import { useFormHandler } from "@mobx-sentinel/react";

const InvoiceForm: React.FC<{ model: Invoice }> = observer(({ model }) => {
  // One line to attach a form to a model.
  // No provider, no context, no schema, no field registration.
  const form = Form.get(model);

  // Submission is a lifecycle rather than a callback: `willSubmit` can veto it,
  // `submit` handlers run serially with an AbortSignal and report whether the submission succeeded,
  // `didSubmit` reacts to the outcome.
  // When you have view-models, form.addHandler() API is also available.
  useFormHandler(form, "submit", async (abortSignal) => {
    const response = await fetch("/api/invoices", {
      method: "POST",
      body: JSON.stringify(model),
      signal: abortSignal, // Cancels the request when a newer submission replaces this one.
    });
    return response.ok; // didSubmit receives this, and the form resets itself only on true.
  });

  return (
    <>
      <div className="field">
        {/* Bindings add the proper aria- attributes and tie the label to the input. */}
        <label {...form.bindLabel(["customerEmail"])}>Billing contact</label>
        <input
          {...form.bindInput("customerEmail", {
            getter: () => model.customerEmail, // Get the value from the model.
            setter: (v) => (model.customerEmail = v), // Write the value to the model.
          })}
        />
        {/* Errors appear when the user is ready for them, not on the first keystroke. */}
        <ErrorText errors={form.getErrors("customerEmail")} />
      </div>

      {/* A nested model gets its own form. Nothing is threaded down from the parent. */}
      <AddressForm model={model.billTo} />

      {/* A dynamic list is just an array on the model: mutate it and the forms follow. */}
      {model.lineItems.map((item) => (
        <LineItemForm key={item.id} model={item} />
      ))}
      <button onClick={model.addLineItem}>Add a line</button>

      {/* Disabled while the form is invalid or busy.
          Hovering it reveals every outstanding error at once. */}
      <button {...form.bindSubmitButton()}>Send invoice</button>
    </>
  );
});
```

```tsx
const AddressForm: React.FC<{ model: PostalAddress }> = observer(({ model }) => {
  // Forms are looked up per model and are completely independent.
  // No child-to-parent dependency, yet the parent's validity and dirtiness include this one.
  const form = Form.get(model);

  return (...);
});
```
