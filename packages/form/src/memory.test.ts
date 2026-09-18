import { addValidation, KeyPath, nested, unwatch } from "@mobx-sentinel/core";
import { makeObservable, observable, runInAction } from "mobx";
import type { FormBinding } from "./binding";
import type { FormField } from "./field";
import { debugForm, Form } from "./form";

/**
 * Whether the object behind the reference gets garbage collected
 *
 * Create the object in a function of its own that returns only the reference: a local variable of the test, or of a
 * scope shared with a closure that is still alive, would keep it alive. `new WeakRef()` and `WeakRef#deref()` hold
 * their target until the current job ends, so each attempt waits for a new task before collecting.
 *
 * @returns `false` if the object is still reachable after a few attempts
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

/**
 * Pass the object behind the reference to `fn`
 *
 * Use it to call a method of the object without the test holding onto it. After calling a bound action, such as
 * `form.reset()`, the test itself can keep the action, and so the instance it is bound to, alive while it awaits.
 */
function withTarget<T extends object>(ref: WeakRef<T>, fn: (target: T) => void) {
  fn(ref.deref()!);
}

class ChildModel {
  @observable value = "";

  constructor() {
    makeObservable(this);
  }
}

class SampleModel {
  @observable field = "";
  @observable otherField = "";
  @nested @observable child = new ChildModel();
  @nested @observable children = [new ChildModel()];

  constructor() {
    makeObservable(this);
    addValidation(this, (b) => {
      if (!this.field) b.invalidate("field", "required");
    });
  }
}

class FieldBinding implements FormBinding {
  constructor(
    private readonly field: FormField,
    public config: { onChange?: () => void }
  ) {}

  get props() {
    return { id: this.field.id, onChange: this.config.onChange };
  }
}

class MultiFieldBinding implements FormBinding {
  constructor(private readonly fields: FormField[]) {}

  get props() {
    return { ids: this.fields.map((field) => field.id) };
  }
}

class FormStateBinding implements FormBinding {
  constructor(private readonly form: Form<unknown>) {}

  get props() {
    return { disabled: !this.form.canSubmit };
  }
}

