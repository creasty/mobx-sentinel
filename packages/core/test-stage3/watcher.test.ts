// biome-ignore-all lint/plugin/mobxMissingMakeObservable: stage-3 decorators need no makeObservable(this)
import { observable, computed, runInAction } from "mobx";
import { Watcher, unwatch, watch } from "../src/watcher";
import { nested } from "../src/nested";
import { KeyPath } from "../src/keyPath";

class Leaf {
  @observable accessor value = 0;
}

describe("Annotations", () => {
  describe("@observable / @computed", () => {
    class Sample {
      @observable accessor field1 = false;
      @observable accessor field2 = false;

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

    describe("ECMAScript private", () => {
      class Sample {
        @observable accessor #field1 = false;

        // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read back through the watcher under test
        @computed get #computed1() {
          return this.#field1;
        }

        set field1(value: boolean) {
          this.#field1 = value;
        }
      }

      test("private fields are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);
        expect(watcher.changed).toBe(false);
        expect(watcher.changedKeys).toEqual(new Set());

        runInAction(() => {
          sample.field1 = true;
        });
        expect(watcher.changed).toBe(true);
        expect(watcher.changedKeys).toEqual(new Set(["#field1", "#computed1"]));
      });
    });

    describe("collections", () => {
      class Sample {
        @observable accessor array = [1];
      }

      test("mutations to an array are tracked", () => {
        const sample = new Sample();
        const watcher = Watcher.get(sample);

        runInAction(() => {
          sample.array.push(2);
        });
        expect(watcher.changedKeys).toEqual(new Set(["array"]));
        expect(watcher.changedTick).toBe(1n);
      });
    });
  });

  describe("@watch", () => {
    class Sample {
      @watch readonly #box = observable.box(0);
      @watch accessor plain = 0;

      @watch
      get doubled() {
        return this.#box.get() * 2;
      }

      setBox(value: number) {
        this.#box.set(value);
      }
    }

    test("ECMAScript private fields and getters are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.setBox(1);
      });
      expect(watcher.changedKeys).toEqual(new Set(["#box", "doubled"]));
      expect(watcher.changedTick).toBe(2n);
    });

    test("assignments to a non-observable accessor are NOT tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.plain = 1;
      });
      expect(watcher.changed).toBe(false);
    });
  });

  describe("@watch.ref", () => {
    class Sample {
      @watch.ref readonly #box = observable.box(0);
      @watch.ref @observable accessor #array = [1];

      setBox(value: number) {
        this.#box.set(value);
      }

      pushArray(value: number) {
        this.#array.push(value);
      }

      assignArray(value: number[]) {
        this.#array = value;
      }
    }

    test("setting a boxed observable is NOT tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.setBox(1);
      });
      // As documented on `watch`, @watch.ref opts out of unwrapping boxed observables: the box itself is compared by identity, and a readonly box never changes identity (same as with stage-2 decorators)
      expect(watcher.changed).toBe(false);
      expect(watcher.changedTick).toBe(0n);
    });

    test("mutations to a private array are NOT tracked, but assignments are", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.pushArray(2);
      });
      expect(watcher.changed).toBe(false);

      runInAction(() => {
        sample.assignArray([1, 2]);
      });
      expect(watcher.changedKeys).toEqual(new Set(["#array"]));
      expect(watcher.changedTick).toBe(1n);
    });
  });

  describe("@watch and @watch.ref on the same key", () => {
    class Sample {
      @watch @watch.ref readonly #shallowOuter = observable.array([1]);
      @watch.ref @watch readonly #refOuter = observable.array([1]);

      pushAll() {
        this.#shallowOuter.push(2);
        this.#refOuter.push(2);
      }
    }

    test("the outermost annotation prevails", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.pushAll();
      });
      expect(watcher.changedKeys).toEqual(new Set(["#shallowOuter"]));
    });
  });

  describe("@unwatch", () => {
    class Sample {
      @unwatch @observable accessor field1 = false;
      @unwatch @observable accessor #field2 = false;
      @observable accessor field3 = false;

      @unwatch
      @computed
      get computed1() {
        return this.field1 || this.#field2;
      }

      setField2(value: boolean) {
        this.#field2 = value;
      }
    }

    test("changes to @unwatch fields, including private ones, are ignored", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.field1 = true;
        sample.setField2(true);
      });
      expect(watcher.changed).toBe(false);
      expect(watcher.changedTick).toBe(0n);

      runInAction(() => {
        sample.field3 = true;
      });
      expect(watcher.changedKeys).toEqual(new Set(["field3"]));
    });

    test("unwatch() suppresses changes to accessors", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      unwatch(() => {
        sample.field3 = true;
      });
      expect(watcher.changed).toBe(false);
    });
  });

  describe("@nested", () => {
    class Sample {
      @nested @observable accessor child = new Leaf();
      @nested readonly #privateChild = new Leaf();

      get privateChild() {
        return this.#privateChild;
      }
    }

    test("nested watchers are created, including for private fields", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.nested).toEqual(
        new Map([
          ["child", Watcher.get(sample.child)],
          ["#privateChild", Watcher.get(sample.privateChild)],
        ])
      );
    });

    test("changes to nested objects are tracked with their key paths", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.child.value = 1;
        sample.privateChild.value = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedKeyPaths).toEqual(new Set(["child.value", "#privateChild.value"]));
      expect(watcher.changed).toBe(true);
    });

    test("assignments to a nested accessor are tracked", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.child = new Leaf();
      });
      expect(watcher.changedKeys).toEqual(new Set(["child"]));
      expect(watcher.nested.get("child" as KeyPath)).toBe(Watcher.get(sample.child));
    });

    test("reset() resets nested watchers of private fields", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.privateChild.value = 1;
      });
      expect(Watcher.get(sample.privateChild).changed).toBe(true);

      watcher.reset();
      expect(Watcher.get(sample.privateChild).changed).toBe(false);
      expect(watcher.changed).toBe(false);
    });
  });

  describe("@nested.hoist", () => {
    class Sample {
      @nested.hoist readonly #list = observable.array([new Leaf()]);

      get list() {
        return this.#list;
      }
    }

    test("changes to a private hoisted collection are tracked without the key", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);
      expect(watcher.nested).toEqual(new Map([["0", Watcher.get(sample.list[0])]]));

      runInAction(() => {
        sample.list[0].value = 1;
      });
      expect(watcher.changedKeyPaths).toEqual(new Set(["0.value"]));
      expect(watcher.changedTick).toBe(1n);
    });

    test("mutations to a private hoisted collection increment changedTick without adding a key", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.list.push(new Leaf());
      });
      expect(watcher.changed).toBe(true);
      expect(watcher.changedTick).toBe(1n);
      expect(watcher.changedKeys).toEqual(new Set());
      expect(watcher.changedKeyPaths).toEqual(new Set());
    });

    test("changes to nested objects and to own keys are tracked side by side", () => {
      class WithOwnKey {
        @nested.hoist @observable accessor list = [new Leaf()];
        @observable accessor own = 0;
      }

      const sample = new WithOwnKey();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.list[0].value = 1;
        sample.own = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["own"]));
      expect(watcher.changedKeyPaths).toEqual(new Set(["own", "0.value"]));
      expect(watcher.changedTick).toBe(2n);
    });
  });

  describe("@unwatch combined with @nested", () => {
    class Sample {
      @unwatch @nested @observable accessor child = new Leaf();
    }

    test("reassignments are NOT tracked, but the nested watcher follows the new object", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.child = new Leaf();
      });
      expect(watcher.changed).toBe(false);
      expect(watcher.nested.get("child" as KeyPath)).toBe(Watcher.get(sample.child));
    });
  });

  describe("@watch on ECMAScript private getters", () => {
    class Sample {
      @observable accessor value = 0;

      // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read back through the watcher under test
      @watch get #doubled() {
        return this.value * 2;
      }

      // biome-ignore lint/correctness/noUnusedPrivateClassMembers: read back through the watcher under test
      @watch.ref get #wrapped() {
        return [this.value];
      }
    }

    test("are tracked through the decorator context", () => {
      const sample = new Sample();
      const watcher = Watcher.get(sample);

      runInAction(() => {
        sample.value = 1;
      });
      expect(watcher.changedKeys).toEqual(new Set(["value", "#doubled", "#wrapped"]));
      expect(watcher.changedTick).toBe(3n);
    });
  });

  describe("inheritance", () => {
    class Base {
      @watch.ref readonly refInBase = observable.array([1]);
      @watch readonly shallowInBase = observable.array([1]);
      @unwatch readonly unwatchedInBase = observable.box(0);
    }

    class Derived extends Base {
      @watch override readonly refInBase = observable.array([1]);
      @watch.ref override readonly shallowInBase = observable.array([1]);
      @watch override readonly unwatchedInBase = observable.box(0);
    }

    test("the annotation in the subclass prevails, except that @unwatch cannot be re-enabled", () => {
      const derived = new Derived();
      const derivedWatcher = Watcher.get(derived);
      const base = new Base();
      const baseWatcher = Watcher.get(base);

      runInAction(() => {
        for (const sample of [derived, base]) {
          sample.refInBase.push(2);
          sample.shallowInBase.push(2);
          sample.unwatchedInBase.set(1);
        }
      });
      expect(derivedWatcher.changedKeys).toEqual(new Set(["refInBase"]));
      expect(baseWatcher.changedKeys).toEqual(new Set(["shallowInBase"]));
    });
  });

  describe("creation inside a transaction", () => {
    class Sample {
      @observable accessor value = 0;
    }

    test("changes made later in the same transaction are NOT tracked", () => {
      const sample = new Sample();
      let watcher!: Watcher;
      runInAction(() => {
        watcher = Watcher.get(sample);
        sample.value = 1;
      });
      // PINNED(bug): same as with stage-2 decorators: the watcher's reactions take their first reading when the transaction ends, so the change becomes the baseline. Expected: tracked, as the docs say "Watching starts immediately when the Watcher instance is created". Flip this assertion when fixing.
      expect(watcher.changed).toBe(false);
    });
  });
});
