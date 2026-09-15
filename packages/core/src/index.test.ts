import { ValidationError, type ValidationErrorMapBuilder } from "./error";
import * as indexModule from "./index";
import { KeyPath } from "./keyPath";
import { nested, StandardNestedFetcher } from "./nested";
import { makeValidatable, Validator } from "./validator";
import { unwatch, Watcher, watch } from "./watcher";

describe("package entry point", () => {
  test("exports the runtime values", () => {
    expect(Object.keys(indexModule).sort()).toEqual([
      "KeyPath",
      "StandardNestedFetcher",
      "ValidationError",
      "Validator",
      "Watcher",
      "makeValidatable",
      "nested",
      "unwatch",
      "watch",
    ]);
    expect(indexModule.KeyPath).toBe(KeyPath);
    expect(indexModule.StandardNestedFetcher).toBe(StandardNestedFetcher);
    expect(indexModule.ValidationError).toBe(ValidationError);
    expect(indexModule.Validator).toBe(Validator);
    expect(indexModule.Watcher).toBe(Watcher);
    expect(indexModule.makeValidatable).toBe(makeValidatable);
    expect(indexModule.nested).toBe(nested);
    expect(indexModule.unwatch).toBe(unwatch);
    expect(indexModule.watch).toBe(watch);
  });

  test("exports ValidationErrorMapBuilder as a type only", () => {
    expectTypeOf<indexModule.ValidationErrorMapBuilder<{ a: number }>>().toEqualTypeOf<
      ValidationErrorMapBuilder<{ a: number }>
    >();
    // Handlers receive a builder, but only the validator creates one
    // @ts-expect-error there is no runtime value to import
    expect(indexModule.ValidationErrorMapBuilder).toBeUndefined();
  });
});
