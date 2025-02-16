import { buildKeyPath, KeyPath } from "./keyPath";

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
