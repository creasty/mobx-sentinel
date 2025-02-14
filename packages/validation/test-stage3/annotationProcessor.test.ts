import { AnnotationProcessor, createPropertyLikeAnnotation, getAnnotationProcessor } from "../src/annotationProcessor";

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
function extractValues(processor: AnnotationProcessor) {
  return mapValues(processor.getPropertyLike(sampleKey)!, (v) => v.get?.());
}

describe("createPropertyLikeAnnotation", () => {
  describe("without inheritance", () => {
    const fn = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data of ${propertyKey}`;
    });
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      accessor accessor1 = "value of accessor1";

      @sample
      get getter1() {
        return "value of getter1";
      }

      @sample
      // eslint-disable-next-line no-unused-private-class-members
      #privateProperty1 = "value of privateProperty1";

      @sample
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample
      // eslint-disable-next-line no-unused-private-class-members
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }

    test("processed at the time of instantiation", () => {
      expect(fn).toBeCalledTimes(0);

      new Sample();

      expect(fn).toBeCalledTimes(6);
      expect(fn).toBeCalledWith("property1");
      expect(fn).toBeCalledWith("accessor1");
      expect(fn).toBeCalledWith("getter1");
      expect(fn).toBeCalledWith("#privateProperty1");
      expect(fn).toBeCalledWith("#privateAccessor1");
      expect(fn).toBeCalledWith("#privateGetter1");
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data of getter1",
          ],
          "#privateGetter1" => [
            "data of #privateGetter1",
          ],
          "property1" => [
            "data of property1",
          ],
          "accessor1" => [
            "data of accessor1",
          ],
          "#privateProperty1" => [
            "data of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });
  });

  describe("with inheritance", () => {
    const fn = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[12]|#private(Property|Getter|Accessor)[12]$/);
      return `data of ${propertyKey}`;
    });
    const sample = createPropertyLikeAnnotation(sampleKey, fn);

    class Sample {
      @sample
      property1 = "value of property1";

      @sample
      accessor accessor1 = "value of accessor1";

      @sample
      get getter1() {
        return "value of getter1";
      }

      @sample
      // eslint-disable-next-line no-unused-private-class-members
      #privateProperty1 = "value of privateProperty1";

      @sample
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample
      // eslint-disable-next-line no-unused-private-class-members
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }

    class Extended extends Sample {
      @sample
      property2 = "value of property2";

      @sample
      accessor accessor2 = "value of accessor2";

      @sample
      get getter2() {
        return "value of getter2";
      }

      @sample
      // eslint-disable-next-line no-unused-private-class-members
      #privateProperty2 = "value of privateProperty2";

      @sample
      accessor #privateAccessor2 = "value of privateAccessor2";

      @sample
      // eslint-disable-next-line no-unused-private-class-members
      get #privateGetter2() {
        return "value of privateGetter2";
      }
    }

    test("processed at the time of instantiation", () => {
      expect(fn).toBeCalledTimes(0);

      new Extended();

      expect(fn).toBeCalledTimes(12);
      expect(fn).toBeCalledWith("property1");
      expect(fn).toBeCalledWith("accessor1");
      expect(fn).toBeCalledWith("getter1");
      expect(fn).toBeCalledWith("#privateProperty1");
      expect(fn).toBeCalledWith("#privateAccessor1");
      expect(fn).toBeCalledWith("#privateGetter1");
      expect(fn).toBeCalledWith("property2");
      expect(fn).toBeCalledWith("accessor2");
      expect(fn).toBeCalledWith("getter2");
      expect(fn).toBeCalledWith("#privateProperty2");
      expect(fn).toBeCalledWith("#privateAccessor2");
      expect(fn).toBeCalledWith("#privateGetter2");
    });

    test("getAnnotationProcessor returns own annotations for the parent", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data of getter1",
          ],
          "#privateGetter1" => [
            "data of #privateGetter1",
          ],
          "property1" => [
            "data of property1",
          ],
          "accessor1" => [
            "data of accessor1",
          ],
          "#privateProperty1" => [
            "data of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Extended();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data of getter1",
          ],
          "#privateGetter1" => [
            "data of #privateGetter1",
          ],
          "property1" => [
            "data of property1",
          ],
          "accessor1" => [
            "data of accessor1",
          ],
          "#privateProperty1" => [
            "data of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data of #privateAccessor1",
          ],
          "getter2" => [
            "data of getter2",
          ],
          "#privateGetter2" => [
            "data of #privateGetter2",
          ],
          "property2" => [
            "data of property2",
          ],
          "accessor2" => [
            "data of accessor2",
          ],
          "#privateProperty2" => [
            "data of #privateProperty2",
          ],
          "#privateAccessor2" => [
            "data of #privateAccessor2",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
          "getter2" => "value of getter2",
          "#privateGetter2" => "value of privateGetter2",
          "property2" => "value of property2",
          "accessor2" => "value of accessor2",
          "#privateProperty2" => "value of privateProperty2",
          "#privateAccessor2" => "value of privateAccessor2",
        }
      `);
    });
  });

  describe("with overrides", () => {
    const fn1 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 1 of ${propertyKey}`;
    });
    const sample1 = createPropertyLikeAnnotation(sampleKey, fn1);

    const fn2 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 2 of ${propertyKey}`;
    });
    const sample2 = createPropertyLikeAnnotation(sampleKey, fn2);

    class Sample {
      @sample1
      property1 = "value of property1";

      @sample1
      accessor accessor1 = "value of accessor1";

      @sample1
      get getter1() {
        return "value of getter1";
      }

      @sample1
      // eslint-disable-next-line no-unused-private-class-members
      #privateProperty1 = "value of privateProperty1";

      @sample1
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample1
      // eslint-disable-next-line no-unused-private-class-members
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }

    class Overridden extends Sample {
      @sample2
      override property1 = "value of property1 (overridden)";

      @sample2
      override accessor accessor1 = "value of accessor1 (overridden)";

      @sample2
      override get getter1() {
        return "value of getter1 (overridden)";
      }

      @sample2
      // eslint-disable-next-line no-unused-private-class-members
      override #privateProperty1 = "value of privateProperty1 (overridden)";

      @sample2
      override accessor #privateAccessor1 = "value of privateAccessor1 (overridden)";

      @sample2
      // eslint-disable-next-line no-unused-private-class-members
      override get #privateGetter1() {
        return "value of privateGetter1 (overridden)";
      }
    }

    test("processed at the time of instantiation", () => {
      expect(fn1).toBeCalledTimes(0);
      expect(fn2).toBeCalledTimes(0);

      new Overridden();

      expect(fn1).toBeCalledTimes(6);
      expect(fn1).toBeCalledWith("property1");
      expect(fn1).toBeCalledWith("accessor1");
      expect(fn1).toBeCalledWith("getter1");
      expect(fn1).toBeCalledWith("#privateProperty1");
      expect(fn1).toBeCalledWith("#privateAccessor1");
      expect(fn1).toBeCalledWith("#privateGetter1");

      expect(fn2).toBeCalledTimes(6);
      expect(fn2).toBeCalledWith("property1");
      expect(fn2).toBeCalledWith("accessor1");
      expect(fn2).toBeCalledWith("getter1");
      expect(fn2).toBeCalledWith("#privateProperty1");
      expect(fn2).toBeCalledWith("#privateAccessor1");
      expect(fn2).toBeCalledWith("#privateGetter1");
    });

    test("getAnnotationProcessor returns own annotations for the parent", () => {
      const obj = new Sample();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 1 of getter1",
          ],
          "#privateGetter1" => [
            "data 1 of #privateGetter1",
          ],
          "property1" => [
            "data 1 of property1",
          ],
          "accessor1" => [
            "data 1 of accessor1",
          ],
          "#privateProperty1" => [
            "data 1 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 1 of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });

    test("getAnnotationProcessor returns all annotations", () => {
      const obj = new Overridden();
      const processor = getAnnotationProcessor(obj);
      expect(processor).toBeTruthy();
      expect(extractStoredData(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 1 of getter1",
            "data 2 of getter1",
          ],
          "#privateGetter1" => [
            "data 1 of #privateGetter1",
            "data 2 of #privateGetter1",
          ],
          "property1" => [
            "data 1 of property1",
            "data 2 of property1",
          ],
          "accessor1" => [
            "data 1 of accessor1",
            "data 2 of accessor1",
          ],
          "#privateProperty1" => [
            "data 1 of #privateProperty1",
            "data 2 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 1 of #privateAccessor1",
            "data 2 of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1 (overridden)",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1 (overridden)",
          "accessor1" => "value of accessor1 (overridden)",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });
  });

  describe("separate classes", () => {
    const fn1 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 1 of ${propertyKey}`;
    });
    const sample1 = createPropertyLikeAnnotation(sampleKey, fn1);
    const fn2 = vi.fn((propertyKey) => {
      expect(propertyKey).toMatch(/^(property|getter|accessor)[1]|#private(Property|Getter|Accessor)[1]$/);
      return `data 2 of ${propertyKey}`;
    });
    const sample2 = createPropertyLikeAnnotation(sampleKey, fn2);

    class Sample1 {
      @sample1
      property1 = "value of property1";

      @sample1
      accessor accessor1 = "value of accessor1";

      @sample1
      get getter1() {
        return "value of getter1";
      }

      @sample1
      // eslint-disable-next-line no-unused-private-class-members
      #privateProperty1 = "value of privateProperty1";

      @sample1
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample1
      // eslint-disable-next-line no-unused-private-class-members
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }
    class Sample2 {
      @sample2
      property1 = "value of property1";

      @sample2
      accessor accessor1 = "value of accessor1";

      @sample2
      get getter1() {
        return "value of getter1";
      }

      @sample2
      // eslint-disable-next-line no-unused-private-class-members
      #privateProperty1 = "value of privateProperty1";

      @sample2
      accessor #privateAccessor1 = "value of privateAccessor1";

      @sample2
      // eslint-disable-next-line no-unused-private-class-members
      get #privateGetter1() {
        return "value of privateGetter1";
      }
    }

    test("processed at the time of declaration", () => {
      expect(fn1).toBeCalledTimes(0);
      expect(fn2).toBeCalledTimes(0);

      new Sample1();
      new Sample2();

      expect(fn1).toBeCalledTimes(6);
      expect(fn1).toBeCalledWith("property1");
      expect(fn1).toBeCalledWith("accessor1");
      expect(fn1).toBeCalledWith("getter1");
      expect(fn1).toBeCalledWith("#privateProperty1");
      expect(fn1).toBeCalledWith("#privateAccessor1");
      expect(fn1).toBeCalledWith("#privateGetter1");
      expect(fn2).toBeCalledTimes(6);
      expect(fn2).toBeCalledWith("property1");
      expect(fn2).toBeCalledWith("accessor1");
      expect(fn2).toBeCalledWith("getter1");
      expect(fn2).toBeCalledWith("#privateProperty1");
      expect(fn2).toBeCalledWith("#privateAccessor1");
      expect(fn2).toBeCalledWith("#privateGetter1");
    });

    test("annotations should not mix", () => {
      const obj1 = new Sample1();
      const processor1 = getAnnotationProcessor(obj1);
      expect(processor1).toBeTruthy();
      expect(extractStoredData(processor1!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 1 of getter1",
          ],
          "#privateGetter1" => [
            "data 1 of #privateGetter1",
          ],
          "property1" => [
            "data 1 of property1",
          ],
          "accessor1" => [
            "data 1 of accessor1",
          ],
          "#privateProperty1" => [
            "data 1 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 1 of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor1!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);

      const obj2 = new Sample2();
      const processor2 = getAnnotationProcessor(obj2);
      expect(processor2).toBeTruthy();
      expect(extractStoredData(processor2!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => [
            "data 2 of getter1",
          ],
          "#privateGetter1" => [
            "data 2 of #privateGetter1",
          ],
          "property1" => [
            "data 2 of property1",
          ],
          "accessor1" => [
            "data 2 of accessor1",
          ],
          "#privateProperty1" => [
            "data 2 of #privateProperty1",
          ],
          "#privateAccessor1" => [
            "data 2 of #privateAccessor1",
          ],
        }
      `);
      expect(extractValues(processor2!)).toMatchInlineSnapshot(`
        Map {
          "getter1" => "value of getter1",
          "#privateGetter1" => "value of privateGetter1",
          "property1" => "value of property1",
          "accessor1" => "value of accessor1",
          "#privateProperty1" => "value of privateProperty1",
          "#privateAccessor1" => "value of privateAccessor1",
        }
      `);
    });
  });
});
