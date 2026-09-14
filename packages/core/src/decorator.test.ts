import { Decorator202112, Decorator202203, isDecorator202112, isDecorator202203 } from "./decorator";

class Model {
  value = 1;
}

describe("isDecorator202203", () => {
  test.each(["class", "method", "getter", "setter", "field", "accessor"])(
    "returns true for a context of kind %s",
    (kind) => {
      expect(isDecorator202203({ kind, name: "value" })).toBe(true);
    }
  );

  test("returns true for any object whose kind is a string", () => {
    expect(isDecorator202203({ kind: "" })).toBe(true);
    expect(isDecorator202203({ kind: "unknown" })).toBe(true);
    expect(isDecorator202203(Object.create({ kind: "field" }))).toBe(true);
  });

  test("returns false for values that are not objects with a string kind", () => {
    expect(isDecorator202203(undefined)).toBe(false);
    expect(isDecorator202203("field")).toBe(false);
    expect(isDecorator202203(Symbol("field"))).toBe(false);
    expect(isDecorator202203(0)).toBe(false);
    expect(isDecorator202203(true)).toBe(false);
    expect(isDecorator202203({})).toBe(false);
    expect(isDecorator202203({ kind: 1 })).toBe(false);
    expect(isDecorator202203({ kind: new String("field") })).toBe(false);
    expect(isDecorator202203([])).toBe(false);
  });

  test("returns false for a function even if it has a string kind", () => {
    expect(isDecorator202203(Object.assign(() => {}, { kind: "field" }))).toBe(false);
  });

  test("throws for null", () => {
    // PINNED(bug): isDecorator202203(null) throws "TypeError: Cannot read properties of null" because `typeof null == "object"` passes the first check. Expected: it returns false like any other non-context value, as its `(context: any): context is DecoratorContext` signature promises. Flip this assertion when fixing (to `expect(isDecorator202203(null)).toBe(false)`).
    expect(() => isDecorator202203(null)).toThrow(TypeError);
  });

  test("returns false for every argument of a stage-2 decorator", () => {
    const calls: unknown[][] = [];
    const capture = (...args: unknown[]) => {
      calls.push(args);
    };

    class Sample {
      @capture
      property1 = "value of property1";

      @capture
      get getter1() {
        return "value of getter1";
      }

      @capture
      method1() {
        return "value of method1";
      }
    }
    void Sample;

    expect(calls).toHaveLength(3);
    for (const args of calls) {
      for (const arg of args) {
        expect(isDecorator202203(arg)).toBe(false);
      }
    }
  });

  test("narrows its argument to DecoratorContext", () => {
    expectTypeOf(isDecorator202203).parameter(0).toBeAny();

    const value: unknown = { kind: "field" };
    expect(isDecorator202203(value)).toBe(true);
    if (isDecorator202203(value)) {
      expectTypeOf(value).toEqualTypeOf<DecoratorContext>();
    }
  });
});

describe("isDecorator202112", () => {
  test("returns true for strings and symbols", () => {
    expect(isDecorator202112("field")).toBe(true);
    expect(isDecorator202112("")).toBe(true);
    expect(isDecorator202112("#private")).toBe(true);
    expect(isDecorator202112(Symbol("field"))).toBe(true);
    expect(isDecorator202112(Symbol.iterator)).toBe(true);
  });

  test("returns false for other values", () => {
    expect(isDecorator202112(undefined)).toBe(false);
    expect(isDecorator202112(null)).toBe(false);
    expect(isDecorator202112(0)).toBe(false);
    expect(isDecorator202112(new String("field"))).toBe(false);
    expect(isDecorator202112(Object(Symbol("field")))).toBe(false);
    expect(isDecorator202112(["field"])).toBe(false);
    expect(isDecorator202112(() => "field")).toBe(false);
    expect(isDecorator202112({ kind: "field", name: "field" })).toBe(false);
  });

  test("returns true for the property key of a stage-2 decorator", () => {
    const propertyKeys: unknown[] = [];
    const capture = (_target: object, propertyKey: string | symbol) => {
      propertyKeys.push(propertyKey);
    };
    const symbolKey = Symbol("symbolKey");

    class Sample {
      @capture
      property1 = "value of property1";

      @capture
      [symbolKey] = "value of symbolKey";

      @capture
      get getter1() {
        return "value of getter1";
      }
    }
    void Sample;

    expect(propertyKeys).toEqual(["property1", symbolKey, "getter1"]);
    for (const propertyKey of propertyKeys) {
      expect(isDecorator202112(propertyKey)).toBe(true);
    }
  });

  test("narrows its argument to string | symbol", () => {
    expectTypeOf(isDecorator202112).parameter(0).toBeAny();

    const value: unknown = "field";
    expect(isDecorator202112(value)).toBe(true);
    if (isDecorator202112(value)) {
      expectTypeOf(value).toEqualTypeOf<string | symbol>();
    }
  });
});

