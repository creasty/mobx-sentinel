import { KeyPath, KeyPathMultiMap, type ReadonlyKeyPathMultiMap } from "./keyPath";

describe("KeyPath.Component", () => {
  test("being a branded type", () => {
    expectTypeOf<KeyPath.Component>().toMatchTypeOf<string>();
    expectTypeOf<string>().not.toMatchTypeOf<KeyPath.Component>();
  });
});

describe("KeyPath.Self", () => {
  test("being a branded type", () => {
    expectTypeOf<KeyPath.Self>().toMatchTypeOf<symbol>();
    expectTypeOf<symbol>().not.toMatchTypeOf<KeyPath.Self>();
  });

  describe("KeyPath.isSelf", () => {
    it("returns true if the key path is a self path", () => {
      expect(KeyPath.isSelf(KeyPath.Self)).toBe(true);
    });

    it("returns false if the key path is not a self path", () => {
      expect(KeyPath.isSelf("a" as KeyPath)).toBe(false);
    });

    it("returns true if the key path is an empty string", () => {
      expect(KeyPath.isSelf("" as KeyPath)).toBe(true);
    });
  });
});

describe("KeyPath.build", () => {
  it("returns a self path if no keys are provided", () => {
    expect(KeyPath.build()).toBe(KeyPath.Self);
  });

  it("builds a key path with strings", () => {
    expect(KeyPath.build("a", "b", "c")).toBe("a.b.c");
  });

  it("builds a key path with numbers", () => {
    expect(KeyPath.build("a", 0, "c")).toBe("a.0.c");
  });

  it("builds a key path with self paths", () => {
    expect(KeyPath.build(KeyPath.Self)).toBe(KeyPath.Self);
  });

  it("ignores nulls", () => {
    expect(KeyPath.build("a", null, "c", null)).toBe("a.c");
  });

  it("ignores empty strings", () => {
    expect(KeyPath.build("a", "", "c", "")).toBe("a.c");
  });

  it("ignores self paths", () => {
    expect(KeyPath.build("a", KeyPath.Self, "c", KeyPath.Self)).toBe("a.c");
  });
});

describe("KeyPath.getParentKey", () => {
  it("returns the parent key of a key path", () => {
    expect(KeyPath.getParentKey("a.b.c" as KeyPath)).toBe("a");
    expect(KeyPath.getParentKey("a" as KeyPath)).toBe("a");
  });

  it("returns a self path if the key path is a self path", () => {
    expect(KeyPath.getParentKey(KeyPath.Self)).toBe(KeyPath.Self);
  });

  it("returns a self path if the key path is empty", () => {
    expect(KeyPath.getParentKey("" as KeyPath)).toBe(KeyPath.Self);
  });
});

describe("KeyPath.getRelative", () => {
  it("returns the relative key path", () => {
    expect(KeyPath.getRelative("a.b.c" as KeyPath, "a.b" as KeyPath)).toBe("c");
  });

  it("returns null if the key path is not a child of the prefix key path", () => {
    expect(KeyPath.getRelative("a.b.c" as KeyPath, "a.c" as KeyPath)).toBeNull();
  });

  it("considers path delimiter when checking if key path is a child of prefix", () => {
    expect(KeyPath.getRelative("aa" as KeyPath, "a" as KeyPath)).toBeNull();
    expect(KeyPath.getRelative("a.bb" as KeyPath, "a.b" as KeyPath)).toBeNull();
  });

  it("returns a self path if the prefix key path is the same as the key path", () => {
    expect(KeyPath.getRelative("a.b.c" as KeyPath, "a.b.c" as KeyPath)).toBe(KeyPath.Self);
  });

  it("returns a self path if the key path is a self path", () => {
    expect(KeyPath.getRelative(KeyPath.Self, "a.b.c" as KeyPath)).toBe(KeyPath.Self);
  });

  it("returns a self path if the key path is empty", () => {
    expect(KeyPath.getRelative("" as KeyPath, "a.b.c" as KeyPath)).toBe(KeyPath.Self);
  });

  it("returns the original key path if the prefix key path is a self path", () => {
    expect(KeyPath.getRelative("a.b.c" as KeyPath, KeyPath.Self)).toBe("a.b.c");
  });

  it("returns the original key path if the prefix key path is empty", () => {
    expect(KeyPath.getRelative("a.b.c" as KeyPath, "" as KeyPath)).toBe("a.b.c");
  });
});

describe("KeyPath.getAncestors", () => {
  it("includes the key path itself when includeSelf is true", () => {
    expect(Array.from(KeyPath.getAncestors("a.b.c" as KeyPath))).toEqual(["a.b.c", "a.b", "a"]);
  });

  it("does not include the key path itself when includeSelf is false", () => {
    expect(Array.from(KeyPath.getAncestors("a.b.c" as KeyPath, false))).toEqual(["a.b", "a"]);
  });

  it("returns a self path if the key path is a single-level key path", () => {
    expect(Array.from(KeyPath.getAncestors("a" as KeyPath))).toEqual(["a"]);
    expect(Array.from(KeyPath.getAncestors("a" as KeyPath, false))).toEqual([]);
  });

  it("returns a self path if the key path is a self path", () => {
    expect(Array.from(KeyPath.getAncestors(KeyPath.Self))).toEqual([KeyPath.Self]);
    expect(Array.from(KeyPath.getAncestors(KeyPath.Self, false))).toEqual([]);
  });

  it("returns a self path if the key path is empty", () => {
    expect(Array.from(KeyPath.getAncestors("" as KeyPath))).toEqual([KeyPath.Self]);
    expect(Array.from(KeyPath.getAncestors("" as KeyPath, false))).toEqual([]);
  });
});

