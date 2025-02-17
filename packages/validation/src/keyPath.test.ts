import { buildKeyPath, KeyPath, KeyPathMultiMap } from "./keyPath";

describe("KeyPath", () => {
  test("being a branded type", () => {
    expectTypeOf<KeyPath>().toMatchTypeOf<string>();
    expectTypeOf<string>().not.toMatchTypeOf<KeyPath>();
  });
});

describe("buildKeyPath", () => {
  it("builds a key path with strings", () => {
    expect(buildKeyPath("a", "b", "c")).toBe("a.b.c");
  });

  it("builds a key path with numbers", () => {
    expect(buildKeyPath("a", 0, "c")).toBe("a.0.c");
  });

  it("ignores nulls", () => {
    expect(buildKeyPath("a", null, "c", null)).toBe("a.c");
  });

  it("ignores empty strings", () => {
    expect(buildKeyPath("a", "", "c", "")).toBe("a.c");
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

  describe("iteration", () => {
    it("iterates over all unique values", () => {
      const map = new KeyPathMultiMap<string>();
      map.set("a.b" as KeyPath, "value1");
      map.set("x.y" as KeyPath, "value2");
      map.set("p.q" as KeyPath, "value1"); // Duplicate value

      const entries = Array.from(map);
      expect(entries).toEqual([
        ["a.b" as KeyPath, "value1"],
        ["x.y" as KeyPath, "value2"],
      ]);
    });
  });
});
