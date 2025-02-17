import { computed, makeObservable, observable, runInAction } from "mobx";
import { Watcher, getInternal, unwatch, watch } from "./watcher";
import { nested } from "./nested";
import { KeyPath } from "./keyPath";

describe("Watcher", () => {
  describe("constructor", () => {
    it("throws an error when attempted to be instantiated directly", () => {
      expect(() => {
        new (Watcher as any)();
      }).toThrowError(/private constructor/);
    });
  });

  describe(".get", () => {
    it("throws an error when a non-object is given", () => {
      expect(() => {
        Watcher.get(null as any);
      }).toThrowError(/Expected an object/);
      expect(() => {
        Watcher.get(1 as any);
      }).toThrowError(/Expected an object/);
    });

    it("returns the same instance for the same target", () => {
      const target = {};
      const watcher = Watcher.get(target);
      expect(Watcher.get(target)).toBe(watcher);
    });

    it("returns different instances for different targets", () => {
      const target1 = {};
      const target2 = {};
      expect(Watcher.get(target1)).not.toBe(Watcher.get(target2));
    });
  });

  describe(".getSafe", () => {
    it("returns null when the target is not an object", () => {
      expect(Watcher.getSafe(null as any)).toBeNull();
      expect(Watcher.getSafe(1 as any)).toBeNull();
    });
  });

  describe("#assumeChanged", () => {
    it("sets changed to true without incrementing changedTick", () => {
      const watcher = Watcher.get({});
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changed).toBe(false);
      watcher.assumeChanged();
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changed).toBe(true);
    });
  });

  describe("#reset", () => {
    it("resets the state", () => {
      const watcher = Watcher.get({});
      const internal = getInternal(watcher);

      watcher.assumeChanged();
      expect(watcher.changed).toBe(true);

      watcher.reset();
      expect(watcher.changed).toBe(false);

      internal.didChange("field1");
      expect(watcher.changedTick).toBe(1n);
      expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      expect(watcher.changed).toBe(true);

      watcher.reset();
      expect(watcher.changedTick).toBe(0n);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changed).toBe(false);
    });
  });
});

