import { ValidationError, ValidationErrorMapBuilder } from "./error";
import { KeyPath, KeyPathMultiMap, type ReadonlyKeyPathMultiMap } from "./keyPath";

describe("ValidationError", () => {
  it("can be created with a string reason", () => {
    const error = new ValidationError({ keyPath: KeyPath.build("key1.subKey1"), reason: "reason" });
    expect(error.key).toBe("key1");
    expect(error.keyPath).toBe("key1.subKey1");
    expect(error.message).toBe("reason");
    expect(error.cause).toBeUndefined();
  });

  it("can be created with an error reason", () => {
    const error = new ValidationError({ keyPath: KeyPath.build("key1.subKey1"), reason: new Error("reason") });
    expect(error.key).toBe("key1");
    expect(error.keyPath).toBe("key1.subKey1");
    expect(error.message).toBe("reason");
    expect(error.cause).toBeInstanceOf(Error);
  });
});

describe("ValidationErrorMapBuilder", () => {
  it("can be created", () => {
    const builder = new ValidationErrorMapBuilder<unknown>();
    expect(builder.hasError).toBe(false);
  });

  describe(".build", () => {
    it("returns a frozen array", () => {
      const builder = new ValidationErrorMapBuilder<unknown>();
      const result = ValidationErrorMapBuilder.build(builder);
      expect(result).toBeInstanceOf(KeyPathMultiMap);
      expect(Object.isFrozen(result)).toBe(true);
    });
  });

  describe("#invalidate", () => {
    it("adds an error for the given key", () => {
      const builder = new ValidationErrorMapBuilder<{ key1: number; key2: number }>();
      builder.invalidate("key1", "reason");
      expect(builder.hasError).toBe(true);

      const result = ValidationErrorMapBuilder.build(builder);
      expect(result.size).toEqual(1);
      expect(result.get(KeyPath.build("key1"))).toEqual(
        new Set([new ValidationError({ keyPath: KeyPath.build("key1"), reason: "reason" })])
      );
    });

    it("adds another error for the same key", () => {
      const builder = new ValidationErrorMapBuilder<{ key1: number; key2: number }>();
      builder.invalidate("key1", "reason1");
      builder.invalidate("key1", "reason2");
      expect(builder.hasError).toBe(true);

      const result = ValidationErrorMapBuilder.build(builder);
      expect(result.size).toEqual(1);
      expect(result.get(KeyPath.build("key1"))).toEqual(
        new Set([
          new ValidationError({ keyPath: KeyPath.build("key1"), reason: "reason1" }),
          new ValidationError({ keyPath: KeyPath.build("key1"), reason: "reason2" }),
        ])
      );
    });

    it("adds an error for a different key", () => {
      const builder = new ValidationErrorMapBuilder<{ key1: number; key2: number }>();
      builder.invalidate("key1", "reasonA");
      builder.invalidate("key2", "reasonB");
      expect(builder.hasError).toBe(true);

      const result = ValidationErrorMapBuilder.build(builder);
      expect(result.size).toEqual(2);
      expect(result.get(KeyPath.build("key1"))).toEqual(
        new Set([new ValidationError({ keyPath: KeyPath.build("key1"), reason: "reasonA" })])
      );
      expect(result.get(KeyPath.build("key2"))).toEqual(
        new Set([new ValidationError({ keyPath: KeyPath.build("key2"), reason: "reasonB" })])
      );
    });
  });

  describe("#invalidateSelf", () => {
    it("adds an error for the target object itself", () => {
      const builder = new ValidationErrorMapBuilder<{ key1: number; key2: number }>();
      builder.invalidateSelf("reason");
      expect(builder.hasError).toBe(true);

      const result = ValidationErrorMapBuilder.build(builder);
      expect(result.size).toEqual(1);
      expect(result.get(KeyPath.Self)).toEqual(
        new Set([new ValidationError({ keyPath: KeyPath.Self, reason: "reason" })])
      );
    });
  });
});