describe("KeyPathMultiMap", () => {
  describe("#findExact", () => {
    it("yields no values when key path does not exist", () => {
      const map = new KeyPathMultiMap<string>();
      expect(Array.from(map.findExact("test" as KeyPath))).toEqual([]);
    });

    it("yields all values for exact key path match", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b.c" as KeyPath, "value1");
      map.set("a.b.c" as KeyPath, "value2");
      expect(Array.from(map.findExact("a.b.c" as KeyPath))).toEqual(["value1", "value2"]);
    });

    it("yields values for self key path", () => {
      const map = new KeyPathMultiMap<string>();
      map.set(KeyPath.Self, "value");
      expect(Array.from(map.findExact(KeyPath.Self))).toEqual(["value"]);
    });
  });

  describe("#findPrefix", () => {
    it("yields no values when key path does not exist", () => {
      const map = new KeyPathMultiMap<string>();
      expect(Array.from(map.findPrefix("test" as KeyPath))).toEqual([]);
    });

    it("yields values for exact key path match", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value1");
      map.set("a.b" as KeyPath, "value2");
      expect(Array.from(map.findPrefix("a.b" as KeyPath))).toEqual(["value1", "value2"]);
    });

    it("yields values for child key paths", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b.c" as KeyPath, "child1");
      map.set("a.b.d" as KeyPath, "child2");
      expect(Array.from(map.findPrefix("a.b" as KeyPath))).toEqual(["child1", "child2"]);
    });

    it("yields both exact matches and child values", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "parent");
      map.set("a.b.c" as KeyPath, "child");
      expect(Array.from(map.findPrefix("a.b" as KeyPath))).toEqual(["parent", "child"]);
    });

    it("yields all values with self key path", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "parent");
      map.set("a.b.c" as KeyPath, "child");
      expect(Array.from(map.findPrefix(KeyPath.Self))).toEqual(["parent", "child"]);
    });
  });

  describe("#get", () => {
    it("calls findExact when prefixMatch is false", () => {
      const map = new KeyPathMultiMap<string>();
      const spy = vi.spyOn(map, "findExact");

      map.get("a.b" as KeyPath, false);
      expect(spy).toHaveBeenCalledWith("a.b" as KeyPath);
    });

    it("calls findPrefix when prefixMatch is true", () => {
      const map = new KeyPathMultiMap<string>();
      const spy = vi.spyOn(map, "findPrefix");

      map.get("a.b" as KeyPath, true);
      expect(spy).toHaveBeenCalledWith("a.b" as KeyPath);
    });

    it("defaults to findExact when prefixMatch is not specified", () => {
      const map = new KeyPathMultiMap<string>();
      const spy = vi.spyOn(map, "findExact");

      map.get("a.b" as KeyPath);
      expect(spy).toHaveBeenCalledWith("a.b" as KeyPath);
    });
  });

  describe("#set", () => {
    it("allows multiple values for the same key path", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("test" as KeyPath, "value1");
      map.set("test" as KeyPath, "value2");
      expect(map.get("test" as KeyPath)).toEqual(new Set(["value1", "value2"]));
    });

    it("updates prefix mappings", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b.c" as KeyPath, "value");
      expect(map.get("a" as KeyPath, true)).toEqual(new Set(["value"]));
      expect(map.get("a.b" as KeyPath, true)).toEqual(new Set(["value"]));
    });
  });

  describe("#delete", () => {
    it("removes values for the key path", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("test" as KeyPath, "value");
      map.delete("test" as KeyPath);
      expect(map.get("test" as KeyPath)).toEqual(new Set());
    });

    it("updates prefix mappings", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b.c" as KeyPath, "value");
      map.delete("a.b.c" as KeyPath);
      expect(map.get("a" as KeyPath, true)).toEqual(new Set());
      expect(map.get("a.b" as KeyPath, true)).toEqual(new Set());
    });
  });

  describe("#size", () => {
    it("returns the number of key paths", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value1");
      map.set("x.y" as KeyPath, "value2");
      map.set("p.q" as KeyPath, "value1");
      expect(map.size).toBe(3);
    });
  });

  describe("#has", () => {
    it("returns true if the key path exists", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value1");
      expect(map.has("a.b" as KeyPath)).toBe(true);
    });

    it("returns false if the key path does not exist", () => {
      const map = new KeyPathMultiMap<string>();
      expect(map.has("a.b" as KeyPath)).toBe(false);
    });

    it("returns true if the key path exists with prefixMatch", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value1");
      expect(map.has("a" as KeyPath, true)).toBe(true);
    });
  });

  describe("iterator", () => {
    it("iterates over all values", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value1");
      map.set("x.y" as KeyPath, "value2");
      map.set("p.q" as KeyPath, "value1");

      const entries = Array.from(map);
      expect(entries).toEqual([
        ["a.b" as KeyPath, "value1"],
        ["x.y" as KeyPath, "value2"],
        ["p.q" as KeyPath, "value1"],
      ]);
    });
  });

  describe("#toImmutable", () => {
    it("creates an immutable version of the map", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value1");

      const immutable = map.toImmutable();
      expect(immutable).toBe(map);

      expect(Object.isFrozen(map)).toBe(true);
      expect(map.get("a.b" as KeyPath)).toEqual(new Set(["value1"]));

      expect(() => map.set("a.b" as KeyPath, "value2")).toThrow(/frozen/);
      expect(() => map.delete("a.b" as KeyPath)).toThrow(/frozen/);
      expect(map.get("a.b" as KeyPath)).toEqual(new Set(["value1"]));
    });
  });
});