describe("Annotations", () => {
  describe("@observable / @computed", () => {
    class Sample {
      @observable field1 = false;
      @observable field2 = false;

      constructor() {
        makeObservable(this);
      }

      @computed
      get computed1() {
        return this.field1;
      }

      @computed
      get computed2() {
        return this.field2;
      }

      @computed
      get computed3() {
        return this.field1 || this.field2;
      }
    }

    test("changes to @observable/@computed fields are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "computed3"]));

      runInAction(() => {
        sample.field2 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "field2", "computed2", "computed3"]));
    });

    test("changedTick is incremented for each change", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changedTick).toBe(0n);

      runInAction(() => {
        sample.field1 = true;
      });
      // 1 change to 3 fields each (field1, computed1, computed3)
      expect(watcher.changedTick).toBe(3n);

      runInAction(() => {
        sample.field2 = true;
      });
      // 1 change to 2 fields each (field2, computed2)
      // Since the value of computed3 is constant, it won't be counted.
      expect(watcher.changedTick).toBe(3n + 2n);

      runInAction(() => {
        sample.field1 = false;
        sample.field2 = false;
      });
      // 1 change to all 5 fields each
      // Since runInAction is used, change to field1 and field2 are counted as 1 change.
      expect(watcher.changedTick).toBe(3n + 2n + 5n);
    });

    test("when the value is not changed, the watcher is not updated", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = false; // same value as before
      });
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
    });

    test("reset() resets changed, changedKeys, and changedTick", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedTick).toBe(0n);

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).not.toEqual(new Set());
      expect(watcher.changedTick).not.toBe(0n);

      watcher.reset();
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedTick).toBe(0n);
    });

    describe("object", () => {
      class Sample {
        @observable field1 = { value: false };

        constructor() {
          makeObservable(this);
        }
      }

      test("changes to an object are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("array", () => {
      class Sample {
        @observable field1 = [false];
        @observable field2 = [{ value: false }];

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to an array are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1[0] = true;
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("mutations to an array are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.push(true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to array elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("set", () => {
      class Sample {
        @observable field1 = new Set([false]);
        @observable field2 = new Set([{ value: false }]);

        constructor() {
          makeObservable(this);
        }
      }

      test("mutations to a set are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.add(true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to set elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("map", () => {
      class Sample {
        @observable field1 = new Map([["key1", false]]);
        @observable field2 = new Map([["key1", { value: false }]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to a map are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.set("key2", true);
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
      });

      test("changes to map elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });
  });

  describe("@watch", () => {
    class Sample {
      @watch field1 = observable.box(false);
      @watch field2 = observable.box(false);

      constructor() {
        makeObservable(this);
      }

      readonly #computed1 = computed(() => this.field1.get());
      @watch
      get computed1() {
        return this.#computed1.get();
      }

      readonly #computed2 = computed(() => this.field2.get());
      @watch
      get computed2() {
        return this.#computed2.get();
      }

      readonly #computed3 = computed(() => this.field1.get() || this.field2.get());
      @watch
      get computed3() {
        return this.#computed3.get();
      }
    }

    test("changes to @watch fields are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1.set(true);
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "computed3"]));

      runInAction(() => {
        sample.field2.set(true);
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field1", "computed1", "field2", "computed2", "computed3"]));
    });
  });

  describe("@unwatch", () => {
    class Sample {
      @unwatch @observable field1 = false;
      @observable field2 = false;

      constructor() {
        makeObservable(this);
      }

      @unwatch
      @computed
      get computed1() {
        return this.field1;
      }

      @unwatch
      @computed
      get computed2() {
        return this.field2;
      }

      @computed
      get computed3() {
        return this.field1 || this.field2;
      }
    }

    test("changes to @unwatch fields are ignored", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.changed).toBe(false);
      expect(watcher.changedKeys).toEqual(new Set());

      runInAction(() => {
        sample.field1 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["computed3"]));

      runInAction(() => {
        sample.field2 = true;
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedKeys).toEqual(new Set(["field2", "computed3"]));
    });
  });

  describe("@watch.ref", () => {
    describe("object", () => {
      class Sample {
        @watch.ref @observable field1 = { value: false };

        constructor() {
          makeObservable(this);
        }
      }

      test("changes to an object are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("array", () => {
      class Sample {
        @watch.ref @observable field1 = [false];
        @watch.ref @observable field2 = [{ value: false }];

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to an array are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1[0] = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("mutations to an array are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.push(true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to array elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("set", () => {
      class Sample {
        @watch.ref @observable field1 = new Set([false]);
        @watch.ref @observable field2 = new Set([{ value: false }]);

        constructor() {
          makeObservable(this);
        }
      }

      test("mutations to a set are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.add(true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to set elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });

    describe("map", () => {
      class Sample {
        @watch.ref @observable field1 = new Map([["key1", false]]);
        @watch.ref @observable field2 = new Map([["key1", { value: false }]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("assignments to a map are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.set("key2", true);
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });

      test("changes to map elements are NOT tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set());
      });
    });
  });

  describe("@nested", () => {
    describe("non-nested value", () => {
      class Sample {
        @nested @observable field1 = 1;

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are not created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.size).toBe(0);
      });
    });

    describe("object", () => {
      class Sample {
        @nested @observable field1 = { value: false };
        @nested field2 = observable({ value: false });

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1" as KeyPath)).toBe(Watcher.get(sample.field1));
        expect(watcher.nested.get("field2" as KeyPath)).toBe(Watcher.get(sample.field2));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to an object are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
          sample.field2.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.value", "field2.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("boxed observable", () => {
      class Sample {
        @nested field1 = observable.box({ value: false });
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1" as KeyPath)).toBe(Watcher.get(sample.field1.get()));
        expect(watcher.nested.size).toBe(1);
      });

      test("assignments to a boxed observable field are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.set({ value: true });
        });
        expect(watcher.changedKeys).toEqual(new Set(["field1"]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1"]));
        expect(watcher.changed).toBe(true);
      });

      test("changes to a boxed observable field are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.get().value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("array", () => {
      class Sample {
        @nested @observable field1 = [{ value: false }];
        @nested field2 = [observable({ value: false })];

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1.0" as KeyPath)).toBe(Watcher.get(sample.field1[0]));
        expect(watcher.nested.get("field2.0" as KeyPath)).toBe(Watcher.get(sample.field2[0]));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to array elements are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1[0].value = true;
          sample.field2[0].value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.0.value", "field2.0.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1.0" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2.0" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("set", () => {
      class Sample {
        @nested @observable field1 = new Set([{ value: false }]);
        @nested field2 = new Set([observable({ value: false })]);

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1.0" as KeyPath)).toBe(Watcher.get(Array.from(sample.field1)[0]));
        expect(watcher.nested.get("field2.0" as KeyPath)).toBe(Watcher.get(Array.from(sample.field2)[0]));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to set elements are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          for (const element of sample.field1) {
            element.value = true;
          }
          for (const element of sample.field2) {
            element.value = true;
          }
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.0.value", "field2.0.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1.0" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2.0" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2.0" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("map", () => {
      class Sample {
        @nested @observable field1 = new Map([["key1", { value: false }]]);
        @nested field2 = new Map([["key1", observable({ value: false })]]);

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.get("field1.key1" as KeyPath)).toBe(Watcher.get(sample.field1.get("key1")!));
        expect(watcher.nested.get("field2.key1" as KeyPath)).toBe(Watcher.get(sample.field2.get("key1")!));
        expect(watcher.nested.size).toBe(2);
      });

      test("changes to map elements are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.get("key1")!.value = true;
          sample.field2.get("key1")!.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.key1.value", "field2.key1.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1.key1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1.key1" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2.key1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2.key1" as KeyPath)?.changed).toBe(true);
      });
    });

    describe("class", () => {
      class Sample {
        @nested field1 = new Other();
        @nested @observable field2 = new Other();

        constructor() {
          makeObservable(this);
        }
      }

      class Other {
        @observable value = false;

        constructor() {
          makeObservable(this);
        }
      }

      test("nested watchers are created", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.nested.size).toBe(2);
        expect(watcher.nested.get("field1" as KeyPath)).toBe(Watcher.get(sample.field1));
        expect(watcher.nested.get("field2" as KeyPath)).toBe(Watcher.get(sample.field2));
      });

      test("changes to a nested class are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.field1.value = true;
          sample.field2.value = true;
        });
        expect(watcher.changedKeys).toEqual(new Set([]));
        expect(watcher.changedKeyPaths).toEqual(new Set(["field1.value", "field2.value"]));
        expect(watcher.changed).toBe(true);
        expect(watcher.nested.get("field1" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field1" as KeyPath)?.changed).toBe(true);
        expect(watcher.nested.get("field2" as KeyPath)?.changedKeys).toEqual(new Set(["value"]));
        expect(watcher.nested.get("field2" as KeyPath)?.changed).toBe(true);
      });

      test("resetting a nested object does not reset the parent", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        const watcherNested = Watcher.get(sample.field1);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changed).toBe(true);
        expect(watcherNested.changed).toBe(true);

        watcherNested.reset();
        expect(watcher.changed).toBe(true);
        expect(watcherNested.changed).toBe(false);
      });

      test("the parent can reset all nested objects recursively", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        const watcherNested = Watcher.get(sample.field1);

        runInAction(() => {
          sample.field1.value = true;
        });
        expect(watcher.changed).toBe(true);
        expect(watcherNested.changed).toBe(true);

        watcher.reset();
        expect(watcher.changed).toBe(false);
        expect(watcherNested.changed).toBe(false);
      });
    });
  });
});
