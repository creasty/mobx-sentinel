import {
  buildKeyPath,
  getKeyPathAncestors,
  getRelativeKeyPath,
  isKeyPathSelf,
  KeyPath,
  KeyPathMultiMap,
  KeyPathComponent,
  KeyPathSelf,
  getParentKeyOfKeyPath,
} from "./keyPath";

describe("KeyPathComponent", () => {
  test("being a branded type", () => {
    expectTypeOf<KeyPathComponent>().toMatchTypeOf<string>();
    expectTypeOf<string>().not.toMatchTypeOf<KeyPathComponent>();
  });
});

describe("KeyPathSelf", () => {
  test("being a branded type", () => {
    expectTypeOf<KeyPathSelf>().toMatchTypeOf<symbol>();
    expectTypeOf<symbol>().not.toMatchTypeOf<KeyPathSelf>();
  });

  describe("isKeyPathSelf", () => {
    it("returns true if the key path is a self path", () => {
      expect(isKeyPathSelf(KeyPathSelf)).toBe(true);
    });

    it("returns false if the key path is not a self path", () => {
      expect(isKeyPathSelf("a" as KeyPath)).toBe(false);
    });

    it("returns true if the key path is an empty string", () => {
      expect(isKeyPathSelf("" as KeyPath)).toBe(true);
    });
  });
});

describe("buildKeyPath", () => {
  it("returns a self path if no keys are provided", () => {
    expect(buildKeyPath()).toBe(KeyPathSelf);
  });

  it("builds a key path with strings", () => {
    expect(buildKeyPath("a", "b", "c")).toBe("a.b.c");
  });

  it("builds a key path with numbers", () => {
    expect(buildKeyPath("a", 0, "c")).toBe("a.0.c");
  });

  it("builds a key path with self paths", () => {
    expect(buildKeyPath(KeyPathSelf)).toBe(KeyPathSelf);
  });

  it("ignores nulls", () => {
    expect(buildKeyPath("a", null, "c", null)).toBe("a.c");
  });

  it("ignores empty strings", () => {
    expect(buildKeyPath("a", "", "c", "")).toBe("a.c");
  });

  it("ignores self paths", () => {
    expect(buildKeyPath("a", KeyPathSelf, "c", KeyPathSelf)).toBe("a.c");
  });
});

describe("getParentKeyOfKeyPath", () => {
  it("returns the parent key of a key path", () => {
    expect(getParentKeyOfKeyPath("a.b.c" as KeyPath)).toBe("a");
    expect(getParentKeyOfKeyPath("a" as KeyPath)).toBe("a");
  });

  it("returns a self path if the key path is a self path", () => {
    expect(getParentKeyOfKeyPath(KeyPathSelf)).toBe(KeyPathSelf);
  });

  it("returns a self path if the key path is empty", () => {
    expect(getParentKeyOfKeyPath("" as KeyPath)).toBe(KeyPathSelf);
  });
});

describe("getRelativeKeyPath", () => {
  it("returns the relative key path", () => {
    expect(getRelativeKeyPath("a.b.c" as KeyPath, "a.b" as KeyPath)).toBe("c");
  });

  it("returns null if the key path is not a child of the prefix key path", () => {
    expect(getRelativeKeyPath("a.b.c" as KeyPath, "a.c" as KeyPath)).toBeNull();
  });

  it("considers path delimiter when checking if key path is a child of prefix", () => {
    expect(getRelativeKeyPath("aa" as KeyPath, "a" as KeyPath)).toBeNull();
    expect(getRelativeKeyPath("a.bb" as KeyPath, "a.b" as KeyPath)).toBeNull();
  });

  it("returns a self path if the prefix key path is the same as the key path", () => {
    expect(getRelativeKeyPath("a.b.c" as KeyPath, "a.b.c" as KeyPath)).toBe(KeyPathSelf);
  });

  it("returns a self path if the key path is a self path", () => {
    expect(getRelativeKeyPath(KeyPathSelf, "a.b.c" as KeyPath)).toBe(KeyPathSelf);
  });

  it("returns a self path if the key path is empty", () => {
    expect(getRelativeKeyPath("" as KeyPath, "a.b.c" as KeyPath)).toBe(KeyPathSelf);
  });

  it("returns the original key path if the prefix key path is a self path", () => {
    expect(getRelativeKeyPath("a.b.c" as KeyPath, KeyPathSelf)).toBe("a.b.c");
  });

  it("returns the original key path if the prefix key path is empty", () => {
    expect(getRelativeKeyPath("a.b.c" as KeyPath, "" as KeyPath)).toBe("a.b.c");
  });
});

describe("getKeyPathAncestors", () => {
  it("includes the key path itself when includeSelf is true", () => {
    expect(Array.from(getKeyPathAncestors("a.b.c" as KeyPath))).toEqual(["a.b.c", "a.b", "a"]);
  });

  it("does not include the key path itself when includeSelf is false", () => {
    expect(Array.from(getKeyPathAncestors("a.b.c" as KeyPath, false))).toEqual(["a.b", "a"]);
  });

  it("returns a self path if the key path is a single-level key path", () => {
    expect(Array.from(getKeyPathAncestors("a" as KeyPath))).toEqual(["a"]);
    expect(Array.from(getKeyPathAncestors("a" as KeyPath, false))).toEqual([]);
  });

  it("returns a self path if the key path is a self path", () => {
    expect(Array.from(getKeyPathAncestors(KeyPathSelf))).toEqual([KeyPathSelf]);
    expect(Array.from(getKeyPathAncestors(KeyPathSelf, false))).toEqual([]);
  });

  it("returns a self path if the key path is empty", () => {
    expect(Array.from(getKeyPathAncestors("" as KeyPath))).toEqual([KeyPathSelf]);
    expect(Array.from(getKeyPathAncestors("" as KeyPath, false))).toEqual([]);
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
