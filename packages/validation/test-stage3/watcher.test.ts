/* eslint-disable mobx/missing-make-observable */
import { observable, computed, runInAction } from "mobx";
import { getWatcher } from "../src/watcher";

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
      const watcher = getWatcher(sample);
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
      const watcher = getWatcher(sample);
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

        @computed
        // eslint-disable-next-line no-unused-private-class-members
        get #computed1() {
          return this.#field1;
        }

        set field1(value: boolean) {
          this.#field1 = value;
        }
      }

      test("private fields are tracked", () => {
        const sample = new Sample();
        const watcher = getWatcher(sample);
        expect(watcher.changed).toBe(false);
        expect(watcher.changedKeys).toEqual(new Set());

        runInAction(() => {
          sample.field1 = true;
        });
        expect(watcher.changed).toBe(true);
        expect(watcher.changedKeys).toEqual(new Set(["#field1", "#computed1"]));
      });
    });
  });
});