describe("ValidationError (details)", () => {
  const create = (keyPath: KeyPath, reason: string | Error) => new ValidationError({ keyPath, reason });

  test("types", () => {
    expectTypeOf<ValidationError>().toExtend<Error>();
    expectTypeOf<ValidationError["key"]>().toEqualTypeOf<KeyPath>();
    expectTypeOf<ValidationError["keyPath"]>().toEqualTypeOf<KeyPath>();
    expectTypeOf<ValidationError["message"]>().toEqualTypeOf<string>();
    expectTypeOf<ValidationError["cause"]>().toEqualTypeOf<Error | undefined>();
    expectTypeOf(ValidationError).constructorParameters.toEqualTypeOf<
      [args: { keyPath: KeyPath; reason: string | Error }]
    >();
  });

  it("is an instance of Error and ValidationError", () => {
    const error = create(KeyPath.build("a"), "reason");
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(ValidationError);
    expect(Object.getPrototypeOf(error)).toBe(ValidationError.prototype);
    expect(typeof error.stack).toBe("string");
  });

  it("keeps the default Error name", () => {
    const error = create(KeyPath.build("a"), "reason");
    // PINNED(quirk): name is inherited as "Error", so String(error) is "Error: reason". Decide: should ValidationError set name = "ValidationError" (flip to toBe("ValidationError") / "ValidationError: reason"; if set as an own field, the own-property and JSON tests below change too)?
    expect(error.name).toBe("Error");
    expect(String(error)).toBe("Error: reason");
  });

  it("uses the Error reason instance itself as the cause", () => {
    const reason = new Error("reason");
    const error = create(KeyPath.build("a"), reason);
    expect(error.cause).toBe(reason);
    expect(error.message).toBe("reason");
  });

  it("takes the message of an Error subclass reason", () => {
    class CustomError extends Error {
      name = "CustomError";
    }
    const reason = new CustomError("custom");
    const error = create(KeyPath.build("a"), reason);
    expect(error.message).toBe("custom");
    expect(error.cause).toBe(reason);
  });

  it("accepts another ValidationError as the reason", () => {
    const inner = create(KeyPath.build("inner.path"), "inner reason");
    const error = create(KeyPath.build("outer"), inner);
    expect(error.message).toBe("inner reason");
    expect(error.cause).toBe(inner);
    expect(error.key).toBe("outer");
    expect(error.keyPath).toBe("outer");
  });

  it("keeps an empty message from an Error reason", () => {
    const reason = new Error();
    const error = create(KeyPath.build("a"), reason);
    expect(error.message).toBe("");
    expect(error.cause).toBe(reason);
  });

  it("keeps an empty string reason", () => {
    const error = create(KeyPath.build("a"), "");
    expect(error.message).toBe("");
    expect(error.cause).toBeUndefined();
  });

  it("snapshots the message of an Error reason at construction", () => {
    const reason = new Error("before");
    const error = create(KeyPath.build("a"), reason);
    reason.message = "after";
    expect(error.message).toBe("before");
    expect(error.cause?.message).toBe("after");
  });

  it("uses an Error-shaped object that is not an Error instance as the message itself", () => {
    const reason = { name: "CustomError", message: "plain message" };
    expectTypeOf(reason).toExtend<string | Error>();
    const error = create(KeyPath.build("a"), reason);
    // PINNED(bug): the reason type accepts any structurally Error-shaped object (e.g. an error from another realm), but only `instanceof Error` is unwrapped, so message becomes the object itself and cause is undefined. Expected: message is "plain message" and cause is the reason. Flip these assertions when fixing.
    expect(error.message).toBe(reason);
    expect(error.cause).toBeUndefined();
  });

  it("derives key from the first segment of the key path", () => {
    const error = create(KeyPath.build("items", 0, "name"), "reason");
    expect(error.key).toBe("items");
    expect(error.keyPath).toBe("items.0.name");

    const indexError = create(KeyPath.build(0, "name"), "reason");
    expect(indexError.key).toBe("0");
    expect(indexError.keyPath).toBe("0.name");
  });

  it("uses the key path as the key for a single-level key path", () => {
    const error = create(KeyPath.build("a"), "reason");
    expect(error.key).toBe("a");
    expect(error.keyPath).toBe("a");
  });

  it("uses a self path as the key for self key paths", () => {
    const error = create(KeyPath.Self, "reason");
    expect(error.key).toBe(KeyPath.Self);
    expect(error.keyPath).toBe(KeyPath.Self);
  });

  it("does not normalize an empty string key path", () => {
    const error = create("" as KeyPath, "reason");
    expect(error.key).toBe(KeyPath.Self);
    // PINNED(quirk): key is normalized to KeyPath.Self but keyPath stays "", so the two fields disagree and map lookups by KeyPath.Self miss it. Decide: should the constructor normalize "" to KeyPath.Self (flip to toBe(KeyPath.Self))?
    expect(error.keyPath).toBe("");
  });

  it("defines key, keyPath, message and cause as own enumerable properties", () => {
    const error = create(KeyPath.build("a"), "reason");
    expect(Object.keys(error)).toEqual(["key", "keyPath", "message", "cause"]);
    expect(Object.hasOwn(error, "cause")).toBe(true);
    expect(Object.getOwnPropertyDescriptor(error, "message")).toEqual({
      value: "reason",
      writable: true,
      enumerable: true,
      configurable: true,
    });
  });

  describe("equality", () => {
    it("equals another error created with the same arguments", () => {
      expect(create(KeyPath.build("a"), "reason")).toEqual(create(KeyPath.build("a"), "reason"));
      expect(create(KeyPath.build("a"), "reason")).toStrictEqual(create(KeyPath.build("a"), "reason"));
      expect(create(KeyPath.build("a"), "reason")).not.toBe(create(KeyPath.build("a"), "reason"));
    });

    it("differs when the reason differs", () => {
      expect(create(KeyPath.build("a"), "reason1")).not.toEqual(create(KeyPath.build("a"), "reason2"));
    });

    it("differs when the key path differs, even under the same key", () => {
      expect(create(KeyPath.build("a"), "reason")).not.toEqual(create(KeyPath.build("b"), "reason"));
      expect(create(KeyPath.build("a.x"), "reason")).not.toEqual(create(KeyPath.build("a.y"), "reason"));
    });

    it("differs between a string reason and an Error reason with the same message", () => {
      expect(create(KeyPath.build("a"), "reason")).not.toEqual(create(KeyPath.build("a"), new Error("reason")));
    });

    it("equals when Error reasons are distinct instances with the same message", () => {
      expect(create(KeyPath.build("a"), new Error("reason"))).toEqual(create(KeyPath.build("a"), new Error("reason")));
    });

    it("differs from a plain Error with the same message", () => {
      expect(create(KeyPath.build("a"), "reason")).not.toEqual(new Error("reason"));
    });
  });
});