describe("isDecorator202203 and isDecorator202112", () => {
  test.each([
    ["a string", "field"],
    ["a symbol", Symbol("field")],
    ["a context", { kind: "field", name: "field" }],
    ["undefined", undefined],
    ["a number", 0],
    ["a plain object", {}],
  ])("never both match %s", (_label, value) => {
    expect(isDecorator202203(value) && isDecorator202112(value)).toBe(false);
  });
});

describe("Decorator202112", () => {
  test("PropertyDecorator and ParameterDecorator match TypeScript's legacy declarations", () => {
    // biome-ignore lint/complexity/noBannedTypes: compared against lib.decorators.legacy.d.ts, which uses Object
    expectTypeOf<Decorator202112.PropertyDecorator<Object>>().toEqualTypeOf<PropertyDecorator>();
    // biome-ignore lint/complexity/noBannedTypes: compared against lib.decorators.legacy.d.ts, which uses Object
    expectTypeOf<Decorator202112.ParameterDecorator<Object>>().toEqualTypeOf<ParameterDecorator>();
  });

  test("ClassDecorator and MethodDecorator are instantiations of TypeScript's generic legacy declarations", () => {
    expectTypeOf<Decorator202112.ClassDecorator<typeof Model>>().toEqualTypeOf<
      (target: typeof Model) => typeof Model | void
    >();
    expectTypeOf<Decorator202112.MethodDecorator<Model, number>>().toEqualTypeOf<
      (
        target: Model,
        propertyKey: string | symbol,
        descriptor: TypedPropertyDescriptor<number>
      ) => TypedPropertyDescriptor<number> | void
    >();
    expectTypeOf<ClassDecorator>().toExtend<Decorator202112.ClassDecorator<typeof Model>>();
    expectTypeOf<MethodDecorator>().toExtend<Decorator202112.MethodDecorator<Model, number>>();
  });
});

describe("Decorator202203", () => {
  test("class and member decorator signatures", () => {
    expectTypeOf<Decorator202203.ClassDecorator<typeof Model>>().toEqualTypeOf<
      (value: typeof Model, context: ClassDecoratorContext<typeof Model>) => typeof Model | void
    >();
    expectTypeOf<Decorator202203.ClassGetterDecorator<Model, number>>().toEqualTypeOf<
      (value: (this: Model) => number, context: ClassGetterDecoratorContext) => ((this: Model) => number) | void
    >();
    expectTypeOf<Decorator202203.ClassSetterDecorator<Model, number>>().toEqualTypeOf<
      (
        value: (this: Model, value: number) => void,
        context: ClassSetterDecoratorContext
      ) => ((this: Model, value: number) => void) | void
    >();
    expectTypeOf<Decorator202203.ClassAccessorDecorator<Model, number>>().toEqualTypeOf<
      (
        value: ClassAccessorDecoratorTarget<Model, number>,
        context: ClassAccessorDecoratorContext
      ) => ClassAccessorDecoratorResult<Model, number> | void
    >();
    expectTypeOf<Decorator202203.ClassMethodDecorator<Model, () => number>>().toEqualTypeOf<
      (value: () => number, context: ClassMethodDecoratorContext<Model, () => number>) => (() => number) | void
    >();
  });

  test("ClassFieldDecorator takes a function type as Value", () => {
    type FieldDecorator = Decorator202203.ClassFieldDecorator<Model, () => number>;
    // PINNED(quirk): ClassFieldDecorator constrains `Value` to a function type and uses it both as the context's value type and as the return type, whereas a stage-3 field decorator receives `ClassFieldDecoratorContext<This, FieldValue>` and may return an initializer `(this: This, value: FieldValue) => FieldValue`. Decide: should it be `(value: undefined, context: ClassFieldDecoratorContext<This, Value>) => ((this: This, value: Value) => Value) | void` with an unconstrained Value?
    expectTypeOf<Parameters<FieldDecorator>>().toEqualTypeOf<
      [value: undefined, context: ClassFieldDecoratorContext<Model, () => number>]
    >();
    expectTypeOf<ReturnType<FieldDecorator>>().toEqualTypeOf<(() => number) | void>();
  });
});
