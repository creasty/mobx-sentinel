---
title: "Validator"
description: "Get a Validator for a model and validate it synchronously."
sidebar:
  order: 4
---

Perform synchronous and asynchronous validation on MobX models with automatic throttling.

`Validator` is designed for declarative, reactive validation - such as form validation with automatic field-level and cross-field checks, throttled async API checks (e.g., username availability), complex multi-field validation with dependencies, hierarchical validation of nested structures with error aggregation, throttled real-time feedback during user input, and submission guards that prevent invalid data from being submitted.

## Getting a Validator Instance

Use `Validator.get()` to retrieve or create a validator instance for an object:

```typescript
const model = new MyModel();
const validator = Validator.get(model);
```

Validator instances are cached. The same object always returns the same validator instance:

```typescript
const validator1 = Validator.get(model);
const validator2 = Validator.get(model);
// validator1 === validator2 (same instance)
```

Validation handlers are MobX reactions, so a validator is garbage collected together with its target only if everything its handlers observe is too, as with [any reaction](https://mobx.js.org/reactions.html#always-dispose-of-reactions). Dispose a handler that reads something outliving the target, such as a store, with the function that `addValidation`, `addSyncHandler` or `addAsyncHandler` returns.

Use `Validator.getSafe()` to get a validator without throwing errors for non-objects:

```typescript
const validator = Validator.getSafe(maybeObject);
// Returns null if maybeObject is not an object
```

## Using `addValidation()`

The `addValidation()` function is a convenient shorthand for adding validation handlers:

```typescript
class Model {
  @observable email = "";

  constructor() {
    makeObservable(this);

    // Sync validation
    addValidation(this, (builder) => { ... });
    // Async validation
    addValidation(this, () => this.email, async (email, builder, abortSignal) => { ... });
  }
}
```

This is equivalent to:

```typescript
const validator = Validator.get(this);

validator.addSyncHandler((builder) => { ... });
validator.addAsyncHandler(() => this.email, async (email, builder, abortSignal) => { ... });
```

**⚠️ Important**:
- If you're using `makeObservable()` or `makeAutoObservable()`, call `addValidation()` **after** them to ensure observability is set up first.
- Handlers run **immediately by default** on registration (`initialRun: true`). Set `initialRun: false` to wait for the first change.

## Synchronous Validation

Validators run with a default delay of 100ms to throttle rapid changes. This delay acts as **throttling**, not debouncing - the handler will eventually run even during continuous changes.

**Key behaviors**:
- Default delay: `Validator.defaultDelayMs` (100ms)
- Configurable via `delayMs` option in handler options
- Multiple rapid changes are batched and validated once after the delay
- Handlers run **immediately by default** on registration unless `initialRun: false` is set

```typescript
class FormModel {
  @observable email = "";
  @observable age = 0;

  constructor() {
    makeObservable(this);

    addValidation(this, (builder) => {
      if (!this.email.includes("@")) {
        builder.invalidate("email", "Invalid email format");
      }
      if (this.age < 18) {
        builder.invalidate("age", "Must be 18 or older");
      }
    });
  }
}

const form = new FormModel();
const validator = Validator.get(form);

// Multiple rapid changes are throttled
runInAction(() => {
  form.email = "test";
});
runInAction(() => {
  form.email = "invalid"; // Only validated once after delay
});

// Wait for validation to complete
await validator.waitForValidation();

validator.isValid // false
validator.invalidKeys // Set(["email"])
validator.invalidKeyCount // 1

// Get error messages
validator.getErrorMessages("email") // Set(["Invalid email format"])
validator.firstErrorMessage // "Invalid email format"

// Check for errors
validator.hasErrors("email") // true
validator.hasErrors("age") // false

// Get detailed errors
for (const [keyPath, error] of validator.findErrors(KeyPath.Self)) {
  console.log(`${keyPath}: ${error.message}`);
}
```

## Validator State Properties

Access the current validation state through these reactive properties:

```typescript
const validator = Validator.get(model);

// Validity state
validator.isValid // boolean - no validation errors
validator.invalidKeys // Set<KeyPath> - direct property errors only (e.g., "name", "email")
validator.invalidKeyPaths // Set<KeyPath> - all errors including nested (e.g., "child.email", "items.0.age")
validator.invalidKeyCount // number - count of direct errors
validator.invalidKeyPathCount // number - count of all errors

// Validation progress
validator.isValidating // boolean - any validation in progress (reactionState + asyncState > 0)
validator.reactionState // number - pending sync reactions (0 or more)
validator.asyncState // number - pending async jobs (0 or more)
validator.waitForValidation() // Promise<void> - resolves once isValidating is false

// Error queries
validator.firstErrorMessage // string | undefined - first error found
validator.getErrorMessages(keyPath) // Set<string> - errors for a path
validator.hasErrors(keyPath, deep?) // boolean - check for errors
validator.findErrors(keyPath, deep?) // Iterator<[KeyPath, ValidationError]>
```

**Understanding validation states**:
- `reactionState`: Counts pending/running synchronous validation reactions
- `asyncState`: Counts pending/running asynchronous validation jobs
- `isValidating`: Convenience property that's `true` when either state is non-zero
- Multiple handlers can add multiple errors to the same key - they accumulate in a Set

## Waiting for Validation

Errors don't reflect a change right away: handlers run after the delay, and async handlers take as long as their work does. Await `waitForValidation()` before reading the result; it resolves once the validation completes:

```typescript
runInAction(() => {
  form.email = "invalid";
});

await validator.waitForValidation();

validator.isValid // false
validator.getErrorMessages("email") // Set(["Invalid email format"])
```

**Key behaviors**:
- A shorthand for `await when(() => !validator.isValidating)`
- Resolves right away if nothing is being validated
- Waits for nested validators as well
- Deadlocks when awaited in an async handler of the same validator or of a nested one, since the handler is part of the validation it waits for

To stop waiting, pass an [AbortSignal](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal). When it's aborted, the promise rejects with the signal's reason, while the validation itself goes on. `AbortSignal.timeout()` puts a time limit on the wait:

```typescript
try {
  await validator.waitForValidation({ signal: AbortSignal.timeout(5000) });
} catch (e) {
  // A "TimeoutError" DOMException after 5 seconds
}
```