describe("KeyPath types", () => {
  test("KeyPath is the union of the branded component and self types", () => {
    expectTypeOf<KeyPath>().toEqualTypeOf<KeyPath.Component | KeyPath.Self>();
  });

  test("the branded types are not interchangeable with each other or with their base types", () => {
    expectTypeOf<KeyPath.Component>().not.toExtend<KeyPath.Self>();
    expectTypeOf<KeyPath.Self>().not.toExtend<KeyPath.Component>();
    expectTypeOf<"a">().not.toExtend<KeyPath>();
    expectTypeOf<symbol>().not.toExtend<KeyPath>();
  });

  test("KeyPath.Self is typed as the branded self type", () => {
    expectTypeOf(KeyPath.Self).toEqualTypeOf<KeyPath.Self>();
  });

  test("function signatures", () => {
    expectTypeOf(KeyPath.isSelf).parameters.toEqualTypeOf<[KeyPath]>();
    expectTypeOf(KeyPath.build).parameters.toEqualTypeOf<(KeyPath | string | number | null)[]>();
    expectTypeOf(KeyPath.build).returns.toEqualTypeOf<KeyPath>();
    expectTypeOf(KeyPath.getRelative).parameters.toEqualTypeOf<[KeyPath, KeyPath]>();
    expectTypeOf(KeyPath.getRelative).returns.toEqualTypeOf<KeyPath | null>();
    expectTypeOf(KeyPath.getParentKey).parameters.toEqualTypeOf<[KeyPath]>();
    expectTypeOf(KeyPath.getParentKey).returns.toEqualTypeOf<KeyPath>();
    expectTypeOf(KeyPath.getAncestors).parameters.toEqualTypeOf<[KeyPath, boolean?]>();
    expectTypeOf(KeyPath.getAncestors).returns.toEqualTypeOf<Generator<KeyPath>>();
  });

  test("KeyPath.build rejects undefined and booleans at the type level", () => {
    // @ts-expect-error - undefined is not an accepted key
    expect(KeyPath.build(undefined)).toBe(KeyPath.Self);
    // @ts-expect-error - booleans are not accepted keys
    expect(KeyPath.build(true)).toBe(KeyPath.Self);
  });

  test("plain strings and symbols must be cast to be used as key paths", () => {
    // @ts-expect-error - a plain string is not a KeyPath
    expect(KeyPath.isSelf("a")).toBe(false);
    // @ts-expect-error - a plain symbol is not a KeyPath
    expect(KeyPath.isSelf(Symbol("self"))).toBe(false);
  });
});

describe("KeyPath.isSelf (edge cases)", () => {
  it("only matches the KeyPath.Self symbol itself, not other symbols", () => {
    expect(KeyPath.Self.description).toBe("self");
    expect(KeyPath.isSelf(Symbol("self") as KeyPath)).toBe(false);
    expect(KeyPath.isSelf(Symbol.for("self") as KeyPath)).toBe(false);
  });

  it("does not treat falsy-looking, whitespace or dot strings as self paths", () => {
    expect(KeyPath.isSelf("0" as KeyPath)).toBe(false);
    expect(KeyPath.isSelf(" " as KeyPath)).toBe(false);
    expect(KeyPath.isSelf("." as KeyPath)).toBe(false);
  });

  it("narrows the key path type", () => {
    const keyPath = KeyPath.build("a");
    if (KeyPath.isSelf(keyPath)) {
      expectTypeOf(keyPath).toEqualTypeOf<KeyPath.Self>();
    } else {
      expectTypeOf(keyPath).toEqualTypeOf<KeyPath.Component>();
    }
  });

  it("narrows an empty string to KeyPath.Self although the value stays a string", () => {
    const keyPath = "" as KeyPath;
    expect(KeyPath.isSelf(keyPath)).toBe(true);
    if (KeyPath.isSelf(keyPath)) {
      expect(typeof keyPath).toBe("string");
      // PINNED(quirk): the JSDoc makes "" a self path on purpose, but the `keyPath is Self` guard then types a runtime string as KeyPath.Self (a symbol), so the true branch is typed as the symbol although lookups keyed by "" and by KeyPath.Self differ (see "keeps an empty string key path separate from KeyPath.Self"). Decide: should the predicate admit the empty string (flip to toEqualTypeOf<KeyPath.Self | (KeyPath.Component & "")>()), or should "" stop being a self path?
      expectTypeOf(keyPath).toEqualTypeOf<KeyPath.Self>();
    }
  });
});

