import { AnnotationProcessor, createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";
import { Decorator202112, Decorator202203 } from "./decorator";

const sampleKey = Symbol("sample");

/** The data of every annotated member, merged under the property key it spells */
function extractStoredData(processor: AnnotationProcessor) {
  const result = new Map<string | symbol, any[]>();
  for (const { propertyKey, data } of processor.getPropertyLikeMembers(sampleKey)!.values()) {
    const merged = result.get(propertyKey);
    if (merged) {
      merged.push(...data);
    } else {
      result.set(propertyKey, [...data]);
    }
  }
  return result;
}
/** The property key of every annotated member, in registration order */
function annotatedKeys(target: object) {
  const members = getAnnotationProcessor(target)?.getPropertyLikeMembers(sampleKey);
  return Array.from(members?.values() ?? [], (member) => member.propertyKey);
}

describe("createPropertyLikeAnnotation", () => {
  describe("without inheritance", () => {
    const fn = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter)[1]$/);
      return `data of ${propertyKey}`;
    });
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      get getter1() {
        return "value of getter1";
      }
    }

    test("processed at the time of declaration", () => {
      expect(fn).toBeCalledTimes(2);
      expect(fn).toBeCalledWith("property1");
      expect(fn).toBeCalledWith("getter1");

      new Sample();

      expect(fn).toBeCalledTimes(2);
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "property1" => [
            "data of property1",
          ],
          "getter1" => [
            "data of getter1",
          ],
        }
      `);
    });
  });

  describe("with inheritance", () => {
    const fn = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter)[12]$/);
      return `data of ${propertyKey}`;
    });
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      get getter1() {
        return "value of getter1";
      }
    }

    class Extended extends Sample {
      @sample
      property2 = "value of property2";

      @sample
      get getter2() {
        return "value of getter2";
      }
    }

    test("processed at the time of declaration", () => {
      expect(fn).toBeCalledTimes(4);
      expect(fn).toBeCalledWith("property1");
      expect(fn).toBeCalledWith("getter1");
      expect(fn).toBeCalledWith("property2");
      expect(fn).toBeCalledWith("getter2");

      new Sample();
      new Extended();

      expect(fn).toBeCalledTimes(4);
    });

    test("getAnnotationProcessor returns own annotations for the parent", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "property1" => [
            "data of property1",
          ],
          "getter1" => [
            "data of getter1",
          ],
        }
      `);
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Extended();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "property1" => [
            "data of property1",
          ],
          "getter1" => [
            "data of getter1",
          ],
          "property2" => [
            "data of property2",
          ],
          "getter2" => [
            "data of getter2",
          ],
        }
      `);
    });
  });

  describe("with overrides", () => {
    const fn1 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter)[1]$/);
      return `data 1 of ${propertyKey}`;
    });
    const sample1 = createPropertyLikeAnnotation(sampleKey, fn1);

    const fn2 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter)[1]$/);
      return `data 2 of ${propertyKey}`;
    });
    const sample2 = createPropertyLikeAnnotation(sampleKey, fn2);

    class Sample {
      @sample1
      property1 = "value of property1";

      @sample1
      get getter1() {
        return "value of getter1";
      }
    }

    class Overridden extends Sample {
      @sample2
      override property1 = "value of property1 (overridden)";

      @sample2
      override get getter1() {
        return "value of getter1 (overridden)";
      }
    }

    test("processed at the time of declaration", () => {
      expect(fn1).toBeCalledTimes(2);
      expect(fn1).toBeCalledWith("property1");
      expect(fn1).toBeCalledWith("getter1");

      expect(fn2).toBeCalledTimes(2);
      expect(fn2).toBeCalledWith("property1");
      expect(fn2).toBeCalledWith("getter1");
    });

    test("getAnnotationProcessor returns own annotations for the parent", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "property1" => [
            "data 1 of property1",
          ],
          "getter1" => [
            "data 1 of getter1",
          ],
        }
      `);
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Overridden();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "property1" => [
            "data 1 of property1",
            "data 2 of property1",
          ],
          "getter1" => [
            "data 1 of getter1",
            "data 2 of getter1",
          ],
        }
      `);
    });
  });

  describe("separate classes", () => {
    const fn1 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter)[1]$/);
      return `data 1 of ${propertyKey}`;
    });
    const sample1 = createPropertyLikeAnnotation(sampleKey, fn1);
    const fn2 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter)[1]$/);
      return `data 2 of ${propertyKey}`;
    });
    const sample2 = createPropertyLikeAnnotation(sampleKey, fn2);

    class Sample1 {
      @sample1
      property1 = "value of property1";

      @sample1
      get getter1() {
        return "value of getter1";
      }
    }
    class Sample2 {
      @sample2
      property1 = "value of property1";

      @sample2
      get getter1() {
        return "value of getter1";
      }
    }

    test("processed at the time of declaration", () => {
      expect(fn1).toBeCalledTimes(2);
      expect(fn1).toBeCalledWith("property1");
      expect(fn1).toBeCalledWith("getter1");
      expect(fn2).toBeCalledTimes(2);
      expect(fn2).toBeCalledWith("property1");
      expect(fn2).toBeCalledWith("getter1");

      new Sample1();
      new Sample2();

      expect(fn1).toBeCalledTimes(2);
      expect(fn2).toBeCalledTimes(2);
    });

    test("annotations should not mix", () => {
      const obj1 = new Sample1();
      const processor1 = getAnnotationProcessor(obj1);
      expect(processor1).toBeTruthy();
      expect(extractStoredData(processor1!)).toMatchInlineSnapshot(`
        Map {
          "property1" => [
            "data 1 of property1",
          ],
          "getter1" => [
            "data 1 of getter1",
          ],
        }
      `);

      const obj2 = new Sample2();
      const processor2 = getAnnotationProcessor(obj2);
      expect(processor2).toBeTruthy();
      expect(extractStoredData(processor2!)).toMatchInlineSnapshot(`
        Map {
          "property1" => [
            "data 2 of property1",
          ],
          "getter1" => [
            "data 2 of getter1",
          ],
        }
      `);
    });
  });

  describe("auto accessors", () => {
    const fn = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(accessor)[1]$/);
      return `data of ${propertyKey}`;
    });
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    test("Not supported", () => {
      class Sample {
        // @ts-expect-error requires stage3 decorators
        @sample
        accessor accessor1 = "value of accessor1";
      }
      void Sample;
    });

    test("only the types reject them; at runtime they are registered like any other member", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

      class Sample {
        // @ts-expect-error requires stage3 decorators
        @sample
        accessor accessor1 = "value of accessor1";
      }

      const obj = new Sample();
      expect(obj.accessor1).toBe("value of accessor1");
      expect(getAnnotationProcessor(Sample.prototype)).toBe(getAnnotationProcessor(obj));
      expect(extractStoredData(getAnnotationProcessor(obj)!)).toEqual(new Map([["accessor1", ["data of accessor1"]]]));
      expect(getAnnotationProcessor(obj)!.getPropertyLikeMembers(sampleKey)!.get("accessor1")!.get).toBeUndefined();
    });
  });

  describe("stacked annotations", () => {
    const calls: string[] = [];
    const outer = createPropertyLikeAnnotation(sampleKey, (propertyKey) => {
      calls.push(`outer of ${String(propertyKey)}`);
      return `outer of ${String(propertyKey)}`;
    });
    const inner = createPropertyLikeAnnotation(sampleKey, (propertyKey) => {
      calls.push(`inner of ${String(propertyKey)}`);
      return `inner of ${String(propertyKey)}`;
    });

    class Sample {
      @outer
      @inner
      property1 = "value of property1";

      @outer
      @outer
      property2 = "value of property2";
    }

    test("decorators are applied bottom-up", () => {
      expect(calls).toEqual(["inner of property1", "outer of property1", "outer of property2", "outer of property2"]);
      expect(getAnnotationProcessor(new Sample())!.getPropertyLikeMembers(sampleKey)!.get("property1")!.data).toEqual([
        "inner of property1",
        "outer of property1",
      ]);
    });

    test("the same annotation applied twice is recorded twice", () => {
      expect(getAnnotationProcessor(new Sample())!.getPropertyLikeMembers(sampleKey)!.get("property2")!.data).toEqual([
        "outer of property2",
        "outer of property2",
      ]);
    });
  });

  describe("symbol keys", () => {
    const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
    const sample = createPropertyLikeAnnotation(sampleKey, fn);
    const symbolKey = Symbol("symbolKey");

    class Sample {
      @sample
      [symbolKey] = "value of symbolKey";
    }

    test("the symbol itself is passed to getData and used as the property key", () => {
      expect(fn).toBeCalledTimes(1);
      expect(fn).toBeCalledWith(symbolKey);

      const annotations = getAnnotationProcessor(new Sample())!.getPropertyLikeMembers(sampleKey)!;
      expect([...annotations.keys()]).toEqual([symbolKey]);
      expect(annotations.get(symbolKey)!.data).toEqual(["data of Symbol(symbolKey)"]);
      expect(annotations.get("symbolKey")).toBeUndefined();
    });
  });

  describe("different annotation keys", () => {
    const otherKey = Symbol("other");
    const sample = createPropertyLikeAnnotation(sampleKey, () => "sample");
    const other = createPropertyLikeAnnotation(otherKey, () => "other");

    class Sample {
      @sample
      @other
      property1 = "value of property1";

      @other
      property2 = "value of property2";
    }

    test("share one processor but are stored separately", () => {
      const processor = getAnnotationProcessor(new Sample())!;
      expect(extractStoredData(processor)).toEqual(new Map([["property1", ["sample"]]]));
      expect([...processor.getPropertyLikeMembers(otherKey)!.keys()]).toEqual(["property1", "property2"]);
      expect(processor.getPropertyLikeMembers(otherKey)!.get("property1")!.data).toEqual(["other"]);
      expect(processor.getPropertyLikeMembers(otherKey)!.get("property2")!.data).toEqual(["other"]);
    });

    test("are looked up by symbol identity, not by description", () => {
      const processor = getAnnotationProcessor(new Sample())!;
      expect(processor.getPropertyLikeMembers(Symbol("sample"))).toBeUndefined();
    });
  });

  describe("stage2 metadata", () => {
    const sample = createPropertyLikeAnnotation(sampleKey, () => true);

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      get getter1() {
        return "value of getter1";
      }
    }

    test("does not capture a value getter", () => {
      const annotations = getAnnotationProcessor(new Sample())!.getPropertyLikeMembers(sampleKey)!;
      expect(annotations.get("property1")!.get).toBeUndefined();
      expect(annotations.get("getter1")!.get).toBeUndefined();
    });

    test("does not alter the decorated members", () => {
      const obj = new Sample();
      expect(obj.property1).toBe("value of property1");
      expect(obj.getter1).toBe("value of getter1");
      expect(Object.keys(obj)).toEqual(["property1"]);
      expect(Object.getOwnPropertyDescriptor(Sample.prototype, "getter1")).toEqual({
        get: expect.any(Function),
        set: undefined,
        enumerable: false,
        configurable: true,
      });
    });
  });

  describe("methods and setters", () => {
    const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      method1() {
        return "value of method1";
      }

      @sample
      set setter1(_value: string) {}
    }

    test("are registered like properties", () => {
      expect(fn).toBeCalledTimes(2);
      const annotations = getAnnotationProcessor(new Sample())?.getPropertyLikeMembers(sampleKey);
      // PINNED(quirk): methods and setters are accepted by the stage-2 typing and registered, although the JSDoc only lists properties, getters and class fields. Decide: should non-property-like members be rejected by the types, or ignored at runtime?
      expect(annotations?.has("method1")).toBe(true);
      expect(annotations?.has("setter1")).toBe(true);
    });
  });

  describe("static members", () => {
    const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      static staticProperty1 = "value of staticProperty1";

      @sample
      static get staticGetter1() {
        return "value of staticGetter1";
      }

      @sample
      property1 = "value of property1";
    }

    test("getData is called at the time of declaration", () => {
      expect(fn).toBeCalledTimes(3);
      expect(fn).toBeCalledWith("staticProperty1");
      expect(fn).toBeCalledWith("staticGetter1");
      expect(fn).toBeCalledWith("property1");
    });

    test("static annotations are unreachable and do not leak into the prototype", () => {
      // PINNED(quirk): static members are registered on a processor stored against the constructor, but getAnnotationProcessor only walks values whose typeof is "object", so static annotations are silently unreachable. Decide: should static members be supported, or rejected when decorated?
      expect(getAnnotationProcessor(Sample)).toBeNull();
      expect(annotatedKeys(Sample.prototype)).toEqual(["property1"]);
      expect(annotatedKeys(new Sample())).toEqual(["property1"]);
    });
  });

  describe("multi-level inheritance", () => {
    const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

    class Base {
      @sample
      property1 = "value of property1";
    }
    class Middle extends Base {
      property2 = "value of property2";
    }
    class Leaf extends Middle {
      @sample
      property3 = "value of property3";
    }
    class Sibling extends Base {
      @sample
      property4 = "value of property4";
    }

    test("a subclass without annotations shares the processor of its nearest annotated ancestor", () => {
      const baseProcessor = getAnnotationProcessor(new Base());
      expect(baseProcessor).toBeInstanceOf(AnnotationProcessor);
      expect(getAnnotationProcessor(Base.prototype)).toBe(baseProcessor);
      expect(getAnnotationProcessor(Middle.prototype)).toBe(baseProcessor);
      expect(getAnnotationProcessor(new Middle())).toBe(baseProcessor);
    });

    test("a subclass with annotations owns a copy that includes the inherited annotations", () => {
      const baseProcessor = getAnnotationProcessor(new Base());
      const leafProcessor = getAnnotationProcessor(new Leaf());
      const siblingProcessor = getAnnotationProcessor(new Sibling());
      expect(leafProcessor).not.toBe(baseProcessor);
      expect(siblingProcessor).not.toBe(baseProcessor);
      expect(siblingProcessor).not.toBe(leafProcessor);

      expect(annotatedKeys(new Base())).toEqual(["property1"]);
      expect(annotatedKeys(new Leaf())).toEqual(["property1", "property3"]);
      expect(annotatedKeys(new Sibling())).toEqual(["property1", "property4"]);
    });

    test("the inherited data arrays are copies", () => {
      const baseData = getAnnotationProcessor(new Base())!.getPropertyLikeMembers(sampleKey)!.get("property1")!.data;
      const leafData = getAnnotationProcessor(new Leaf())!.getPropertyLikeMembers(sampleKey)!.get("property1")!.data;
      expect(leafData).toEqual(baseData);
      expect(leafData).not.toBe(baseData);
    });

    test("a subclass of an annotated subclass copies from its nearest annotated ancestor", () => {
      class Grandchild extends Leaf {
        @sample
        property5 = "value of property5";
      }

      const leafProcessor = getAnnotationProcessor(Leaf.prototype);
      const grandchildProcessor = getAnnotationProcessor(new Grandchild());
      expect(grandchildProcessor).not.toBe(leafProcessor);
      expect(grandchildProcessor).not.toBe(getAnnotationProcessor(Base.prototype));
      expect(annotatedKeys(new Grandchild())).toEqual(["property1", "property3", "property5"]);
      expect(annotatedKeys(new Leaf())).toEqual(["property1", "property3"]);
      expect(annotatedKeys(new Base())).toEqual(["property1"]);
    });
  });

  describe("processor identity", () => {
    test("a target keeps the same processor while annotations are added to it", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

      class Parent {
        @sample
        property1 = "value of property1";
      }
      class Child extends Parent {
        @sample
        property2 = "value of property2";
      }

      const parentProcessor = getAnnotationProcessor(Parent.prototype);
      const childProcessor = getAnnotationProcessor(Child.prototype);
      sample(Child.prototype, "property3");
      sample(Parent.prototype, "property4");

      expect(getAnnotationProcessor(Child.prototype)).toBe(childProcessor);
      expect(getAnnotationProcessor(Parent.prototype)).toBe(parentProcessor);
      expect(annotatedKeys(new Child())).toEqual(["property1", "property2", "property3"]);
      expect(annotatedKeys(new Parent())).toEqual(["property1", "property4"]);
    });
  });

  describe("annotating an instance directly", () => {
    test("gives that instance its own copy, reused for later registrations, without affecting other instances", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

      class Sample {
        @sample
        property1 = "value of property1";
      }

      const obj1 = new Sample();
      const obj2 = new Sample();
      const prototypeProcessor = getAnnotationProcessor(Sample.prototype);

      sample(obj1, "extra1");
      const instanceProcessor = getAnnotationProcessor(obj1);
      expect(instanceProcessor).toBeInstanceOf(AnnotationProcessor);
      expect(instanceProcessor).not.toBe(prototypeProcessor);

      sample(obj1, "extra2");
      expect(getAnnotationProcessor(obj1)).toBe(instanceProcessor);
      expect(annotatedKeys(obj1)).toEqual(["property1", "extra1", "extra2"]);

      expect(getAnnotationProcessor(obj2)).toBe(prototypeProcessor);
      expect(annotatedKeys(obj2)).toEqual(["property1"]);
      expect(annotatedKeys(new Sample())).toEqual(["property1"]);
    });
  });

  describe("annotating a parent after a subclass is defined", () => {
    test("reaches subclasses without annotations but not subclasses with annotations", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

      class Parent {
        @sample
        property1 = "value of property1";
      }
      class UnannotatedChild extends Parent {}
      class AnnotatedChild extends Parent {
        @sample
        property2 = "value of property2";
      }

      sample(Parent.prototype, "property3");

      expect(annotatedKeys(new Parent())).toEqual(["property1", "property3"]);
      expect(annotatedKeys(new UnannotatedChild())).toEqual(["property1", "property3"]);
      // PINNED(quirk): a subclass with its own annotations holds a clone of the parent's processor taken when its first annotation was applied, so later registrations on the parent never reach it. Decide: should subclasses resolve inherited annotations lazily instead of cloning them?
      expect(annotatedKeys(new AnnotatedChild())).toEqual(["property1", "property2"]);
    });
  });

  describe("direct invocation", () => {
    test("registers on a plain object target and returns undefined", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);
      const target = {};

      expect(sample(target, "property1")).toBeUndefined();

      const processor = getAnnotationProcessor(target);
      expect(processor).toBeInstanceOf(AnnotationProcessor);
      expect(extractStoredData(processor!)).toEqual(new Map([["property1", ["data of property1"]]]));
      expect(getAnnotationProcessor(Object.create(target))).toBe(processor);
    });

    test("ignores a missing target", () => {
      const fn = vi.fn(() => true);
      const sample = createPropertyLikeAnnotation(sampleKey, fn) as unknown as (
        target: unknown,
        context: unknown
      ) => void;

      expect(sample(undefined, "property1")).toBeUndefined();
      expect(sample(null, "property1")).toBeUndefined();
      expect(fn).not.toBeCalled();
    });

    test("ignores a context that is neither a property key nor a stage-3 context", () => {
      const fn = vi.fn(() => true);
      const sample = createPropertyLikeAnnotation(sampleKey, fn) as unknown as (
        target: unknown,
        context: unknown
      ) => void;
      const target = {};

      expect(sample(target, undefined)).toBeUndefined();
      expect(sample(target, 0)).toBeUndefined();
      expect(sample(target, {})).toBeUndefined();
      expect(fn).not.toBeCalled();
      expect(getAnnotationProcessor(target)).toBeNull();
    });

    test("stores whatever getData returns as-is", () => {
      const data = { some: "data" };
      const sampleObject = createPropertyLikeAnnotation(sampleKey, () => data);
      const sampleUndefined = createPropertyLikeAnnotation(sampleKey, () => undefined);
      const target = {};

      sampleObject(target, "property1");
      sampleUndefined(target, "property1");

      const stored = getAnnotationProcessor(target)!.getPropertyLikeMembers(sampleKey)!.get("property1")!.data;
      expect(stored).toHaveLength(2);
      expect(stored[0]).toBe(data);
      expect(stored[1]).toBeUndefined();
    });

    test("propagates an error thrown by getData", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, () => {
        throw new Error("getData failed");
      });
      const target = {};

      expect(() => sample(target, "property1")).toThrow("getData failed");
      // PINNED(quirk): the processor is created before getData runs, so a throwing getData leaves an empty processor behind. Decide: should the processor be created only once the data is available?
      expect(getAnnotationProcessor(target)).not.toBeNull();
      expect(getAnnotationProcessor(target)?.getPropertyLikeMembers(sampleKey)).toBeUndefined();
    });

    test("ignores a null context", () => {
      const fn = vi.fn(() => true);
      const sample = createPropertyLikeAnnotation(sampleKey, fn) as unknown as (
        target: unknown,
        context: unknown
      ) => void;
      const target = {};

      expect(sample(target, null)).toBeUndefined();
      expect(fn).not.toBeCalled();
      expect(getAnnotationProcessor(target)).toBeNull();
    });

    test("throws for an object with a string kind that is not a complete stage-3 context", () => {
      const fn = vi.fn(() => true);
      const sample = createPropertyLikeAnnotation(sampleKey, fn) as unknown as (
        target: unknown,
        context: unknown
      ) => void;
      const target = {};

      // Any object with a string `kind` is treated as a stage-3 context (a duck-typed check), so a context
      // outside the declared types fails with "context.addInitializer is not a function"
      expect(() => sample(target, { kind: "field", name: "property1" })).toThrow(
        "context.addInitializer is not a function"
      );
      expect(fn).not.toBeCalled();
      expect(getAnnotationProcessor(target)).toBeNull();
    });

    test("with a stage-3 context, ignores the target and defers getData until the initializer runs", () => {
      const fn = vi.fn((propertyKey: string | symbol) => `data of ${String(propertyKey)}`);
      const sample = createPropertyLikeAnnotation(sampleKey, fn) as unknown as (
        target: unknown,
        context: unknown
      ) => unknown;
      const target = {};
      const obj = { extra: "value of extra" };
      const initializers: ((this: object) => void)[] = [];
      const context = {
        kind: "field",
        name: "extra",
        addInitializer: (initializer: (this: object) => void) => {
          initializers.push(initializer);
        },
        access: { get: (o: typeof obj) => o.extra },
      };

      expect(sample(target, context)).toBeUndefined();
      expect(initializers).toHaveLength(1);
      expect(fn).not.toBeCalled();
      expect(getAnnotationProcessor(target)).toBeNull();

      initializers[0].call(obj);
      expect(fn).toBeCalledTimes(1);
      expect(fn).toBeCalledWith("extra");
      expect(getAnnotationProcessor(target)).toBeNull();

      const processor = getAnnotationProcessor(obj)!;
      expect(extractStoredData(processor)).toEqual(new Map([["extra", ["data of extra"]]]));
      obj.extra = "updated extra";
      expect(processor.getPropertyLikeMembers(sampleKey)!.get("extra")!.get!()).toBe("updated extra");
    });

    test("with a stage-3 context for a private member and no metadata, separates members by the identity of access.has", () => {
      // What `tsc` emits on a runtime without `Symbol.metadata`, as Node is: no metadata object, and one set of
      // `access` functions per member of a class, which stacked decorators on that member share
      const sample = createPropertyLikeAnnotation(sampleKey, () => "data") as unknown as (
        target: unknown,
        context: unknown
      ) => void;
      const obj = { parent: "parent value", child: "child value" };
      const initializers: ((this: object) => void)[] = [];
      const context = (has: (o: typeof obj) => boolean, get: (o: typeof obj) => string) => ({
        kind: "field",
        name: "#field",
        private: true,
        metadata: undefined,
        addInitializer: (initializer: (this: object) => void) => {
          initializers.push(initializer);
        },
        access: { has, get },
      });
      const parentAccess = context(
        (o) => "parent" in o,
        (o) => o.parent
      );
      const childAccess = context(
        (o) => "child" in o,
        (o) => o.child
      );

      sample(undefined, parentAccess);
      sample(undefined, { ...parentAccess, access: { ...parentAccess.access } }); // stacked on the same member
      sample(undefined, childAccess);
      for (const initializer of initializers) {
        initializer.call(obj);
      }

      const members = getAnnotationProcessor(obj)!.getPropertyLikeMembers(sampleKey)!;
      // One entry per member, the stacked decorators of the first sharing its entry, both spelling "#field"
      expect(Array.from(members.values(), (member) => [member.propertyKey, member.data, member.get!()])).toEqual([
        ["#field", ["data", "data"], "parent value"],
        ["#field", ["data"], "child value"],
      ]);
    });
  });

  describe("stage3 context on an instance of a stage2-annotated class", () => {
    test("registers into the prototype's processor shared by every instance", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => `data of ${String(propertyKey)}`);

      class Sample {
        @sample
        property1 = "value of property1";
      }

      const initializers: ((this: Sample) => void)[] = [];
      const context = {
        kind: "field",
        name: "extra",
        static: false,
        private: false,
        metadata: {},
        addInitializer: (initializer: (this: Sample) => void) => {
          initializers.push(initializer);
        },
        access: {
          has: (obj: Sample) => "property1" in obj,
          get: (obj: Sample) => obj.property1,
          set: () => {},
        },
      };
      (sample as unknown as (target: unknown, context: unknown) => void)(undefined, context);
      expect(initializers).toHaveLength(1);

      const obj1 = new Sample();
      const obj2 = new Sample();
      obj2.property1 = "value of obj2";
      initializers[0].call(obj1);
      initializers[0].call(obj2);

      const processor = getAnnotationProcessor(Sample.prototype)!;
      const extra = processor.getPropertyLikeMembers(sampleKey)!.get("extra")!;
      // PINNED(quirk): a stage-3 initializer registers without cloning an inherited processor, so on an instance whose prototype holds a stage-2 processor it mutates that shared processor: the annotation appears for every instance, accumulates per initialization, and `get` stays bound to the first instance. Decide: should stage-3 registration clone an inherited processor so each instance owns its annotations?
      expect(getAnnotationProcessor(obj1)).toBe(processor);
      expect(getAnnotationProcessor(obj2)).toBe(processor);
      expect(extra.data).toEqual(["data of extra", "data of extra"]);
      expect(extra.get!()).toBe("value of property1");
    });
  });

  describe("types", () => {
    test("getData receives the property key", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, (propertyKey) => {
        expectTypeOf(propertyKey).toEqualTypeOf<string | symbol>();
        return 1;
      });
      void sample;
    });

    test("returns a decorator that works with both decorator standards", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, () => 1);
      expectTypeOf(sample).toEqualTypeOf<
        Decorator202112.PropertyDecorator<object> &
          Decorator202203.ClassGetterDecorator<object> &
          Decorator202203.ClassAccessorDecorator<object> &
          Decorator202203.ClassFieldDecorator<object>
      >();

      const sampleForModel = createPropertyLikeAnnotation<{ value: number }, number>(sampleKey, () => 1);
      expectTypeOf(sampleForModel).toExtend<Decorator202112.PropertyDecorator<{ value: number }>>();
    });

    test("the annotation key must be a symbol", () => {
      // @ts-expect-error string annotation keys are not accepted
      createPropertyLikeAnnotation("sample", () => 1);
    });

    test("getData must accept symbol property keys", () => {
      // @ts-expect-error a getData that only accepts string keys is not accepted
      createPropertyLikeAnnotation(sampleKey, (propertyKey: string) => propertyKey);
    });

    test("the target type restricts which classes can be annotated", () => {
      const sampleForModel = createPropertyLikeAnnotation<{ value: number }, number>(sampleKey, () => 1);

      class Model {
        @sampleForModel
        value = 1;
      }
      class Other {
        // @ts-expect-error Other is not assignable to the target type
        @sampleForModel
        other = 1;
      }
      void Model;
      void Other;

      expectTypeOf(sampleForModel).toExtend<
        (value: undefined, context: ClassFieldDecoratorContext<Model, number>) => void
      >();
      expectTypeOf(sampleForModel).not.toExtend<
        (value: undefined, context: ClassFieldDecoratorContext<Other, number>) => void
      >();
      expectTypeOf(sampleForModel).toExtend<
        (value: (this: Model) => number, context: ClassGetterDecoratorContext<Model, number>) => void
      >();
      expectTypeOf(sampleForModel).not.toExtend<
        (value: (this: Other) => number, context: ClassGetterDecoratorContext<Other, number>) => void
      >();
      expectTypeOf(sampleForModel).toExtend<
        (
          value: ClassAccessorDecoratorTarget<Model, number>,
          context: ClassAccessorDecoratorContext<Model, number>
        ) => void
      >();
      expectTypeOf(sampleForModel).not.toExtend<
        (
          value: ClassAccessorDecoratorTarget<Other, number>,
          context: ClassAccessorDecoratorContext<Other, number>
        ) => void
      >();
    });

    test("the stage-3 signature does not accept methods or setters", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, () => 1);

      // PINNED(quirk): the stage-3 half of the type accepts only getters, accessors and fields, so tsc rejects `@annotation` on a method, a setter or a private method (TS1241), although the runtime registers them (see "methods and setters" and "private methods" in test-stage3/annotationProcessor.test.ts) and the AnnotationProcessor JSDoc says private methods are supported. Decide: should the types accept methods (and setters), or should the runtime ignore them? Flip `not.toExtend` to `toExtend` if the types start accepting them.
      expectTypeOf(sample).not.toExtend<
        (
          value: (this: object) => number,
          context: ClassMethodDecoratorContext<object, (this: object) => number>
        ) => void
      >();
      expectTypeOf(sample).not.toExtend<
        (value: (this: object, value: number) => void, context: ClassSetterDecoratorContext<object, number>) => void
      >();
    });

    test("is not a class decorator and ignores being called as one", () => {
      const sample = createPropertyLikeAnnotation(sampleKey, () => 1);

      // @ts-expect-error class decorators are not accepted
      @sample
      class Sample {
        property1 = "value of property1";
      }

      expect(new Sample().property1).toBe("value of property1");
      expect(getAnnotationProcessor(Sample.prototype)).toBeNull();
    });
  });
});

describe("AnnotationProcessor", () => {
  const otherKey = Symbol("other");

  test("getPropertyLikeMembers returns undefined before anything is registered", () => {
    const processor = new AnnotationProcessor();
    expect(processor.getPropertyLikeMembers(sampleKey)).toBeUndefined();
  });

  test("registerPropertyLikeMember groups data by annotation key and member key in insertion order", () => {
    const processor = new AnnotationProcessor();
    const symbolKey = Symbol("symbolKey");

    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "b", data: 1 });
    processor.registerPropertyLikeMember(sampleKey, { propertyKey: symbolKey, data: 2 });
    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 3 });
    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "b", data: 4 });
    processor.registerPropertyLikeMember(otherKey, { propertyKey: "b", data: 5 });

    const annotations = processor.getPropertyLikeMembers(sampleKey)!;
    expect([...annotations.keys()]).toEqual(["b", symbolKey, "a"]);
    expect(annotations.get("b")!.data).toEqual([1, 4]);
    expect(annotations.get(symbolKey)!.data).toEqual([2]);
    expect(annotations.get("a")!.data).toEqual([3]);

    expect([...processor.getPropertyLikeMembers(otherKey)!.keys()]).toEqual(["b"]);
    expect(processor.getPropertyLikeMembers(otherKey)!.get("b")!.data).toEqual([5]);
  });

  test("registerPropertyLikeMember stores data by reference", () => {
    const processor = new AnnotationProcessor();
    const data = { some: "data" };

    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data });
    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: undefined });

    const stored = processor.getPropertyLikeMembers(sampleKey)!.get("a")!.data;
    expect(stored).toHaveLength(2);
    expect(stored[0]).toBe(data);
    expect(stored[1]).toBeUndefined();
  });

  test("registerPropertyLikeMember keeps the property key and the get function of the first registration", () => {
    const processor = new AnnotationProcessor();
    const get1 = () => "first";
    const get2 = () => "second";

    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 1, get: get1 });
    processor.registerPropertyLikeMember(sampleKey, { memberKey: "a", propertyKey: "later", data: 2, get: get2 });

    expect(processor.getPropertyLikeMembers(sampleKey)!.get("a")!.propertyKey).toBe("a");
    expect(processor.getPropertyLikeMembers(sampleKey)!.get("a")!.get).toBe(get1);
  });

  test("registerPropertyLikeMember keeps a missing get function when the first registration had none", () => {
    const processor = new AnnotationProcessor();

    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 1 });
    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 2, get: () => "second" });

    // PINNED(quirk): `get` is taken only from the first registration for a member, so a later registration cannot fill in a missing one. Decide: should a later `get` replace a missing (or any) earlier one?
    expect(processor.getPropertyLikeMembers(sampleKey)!.get("a")!.get).toBeUndefined();
  });

  test("registerPropertyLikeMember keeps registrations with different memberKeys apart under one property key", () => {
    const processor = new AnnotationProcessor();
    const memberKey = Symbol("#a");
    const get1 = () => "first";
    const get2 = () => "second";

    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "#a", data: 1, get: get1 });
    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "#a", memberKey, data: 2, get: get2 });

    const annotations = processor.getPropertyLikeMembers(sampleKey)!;
    // Two entries, each with its own data and `get`, both spelling the one property key
    expect([...annotations.keys()]).toEqual(["#a", memberKey]);
    expect(Array.from(annotations.values(), (member) => [member.propertyKey, member.data, member.get])).toEqual([
      ["#a", [1], get1],
      ["#a", [2], get2],
    ]);
  });

  test("getPropertyLikeMembers returns the live internal map", () => {
    const processor = new AnnotationProcessor();
    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 1 });

    const annotations = processor.getPropertyLikeMembers(sampleKey)!;
    expect(processor.getPropertyLikeMembers(sampleKey)).toBe(annotations);

    processor.registerPropertyLikeMember(sampleKey, { propertyKey: "b", data: 2 });
    expect(annotations.has("b")).toBe(true);

    annotations.delete("a");
    annotations.get("b")!.data.push(3);
    // PINNED(quirk): the returned Map and its data arrays are the processor's own state, so callers can mutate registered annotations. Decide: should getPropertyLikeMembers return a read-only view or a copy?
    expect(processor.getPropertyLikeMembers(sampleKey)!.has("a")).toBe(false);
    expect(processor.getPropertyLikeMembers(sampleKey)!.get("b")!.data).toEqual([2, 3]);
  });

  describe("clone", () => {
    test("copies every annotation into a new processor", () => {
      const processor = new AnnotationProcessor();
      const data = { some: "data" };
      const get = () => "value";
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data, get });
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 2 });
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "b", data: 3 });
      processor.registerPropertyLikeMember(otherKey, { propertyKey: "c", data: 4 });

      const clone = processor.clone();
      expect(clone).toBeInstanceOf(AnnotationProcessor);
      expect(clone).not.toBe(processor);

      const annotations = clone.getPropertyLikeMembers(sampleKey)!;
      expect(annotations).not.toBe(processor.getPropertyLikeMembers(sampleKey));
      expect([...annotations.keys()]).toEqual(["a", "b"]);
      expect(annotations.get("a")!.data).toEqual([data, 2]);
      expect(annotations.get("a")!.data[0]).toBe(data);
      expect(annotations.get("a")!.data).not.toBe(processor.getPropertyLikeMembers(sampleKey)!.get("a")!.data);
      expect(annotations.get("a")!.get).toBe(get);
      expect(annotations.get("b")!.data).toEqual([3]);
      expect(annotations.get("b")!.get).toBeUndefined();
      expect([...clone.getPropertyLikeMembers(otherKey)!.keys()]).toEqual(["c"]);
      expect(clone.getPropertyLikeMembers(otherKey)!.get("c")!.data).toEqual([4]);
    });

    test("keeps the members of a property key apart", () => {
      const processor = new AnnotationProcessor();
      const memberKey = Symbol("#a");
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "#a", data: 1 });
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "#a", memberKey, data: 2 });

      const annotations = processor.clone().getPropertyLikeMembers(sampleKey)!;
      expect([...annotations.keys()]).toEqual(["#a", memberKey]);
      expect(Array.from(annotations.values(), (member) => [member.propertyKey, member.data])).toEqual([
        ["#a", [1]],
        ["#a", [2]],
      ]);
    });

    test("is independent of the original in both directions", () => {
      const processor = new AnnotationProcessor();
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 1 });
      const clone = processor.clone();

      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 2 });
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "b", data: 3 });
      clone.registerPropertyLikeMember(sampleKey, { propertyKey: "c", data: 4 });
      clone.registerPropertyLikeMember(otherKey, { propertyKey: "d", data: 5 });

      expect(extractStoredData(processor)).toEqual(
        new Map([
          ["a", [1, 2]],
          ["b", [3]],
        ])
      );
      expect(processor.getPropertyLikeMembers(otherKey)).toBeUndefined();
      expect(extractStoredData(clone)).toEqual(
        new Map([
          ["a", [1]],
          ["c", [4]],
        ])
      );
    });

    test("of an empty processor has no annotations", () => {
      const clone = new AnnotationProcessor().clone();
      expect(clone.getPropertyLikeMembers(sampleKey)).toBeUndefined();
    });

    test("drops members and annotation keys whose entries were emptied through the live map", () => {
      const processor = new AnnotationProcessor();
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "a", data: 1, get: () => "value" });
      processor.registerPropertyLikeMember(sampleKey, { propertyKey: "b", data: 2 });
      processor.registerPropertyLikeMember(otherKey, { propertyKey: "c", data: 3 });

      processor.getPropertyLikeMembers(sampleKey)!.get("a")!.data.length = 0;
      processor.getPropertyLikeMembers(otherKey)!.clear();
      const clone = processor.clone();

      expect(processor.getPropertyLikeMembers(sampleKey)!.has("a")).toBe(true);
      expect(processor.getPropertyLikeMembers(otherKey)).toEqual(new Map());
      // clone replays one registration per data item of a member, so a member holding no data (and its `get`) and
      // an annotation key whose map is empty are not copied. Such entries can only arise by mutating the live map
      // (see "getPropertyLikeMembers returns the live internal map"), never through registerPropertyLikeMember.
      expect(clone.getPropertyLikeMembers(sampleKey)!.has("a")).toBe(false);
      expect(clone.getPropertyLikeMembers(otherKey)).toBeUndefined();
      expect(clone.getPropertyLikeMembers(sampleKey)!.get("b")!.data).toEqual([2]);
    });
  });

  test("types", () => {
    expectTypeOf<ReturnType<AnnotationProcessor["getPropertyLikeMembers"]>>().toEqualTypeOf<
      Map<string | symbol, { propertyKey: string | symbol; data: any[]; get?: () => any }> | undefined
    >();
    expectTypeOf<Parameters<AnnotationProcessor["registerPropertyLikeMember"]>>().toEqualTypeOf<
      [
        annotationKey: symbol,
        args: { propertyKey: string | symbol; memberKey?: string | symbol; data: any; get?: () => any },
      ]
    >();
    expectTypeOf<ReturnType<AnnotationProcessor["clone"]>>().toEqualTypeOf<AnnotationProcessor>();
  });
});

describe("getAnnotationProcessor", () => {
  test("returns null for objects without annotations", () => {
    class Plain {
      value = 1;
    }
    expect(getAnnotationProcessor({})).toBeNull();
    expect(getAnnotationProcessor(Object.create(null))).toBeNull();
    expect(getAnnotationProcessor([])).toBeNull();
    expect(getAnnotationProcessor(new Plain())).toBeNull();
    expect(getAnnotationProcessor(Plain)).toBeNull();
  });

  test("returns null for nullish values passed through an untyped call", () => {
    expect(getAnnotationProcessor(null as any)).toBeNull();
    expect(getAnnotationProcessor(undefined as any)).toBeNull();
  });

  test("returns the processor stored on the prototype for every instance", () => {
    const sample = createPropertyLikeAnnotation(sampleKey, () => true);
    class Sample {
      @sample
      property1 = "value of property1";
    }

    const processor = getAnnotationProcessor(Sample.prototype);
    expect(processor).toBeInstanceOf(AnnotationProcessor);
    expect(getAnnotationProcessor(new Sample())).toBe(processor);
    expect(getAnnotationProcessor(new Sample())).toBe(processor);
    expect(getAnnotationProcessor(Object.create(new Sample()))).toBe(processor);
    expect(getAnnotationProcessor(Sample)).toBeNull();
  });

  test("annotating a subclass of a built-in stores nothing on the built-in's prototype", () => {
    const sample = createPropertyLikeAnnotation(sampleKey, () => true);
    class SampleMap extends Map<string, number> {
      @sample
      property1 = "value of property1";
    }

    expect(annotatedKeys(new SampleMap())).toEqual(["property1"]);
    expect(getAnnotationProcessor(SampleMap.prototype)).not.toBeNull();
    expect(getAnnotationProcessor(Map.prototype)).toBeNull();
    expect(getAnnotationProcessor(new Map())).toBeNull();
    expect(getAnnotationProcessor(Object.prototype)).toBeNull();
    expect(getAnnotationProcessor({})).toBeNull();
  });

  test("types", () => {
    expectTypeOf(getAnnotationProcessor).parameter(0).toEqualTypeOf<object>();
    expectTypeOf(getAnnotationProcessor).returns.toEqualTypeOf<AnnotationProcessor | null>();
  });
});
