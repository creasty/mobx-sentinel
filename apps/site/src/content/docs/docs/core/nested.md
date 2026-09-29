---
title: "Nested Objects"
description: "Declare nested models with @nested and @nested.hoist, and walk them with StandardNestedFetcher."
sidebar:
  order: 7
---

Utilities for working with nested observable structures.

The `@nested` annotation enables hierarchical tracking and validation - such as tracking changes in deeply nested form structures, validating parent and child objects together, aggregating errors from nested objects to parents, managing changes in arrays of objects, and working with maps, sets, and complex object graphs. Without `@nested`, Watcher and Validator only track direct property assignments, not changes within nested objects.

## `@nested` Annotation

Marks properties as containing nested observable objects that should be tracked or validated.

- For mutable properties, combine with `@observable` to make the property itself observable
- For readonly properties, `@nested` alone is sufficient to track changes within the nested object
- Keys with no key path form are ignored: symbol keys, and map keys such as objects and booleans
- Boxed observables are automatically unwrapped
- Each nested object gets its own Watcher/Validator instance
- Two annotated members that land on the same key path are rejected, since a key path is the address a nested object is looked up by

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

## `@nested.hoist` Annotation

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

## StandardNestedFetcher (low-level API)

A utility class for iterating over nested observable structures with custom data extraction.

**When to use `StandardNestedFetcher`:**
- Build lookup tables or indexes from nested structures
- Extract and transform data from complex nested hierarchies
- Create reactive derived views of nested collections
- Implement custom aggregation logic over nested objects

**Key features:**
- Automatically handles arrays, sets, maps, and boxed observables
- Supports `@nested.hoist` - hoisted entries use `KeyPath.Self`
- Iterating yields one entry per nested object, carrying the annotated member's name (`key`, or `KeyPath.Self` when the member is hoisted), the address of the object (`keyPath`) and the extracted value (`data`)
- `getForKey(keyPath)` narrows the iteration to one annotated member
- **Null values** from the data extractor are **filtered out** - use this to conditionally include entries

**Important limitations**:
- **Keys with no key path form are ignored** - symbol keys, and map keys such as objects and booleans, are not yielded
- **Nothing is cached.** Every iteration reads the annotated members again and calls the data extractor again, so a derivation that iterates re-runs whenever an observable it read along the way changes
- The data extractor is called during iteration, so the observables it reads are tracked by whatever iterates
- **Key paths are not unique.** The contents of one member can land on a single key path (a map holding both `0` and `"0"`), and a hoisted entry can land on a sibling's key path. Every one of them is yielded; match on `key` when you are after a particular member

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

// Iterate inside a derivation to make it reactive.
// The iterator has to be consumed: making one reads no observable.
autorun(() => {
  const entries = Array.from(fetcher);

  // This autorun re-runs when the items array changes (add/remove/reorder),
  // and when anything the data extractor reads changes - here `toString()` reads id and name
  console.log(`Total items: ${entries.length}`);
});

runInAction(() => {
  parent.items.push(new Item(3, "Third"));
  // autorun triggers because the array structure changed
});

runInAction(() => {
  parent.items[0].name = "Updated";
  // autorun triggers: the extractor reads `name`
});
```

**Performance note**: there is no memoization. Whatever iterates re-runs when an observable read during that iteration changes - the structure of the nested collections, plus whatever your data extractor reads. Replacing a collection with an equal one (`parent.items = [...parent.items]`) re-runs its observers too. Keep the extractor narrow to keep large nested structures cheap: an extractor that reads nothing but `entry.data` re-runs only on structural changes. Cache a derived shape yourself (a `@computed` over the entries) when it is read often and changes rarely.