describe("KeyPath.build (edge cases)", () => {
  it("keeps a zero index", () => {
    expect(KeyPath.build(0)).toBe("0");
    expect(KeyPath.build("items", 0)).toBe("items.0");
  });

  it("stringifies negative and non-finite numbers verbatim", () => {
    expect(KeyPath.build(-1)).toBe("-1");
    expect(KeyPath.build(Number.NaN, Number.POSITIVE_INFINITY)).toBe("NaN.Infinity");
  });

  it("returns a single string key unchanged", () => {
    expect(KeyPath.build("a")).toBe("a");
  });

  it("returns a self path when every key is ignored", () => {
    expect(KeyPath.build(null, "", KeyPath.Self)).toBe(KeyPath.Self);
  });

  it("concatenates existing key paths", () => {
    expect(KeyPath.build(KeyPath.build("a", "b"), KeyPath.build("c", 0))).toBe("a.b.c.0");
  });

  it("does not escape dots inside keys", () => {
    // PINNED(quirk): a key containing "." is joined verbatim, so build("a.b", "c") is indistinguishable from build("a", "b", "c"), and a fractional number becomes two segments. Decide: should dots inside a single key be escaped or rejected?
    expect(KeyPath.build("a.b", "c")).toBe(KeyPath.build("a", "b", "c"));
    expect(KeyPath.build("a", 1.5)).toBe("a.1.5");
  });

  it("produces empty segments from keys with leading or trailing dots", () => {
    // PINNED(quirk): empty keys are dropped, but a key with a leading/trailing dot still yields an empty segment ("a..b", ".a"). Decide: should build normalize or reject empty segments?
    expect(KeyPath.build("a.", "b")).toBe("a..b");
    expect(KeyPath.build(".a")).toBe(".a");
  });

  it("keeps whitespace-only keys and '*' verbatim (no trimming, no wildcard semantics)", () => {
    expect(KeyPath.build(" ")).toBe(" ");
    expect(KeyPath.build("a", "*")).toBe("a.*");
  });

  it("ignores values outside its signature at runtime", () => {
    expect(KeyPath.build("a", undefined as unknown as null, "b")).toBe("a.b");
    expect(KeyPath.build("a", true as unknown as null, {} as unknown as null, "b")).toBe("a.b");
    expect(KeyPath.build(Symbol("other") as KeyPath, "b")).toBe("b");
  });
});

describe("KeyPath.getParentKey (edge cases)", () => {
  it("returns the first segment for index paths", () => {
    expect(KeyPath.getParentKey("items.0.name" as KeyPath)).toBe("items");
    expect(KeyPath.getParentKey("0.name" as KeyPath)).toBe("0");
  });

  it("does not treat '*' specially", () => {
    expect(KeyPath.getParentKey("*.a" as KeyPath)).toBe("*");
  });

  it("ignores a trailing empty segment", () => {
    expect(KeyPath.getParentKey("a." as KeyPath)).toBe("a");
  });

  it("returns a self path for a key path with a leading dot", () => {
    // PINNED(quirk): the first segment of ".a" is empty, so the parent key falls back to KeyPath.Self. Decide: should a leading empty segment be skipped (yielding "a") or rejected?
    expect(KeyPath.getParentKey(".a" as KeyPath)).toBe(KeyPath.Self);
  });
});

describe("KeyPath.getRelative (edge cases)", () => {
  it("returns a multi-segment remainder", () => {
    expect(KeyPath.getRelative("a.b.c" as KeyPath, "a" as KeyPath)).toBe("b.c");
  });

  it("returns null if the prefix is longer than the key path", () => {
    expect(KeyPath.getRelative("a" as KeyPath, "a.b" as KeyPath)).toBeNull();
  });

  it("respects segment boundaries for numeric indices", () => {
    expect(KeyPath.getRelative("items.10" as KeyPath, "items.1" as KeyPath)).toBeNull();
    expect(KeyPath.getRelative("items.10.name" as KeyPath, "items.1" as KeyPath)).toBeNull();
    expect(KeyPath.getRelative("items.1.name" as KeyPath, "items.1" as KeyPath)).toBe("name");
  });

  it("does not treat '*' as a wildcard", () => {
    expect(KeyPath.getRelative("a.b" as KeyPath, "*" as KeyPath)).toBeNull();
    expect(KeyPath.getRelative("a.b" as KeyPath, "a.*" as KeyPath)).toBeNull();
    expect(KeyPath.getRelative("a.*" as KeyPath, "a" as KeyPath)).toBe("*");
  });

  it("returns a self path when both are self paths", () => {
    expect(KeyPath.getRelative(KeyPath.Self, KeyPath.Self)).toBe(KeyPath.Self);
    expect(KeyPath.getRelative("" as KeyPath, KeyPath.Self)).toBe(KeyPath.Self);
    expect(KeyPath.getRelative(KeyPath.Self, "" as KeyPath)).toBe(KeyPath.Self);
  });

  it("treats a trailing dot as the same path as the prefix", () => {
    // PINNED(quirk): "a." is considered identical to "a" (the empty remainder becomes KeyPath.Self). Decide: should empty segments be significant, making this null?
    expect(KeyPath.getRelative("a." as KeyPath, "a" as KeyPath)).toBe(KeyPath.Self);
  });

  it("keeps a leading dot in the remainder when the key path has an empty segment", () => {
    // PINNED(quirk): the empty segment in "a..b" surfaces as a leading dot in the remainder ".b". Decide: should empty segments be collapsed or rejected?
    expect(KeyPath.getRelative("a..b" as KeyPath, "a" as KeyPath)).toBe(".b");
  });
});