describe("ValidationErrorMapBuilder (details)", () => {
  test("types", () => {
    expectTypeOf<Parameters<ValidationErrorMapBuilder<{ a: number; 0: string }>["invalidate"]>>().toEqualTypeOf<
      [key: "a", reason: string | Error]
    >();
    expectTypeOf<Parameters<ValidationErrorMapBuilder<unknown>["invalidate"]>[0]>().toEqualTypeOf<never>();
    expectTypeOf<Parameters<ValidationErrorMapBuilder<unknown>["invalidateSelf"]>>().toEqualTypeOf<
      [reason: string | Error]
    >();
    expectTypeOf<ValidationErrorMapBuilder<unknown>["hasError"]>().toEqualTypeOf<boolean>();
    expectTypeOf(ValidationErrorMapBuilder.build).returns.toEqualTypeOf<ReadonlyKeyPathMultiMap<ValidationError>>();
  });

  it("rejects keys that are not string keys of the target at the type level", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    // @ts-expect-error - "unknown" is not a key of the target
    builder.invalidate("unknown", "reason");
    // Runtime does not validate the key
    expect(Array.from(ValidationErrorMapBuilder.build(builder)).map(([keyPath]) => keyPath)).toEqual(["unknown"]);
  });

  it("stores an Error reason as the cause", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    const reason = new Error("reason");
    builder.invalidate("key1", reason);

    const [error] = ValidationErrorMapBuilder.build(builder).get(KeyPath.build("key1"));
    expect(error.message).toBe("reason");
    expect(error.cause).toBe(reason);
  });

  it("stores an Error reason as the cause for self errors", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    const reason = new Error("reason");
    builder.invalidateSelf(reason);

    const [error] = ValidationErrorMapBuilder.build(builder).get(KeyPath.Self);
    expect(error.key).toBe(KeyPath.Self);
    expect(error.keyPath).toBe(KeyPath.Self);
    expect(error.message).toBe("reason");
    expect(error.cause).toBe(reason);
  });

  it("keeps separate errors for identical reasons on the same key", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    builder.invalidate("key1", "same");
    builder.invalidate("key1", "same");
    builder.invalidateSelf("same");
    builder.invalidateSelf("same");

    const result = ValidationErrorMapBuilder.build(builder);
    expect(result.size).toBe(2);
    expect(result.get(KeyPath.build("key1")).size).toBe(2);
    expect(result.get(KeyPath.Self).size).toBe(2);
  });

  it("keeps key and self errors side by side in insertion order", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number; key2: number }>();
    builder.invalidate("key1", "a");
    builder.invalidateSelf("b");
    builder.invalidate("key2", "c");
    builder.invalidate("key1", "d");

    const result = ValidationErrorMapBuilder.build(builder);
    expect(Array.from(result).map(([keyPath, error]) => [keyPath, error.keyPath, error.message])).toEqual([
      ["key1", "key1", "a"],
      ["key1", "key1", "d"],
      [KeyPath.Self, KeyPath.Self, "b"],
      ["key2", "key2", "c"],
    ]);
  });

  it("treats dots in the key as a nested key path", () => {
    const builder = new ValidationErrorMapBuilder<{ "a.b": number }>();
    builder.invalidate("a.b", "reason");

    const result = ValidationErrorMapBuilder.build(builder);
    const [error] = result.get(KeyPath.build("a.b"));
    // PINNED(quirk): a property name containing "." is recorded as the nested path "a.b" under key "a", so it reads as an error on a child of property "a". Decide: should invalidate escape dotted keys (flip key to toBe("a.b") and findPrefix("a") to toEqual([])) or reject them?
    expect(error.key).toBe("a");
    expect(error.keyPath).toBe("a.b");
    expect(result.has("a" as KeyPath)).toBe(false);
    expect(Array.from(result.findPrefix("a" as KeyPath))).toEqual([error]);
  });

  it("merges errors for an empty-string key into self errors", () => {
    const builder = new ValidationErrorMapBuilder<{ "": number }>();
    builder.invalidate("", "empty key");
    builder.invalidateSelf("self");

    const result = ValidationErrorMapBuilder.build(builder);
    // PINNED(quirk): KeyPath.build("") is KeyPath.Self, so invalidate("") is indistinguishable from invalidateSelf(). Decide: should an empty property name be kept as its own key (flip size to 2 and the self messages to ["self"])?
    expect(result.size).toBe(1);
    expect(Array.from(result.get(KeyPath.Self)).map((error) => error.message)).toEqual(["empty key", "self"]);
  });

  it("returns the same frozen map on every build", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    builder.invalidate("key1", "reason");

    const first = ValidationErrorMapBuilder.build(builder);
    const second = ValidationErrorMapBuilder.build(builder);
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(builder)).toBe(false);
  });

  it("throws when invalidating after build", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    builder.invalidate("key1", "reason");
    const result = ValidationErrorMapBuilder.build(builder);

    // PINNED(quirk): build() freezes the builder's own map, so the builder cannot be reused and throws a KeyPathMultiMap error. Decide: should build() snapshot a copy (flip to not.toThrow()) or should the builder report a builder-specific error?
    expect(() => builder.invalidate("key1", "late")).toThrow(new Error("Cannot modify frozen KeyPathMultiMap"));
    expect(() => builder.invalidateSelf("late")).toThrow(new Error("Cannot modify frozen KeyPathMultiMap"));
    expect(builder.hasError).toBe(true);
    expect(result.size).toBe(1);
    expect(result.get(KeyPath.build("key1")).size).toBe(1);
  });

  it("builds an empty frozen map when nothing was invalidated", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    const result = ValidationErrorMapBuilder.build(builder);
    expect(result.size).toBe(0);
    expect(Array.from(result)).toEqual([]);
    expect(builder.hasError).toBe(false);
  });

  it("throws a TypeError when build is given something other than a builder", () => {
    expect(() => ValidationErrorMapBuilder.build({} as ValidationErrorMapBuilder<unknown>)).toThrow(TypeError);
  });

  it("keeps builders independent of each other", () => {
    const first = new ValidationErrorMapBuilder<{ key1: number }>();
    const second = new ValidationErrorMapBuilder<{ key1: number }>();
    first.invalidate("key1", "reason");
    expect(second.hasError).toBe(false);

    ValidationErrorMapBuilder.build(first);
    expect(() => second.invalidate("key1", "reason")).not.toThrow();
    expect(ValidationErrorMapBuilder.build(second)).not.toBe(ValidationErrorMapBuilder.build(first));
  });

  it("supports prefix and self lookups on the built map", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number; key2: number }>();
    builder.invalidate("key1", "a");
    builder.invalidate("key2", "b");
    builder.invalidateSelf("c");

    const result = ValidationErrorMapBuilder.build(builder);
    expect(Array.from(result.findPrefix(KeyPath.build("key1"))).map((error) => error.message)).toEqual(["a"]);
    expect(Array.from(result.findPrefix(KeyPath.Self)).map((error) => error.message)).toEqual(["a", "b", "c"]);
    expect(Array.from(result.findExact(KeyPath.Self)).map((error) => error.message)).toEqual(["c"]);
  });

  test("key types", () => {
    const sym = Symbol("sym");
    type Target = { a: number; b?: string; readonly c: boolean; [sym]: number; get d(): number; method(): void };
    type AcceptedKey = Parameters<ValidationErrorMapBuilder<Target>["invalidate"]>[0];
    // PINNED(quirk): keyof includes method names, so invalidate("method", ...) type-checks (symbol keys are excluded). Decide: should method keys be excluded from the accepted keys (flip to toEqualTypeOf<"a" | "b" | "c" | "d">())?
    expectTypeOf<AcceptedKey>().toEqualTypeOf<"a" | "b" | "c" | "d" | "method">();
    expectTypeOf<
      Parameters<ValidationErrorMapBuilder<Record<string, number>>["invalidate"]>[0]
    >().toEqualTypeOf<string>();
    expectTypeOf<Parameters<ValidationErrorMapBuilder<any>["invalidate"]>[0]>().toEqualTypeOf<string>();
  });

  it("merges a symbol key passed at runtime into self errors", () => {
    const builder = new ValidationErrorMapBuilder<{ key1: number }>();
    builder.invalidate(Symbol("key") as unknown as "key1", "reason");

    const result = ValidationErrorMapBuilder.build(builder);
    const [error] = result.get(KeyPath.Self);
    expect(result.size).toBe(1);
    expect(error.key).toBe(KeyPath.Self);
    expect(error.keyPath).toBe(KeyPath.Self);
  });
});