describe("Form", () => {
  it("is garbage collected together with its subject, and so are its fields, bindings and sub-forms", async () => {
    const refs = await (async () => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.addHandler("submit", async () => true);
      form.bind("field", FieldBinding, { onChange: () => {} });
      form.bind(["field", "otherField"], MultiFieldBinding);
      expect(form.bind(FormStateBinding)).toEqual({ disabled: true });
      form.getField("otherField").markAsChanged("intermediate"); // Schedules the auto-finalization
      form.reportError();
      runInAction(() => {
        model.field = "value";
      });
      await vi.waitFor(() => expect(form.canSubmit).toBe(true));
      expect(await form.submit()).toBe(true); // Resets the form, which cancels the auto-finalization
      return {
        model: new WeakRef(model),
        form: new WeakRef(form),
        keyedForm: new WeakRef(Form.get(model, Symbol("keyed"))),
        field: new WeakRef(form.getField("field")),
        binding: new WeakRef(debugForm(form).bindings.values().next().value!),
        subForm: new WeakRef(form.subForms.get(KeyPath.build("child"))!),
      };
    })();
    expect(await isCollected(refs.model)).toBe(true);
    expect(await isCollected(refs.form)).toBe(true);
    expect(await isCollected(refs.keyedForm)).toBe(true);
    expect(await isCollected(refs.field)).toBe(true);
    expect(await isCollected(refs.binding)).toBe(true);
    expect(await isCollected(refs.subForm)).toBe(true);
  });

  it("keeps the subject alive while an input awaits auto-finalization, until reset() cancels it", async () => {
    const create = (reset: boolean) => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.configure({ autoFinalizationDelayMs: 60_000 }); // Long enough not to elapse during the test
      form.getField("field").markAsChanged("intermediate");
      if (reset) form.reset();
      return new WeakRef(model);
    };
    const pending = create(false);
    const reset = create(true);
    expect(await isCollected(reset)).toBe(true);
    // The timer references the field, and so the form and the subject, until it fires
    expect(await isCollected(pending)).toBe(false);
    Form.get(pending.deref()!).reset(); // Cancel the timer, so that it does not outlive the test
  });

  it("releases a disposed form while the subject lives on", async () => {
    const model = new SampleModel();
    const create = (formKey: symbol | undefined, setup: (form: Form<SampleModel>) => void) => {
      const form = Form.get(model, formKey);
      setup(form);
      Form.dispose(model, formKey);
      return new WeakRef(form);
    };
    const withoutFields = create(undefined, () => {});
    const withReportedField = create(undefined, (form) => form.getField("field").reportError());
    const keyedWithReportedField = create(Symbol("keyed"), (form) => form.getField("field").reportError());
    const awaitingFinalization = create(undefined, (form) => {
      form.configure({ autoFinalizationDelayMs: 60_000 }); // Long enough not to elapse during the test
      form.getField("field").markAsChanged("intermediate");
    });
    const awaitingValidation = create(undefined, (form) => {
      form.validator.addSyncHandler(() => void model.otherField, { delayMs: 60_000 });
      runInAction(() => {
        model.otherField = "value"; // Schedules a validation that does not settle during the test
      });
      form.getField("field").reportError();
    });
    expect(await isCollected(withoutFields)).toBe(true);
    expect(await isCollected(withReportedField)).toBe(true);
    expect(await isCollected(keyedWithReportedField)).toBe(true);
    // The timer of the auto-finalization references the field, and so the form, until it fires
    expect(await isCollected(awaitingFinalization)).toBe(false);
    withTarget(awaitingFinalization, (form) => form.reset()); // Cancel the timer
    expect(await isCollected(awaitingFinalization)).toBe(true);
    // A field observes the validator only while its report waits for the validation to settle
    expect(await isCollected(awaitingValidation)).toBe(false);
    withTarget(awaitingValidation, (form) => form.validator.reset()); // Cancel the validation, which settles the report
    expect(await isCollected(awaitingValidation)).toBe(true);
    expect(model.field).toBe("");
  });

  it("releases a submission handler once it is disposed", async () => {
    const form = Form.get(new SampleModel());
    const refs = await (async () => {
      const willSubmit = async () => true;
      const submit = async () => true;
      const didSubmit = () => {};
      const disposers = [
        form.addHandler("willSubmit", willSubmit),
        form.addHandler("submit", submit),
        form.addHandler("didSubmit", didSubmit),
      ];
      expect(await form.submit({ force: true })).toBe(true);
      for (const dispose of disposers) dispose();
      return { willSubmit: new WeakRef(willSubmit), submit: new WeakRef(submit), didSubmit: new WeakRef(didSubmit) };
    })();
    expect(await isCollected(refs.willSubmit)).toBe(true);
    expect(await isCollected(refs.submit)).toBe(true);
    expect(await isCollected(refs.didSubmit)).toBe(true);
    expect(form.isSubmitting).toBe(false);
  });

  describe("when the subject nests an object that outlives it", () => {
    class ParentModel {
      @observable field = "";
      @nested @observable child: ChildModel;

      constructor(child: ChildModel) {
        this.child = child;
        makeObservable(this);
      }
    }

    class UnwatchedParentModel {
      @observable field = "";
      @nested @unwatch @observable child: ChildModel;

      constructor(child: ChildModel) {
        this.child = child;
        makeObservable(this);
      }
    }

    it("keeps the subject alive through its watcher, but not through its fields", async () => {
      const shared = new ChildModel();
      const create = (Model: typeof ParentModel | typeof UnwatchedParentModel, withReportedField: boolean) => {
        const model = new Model(shared);
        const form = Form.get(model);
        if (withReportedField) form.getField("field").reportError();
        return new WeakRef(model);
      };
      const watched = create(ParentModel, false);
      const unwatched = create(UnwatchedParentModel, false);
      const unwatchedWithReportedField = create(UnwatchedParentModel, true);
      // With @unwatch, the watcher does not observe the nested object
      expect(await isCollected(unwatched)).toBe(true);
      // PINNED(quirk): The watcher of the subject observes the watchers of its @nested objects with reactions that cannot be disposed (see memory.test.ts in core), so a nested object that outlives the subject (here `shared`) keeps the subject and its forms alive, although MobX alone would let the subject go. Decide: should Watcher reactions be disposable, or stop observing state outside the subject?
      expect(await isCollected(watched)).toBe(false);
      // A field observes validator.isValidating, which reads the validators of the @nested objects, only while its report waits for the validation to settle
      expect(await isCollected(unwatchedWithReportedField)).toBe(true);
      expect(shared.value).toBe("");
    });
  });

  describe("bindings", () => {
    it("keep only the config of the latest call", async () => {
      const form = Form.get(new SampleModel());
      const bind = () => {
        const config = { onChange: () => {} };
        form.bind("field", FieldBinding, config);
        return new WeakRef(config);
      };
      const first = bind();
      const latest = bind();
      expect(await isCollected(first)).toBe(true);
      // The binding keeps the latest config, and whatever its callbacks capture, for as long as the form lives
      expect(await isCollected(latest)).toBe(false);
      expect(debugForm(form).bindings.size).toBe(1);
    });

    it("are kept for every field name and cache key they were created for", async () => {
      const form = Form.get(new SampleModel());
      const bindItem = (id: string) => {
        const config = { onChange: () => {} };
        form.bind(`field:${id}`, FieldBinding, config);
        return new WeakRef(config);
      };
      const removedItem = bindItem("item-1");
      bindItem("item-2");
      // PINNED(quirk): A form caches its fields and bindings for its whole lifetime and has no way to release them, so binding the items of a list by augmented field names (or by cache keys) grows the form with every item that has ever been rendered, and each binding keeps its latest config. Decide: should fields and bindings that are no longer used be released, e.g. through an API to remove them?
      expect(await isCollected(removedItem)).toBe(false);
      expect(debugForm(form).fields.size).toBe(2);
      expect(debugForm(form).bindings.size).toBe(2);
    });
  });
});
