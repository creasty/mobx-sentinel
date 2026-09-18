// biome-ignore-all lint/plugin/mobxMissingMakeObservable: stage-3 decorators need no makeObservable(this)
import { observable, runInAction } from "mobx";
import { nested } from "../src/nested";
import { addValidation, Validator } from "../src/validator";
import { Watcher, watch } from "../src/watcher";

/**
 * Whether the object behind the reference gets garbage collected
 *
 * See `isCollected` in ../src/memory.test.ts.
 */
async function isCollected(ref: WeakRef<object>) {
  const { gc } = globalThis;
  if (!gc) throw new Error("gc() is not exposed: run Vitest with `execArgv: ['--expose-gc']`");
  for (let attempt = 0; attempt < 5; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc();
    if (!ref.deref()) return true;
  }
  return false;
}

class Leaf {
  @observable accessor value = 0;
}

class Sample {
  @observable accessor field = 0;
  @watch tags = observable.array<string>();
  @nested @observable accessor leaf = new Leaf();

  constructor() {
    addValidation(
      this,
      (b) => {
        if (this.field < 0) b.invalidate("field", "negative");
      },
      { delayMs: 0 }
    );
  }
}

// Unlike stage-2 annotations, which are registered on the prototype, stage-3 annotations are registered on each
// instance, in a WeakMap entry whose value references the instance.
test("instances are garbage collected together with their targets", async () => {
  const refs = await (async () => {
    const sample = new Sample();
    const watcher = Watcher.get(sample);
    const validator = Validator.get(sample);
    runInAction(() => {
      sample.field--;
      sample.tags.push("a");
      sample.leaf.value++;
    });
    expect(watcher.changed).toBe(true);
    await vi.waitFor(() => expect(validator.isValid).toBe(false));
    return {
      sample: new WeakRef(sample),
      watcher: new WeakRef(watcher),
      validator: new WeakRef(validator),
      leaf: new WeakRef(sample.leaf),
    };
  })();
  expect(await isCollected(refs.sample)).toBe(true);
  expect(await isCollected(refs.watcher)).toBe(true);
  expect(await isCollected(refs.validator)).toBe(true);
  expect(await isCollected(refs.leaf)).toBe(true);
});