describe("ValidationError (fields and serialization)", () => {
  it("declares its fields readonly at the type level only", () => {
    const error = new ValidationError({ keyPath: KeyPath.build("a"), reason: "reason" });
    // @ts-expect-error - key is read-only
    error.key = KeyPath.build("b");
    // @ts-expect-error - keyPath is read-only
    error.keyPath = KeyPath.build("b");
    // @ts-expect-error - message is read-only
    error.message = "changed";
    expect(error.key).toBe("b");
    expect(error.keyPath).toBe("b");
    expect(error.message).toBe("changed");
  });

  it("keeps the cause chain of an Error reason", () => {
    const reason = new Error("outer", { cause: "inner" });
    const error = new ValidationError({ keyPath: KeyPath.build("a"), reason });
    expect(error.cause).toBe(reason);
    expect(error.cause?.cause).toBe("inner");
    expect(error.message).toBe("outer");
  });

  it("serializes own fields with JSON.stringify", () => {
    const keyError = new ValidationError({ keyPath: KeyPath.build("a", "b"), reason: "reason" });
    expect(JSON.parse(JSON.stringify(keyError))).toEqual({ key: "a", keyPath: "a.b", message: "reason" });

    const selfError = new ValidationError({ keyPath: KeyPath.Self, reason: new Error("self reason") });
    // PINNED(quirk): KeyPath.Self is a symbol, so JSON.stringify drops key and keyPath for self errors, and the Error cause serializes as {}. Decide: should ValidationError provide a toJSON() that encodes self paths and the cause message?
    expect(JSON.parse(JSON.stringify(selfError))).toEqual({ message: "self reason", cause: {} });
  });
});