describe("KeyPath.getAncestors (edge cases)", () => {
  it("yields ancestors one at a time from a generator", () => {
    const iter = KeyPath.getAncestors("a.b.c" as KeyPath);
    expect(iter.next()).toEqual({ value: "a.b.c", done: false });
    expect(iter.next()).toEqual({ value: "a.b", done: false });
    expect(iter.next()).toEqual({ value: "a", done: false });
    expect(iter.next()).toEqual({ value: undefined, done: true });
  });

  it("walks deep and numeric paths up to the root without yielding a self path", () => {
    expect(Array.from(KeyPath.getAncestors("a.b.c.d" as KeyPath))).toEqual(["a.b.c.d", "a.b.c", "a.b", "a"]);
    expect(Array.from(KeyPath.getAncestors("items.0.name" as KeyPath, false))).toEqual(["items.0", "items"]);
  });

  it("yields nothing for a single-level key path when includeSelf is false", () => {
    // PINNED(bug): yields nothing. Expected: the JSDoc promises "KeyPath.Self for single-level paths when includeSelf is false"; either yield it (flip to toEqual([KeyPath.Self]), together with the same assertion in the older "returns a self path if the key path is a single-level key path" test) or correct the JSDoc and drop this pin. Note KeyPathMultiMap#set feeds these ancestors into its prefix index, so yielding Self would also change has(KeyPath.Self, true).
    expect(Array.from(KeyPath.getAncestors("a" as KeyPath, false))).toEqual([]);
  });

  it("yields duplicate ancestors for a key path with an empty segment", () => {
    // PINNED(quirk): "a..b" yields "a" twice because build() drops the empty segment. Decide: should ancestors be de-duplicated, or empty segments rejected?
    expect(Array.from(KeyPath.getAncestors("a..b" as KeyPath, false))).toEqual(["a", "a"]);
  });

  it("yields a self path as an ancestor of a key path with a leading dot", () => {
    // PINNED(quirk): ".a" yields KeyPath.Self as its ancestor, unlike "a" which yields nothing. Decide: should a leading empty segment be ignored?
    expect(Array.from(KeyPath.getAncestors(".a" as KeyPath, false))).toEqual([KeyPath.Self]);
  });

  it("yields the trimmed path as the ancestor of a key path with a trailing dot", () => {
    expect(Array.from(KeyPath.getAncestors("a." as KeyPath, false))).toEqual(["a"]);
  });
});

