---
title: "Nested and Manual Validation"
description: "Validate nested models, let a model validate itself, and manage errors by hand."
sidebar:
  order: 6
---

## Nested Validation

Parent validators automatically track child validation states.

```typescript
class Parent {
  @observable name = "";
  @nested @observable child = new Child();
  @nested @observable items = [new Child()];

  constructor() {
    makeObservable(this);

    makeValidatable(this, (builder) => {
      if (!this.name) {
        builder.invalidate("name", "Name required");
      }
    });
  }
}

class Child {
  @observable email = "";

  constructor() {
    makeObservable(this);

    makeValidatable(this, (builder) => {
      if (!this.email.includes("@")) {
        builder.invalidate("email", "Invalid email");
      }
    });
  }
}

const parent = new Parent();
const validator = Validator.get(parent);

runInAction(() => {
  parent.child.email = "invalid";
  parent.items[0].email = "bad";
});

await when(() => !validator.isValidating);

validator.isValid // false - because nested errors exist

// Direct property errors
validator.invalidKeys // Set([]) - no direct errors
validator.invalidKeyCount // 0

// All errors including nested
validator.invalidKeyPaths // Set(["child.email", "items.0.email"])
validator.invalidKeyPathCount // 2

// Query nested errors
validator.hasErrors("child", true) // true (deep search)
validator.getErrorMessages("child.email") // Set(["Invalid email"])

// Get all nested errors
for (const [keyPath, error] of validator.findErrors(KeyPath.Self, true)) {
  console.log(`${keyPath}: ${error.message}`);
}
// Output:
// child.email: Invalid email
// items.0.email: Invalid email
```

## Self Validation

Validate the object itself rather than specific properties. Use self validation for cross-field validation (e.g., date ranges, password confirmation), business rules that involve multiple fields, or object-level constraints that don't belong to a single field.

```typescript
class Model {
  @observable startDate = new Date();
  @observable endDate = new Date();

  constructor() {
    makeObservable(this);

    makeValidatable(this, (builder) => {
      if (this.startDate > this.endDate) {
        builder.invalidateSelf("Start date must be before end date");
      }
    });
  }
}

const model = new Model();
const validator = Validator.get(model);

runInAction(() => {
  model.startDate = new Date("2024-12-31");
  model.endDate = new Date("2024-01-01");
});

await when(() => !validator.isValidating);

// Self errors appear under KeyPath.Self
validator.getErrorMessages(KeyPath.Self) // Set(["Start date must be before end date"])
validator.hasErrors(KeyPath.Self) // true
```

## Manual Error Management

Use `updateErrors()` to add errors outside of reactive validation handlers - such as displaying server-side validation errors after form submission, adding ad-hoc errors from external sources (e.g., API responses), implementing custom validation that doesn't fit the reactive model, or temporarily marking fields as invalid during multi-step workflows.

```typescript
const validator = Validator.get(model);
const key = Symbol("custom-validation");

// Add errors manually
const dispose = validator.updateErrors(key, (builder) => {
  builder.invalidate("field", "Custom error");
});

validator.hasErrors("field") // true

// Add errors manually - replaces previously added errors
const dispose = validator.updateErrors(key, (builder) => {
  builder.invalidate("field2", "Custom error");
});

validator.hasErrors("field") // false
validator.hasErrors("field2") // true

// Remove errors when no longer needed
dispose();

validator.hasErrors("field") // false
validator.hasErrors("field2") // false
```

The `key` is an identifier that groups manual errors together, serving as a namespace to manage errors independently:

- **Error isolation**: Each key maintains its own set of errors. Different keys don't interfere with each other.
- **Error replacement**: Calling `updateErrors()` with the same key replaces previous errors from that key.
- **Selective cleanup**: The returned dispose function only removes errors associated with that specific key.

Use different keys for different error sources (e.g., server validation, client validation, external APIs). The key is typically a `Symbol` to ensure uniqueness.

**Example with multiple keys:**

```typescript
const serverKey = Symbol("server-errors");
const clientKey = Symbol("client-errors");

// Server validation errors
validator.updateErrors(serverKey, (builder) => {
  builder.invalidate("email", "Email already exists");
});

// Client validation errors
validator.updateErrors(clientKey, (builder) => {
  builder.invalidate("email", "Invalid format");
});

// Both errors coexist
validator.getErrorMessages("email") // Set(["Email already exists", "Invalid format"])

// Update server errors - only replaces serverKey's errors
validator.updateErrors(serverKey, (builder) => {
  builder.invalidate("username", "Username taken");
});

validator.hasErrors("email") // still true (clientKey's error remains)
```
