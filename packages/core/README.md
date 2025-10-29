# mobx-sentinel/core

Core functionality for tracking changes to MobX observables and validating them.

This package provides three core primitives for reactive state management:

- [Watcher](#watcher): Fine-grained change tracking for MobX observables
- [Validator](#validator): Declarative synchronous and asynchronous validation
- [Nested](#nested): Hierarchical tracking of nested object structures

## Watcher

Track changes to observable properties in MobX models.

`Watcher` is designed to detect whether something has changed - useful for dirty state tracking in forms, triggering side effects when any field changes, detecting modifications for auto-save or data synchronization, and tracking change history. The `changedKeys` and `changedKeyPaths` properties are primarily for debugging purposes to identify which fields changed.

### Getting a Watcher Instance

Use `Watcher.get()` to retrieve or create a watcher instance for an object:

```typescript
const model = new MyModel();
const watcher = Watcher.get(model);
```

Watcher instances are cached and automatically garbage collected with their targets. The same object always returns the same watcher instance:

```typescript
const watcher1 = Watcher.get(model);
const watcher2 = Watcher.get(model);
// watcher1 === watcher2 (same instance)
```

Use `Watcher.getSafe()` to get a watcher without throwing errors for non-objects:

```typescript
const watcher = Watcher.getSafe(maybeObject);
// Returns null if maybeObject is not an object
```

### Watcher State Properties

Access the current change state through these reactive properties:

```typescript
// Boolean indicating any changes
watcher.changed // boolean

// Set of changed property names (direct properties only)
// e.g., "name", "age"
watcher.changedKeys // Set<KeyPath>

// All changed paths including nested (when using @nested)
// "child.value", "items.0.name"
watcher.changedKeyPaths // Set<KeyPath>

// Counter that increments with each change (useful for reactions)
watcher.changedTick // bigint
```

### Starting a Watcher

Watching starts immediately when the Watcher instance is created.
The watcher begins tracking changes as soon as `Watcher.get()` is called for the first time.

To set a new starting point after initialization, use the `reset()` method. For fine-grained control over what gets tracked, see [Temporarily Disable Tracking](#temporarily-disable-tracking).

```typescript
const model = new Model();

runInAction(() => {
  model.name = "John"; // Not tracked: Watcher instance hasn't been created yet.
});

const watcher = Watcher.get(model); // Starts tracking from this point forward
watcher.changed // false

runInAction(() => {
  model.name = "Not John"; // Tracked
});

watcher.changed // true
```

### Basic Change Tracking

`@observable` and `@computed` are automatically tracked unless explicitly excluded with `@unwatch`.

- Properties are tracked using **shallow comparison** by default (arrays/sets/maps are compared by creating shallow copies)
- Use `@watch.ref` for **identity comparison** only (reference equality)
- The `changedTick` property uses `bigint` (starts at `0n`) and can track unlimited changes

#### Scalar properties

```typescript
class Model {
  @observable name = "";
  @observable age = 0;

  constructor() {
    makeObservable(this);
  }

  @computed
  get displayName() {
    return `${this.name} (${this.age})`;
  }
}

const model = new Model();
const watcher = Watcher.get(model);

runInAction(() => {
  model.name = "John";
});

watcher.changed // true
watcher.changedKeys // Set(["name", "displayName"])
```

#### Object properties

Assignments to the property are tracked, but changes to nested properties are NOT.\
See also: [Tracking Nested Objects](#tracking-nested-objects).

```typescript
class Model {
  @observable user = { name: "John" };

  constructor() {
    makeObservable(this);
  }
}

const model = new Model();
const watcher = Watcher.get(model);

runInAction(() => {
  model.user.name = "Jane"; // Not tracked
});

watcher.changed // false

runInAction(() => {
  model.user = { name: "Jane" }; // Tracked - assignment to property
});

watcher.changed // true
watcher.changedKeys // Set(["user"])
```

#### Arrays, Sets, and Maps

Mutations are tracked, but element changes are NOT.\
See also: [Tracking Nested Objects](#tracking-nested-objects).

```typescript
class Model {
  @observable items = [{ value: 1 }];
  @observable tags = new Set(["a"]);
  @observable data = new Map([["key", { value: 1 }]]);

  constructor() {
    makeObservable(this);
  }
}

const model = new Model();
const watcher = Watcher.get(model);

// Tracked: mutations to the collection itself
runInAction(() => {
  model.items.push({ value: 2 });
  model.tags.add("b");
  model.data.set("key2", { value: 2 });
});
watcher.changedKeys // Set(["items", "tags", "data"])

watcher.reset();

// NOT tracked: changes to elements
runInAction(() => {
  model.items[0].value = 99;
  model.data.get("key")!.value = 99;
});
watcher.changed // false
```

### Managing State

Reset the watcher to clear all tracked changes:

```typescript
const watcher = Watcher.get(model);

runInAction(() => {
  model.name = "John";
});

watcher.changed // true
watcher.changedKeys // Set(["name"])

// Clear all tracked changes
watcher.reset();

watcher.changed // false
watcher.changedKeys // Set()
watcher.changedTick // 0n
```

Mark the watcher as changed without incrementing the tick (useful for external state synchronization):

```typescript
watcher.assumeChanged();

watcher.changed // true
watcher.changedTick // 0n (not incremented)
```

### Observing Changes

The `changedTick` property is a counter that increments with each tracked change.

```typescript
class Model {
  @observable name = "";
  @observable age = 0;

  constructor() {
    makeObservable(this);
  }

  @computed
  get displayName() {
    return `${this.name} (${this.age})`;
  }
}

const model = new Model();
const watcher = Watcher.get(model);

watcher.changedTick // 0n

runInAction(() => {
  model.name = "John";
});

// Each change increments the tick
watcher.changedTick // 2n (one for name, one for displayName)
watcher.changedKeys // Set(["name", "displayName"])

watcher.reset();

// After reset, both changedKeys and changedTick are cleared
watcher.changedKeys // Set()
watcher.changedTick // 0n
```

Most useful with `reaction()` to trigger side effects when changes occur:

```typescript
const model = new Model();
const watcher = Watcher.get(model);

// React to any tracked changes
reaction(
  () => watcher.changedTick,
  () => {
    // Process changes here...
    saveToBackend(model);
  }
);

runInAction(() => {
  model.name = "John";
  model.age = 30;
});
// Reaction triggers once after the transaction completes
```

### Temporarily Disable Tracking

Use `unwatch()` as a function to run code without changes being detected by Watcher.

```typescript
const model = new Model();
const watcher = Watcher.get(model);

// Changes inside unwatch() are not tracked
unwatch(() => {
  model.name = "John";
  model.age = 30;
});

watcher.changed // false

// Normal changes are still tracked
runInAction(() => {
  model.name = "Jane";
});

watcher.changed // true
```

**⚠️ Warning about transactions**: When used inside a transaction, watching only resumes when the outermost transaction completes. This is a fundamental limitation of the implementation.

```typescript
runInAction(() => {
  model.field1 = true; // Tracked: Before unwatch begins

  unwatch(() => {
    model.field2 = true; // Not tracked
  });

  model.field3 = true; // ⚠️ NOT tracked: Still in the same transaction as unwatch
});
// The transaction completes here; watching finally resumes

watcher.changedKeys // Set(["field1"])
```

### Annotations

#### `@watch`

Explicitly mark properties for tracking (shallow comparison)

```typescript
class Model {
  @watch field = observable.box(false);

  constructor() {
    makeObservable(this);
  }
}
```

#### `@watch.ref`

Track with identity comparison only

```typescript
class Model {
  @watch.ref @observable items = [1, 2, 3];

  constructor() {
    makeObservable(this);
  }
}

const model = new Model();
const watcher = Watcher.get(model);

runInAction(() => {
  model.items.push(4); // No change detected (same array reference)
});

watcher.changed // false
```

#### `@unwatch`

Exclude properties from tracking

```typescript
class Model {
  @unwatch @observable internalState = false;
  @observable userField = false;

  @unwatch
  @computed
  get derivedState() {
    return this.internalState ? "active" : "inactive";
  }

  constructor() {
    makeObservable(this);
  }
}

const model = new Model();
const watcher = Watcher.get(model);

runInAction(() => {
  model.internalState = true; // Not tracked
});

watcher.changed // false
watcher.changedKeys // Set() - derivedState is also not tracked
```

### Tracking Nested Objects

Use `@nested` to track changes in nested object properties. Read [Nested](#nested) section for detail.

- Each nested object gets its own `Watcher` instance automatically
- Nested watchers are independent - calling `reset()` on a child watcher doesn't affect the parent

```typescript
class Parent {
  @nested @observable child = new Child();
  @nested @observable items = [new Item()];

  constructor() {
    makeObservable(this);
  }
}

class Child {
  @observable value = false;

  constructor() {
    makeObservable(this);
  }
}

const parent = new Parent();
const watcher = Watcher.get(parent);

runInAction(() => {
  parent.child.value = true;
  parent.items[0].value = true;
});

watcher.changed // true
watcher.changedKeys // Set([]) - no direct property changes
watcher.changedKeyPaths // Set(["child.value", "items.0.value"]) - nested change tracked

// Nested watchers are independent
const childWatcher = Watcher.get(parent.child);
childWatcher.reset(); // Does NOT affect parent watcher
watcher.changed // still true
```

## Validator

Perform synchronous and asynchronous validation on MobX models with automatic throttling.

`Validator` is designed for declarative, reactive validation - such as form validation with automatic field-level and cross-field checks, debounced async API checks (e.g., username availability), complex multi-field validation with dependencies, hierarchical validation of nested structures with error aggregation, throttled real-time feedback during user input, and submission guards that prevent invalid data from being submitted.

### Getting a Validator Instance

Use `Validator.get()` to retrieve or create a validator instance for an object:

```typescript
const model = new MyModel();
const validator = Validator.get(model);
```

Validator instances are cached and automatically garbage collected with their targets. The same object always returns the same validator instance:

```typescript
const validator1 = Validator.get(model);
const validator2 = Validator.get(model);
// validator1 === validator2 (same instance)
```

Use `Validator.getSafe()` to get a validator without throwing errors for non-objects:

```typescript
const validator = Validator.getSafe(maybeObject);
// Returns null if maybeObject is not an object
```

### Using `makeValidatable()`

The `makeValidatable()` function is a convenient shorthand for adding validation handlers:

```typescript
class Model {
  @observable email = "";

  constructor() {
    makeObservable(this);

    // Sync validation
    makeValidatable(this, (builder) => { ... });
    // Async validation
    makeValidatable(this, () => this.email, async (email, builder, abortSignal) => { ... });
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
- If you're using `makeObservable()` or `makeAutoObservable()`, call `makeValidatable()` **after** them to ensure observability is set up first.
- Handlers run **immediately by default** on registration (`initialRun: true`). Set `initialRun: false` to wait for the first change.

### Synchronous Validation

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

    makeValidatable(this, (builder) => {
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
await when(() => !validator.isValidating);

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

### Validator State Properties

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

### Asynchronous Validation

Async validations are automatically debounced and cancellable.

**Behaviors**:
- **Previous jobs are always cancelled**: When a new async validation starts, any running validation is automatically aborted
- The `abortSignal` parameter allows your handler to respond to cancellation
- Use the signal with `fetch()` and other async APIs to cancel in-flight requests
- Jobs are throttled like sync validators (default 100ms delay)

**Error handling**:
- Errors thrown in async handlers are logged to the console but don't break validation
- The validation state transitions continue normally even when errors occur
- This ensures one buggy validator doesn't break the entire validation system

```typescript
class UserModel {
  @observable username = "";

  constructor() {
    makeObservable(this);

    makeValidatable(
      this,
      () => this.username,
      async (username, builder, abortSignal) => {
        // Automatic cancellation on new changes
        const response = await fetch(`/api/check-username/${username}`, {
          signal: abortSignal
        });

        if (!response.ok) {
          builder.invalidate("username", "Username already taken");
        }
      },
      { initialRun: false }
    );
  }
}

const user = new UserModel();
const validator = Validator.get(user);

runInAction(() => {
  user.username = "john";
});

// Previous job is cancelled
runInAction(() => {
  user.username = "jane"; // Only this value will be validated
});

// Check validation state
validator.isValidating // true
validator.reactionState // 1 (sync validation pending)
validator.asyncState // 1 (async validation running)

await when(() => !validator.isValidating);

// The validation completed successfully
validator.isValid // true or false depending on the result
```

### Nested Validation

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

### Self Validation

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

### Manual Error Management

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

## Nested

Utilities for working with nested observable structures.

The `@nested` annotation enables hierarchical tracking and validation - such as tracking changes in deeply nested form structures, validating parent and child objects together, aggregating errors from nested objects to parents, managing changes in arrays of objects, and working with maps, sets, and complex object graphs. Without `@nested`, Watcher and Validator only track direct property assignments, not changes within nested objects.

### `@nested` Annotation

Marks properties as containing nested observable objects that should be tracked or validated.

- For mutable properties, combine with `@observable` to make the property itself observable
- For readonly properties, `@nested` alone is sufficient to track changes within the nested object
- Symbol keys in nested objects are ignored
- Boxed observables are automatically unwrapped
- Each nested object gets its own Watcher/Validator instance

```typescript
class Model {
  // Mutable properties - combine @nested with @observable
  @nested @observable user = { name: "John" };
  @nested profile = observable({ bio: "..." });

  // Readonly properties - @nested alone is sufficient
  @nested readonly settings = new Settings();

  // Arrays
  @nested @observable items = [{ id: 1 }];

  // Sets
  @nested @observable tags = new Set([{ name: "tag1" }]);

  // Maps
  @nested @observable data = new Map([["key", { value: 1 }]]);

  // Boxed observables - automatically unwrapped
  @nested current = observable.box({ active: true });

  // Classes
  @nested @observable child = new OtherModel();

  constructor() {
    makeObservable(this);
  }
}
```

### `@nested.hoist` Annotation

Hoists nested changes to the parent level, removing the intermediate key from paths.

**When to use `@nested.hoist`:**
- Custom collection classes that wrap internal arrays/maps
- Transparent proxies where you want to hide the internal structure
- When the nested property is an implementation detail

**Restrictions:**
- Only one `@nested.hoist` property per class
- Cannot mix `@nested` and `@nested.hoist` on the same property

**Example use case:**

When you have a custom collection that wraps an internal data structure.

```typescript
class UserCollection {
  @nested.hoist private _items = observable.array<User>([]);

  constructor() {
    makeObservable(this);
  }

  get length() {
    return this._items.length;
  }

  add(user: User) {
    this._items.push(user);
  }

  get(index: number) {
    return this._items[index];
  }
}

class User {
  @observable name = "";
  @observable email = "";

  constructor() {
    makeObservable(this);
  }
}

const collection = new UserCollection();
collection.add(new User());

const watcher = Watcher.get(collection);

runInAction(() => {
  collection.get(0).name = "John";
});

// Without hoist: changedKeyPaths would be Set(["_items.0.name"])
// With hoist: changes are elevated to parent level
watcher.changedKeyPaths // Set(["0.name"])
```

### StandardNestedFetcher (low-level API)

A utility class for iterating over nested observable structures with custom data extraction.

**When to use `StandardNestedFetcher`:**
- Build lookup tables or indexes from nested structures
- Extract and transform data from complex nested hierarchies
- Create reactive derived views of nested collections
- Implement custom aggregation logic over nested objects

**Key features:**
- Automatically handles arrays, sets, maps, and boxed observables
- Supports `@nested.hoist` - hoisted entries use `KeyPath.Self`
- The `dataMap` is a computed property with **structural equality** (`comparer.shallow`)
- Only re-computes when the structure changes (add/remove), not when individual items change
- **Null values** from the data extractor are **filtered out** - use this to conditionally include entries

**Important limitations**:
- **Symbol keys are ignored** - they won't appear in iteration or the dataMap
- The data extractor function is called for each nested entry
- The `dataMap` uses structural equality, so changing object references will trigger updates

**Example use case:**

Build derived data structures from nested observables, like indexes or lookup tables.

```typescript
class Parent {
  @nested @observable items = [
    new Item(1, "First"),
    new Item(2, "Second")
  ];

  constructor() {
    makeObservable(this);
  }
}

class Item {
  @observable id: number;
  @observable name: string;

  constructor(id: number, name: string) {
    this.id = id;
    this.name = name;
    makeObservable(this);
  }

  toString() {
    return `Item(id = ${this.id}, name = ${this.name})`;
  }
}

const parent = new Parent();

// Create a fetcher that builds a lookup table by ID
const fetcher = new StandardNestedFetcher(
  parent,
  (entry) => {
    // entry.key: property name (e.g., "items")
    // entry.keyPath: full path (e.g., "items.0", "items.1")
    // entry.data: the nested object

    // Transform the nested object - return null to exclude this entry
    return entry.data instanceof Item ? entry.data.toString() : null;
  }
);

// The fetcher is reactive.
// Changes to the nested structure (add/remove items) trigger re-computation

// Iterate over all nested items
for (const entry of fetcher) {
  console.log(`${entry.keyPath}: ${entry.data}`);
}
// Output:
// items.0: Item(id = 1, name = First)
// items.1: Item(id = 2, name = Second)

// Get entries for a specific key
const itemEntries = fetcher.getForKey("items" as KeyPath);
for (const entry of itemEntries) {
  console.log(entry.keyPath); // "items.0", "items.1", etc.
}

// Access as a computed map (reactive)
autorun(() => {
  const dataMap = fetcher.dataMap;

  // Map structure: KeyPath -> extracted data
  const item0 = dataMap.get("items.0" as KeyPath);
  const item1 = dataMap.get("items.1" as KeyPath);

  // This autorun re-runs when items array changes (add/remove/reorder)
  // It does NOT re-run when individual item properties change
  console.log(`Total items: ${dataMap.size}`);
});

runInAction(() => {
  parent.items.push(new Item(3, "Third"));
  // autorun triggers because the array structure changed
});

runInAction(() => {
  parent.items[0].name = "Updated";
  // autorun does NOT trigger - only the item changed, not the structure
});
```

**Performance note**: Because `dataMap` uses `comparer.shallow` for structural equality, the computed property only recalculates when the map's structure changes (keys added/removed), not when individual values change. This is efficient for large nested structures.

## Decorator Support

This library supports both stage-2 and stage-3 decorators.

- **Stage-2 (202112)**: The legacy decorator syntax supported by TypeScript with `"experimentalDecorators": true`
- **Stage-3 (202203)**: The standardized decorator syntax supported by modern TypeScript without experimental flags

You can use either decorator version depending on your TypeScript configuration. All decorators in this library work with both standards.
