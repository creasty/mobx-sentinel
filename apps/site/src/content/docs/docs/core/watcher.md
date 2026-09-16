---
title: "Watcher"
description: "Get a Watcher for a model and see which of its properties have changed."
sidebar:
  order: 1
---

Track changes to observable properties in MobX models.

`Watcher` is designed to detect whether something has changed - useful for dirty state tracking in forms, triggering side effects when any field changes, detecting modifications for auto-save or data synchronization, and tracking change history. The `changedKeys` and `changedKeyPaths` properties are primarily for debugging purposes to identify which fields changed.

## Getting a Watcher Instance

Use `Watcher.get()` to retrieve or create a watcher instance for an object:

```typescript
const model = new MyModel();
const watcher = Watcher.get(model);
```

Watcher instances are cached. The same object always returns the same watcher instance:

```typescript
const watcher1 = Watcher.get(model);
const watcher2 = Watcher.get(model);
// watcher1 === watcher2 (same instance)
```

A watcher observes its target through MobX reactions, so it follows the rule for [any reaction](https://mobx.js.org/reactions.html#always-dispose-of-reactions): it is garbage collected together with its target only if everything it observes is too. A `@computed` that reads a store, an `@observable` holding an observable array, set or map that other objects share, or a `@nested` object that outlives the target keeps the watcher alive, and the watcher keeps the target alive. MobX alone would let such a target go, as a `@computed` observes the store only while something observes the computed, and only the watcher reads the elements of the collection or observes the `@nested` object. A watcher cannot be disposed; to let such a target go, exclude the property with `@unwatch`, which also stops tracking its changes.

Use `Watcher.getSafe()` to get a watcher without throwing errors for non-objects:

```typescript
const watcher = Watcher.getSafe(maybeObject);
// Returns null if maybeObject is not an object
```

## Watcher State Properties

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

## Starting a Watcher

Watching starts immediately when the Watcher instance is created.
The watcher begins tracking changes as soon as `Watcher.get()` is called for the first time.

To set a new starting point after initialization, use the `reset()` method. For fine-grained control over what gets tracked, see [Temporarily Disable Tracking](/docs/core/watching-changes/#temporarily-disable-tracking).

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

## Basic Change Tracking

`@observable` and `@computed` are automatically tracked unless explicitly excluded with `@unwatch`.

- Properties are tracked using **shallow comparison** by default (arrays/sets/maps are compared by creating shallow copies)
- Use `@watch.ref` for **identity comparison** only (reference equality)
- The `changedTick` property uses `bigint` (starts at `0n`) and can track unlimited changes

### Scalar properties

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

### Object properties

Assignments to the property are tracked, but changes to nested properties are NOT.\
See also: [Tracking Nested Objects](/docs/core/watch-annotations/#tracking-nested-objects).

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

### Arrays, Sets, and Maps

Mutations are tracked, but element changes are NOT.\
See also: [Tracking Nested Objects](/docs/core/watch-annotations/#tracking-nested-objects).

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