describe("KeyPathMultiMap (edge cases)", () => {
  describe("types", () => {
    test("KeyPathMultiMap implements ReadonlyKeyPathMultiMap", () => {
      expectTypeOf<KeyPathMultiMap<string>>().toExtend<ReadonlyKeyPathMultiMap<string>>();
      expectTypeOf<ReadonlyKeyPathMultiMap<string>>().toExtend<Iterable<[KeyPath, string]>>();
    });

    test("ReadonlyKeyPathMultiMap does not expose mutators", () => {
      expectTypeOf<ReadonlyKeyPathMultiMap<string>>().not.toHaveProperty("set");
      expectTypeOf<ReadonlyKeyPathMultiMap<string>>().not.toHaveProperty("delete");
      expectTypeOf<ReadonlyKeyPathMultiMap<string>>().not.toHaveProperty("toImmutable");
    });

    test("toImmutable returns the read-only interface", () => {
      expectTypeOf<KeyPathMultiMap<string>["toImmutable"]>().returns.toEqualTypeOf<ReadonlyKeyPathMultiMap<string>>();
    });

    test("value accessors are typed by the value type", () => {
      expectTypeOf<ReadonlyKeyPathMultiMap<number>["get"]>().returns.toEqualTypeOf<Set<number>>();
      expectTypeOf<ReadonlyKeyPathMultiMap<number>["findExact"]>().returns.toEqualTypeOf<Generator<number>>();
      expectTypeOf<ReadonlyKeyPathMultiMap<number>["findPrefix"]>().returns.toEqualTypeOf<Generator<number>>();
      expectTypeOf<KeyPathMultiMap<number>["set"]>().parameters.toEqualTypeOf<[KeyPath, number]>();
      expectTypeOf<KeyPathMultiMap<number>["has"]>().returns.toEqualTypeOf<boolean>();
      expectTypeOf<KeyPathMultiMap<number>["delete"]>().parameters.toEqualTypeOf<[KeyPath]>();
      expectTypeOf<ReturnType<KeyPathMultiMap<number>[typeof Symbol.iterator]>>().toEqualTypeOf<
        IterableIterator<[KeyPath, number]>
      >();
    });

    test("ReadonlyKeyPathMultiMap#has omits the prefixMatch parameter", () => {
      expectTypeOf<KeyPathMultiMap<string>["has"]>().parameters.toEqualTypeOf<[KeyPath, boolean?]>();
      // PINNED(quirk): the read-only interface declares has(keyPath) without prefixMatch, so prefix lookups via has() are unavailable on frozen maps at the type level. Decide: should the interface expose prefixMatch (flip to toEqualTypeOf<[KeyPath, boolean?]>)?
      expectTypeOf<ReadonlyKeyPathMultiMap<string>["has"]>().parameters.toEqualTypeOf<[KeyPath]>();
    });
  });

  describe("#has", () => {
    it("returns true with prefixMatch for an exact match without children", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "value");
      expect(map.has("a" as KeyPath, true)).toBe(true);
    });

    it("does not match ancestors without prefixMatch", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value");
      expect(map.has("a" as KeyPath)).toBe(false);
      expect(map.has("a" as KeyPath, false)).toBe(false);
    });

    it("does not match descendants or siblings", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value");
      expect(map.has("a.b.c" as KeyPath, true)).toBe(false);
      expect(map.has("a.c" as KeyPath, true)).toBe(false);
    });

    it("respects segment boundaries with prefixMatch", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.bc" as KeyPath, "value");
      map.set("items.10" as KeyPath, "value");
      expect(map.has("a.b" as KeyPath, true)).toBe(false);
      expect(map.has("items.1" as KeyPath, true)).toBe(false);
    });

    it("returns false with prefixMatch for a self path even though findPrefix yields every value", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value");
      expect(Array.from(map.findPrefix(KeyPath.Self))).toEqual(["value"]);
      // PINNED(bug): has(Self, true) is false because the prefix index never stores KeyPath.Self, while findPrefix(Self)/get(Self, true) return every value. Expected: true whenever findPrefix would yield something. Flip these assertions when fixing.
      expect(map.has(KeyPath.Self, true)).toBe(false);
      expect(map.has("" as KeyPath, true)).toBe(false);
    });

    it("returns true for a self path with prefixMatch when a key path has a leading dot", () => {
      const map = new KeyPathMultiMap<string>();
      map.set(".a" as KeyPath, "value");
      // PINNED(quirk): ".a" registers KeyPath.Self in the prefix index (see getAncestors), so has(Self, true) becomes true only for such paths. Decide: should this follow the fix for has(Self, true)?
      expect(map.has(KeyPath.Self, true)).toBe(true);
    });

    it("returns true with prefixMatch for an intermediate path deleted while descendants remain", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "mid");
      map.set("a.b.c" as KeyPath, "deep");
      map.delete("a.b" as KeyPath);
      expect(map.has("a.b" as KeyPath)).toBe(false);
      expect(map.has("a.b" as KeyPath, true)).toBe(true);
    });
  });

  describe("self paths", () => {
    it("stores values under KeyPath.Self and counts it in size", () => {
      const map = new KeyPathMultiMap<string>();
      map.set(KeyPath.Self, "self");
      map.set("a" as KeyPath, "a");
      expect(map.size).toBe(2);
      expect(map.has(KeyPath.Self)).toBe(true);
      expect(Array.from(map)).toEqual([
        [KeyPath.Self, "self"],
        ["a", "a"],
      ]);
      expect(Array.from(map.findPrefix(KeyPath.Self))).toEqual(["self", "a"]);
    });

    it("keeps an empty string key path separate from KeyPath.Self", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("" as KeyPath, "empty");
      expect(KeyPath.isSelf("" as KeyPath)).toBe(true);
      // PINNED(quirk): "" is a self path per KeyPath.isSelf, but the map stores it as a distinct key, so exact lookups via KeyPath.Self miss it. Decide: should the map normalize "" to KeyPath.Self?
      expect(Array.from(map.findExact(KeyPath.Self))).toEqual([]);
      expect(map.has(KeyPath.Self)).toBe(false);
      expect(Array.from(map.findExact("" as KeyPath))).toEqual(["empty"]);
    });

    it("treats an empty string like KeyPath.Self in findPrefix", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "child");
      map.set(KeyPath.Self, "self");
      expect(Array.from(map.findPrefix("" as KeyPath))).toEqual(["child", "self"]);
    });

    it("deletes a self path without affecting other key paths", () => {
      const map = new KeyPathMultiMap<string>();
      map.set(KeyPath.Self, "self");
      map.set("a.b" as KeyPath, "child");
      map.delete(KeyPath.Self);
      expect(map.size).toBe(1);
      expect(Array.from(map.findPrefix(KeyPath.Self))).toEqual(["child"]);
      expect(map.has("a" as KeyPath, true)).toBe(true);
    });
  });

  describe("#findPrefix", () => {
    it("yields exact matches first, then descendants in insertion order regardless of depth", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b.c" as KeyPath, "deep");
      map.set("a.b" as KeyPath, "mid");
      map.set("a" as KeyPath, "top");
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["top", "deep", "mid"]);
    });

    it("respects segment boundaries", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.bc" as KeyPath, "a.bc");
      map.set("items.10.name" as KeyPath, "items.10.name");
      map.set("items.1.name" as KeyPath, "items.1.name");
      expect(Array.from(map.findPrefix("a.b" as KeyPath))).toEqual([]);
      expect(Array.from(map.findPrefix("items.1" as KeyPath))).toEqual(["items.1.name"]);
    });

    it("does not treat '*' as a wildcard", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.*" as KeyPath, "star");
      map.set("a.b" as KeyPath, "b");
      expect(Array.from(map.findExact("a.b" as KeyPath))).toEqual(["b"]);
      expect(Array.from(map.findPrefix("*" as KeyPath))).toEqual([]);
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["star", "b"]);
    });

    it("yields the same value once per key path it is stored under", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "shared");
      map.set("a.c" as KeyPath, "shared");
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["shared", "shared"]);
      expect(map.get("a" as KeyPath, true)).toEqual(new Set(["shared"]));
    });

    it("drops descendants of a deleted intermediate path only when they are deleted", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "top");
      map.set("a.b" as KeyPath, "mid");
      map.set("a.b.c" as KeyPath, "deep");
      map.delete("a.b" as KeyPath);
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["top", "deep"]);
      expect(Array.from(map.findPrefix("a.b" as KeyPath))).toEqual(["deep"]);
      map.delete("a.b.c" as KeyPath);
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["top"]);
      expect(map.has("a.b" as KeyPath, true)).toBe(false);
    });

    it("cleans up the prefix index for key paths with empty segments", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a..b" as KeyPath, "value");
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["value"]);
      map.delete("a..b" as KeyPath);
      expect(map.has("a" as KeyPath, true)).toBe(false);
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual([]);
    });
  });

  describe("#set", () => {
    it("stores the same value only once per key path", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "value");
      map.set("a" as KeyPath, "value");
      expect(Array.from(map.findExact("a" as KeyPath))).toEqual(["value"]);
      expect(Array.from(map)).toEqual([["a", "value"]]);
    });

    it("distinguishes values by identity", () => {
      const map = new KeyPathMultiMap<{ id: number }>();
      map.set("a" as KeyPath, { id: 1 });
      map.set("a" as KeyPath, { id: 1 });
      expect(map.get("a" as KeyPath).size).toBe(2);
    });
  });

  describe("#delete", () => {
    it("removes every value stored under the key path", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "value1");
      map.set("a" as KeyPath, "value2");
      map.delete("a" as KeyPath);
      expect(map.size).toBe(0);
      expect(Array.from(map)).toEqual([]);
    });

    it("is a no-op for a key path that does not exist", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value");
      expect(() => map.delete("x.y" as KeyPath)).not.toThrow();
      expect(() => map.delete("a" as KeyPath)).not.toThrow();
      expect(map.size).toBe(1);
      expect(map.has("a" as KeyPath, true)).toBe(true);
    });

    it("does not remove descendants", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "top");
      map.set("a.b" as KeyPath, "child");
      map.delete("a" as KeyPath);
      expect(map.size).toBe(1);
      expect(Array.from(map.findExact("a.b" as KeyPath))).toEqual(["child"]);
    });

    it("keeps prefix entries shared with sibling key paths", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "b");
      map.set("a.c" as KeyPath, "c");
      map.delete("a.b" as KeyPath);
      expect(map.has("a" as KeyPath, true)).toBe(true);
      expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["c"]);
    });

    it("moves a re-added key path to the end of the iteration order", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "a1");
      map.set("b" as KeyPath, "b1");
      map.delete("a" as KeyPath);
      map.set("a" as KeyPath, "a2");
      expect(Array.from(map)).toEqual([
        ["b", "b1"],
        ["a", "a2"],
      ]);
    });
  });

  describe("#get", () => {
    it("returns a new Set detached from the map on every call", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "value");
      const first = map.get("a" as KeyPath);
      expect(map.get("a" as KeyPath)).not.toBe(first);
      first.add("injected");
      first.delete("value");
      expect(map.get("a" as KeyPath)).toEqual(new Set(["value"]));
      expect(map.get("a" as KeyPath, true)).toEqual(new Set(["value"]));
    });

    it("returns an empty Set for a missing key path", () => {
      const map = new KeyPathMultiMap<string>();
      expect(map.get("missing" as KeyPath)).toEqual(new Set());
      expect(map.get("missing" as KeyPath, true)).toEqual(new Set());
      expect(map.get(KeyPath.Self, true)).toEqual(new Set());
    });
  });

  describe("#size", () => {
    it("counts key paths, not values, and updates on delete", () => {
      const map = new KeyPathMultiMap<string>();
      expect(map.size).toBe(0);
      map.set("a" as KeyPath, "value1");
      map.set("a" as KeyPath, "value2");
      expect(map.size).toBe(1);
      map.set("a.b" as KeyPath, "value3");
      expect(map.size).toBe(2);
      map.delete("a" as KeyPath);
      expect(map.size).toBe(1);
    });
  });

  describe("iterator", () => {
    it("yields every value of a key path before moving to the next key path", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a" as KeyPath, "a1");
      map.set("b" as KeyPath, "b1");
      map.set("a" as KeyPath, "a2");
      expect(Array.from(map)).toEqual([
        ["a", "a1"],
        ["a", "a2"],
        ["b", "b1"],
      ]);
    });
  });

  describe("#toImmutable", () => {
    it("can be called repeatedly and keeps reads working", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value");
      const immutable = map.toImmutable();
      expect(map.toImmutable()).toBe(immutable);
      expect(immutable.size).toBe(1);
      expect(immutable.has("a.b" as KeyPath)).toBe(true);
      expect(Array.from(immutable.findPrefix("a" as KeyPath))).toEqual(["value"]);
      expect(Array.from(immutable)).toEqual([["a.b", "value"]]);
    });

    it("throws the exact frozen error message for writes", () => {
      const map = new KeyPathMultiMap<string>();
      map.toImmutable();
      expect(() => map.set("a" as KeyPath, "value")).toThrow(new Error("Cannot modify frozen KeyPathMultiMap"));
      expect(() => map.delete("a" as KeyPath)).toThrow(new Error("Cannot modify frozen KeyPathMultiMap"));
      expect(map.size).toBe(0);
    });

    it("also rejects writes when the map is frozen with Object.freeze", () => {
      const map = new KeyPathMultiMap<string>();
      Object.freeze(map);
      expect(() => map.set("a" as KeyPath, "value")).toThrow(/frozen/);
      expect(map.size).toBe(0);
    });

    it("rejects writes when the map is only sealed or made non-extensible", () => {
      const sealed = new KeyPathMultiMap<string>();
      Object.seal(sealed);
      const nonExtensible = new KeyPathMultiMap<string>();
      Object.preventExtensions(nonExtensible);
      // PINNED(quirk): the map has no own properties (only #private fields), so Object.isFrozen is already true once it is sealed or non-extensible, and writes throw the "frozen" error. Decide: should immutability be tracked with an explicit private flag set by toImmutable() (flip both to not.toThrow(), and the size to 1)?
      expect(() => sealed.set("a" as KeyPath, "value")).toThrow(new Error("Cannot modify frozen KeyPathMultiMap"));
      expect(() => nonExtensible.delete("a" as KeyPath)).toThrow(new Error("Cannot modify frozen KeyPathMultiMap"));
      expect(sealed.size).toBe(0);
      expect(Object.isFrozen(sealed)).toBe(true);
    });

    it("still honors prefixMatch in has() at runtime although the read-only type hides it", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value");
      const immutable = map.toImmutable();
      expect(immutable.has("a" as KeyPath)).toBe(false);
      expect((immutable as KeyPathMultiMap<string>).has("a" as KeyPath, true)).toBe(true);
      expect(immutable.get("a" as KeyPath, true)).toEqual(new Set(["value"]));
    });
  });

  describe("#size (types)", () => {
    test("is read-only at the type level and getter-only at runtime", () => {
      expectTypeOf<KeyPathMultiMap<string>["size"]>().toEqualTypeOf<number>();
      expectTypeOf<ReadonlyKeyPathMultiMap<string>["size"]>().toEqualTypeOf<number>();

      const map = new KeyPathMultiMap<string>();
      expect(() => {
        // @ts-expect-error - size is read-only
        map.size = 1;
      }).toThrow(TypeError);
      expect(map.size).toBe(0);
    });
  });
});

