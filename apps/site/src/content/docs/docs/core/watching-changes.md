---
title: "Watching Changes"
description: "Reset a Watcher, react to its changes, and make changes it should not see."
sidebar:
  order: 2
---

## Managing State

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

## Observing Changes

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

## Temporarily Disable Tracking

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
