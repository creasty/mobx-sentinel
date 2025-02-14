import { AnnotationProcessor, createPropertyLikeAnnotation, getAnnotationProcessor } from "./annotationProcessor";

const sampleKey = Symbol("sample");

function mapValues<K, V, R>(map: Map<K, V>, fn: (value: V, key: K) => R) {
  const result = new Map<K, R>();
  for (const [key, value] of map) {
    result.set(key, fn(value, key));
  }
  return result;
}
function extractStoredData(processor: AnnotationProcessor) {
  return mapValues(processor.getPropertyLike(sampleKey)!, (v) => v.data);
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
  });
});