describe("KeyPathMultiMap (lifecycle)", () => {
  it("re-registers prefix entries when a deleted key path is set again", () => {
    const map = new KeyPathMultiMap<string>();
    map.set("a.b" as KeyPath, "v1");
    map.delete("a.b" as KeyPath);
    expect(map.has("a" as KeyPath, true)).toBe(false);

    map.set("a.b" as KeyPath, "v2");
    expect(map.has("a" as KeyPath, true)).toBe(true);
    expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["v2"]);
    expect(map.size).toBe(1);
  });

  it("keeps the prefix index of descendants when deleting an intermediate path that was never set", () => {
    const map = new KeyPathMultiMap<string>();
    map.set("a.b.c" as KeyPath, "deep");
    map.delete("a.b" as KeyPath);
    expect(map.size).toBe(1);
    expect(map.has("a" as KeyPath, true)).toBe(true);
    expect(map.has("a.b" as KeyPath, true)).toBe(true);
    expect(Array.from(map.findPrefix("a" as KeyPath))).toEqual(["deep"]);
  });

  it("keeps the prefix index until the last descendant under a shared ancestor is deleted", () => {
    const map = new KeyPathMultiMap<string>();
    map.set("a.b.c" as KeyPath, "c");
    map.set("a.d" as KeyPath, "d");
    map.delete("a.b.c" as KeyPath);
    expect(map.has("a.b" as KeyPath, true)).toBe(false);
    expect(map.has("a" as KeyPath, true)).toBe(true);
    map.delete("a.d" as KeyPath);
    expect(map.has("a" as KeyPath, true)).toBe(false);
    expect(map.get(KeyPath.Self, true)).toEqual(new Set());
  });

  it("allows deleting every key path while iterating over the map", () => {
    const map = new KeyPathMultiMap<string>();
    map.set("a" as KeyPath, "a");
    map.set("b.c" as KeyPath, "c");
    const visited: KeyPath[] = [];
    for (const [keyPath] of map) {
      visited.push(keyPath);
      map.delete(keyPath);
    }
    expect(visited).toEqual(["a", "b.c"]);
    expect(map.size).toBe(0);
    expect(map.has("b" as KeyPath, true)).toBe(false);
  });

  it("evaluates findExact and findPrefix lazily, so writes made before iteration are visible", () => {
    const map = new KeyPathMultiMap<string>();
    const exact = map.findExact("a" as KeyPath);
    const prefix = map.findPrefix("a" as KeyPath);
    const snapshot = map.get("a" as KeyPath, true);
    map.set("a" as KeyPath, "top");
    map.set("a.b" as KeyPath, "child");
    expect(Array.from(exact)).toEqual(["top"]);
    expect(Array.from(prefix)).toEqual(["top", "child"]);
    expect(snapshot).toEqual(new Set());
  });

  it("yields values added to the same key path during findExact iteration", () => {
    const map = new KeyPathMultiMap<string>();
    map.set("a" as KeyPath, "v0");
    const seen: string[] = [];
    for (const value of map.findExact("a" as KeyPath)) {
      seen.push(value);
      if (seen.length < 3) map.set("a" as KeyPath, `v${seen.length}`);
    }
    expect(seen).toEqual(["v0", "v1", "v2"]);
  });
});

