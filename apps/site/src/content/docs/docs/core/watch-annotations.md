---
title: "Watch Annotations"
description: "Control what a Watcher tracks with @watch, @watch.ref and @unwatch."
sidebar:
  order: 3
---

## Annotations

### `@watch`

Explicitly mark properties for tracking (shallow comparison)

```typescript
class Model {
  @watch field = observable.box(false);

  constructor() {
    makeObservable(this);
  }
}
```

### `@watch.ref`

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

### `@unwatch`

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

## Tracking Nested Objects

Use `@nested` to track changes in nested object properties. Read [Nested](/docs/core/nested/) section for detail.

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