describe("KeyPath (runtime misuse)", () => {
  it("throws a TypeError for symbols other than KeyPath.Self, although build ignores them", () => {
    const other = Symbol("other") as KeyPath;
    expect(KeyPath.isSelf(other)).toBe(false);
    expect(KeyPath.build(other)).toBe(KeyPath.Self);
    expect(() => KeyPath.getParentKey(other)).toThrow(TypeError);
    expect(() => KeyPath.getRelative("a" as KeyPath, other)).toThrow(TypeError);
    expect(() => KeyPath.getRelative(other, "a" as KeyPath)).toThrow(TypeError);
    expect(() => Array.from(KeyPath.getAncestors(other, false))).toThrow(TypeError);
  });

  it("does not treat a prefix with a trailing dot as its parent path", () => {
    // PINNED(quirk): "a." under prefix "a" is KeyPath.Self (see the getRelative edge cases), but "a.b" under prefix "a." is null, so a trailing dot is ignored on the key path side only. Decide: should both sides normalize empty segments the same way (flip to toBe("b"))?
    expect(KeyPath.getRelative("a.b" as KeyPath, "a." as KeyPath)).toBeNull();
    expect(KeyPath.getRelative("a." as KeyPath, "a." as KeyPath)).toBe(KeyPath.Self);
  });
});
