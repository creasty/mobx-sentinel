import { autorun, configure as configureMobx, makeObservable, observable, reaction, runInAction } from "mobx";
import { Form } from "./form";
import { debugFormField, FormField } from "./field";
import { KeyPath, nested, Validator } from "@mobx-sentinel/core";

class SampleModel {
  @observable test = "test";
  @observable other = "test";

  constructor() {
    makeObservable(this);
  }
}

class NestedChildModel {
  @observable name = "";

  constructor() {
    makeObservable(this);
  }
}

class NestedParentModel {
  @observable test = "test";
  @nested @observable child = new NestedChildModel();

  constructor() {
    makeObservable(this);
  }
}

const symbolKey = Symbol("symbolKey");

type TypedModel = {
  a: string;
  1: number;
  [symbolKey]: boolean;
  method(): void;
};

function setupEnv() {
  const model = new SampleModel();
  const form = Form.get(model);
  const field = new FormField({
    fieldName: "test",
    validator: form.validator,
    getFinalizationDelayMs: () => 100,
  });

  const waitForDelay = async (shift = 10) => {
    vi.advanceTimersByTime(100 + shift);
  };

  const errorGroupKey = Symbol();
  const updateErrors = (handler: Validator.InstantHandler<SampleModel>) => {
    form.validator.updateErrors(errorGroupKey, handler);
  };

  return {
    model,
    form,
    validator: form.validator,
    updateErrors,
    waitForDelay,
    field,
  };
}

/** Adds a sync handler that invalidates "test" while its value starts with "invalid". */
function setupValidationEnv() {
  const env = setupEnv();
  const { model, validator } = env;

  validator.addSyncHandler((b) => {
    if (model.test.startsWith("invalid")) {
      b.invalidate("test", "invalid value");
    }
  });

  const setValue = (value: string) => {
    runInAction(() => {
      model.test = value;
    });
  };
  const settleValidation = () => {
    vi.advanceTimersByTime(Validator.defaultDelayMs);
  };

  settleValidation();
  expect(validator.isValidating).toBe(false);

  return { ...env, setValue, settleValidation };
}

/** Records every value the expression produces after the initial run. */
function recordReactions<T>(expr: () => T) {
  const values: T[] = [];
  const dispose = reaction(expr, (value) => {
    values.push(value);
  });
  return { values, dispose };
}

describe("FormField", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("can be created", () => {
    const { field } = setupEnv();
    expect(field.fieldName).toBe("test");

    expect(field.isTouched).toBe(false);
    expect(field.isIntermediate).toBe(false);
    expect(field.isChanged).toBe(false);
    expect(field.isIntermediate).toBe(false);
    expect(field.isErrorReported).toBe(undefined);
  });

  describe("#id, #fieldName, #validator", () => {
    it("exposes the given field name and validator as-is", () => {
      const { field, validator } = setupEnv();
      expect(field.fieldName).toBe("test");
      expect(field.validator).toBe(validator);
    });

    it("assigns a unique UUID v4 to each instance, even for the same field name", () => {
      const { field, validator } = setupEnv();
      const another = new FormField({ fieldName: "test", validator, getFinalizationDelayMs: () => 100 });

      expect(field.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(another.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      expect(another.id).not.toBe(field.id);
    });

    it("keeps the state independent between fields sharing the same name and validator", () => {
      const { field, validator, updateErrors } = setupEnv();
      const another = new FormField({ fieldName: "test", validator, getFinalizationDelayMs: () => 100 });

      updateErrors((b) => b.invalidate("test", "error"));
      field.markAsTouched();
      field.markAsChanged("final");

      expect(another.isTouched).toBe(false);
      expect(another.isChanged).toBe(false);
      expect(another.isErrorReported).toBe(undefined);
      // Errors come from the shared validator
      expect(another.hasErrors).toBe(true);
      expect(another.errors).toEqual(new Set(["error"]));
    });

    it("does not call getFinalizationDelayMs until an intermediate change is scheduled", () => {
      const { validator } = setupEnv();
      const getFinalizationDelayMs = vi.fn(() => 100);
      const field = new FormField({ fieldName: "test", validator, getFinalizationDelayMs });

      field.markAsTouched();
      field.markAsChanged("final");
      field.reportError();
      field.finalizeChangeIfNeeded();
      field.reset();
      expect(getFinalizationDelayMs).toBeCalledTimes(0);

      field.markAsChanged("intermediate");
      expect(getFinalizationDelayMs).toBeCalledTimes(1);
      field.markAsChanged("intermediate");
      expect(getFinalizationDelayMs).toBeCalledTimes(2);
    });
  });

  describe("#errors", () => {
    it("returns an empty set if there are no errors at all", () => {
      const { field } = setupEnv();
      expect(field.errors).toEqual(new Set());
    });

    it("returns an empty set if there is no errors for the field", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("other", "otherError"));
      expect(field.errors).toEqual(new Set());
    });

    it("returns the errors if there are errors for the field", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      expect(field.errors).toEqual(new Set(["error"]));
      updateErrors((b) => {
        b.invalidate("test", "error2");
        b.invalidate("other", "otherError");
      });
      expect(field.errors).toEqual(new Set(["error2"]));
    });

    it("merges messages from multiple error groups and deduplicates identical messages", () => {
      const { field, validator } = setupEnv();
      validator.updateErrors(Symbol(), (b) => {
        b.invalidate("test", "error1");
        b.invalidate("test", "error2");
      });
      validator.updateErrors(Symbol(), (b) => {
        b.invalidate("test", "error2");
        b.invalidate("test", new Error("error3"));
      });
      expect(field.errors).toEqual(new Set(["error1", "error2", "error3"]));
    });

    it("notifies observers only when the field's own error messages change", () => {
      const { field, updateErrors } = setupEnv();
      const seen: ReadonlySet<string>[] = [];
      const dispose = autorun(() => {
        seen.push(field.errors);
      });
      expect(seen).toEqual([new Set()]);

      updateErrors((b) => b.invalidate("other", "otherError"));
      expect(seen).toHaveLength(1);

      updateErrors((b) => b.invalidate("test", "error"));
      expect(seen).toHaveLength(2);
      expect(seen[1]).toEqual(new Set(["error"]));

      // Structurally equal errors for the field keep the same instance
      updateErrors((b) => {
        b.invalidate("test", "error");
        b.invalidate("other", "otherError");
      });
      expect(seen).toHaveLength(2);
      expect(field.errors).toBe(seen[1]);

      dispose();
    });

    it("keeps the errors after reset", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      field.markAsChanged("final");
      field.reset();
      expect(field.errors).toEqual(new Set(["error"]));
      expect(field.hasErrors).toBe(true);
    });
  });

  describe("#hasErrors", () => {
    it("returns false if there are no errors", () => {
      const { field } = setupEnv();
      expect(field.hasErrors).toBe(false);
    });

    it("returns true if there are errors", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      expect(field.hasErrors).toBe(true);
    });

    it("is not affected by errors of other fields", () => {
      const { field, updateErrors } = setupEnv();
      const { values, dispose } = recordReactions(() => field.hasErrors);

      updateErrors((b) => b.invalidate("other", "otherError"));
      expect(field.hasErrors).toBe(false);
      expect(values).toEqual([]);

      updateErrors((b) => b.invalidate("test", "error"));
      expect(values).toEqual([true]);

      updateErrors((b) => {
        b.invalidate("test", "error2");
        b.invalidate("other", "otherError");
      });
      expect(values).toEqual([true]);

      updateErrors(() => {});
      expect(values).toEqual([true, false]);

      dispose();
    });
  });

  describe("Field names", () => {
    it("includes errors of the nested object for a field named after the @nested property", () => {
      const model = new NestedParentModel();
      const form = Form.get(model);
      const field = form.getField("child");

      Validator.get(model.child).updateErrors(Symbol(), (b) => b.invalidate("name", "child error"));
      expect(field.hasErrors).toBe(true);
      expect(field.errors).toEqual(new Set(["child error"]));

      form.validator.updateErrors(Symbol(), (b) => b.invalidate("child", "parent error"));
      expect(field.errors).toEqual(new Set(["parent error", "child error"]));

      // Unrelated fields of the parent are not affected
      expect(form.getField("test").hasErrors).toBe(false);
    });

    it("resolves a dotted field name into the errors of the nested object", () => {
      const model = new NestedParentModel();
      const validator = Validator.get(model);
      const nameField = new FormField({ fieldName: "child.name", validator, getFinalizationDelayMs: () => 100 });
      const missingField = new FormField({ fieldName: "child.missing", validator, getFinalizationDelayMs: () => 100 });

      Validator.get(model.child).updateErrors(Symbol(), (b) => b.invalidate("name", "child error"));
      expect(nameField.hasErrors).toBe(true);
      expect(nameField.errors).toEqual(new Set(["child error"]));
      expect(missingField.hasErrors).toBe(false);
      expect(missingField.errors).toEqual(new Set());
    });

    it("looks up errors by the full augmented field name including the suffix", () => {
      const { form, updateErrors } = setupEnv();
      const field = form.getField("test:suffix");
      expect(field.fieldName).toBe("test:suffix");

      updateErrors((b) => b.invalidate("test", "error"));
      // PINNED(quirk): the ":suffix" of an augmented field name (FormField.NameAugmented) is kept in the error lookup key, and ValidationErrorMapBuilder#invalidate only accepts `keyof T`, so an augmented field never sees errors of its base key. Decide: should errors be looked up by the base name before ":"?
      expect(field.hasErrors).toBe(false);
      expect(field.errors).toEqual(new Set());
    });
  });

  describe("#reportError", () => {
    it("marks the field as reported", () => {
      const { field } = setupEnv();
      const internal = debugFormField(field);
      expect(internal.isReported.get()).toBe(false);
      field.reportError();
      expect(internal.isReported.get()).toBe(true);
    });

    it("does not mark the field as touched or changed", () => {
      const { field } = setupEnv();
      field.reportError();
      expect(field.isTouched).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isIntermediate).toBe(false);
    });

    it("is idempotent and notifies observers once", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      const { values, dispose } = recordReactions(() => field.isErrorReported);
      // reaction() compares values, so also count raw runs of an autorun observing the internal flag
      let flagRuns = 0;
      const disposeFlag = autorun(() => {
        void debugFormField(field).isReported.get();
        flagRuns++;
      });

      field.reportError();
      expect(flagRuns).toBe(2);
      field.reportError();
      expect(flagRuns).toBe(2);
      expect(field.isErrorReported).toBe(true);
      expect(values).toEqual([true]);

      dispose();
      disposeFlag();
    });

    it("does not cancel a pending auto-finalization", async () => {
      const { field, waitForDelay, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));

      field.markAsChanged("intermediate");
      field.reportError();
      expect(field.isIntermediate).toBe(true);
      expect(field.isErrorReported).toBe(true);

      await waitForDelay();
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(true);
    });

    it("is not reflected in isErrorReported until the outermost action ends", () => {
      const { field, validator, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));

      expect(validator.isValidating).toBe(false);
      runInAction(() => {
        field.reportError();
        // PINNED(quirk): isErrorReported is driven by a reaction, so inside a batch (action) it still reads undefined right after reportError() even though no validation is running. Decide: should the report be readable synchronously within the same action?
        expect(field.isErrorReported).toBe(undefined);
      });
      expect(field.isErrorReported).toBe(true);
    });
  });

  describe("#reportError, #isErrorReported", () => {
    it("returns undefined if reporting is pending", () => {
      const { field } = setupEnv();
      expect(field.isErrorReported).toBe(undefined);
    });

    it("returns undefined if there are errors but they are not reported", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      expect(field.isErrorReported).toBe(undefined);
    });

    it("returns false if there are no errors", () => {
      const { field } = setupEnv();
      field.reportError();
      expect(field.isErrorReported).toBe(false);
    });

    it("returns true if there are errors and they are reported", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      field.reportError();
      expect(field.isErrorReported).toBe(true);
    });

    it("retains the current value until the validation becomes up-to-date", async () => {
      const { field, validator, model } = setupEnv();

      validator.addSyncHandler((b) => {
        if (model.test === "test") {
          b.invalidate("test", "error");
        }
      });
      await vi.waitFor(() => expect(validator.isValidating).toBe(false));
      expect(field.hasErrors).toBe(true);
      expect(field.isErrorReported).toBe(undefined);

      runInAction(() => {
        model.test = "valid";
        field.reportError();
      });
      expect(validator.isValidating).toBe(true);
      expect(field.isErrorReported).toBe(undefined); // Does not change immediately

      await vi.waitFor(() => expect(validator.isValidating).toBe(false));
      expect(field.isErrorReported).toBe(false); // Changes after the validation is up-to-date
    });

    it("follows error changes immediately once reported", () => {
      const { field, updateErrors } = setupEnv();
      field.reportError();
      expect(field.isErrorReported).toBe(false);

      updateErrors((b) => b.invalidate("test", "error"));
      expect(field.isErrorReported).toBe(true);

      updateErrors(() => {});
      expect(field.isErrorReported).toBe(false);
    });

    it("does not notify observers about error changes while unreported", () => {
      const { field, updateErrors } = setupEnv();
      const { values, dispose } = recordReactions(() => field.isErrorReported);

      updateErrors((b) => b.invalidate("test", "error"));
      updateErrors(() => {});
      updateErrors((b) => b.invalidate("test", "error"));
      expect(values).toEqual([]);

      field.reportError();
      expect(values).toEqual([true]);

      updateErrors(() => {});
      expect(values).toEqual([true, false]);

      field.reset();
      expect(values).toEqual([true, false, undefined]);

      dispose();
    });

    describe("with validation in progress", () => {
      it("stays undefined while validating and reports once the validation settles", () => {
        const { field, validator, setValue } = setupValidationEnv();

        setValue("invalid");
        expect(validator.isValidating).toBe(true);
        field.reportError();
        expect(field.isErrorReported).toBe(undefined);

        vi.advanceTimersByTime(Validator.defaultDelayMs - 1);
        expect(validator.isValidating).toBe(true);
        expect(field.isErrorReported).toBe(undefined);

        vi.advanceTimersByTime(1);
        expect(validator.isValidating).toBe(false);
        expect(field.isErrorReported).toBe(true);
        expect(field.errors).toEqual(new Set(["invalid value"]));
      });

      it("defers the report of markAsChanged('final') in the same way", () => {
        const { field, setValue, settleValidation } = setupValidationEnv();

        setValue("invalid");
        field.markAsChanged("final");
        expect(field.isChanged).toBe(true);
        expect(field.isErrorReported).toBe(undefined);

        settleValidation();
        expect(field.isErrorReported).toBe(true);
      });

      it("stays unreported when reported and reset within the same validation run", () => {
        const { field, validator, setValue, settleValidation } = setupValidationEnv();

        setValue("invalid");
        field.reportError();
        field.reset();
        expect(validator.isValidating).toBe(true);

        settleValidation();
        expect(validator.isValidating).toBe(false);
        expect(field.hasErrors).toBe(true);
        expect(field.isErrorReported).toBe(undefined);
      });

      it("reports after the validation settles when reset and reported again within the same run", () => {
        const { field, setValue, settleValidation } = setupValidationEnv();

        setValue("invalid");
        field.reset();
        field.reportError();
        expect(field.isErrorReported).toBe(undefined);

        settleValidation();
        expect(field.isErrorReported).toBe(true);
      });

      it("keeps the report visible after reset until the in-flight validation settles", () => {
        const { field, validator, setValue, settleValidation } = setupValidationEnv();

        setValue("invalid");
        settleValidation();
        field.reportError();
        expect(field.isErrorReported).toBe(true);

        setValue("invalid again");
        expect(validator.isValidating).toBe(true);
        field.reset();
        expect(debugFormField(field).isReported.get()).toBe(false);
        // PINNED(bug): reset() while a validation is in progress leaves isErrorReported at true, because clearing the report is deferred like reporting is. Expected: undefined right away (JSDoc of reset: "Clears error reporting"). Flip this assertion when fixing.
        expect(field.isErrorReported).toBe(true);

        settleValidation();
        expect(field.isErrorReported).toBe(undefined);
      });

      it("follows instant error changes before the validation settles once reported", () => {
        const { field, validator, updateErrors, setValue, settleValidation } = setupValidationEnv();

        updateErrors((b) => b.invalidate("test", "instant error"));
        field.reportError();
        expect(field.isErrorReported).toBe(true);

        setValue("valid");
        expect(validator.isValidating).toBe(true);
        updateErrors(() => {});
        // PINNED(quirk): once reported, isErrorReported mirrors hasErrors live, so errors that change mid-validation (e.g. via updateErrors) show up before the validation settles; only the unreported -> reported transition waits. Decide: should the value be held until the validation settles, as "retains the current value until the validation becomes up-to-date" suggests?
        expect(field.isErrorReported).toBe(false);

        settleValidation();
        expect(field.isErrorReported).toBe(false);
      });

      it("waits for async validation handlers to finish", async () => {
        const { model, validator, field } = setupEnv();
        let finish!: () => void;
        validator.addAsyncHandler(
          () => model.test,
          async (value, b) => {
            await new Promise<void>((resolve) => {
              finish = resolve;
            });
            if (value === "invalid") {
              b.invalidate("test", "async error");
            }
          },
          { initialRun: false, delayMs: 10 }
        );

        runInAction(() => {
          model.test = "invalid";
        });
        field.reportError();
        expect(validator.isValidating).toBe(true);
        expect(field.isErrorReported).toBe(undefined);

        // Reaction delay + scheduled run delay; the handler is still pending
        await vi.advanceTimersByTimeAsync(20);
        expect(validator.isValidating).toBe(true);
        expect(field.isErrorReported).toBe(undefined);

        finish();
        await vi.advanceTimersByTimeAsync(0);
        expect(validator.isValidating).toBe(false);
        expect(field.isErrorReported).toBe(true);
        expect(field.errors).toEqual(new Set(["async error"]));
      });
    });
  });

  describe("#markAsTouched", () => {
    it("marks the field as touched", () => {
      const { field } = setupEnv();
      field.markAsTouched();
      expect(field.isTouched).toBe(true);
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(undefined);
    });

    it("does not report errors even when there are errors", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      field.markAsTouched();
      expect(field.hasErrors).toBe(true);
      expect(field.isErrorReported).toBe(undefined);
      expect(debugFormField(field).isReported.get()).toBe(false);
    });

    it("is idempotent and notifies observers once", () => {
      const { field } = setupEnv();
      let runs = 0;
      const dispose = autorun(() => {
        void field.isTouched;
        runs++;
      });
      expect(runs).toBe(1);

      field.markAsTouched();
      expect(runs).toBe(2);
      field.markAsTouched();
      expect(runs).toBe(2);
      expect(field.isTouched).toBe(true);

      dispose();
    });
  });

  describe("#markAsChanged", () => {
    it("defaults to 'final'", async () => {
      const { field, waitForDelay, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));

      field.markAsChanged();
      expect(field.isChanged).toBe(true);
      expect(field.isIntermediate).toBe(false);
      expect(field.isErrorReported).toBe(true);

      await waitForDelay();
      expect(field.isChanged).toBe(true);
      expect(field.isIntermediate).toBe(false);
    });

    it("does not notify observers when the same change type is repeated", () => {
      const { field } = setupEnv();
      // An autorun (unlike reaction()) re-runs on every change of the observed boxes, even if the derived value is equal
      let runs = 0;
      const dispose = autorun(() => {
        void [field.isChanged, field.isIntermediate];
        runs++;
      });
      expect(runs).toBe(1);

      field.markAsChanged("intermediate");
      expect(runs).toBe(2);
      field.markAsChanged("intermediate");
      expect(runs).toBe(2);
      expect(field.isIntermediate).toBe(true);

      field.markAsChanged("final");
      expect(runs).toBe(3);
      field.markAsChanged("final");
      expect(runs).toBe(3);
      expect(field.isIntermediate).toBe(false);

      dispose();
    });

    it("re-runs observers of isChanged when the change type flips while isChanged stays true", () => {
      const { field } = setupEnv();
      let runs = 0;
      const dispose = autorun(() => {
        void field.isChanged;
        runs++;
      });
      expect(runs).toBe(1);

      field.markAsChanged("intermediate");
      expect(runs).toBe(2);

      field.markAsChanged("final");
      expect(field.isChanged).toBe(true);
      // PINNED(quirk): isChanged (like isIntermediate and isTouched) is a plain getter over the change-type box, not @computed, so observers re-run on intermediate -> final although the value stays true. Decide: should these getters be @computed to avoid redundant notifications?
      expect(runs).toBe(3);

      dispose();
    });

    describe("final", () => {
      it("marks the field as changed and reports error instantly", () => {
        const { field, updateErrors } = setupEnv();

        updateErrors((b) => b.invalidate("test", "error"));

        field.markAsChanged("final");
        expect(field.isTouched).toBe(false);
        expect(field.isIntermediate).toBe(false);
        expect(field.isChanged).toBe(true);
        expect(field.isErrorReported).toBe(true);
      });

      it("reports false instantly when there are no errors", () => {
        const { field } = setupEnv();
        field.markAsChanged("final");
        expect(field.isErrorReported).toBe(false);
        expect(debugFormField(field).isReported.get()).toBe(true);
      });
    });

    describe("intermediate", () => {
      it("marks the field as 'intermediately' changed and calls finalizeChangeIfNeeded() after a delay", async () => {
        const { field, waitForDelay, updateErrors } = setupEnv();
        const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

        updateErrors((b) => b.invalidate("test", "error"));

        field.markAsChanged("intermediate");
        expect(spy).toBeCalledTimes(0);
        expect(field.isTouched).toBe(false);
        expect(field.isIntermediate).toBe(true);
        expect(field.isChanged).toBe(true);
        expect(field.isErrorReported).toBe(undefined);

        // Finalized after a delay
        await waitForDelay();
        expect(spy).toBeCalledTimes(1);
      });

      it("prolongs the delay when changes are made again", async () => {
        const { field, waitForDelay, updateErrors } = setupEnv();
        const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

        updateErrors((b) => b.invalidate("test", "error"));

        field.markAsChanged("intermediate");
        await waitForDelay(-10);
        expect(spy).toBeCalledTimes(0);

        field.markAsChanged("intermediate");
        await waitForDelay(-10);
        expect(spy).toBeCalledTimes(0);

        await waitForDelay();
        expect(spy).toBeCalledTimes(1);
      });

      it("cancels the delay with markAsChanged(final)", async () => {
        const { field, waitForDelay, updateErrors } = setupEnv();
        const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

        updateErrors((b) => b.invalidate("test", "error"));

        field.markAsChanged("intermediate");
        field.markAsChanged("final");
        expect(spy).toBeCalledTimes(0);
        await waitForDelay();
        expect(spy).toBeCalledTimes(0);
      });

      it("finalizes exactly after the delay and reports errors", () => {
        const { field, updateErrors } = setupEnv();
        updateErrors((b) => b.invalidate("test", "error"));

        field.markAsChanged("intermediate");
        vi.advanceTimersByTime(99);
        expect(field.isIntermediate).toBe(true);
        expect(field.isErrorReported).toBe(undefined);
        expect(debugFormField(field).isReported.get()).toBe(false);

        vi.advanceTimersByTime(1);
        expect(field.isIntermediate).toBe(false);
        expect(field.isChanged).toBe(true);
        expect(field.isErrorReported).toBe(true);
      });

      it("reads the delay at scheduling time", () => {
        const { validator } = setupEnv();
        let delayMs = 100;
        const field = new FormField({ fieldName: "test", validator, getFinalizationDelayMs: () => delayMs });

        field.markAsChanged("intermediate");
        delayMs = 500;
        vi.advanceTimersByTime(100);
        expect(field.isIntermediate).toBe(false); // The pending timer keeps the old delay

        field.markAsChanged("intermediate");
        vi.advanceTimersByTime(499);
        expect(field.isIntermediate).toBe(true);
        vi.advanceTimersByTime(1);
        expect(field.isIntermediate).toBe(false);
      });

      it("finalizes on the next timer tick when the delay is 0", () => {
        const { validator } = setupEnv();
        const field = new FormField({ fieldName: "test", validator, getFinalizationDelayMs: () => 0 });

        field.markAsChanged("intermediate");
        expect(field.isIntermediate).toBe(true);

        vi.advanceTimersByTime(0);
        expect(field.isIntermediate).toBe(false);
        expect(field.isChanged).toBe(true);
      });

      it("keeps errors visible when switching back to intermediate after a final change", async () => {
        const { field, waitForDelay, updateErrors } = setupEnv();
        updateErrors((b) => b.invalidate("test", "error"));

        field.markAsChanged("final");
        expect(field.isErrorReported).toBe(true);

        field.markAsChanged("intermediate");
        expect(field.isIntermediate).toBe(true);
        expect(field.isChanged).toBe(true);
        // An intermediate change does not withdraw an earlier report: once shown, errors keep following the value while typing (README: "Errors Follow the Value Once Shown")
        expect(field.isErrorReported).toBe(true);

        await waitForDelay();
        expect(field.isIntermediate).toBe(false);
        expect(field.isErrorReported).toBe(true);
      });

      it("leaves the field intermediate without auto-finalization when getFinalizationDelayMs throws", () => {
        const { validator } = setupEnv();
        const field = new FormField({
          fieldName: "test",
          validator,
          getFinalizationDelayMs: () => {
            throw new Error("boom");
          },
        });

        expect(() => field.markAsChanged("intermediate")).toThrow("boom");
        // PINNED(quirk): the change type is set before the delay is resolved, so a throwing getter leaves the field intermediate with no auto-finalization scheduled. Decide: should the delay be resolved before mutating the state (or the error be contained)?
        expect(field.isIntermediate).toBe(true);
        expect(field.isChanged).toBe(true);
        expect(vi.getTimerCount()).toBe(0);

        vi.advanceTimersByTime(60_000);
        expect(field.isIntermediate).toBe(true);
      });
    });
  });

  describe("#finalizeChangeIfNeeded", () => {
    it("does nothing if the field is not intermediate", () => {
      const { field } = setupEnv();
      const spy = vi.spyOn(field, "markAsChanged");

      field.finalizeChangeIfNeeded();
      expect(spy).toBeCalledTimes(0);
    });

    it("finalizes changes if there have been intermediate changes", async () => {
      const { field } = setupEnv();
      const spy = vi.spyOn(field, "markAsChanged");

      field.markAsChanged("intermediate");
      field.finalizeChangeIfNeeded();
      expect(spy).toBeCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith("final");
    });

    it("cancels the delay and finalizes changes right away", async () => {
      const { field, waitForDelay } = setupEnv();
      const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

      field.markAsChanged("intermediate");
      field.finalizeChangeIfNeeded();
      expect(spy).toBeCalledTimes(1);
      await waitForDelay();
      expect(spy).toBeCalledTimes(1);
    });

    it("cancels the delayed validation when the field is reset", async () => {
      const { field, waitForDelay } = setupEnv();
      const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

      field.markAsChanged("intermediate");
      field.reset();
      await waitForDelay();

      expect(spy).toBeCalledTimes(0);
    });

    it("reports errors when finalizing an intermediate change", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));

      field.markAsChanged("intermediate");
      expect(field.isErrorReported).toBe(undefined);

      field.finalizeChangeIfNeeded();
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(true);
      expect(field.isErrorReported).toBe(true);
    });

    it("neither reports errors nor marks the field as changed when there is no change", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));

      field.finalizeChangeIfNeeded();
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(undefined);
    });

    it("does nothing after the change has been finalized", () => {
      const { field } = setupEnv();

      field.markAsChanged("intermediate");
      field.finalizeChangeIfNeeded();
      const spy = vi.spyOn(field, "markAsChanged");

      field.finalizeChangeIfNeeded();
      expect(spy).toBeCalledTimes(0);
      expect(field.isChanged).toBe(true);
    });
  });

  describe("#reset", () => {
    it("resets the field", () => {
      const { field } = setupEnv();
      const internal = debugFormField(field);

      field.markAsTouched();
      field.markAsChanged("intermediate");
      field.markAsChanged("final");
      field.reportError();

      field.reset();
      expect(field.isTouched).toBe(false);
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(undefined);
      expect(internal.isReported.get()).toBe(false);
    });

    it("is a no-op on a pristine field", () => {
      const { field } = setupEnv();
      field.reset();
      expect(field.isTouched).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(undefined);
    });

    it("allows reporting the retained errors again", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));

      field.markAsChanged("final");
      field.reset();
      expect(field.isErrorReported).toBe(undefined);

      field.reportError();
      expect(field.isErrorReported).toBe(true);
    });

    it("allows scheduling auto-finalization again", async () => {
      const { field, waitForDelay } = setupEnv();

      field.markAsChanged("intermediate");
      field.reset();
      field.markAsChanged("intermediate");
      expect(field.isIntermediate).toBe(true);

      await waitForDelay();
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(true);
    });
  });

  describe("with Form", () => {
    it("is cached per field name by Form#getField", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const field = form.getField("test");
      expect(form.getField("test")).toBe(field);
      expect(field.fieldName).toBe("test");
      expect(field.validator).toBe(form.validator);

      expect(form.getField("other")).not.toBe(field);
      expect(form.getField("test:suffix")).not.toBe(field);
      expect(form.getField("test:suffix")).toBe(form.getField("test:suffix"));
    });

    it("is distinct per form key while sharing the validator of the subject", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const altForm = Form.get(model, Symbol("alt"));

      const field = form.getField("test");
      const altField = altForm.getField("test");
      expect(altField).not.toBe(field);
      expect(altField.validator).toBe(field.validator);

      form.validator.updateErrors(Symbol(), (b) => b.invalidate("test", "error"));
      field.markAsTouched();
      field.reportError();
      expect(field.isErrorReported).toBe(true);
      expect(altField.isTouched).toBe(false);
      expect(altField.isErrorReported).toBe(undefined);
      expect(altField.hasErrors).toBe(true);
    });

    it("uses autoFinalizationDelayMs of the form config (default: 3000)", () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("test");

      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(2999);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);
    });

    it("uses the local form config at scheduling time", () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("test");

      form.configure({ autoFinalizationDelayMs: 50 });
      field.markAsChanged("intermediate");
      form.configure({ autoFinalizationDelayMs: 500 });

      vi.advanceTimersByTime(49);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);

      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(499);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);
    });

    it("is reset by Form#reset, which also cancels the pending auto-finalization", () => {
      const form = Form.get(new SampleModel());
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("test", "error"));
      const field = form.getField("test");
      const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

      field.markAsTouched();
      field.reportError();
      field.markAsChanged("intermediate");
      expect(field.isErrorReported).toBe(true);

      form.reset();
      expect(field.isTouched).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(undefined);
      expect(field.hasErrors).toBe(true);

      vi.advanceTimersByTime(form.config.autoFinalizationDelayMs);
      expect(spy).toBeCalledTimes(0);
      expect(field.isChanged).toBe(false);
    });

    it("is reset after a successful submission", async () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("test");
      form.addHandler("submit", async () => true);

      field.markAsTouched();
      field.markAsChanged("final");
      expect(field.isErrorReported).toBe(false);

      await expect(form.submit({ force: true })).resolves.toBe(true);
      expect(field.isTouched).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(undefined);
    });

    it("keeps its state after a failed submission", async () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("test");
      form.addHandler("submit", async () => false);

      field.markAsTouched();
      field.markAsChanged("final");

      await expect(form.submit({ force: true })).resolves.toBe(false);
      expect(field.isTouched).toBe(true);
      expect(field.isChanged).toBe(true);
      expect(field.isErrorReported).toBe(false);
    });

    it("is not reported when the submission is refused by canSubmit", async () => {
      const form = Form.get(new SampleModel());
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("test", "error"));
      const field = form.getField("test");
      const handler = vi.fn(async () => true);
      form.addHandler("submit", handler);

      expect(form.canSubmit).toBe(false);
      // Reporting is left to the caller (README: "Typically called when submit fails validation")
      await expect(form.submit()).resolves.toBe(false);
      expect(handler).toBeCalledTimes(0);
      expect(field.isErrorReported).toBe(undefined);
    });
  });

  describe("Observer notifications", () => {
    it("does not re-run autoruns of hasErrors unless its value flips", () => {
      const { field, validator, updateErrors } = setupEnv();
      let runs = 0;
      let rawRuns = 0;
      const dispose = autorun(() => {
        void field.hasErrors;
        runs++;
      });
      // Reference: the underlying validator query re-runs on any error change
      const disposeRaw = autorun(() => {
        void validator.hasErrors(KeyPath.build("test"));
        rawRuns++;
      });

      updateErrors((b) => b.invalidate("other", "otherError"));
      updateErrors((b) => b.invalidate("test", "error"));
      updateErrors((b) => b.invalidate("test", "error2"));
      expect(rawRuns).toBe(4);
      expect(runs).toBe(2);

      dispose();
      disposeRaw();
    });

    it("exposes a transient snapshot to observers whenever the report changes along with other state", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));

      // [isTouched, isChanged, isIntermediate, isErrorReported]
      const snapshots: [boolean, boolean, boolean, boolean | undefined][] = [];
      const dispose = autorun(() => {
        snapshots.push([field.isTouched, field.isChanged, field.isIntermediate, field.isErrorReported]);
      });
      const takeSnapshots = () => snapshots.splice(0);
      expect(takeSnapshots()).toEqual([[false, false, false, undefined]]);

      field.markAsTouched();
      expect(takeSnapshots()).toEqual([[true, false, false, undefined]]);

      field.markAsChanged("intermediate");
      expect(takeSnapshots()).toEqual([[true, true, true, undefined]]);

      vi.advanceTimersByTime(100); // Auto-finalization
      // PINNED(quirk): the report is propagated by a separate reaction, so observers first see the new change state with the stale report and are notified again once the report catches up (also after markAsChanged("final") and reset() below). Decide: should state and report be published in a single notification (e.g. deriving the report without a reaction)?
      expect(takeSnapshots()).toEqual([
        [true, true, false, undefined],
        [true, true, false, true],
      ]);

      // The report survives the intermediate change (see the pinned quirk in "keeps errors visible when switching back to intermediate after a final change")
      field.markAsChanged("intermediate");
      expect(takeSnapshots()).toEqual([[true, true, true, true]]);

      field.finalizeChangeIfNeeded(); // Already reported; no transient snapshot
      expect(takeSnapshots()).toEqual([[true, true, false, true]]);

      field.reset();
      expect(takeSnapshots()).toEqual([
        [false, false, false, true],
        [false, false, false, undefined],
      ]);

      field.markAsChanged("final");
      expect(takeSnapshots()).toEqual([
        [false, true, false, undefined],
        [false, true, false, true],
      ]);

      dispose();
    });

    it("mutates the state inside actions (no strict-mode warnings), including the auto-finalization timer", () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      configureMobx({ enforceActions: "always" });
      const { field, updateErrors } = setupEnv();
      const dispose = autorun(() => {
        void [field.isTouched, field.isChanged, field.isIntermediate, field.isErrorReported];
      });
      try {
        updateErrors((b) => b.invalidate("test", "error"));
        field.markAsTouched();
        field.markAsChanged("intermediate");
        vi.advanceTimersByTime(100);
        field.markAsChanged("intermediate");
        field.finalizeChangeIfNeeded();
        field.reportError();
        field.reset();
        field.markAsChanged();
        expect(field.isErrorReported).toBe(true);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        dispose();
        configureMobx({ enforceActions: "observed" });
        warn.mockRestore();
      }
    });
  });

  describe("Misuse", () => {
    it("accepts an unknown change type at runtime as a changed, unreported, non-intermediate state", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

      field.markAsChanged("intermediate");
      field.markAsChanged("partial" as FormField.ChangeType);
      // PINNED(quirk): an unknown change type (only rejected by the type) is stored as-is: the field becomes changed but neither intermediate nor reported, and the pending auto-finalization is not cancelled (it later fires as a no-op). Decide: should unknown types throw, or be treated as "final"?
      expect(field.isChanged).toBe(true);
      expect(field.isIntermediate).toBe(false);
      expect(field.isErrorReported).toBe(undefined);

      vi.advanceTimersByTime(100);
      expect(spy).toBeCalledTimes(1);
      expect(field.isChanged).toBe(true);
      expect(field.isErrorReported).toBe(undefined);
    });

    it("cancels a pending auto-finalization in finalizeChangeIfNeeded even when the field is no longer intermediate", () => {
      const { field } = setupEnv();
      const spy = vi.spyOn(field, "finalizeChangeIfNeeded");

      field.markAsChanged("intermediate");
      field.markAsChanged("partial" as FormField.ChangeType); // Leaves the timer pending (see above)
      field.finalizeChangeIfNeeded();
      expect(spy).toBeCalledTimes(1);

      vi.advanceTimersByTime(100);
      expect(spy).toBeCalledTimes(1); // The timer did not fire
    });
  });

  describe("Auto-finalization across fields", () => {
    it("keeps the timers independent between fields", () => {
      const { validator, updateErrors } = setupEnv();
      const field1 = new FormField({ fieldName: "test", validator, getFinalizationDelayMs: () => 100 });
      const field2 = new FormField({ fieldName: "other", validator, getFinalizationDelayMs: () => 100 });
      const field3 = new FormField({ fieldName: "test", validator, getFinalizationDelayMs: () => 100 });
      updateErrors((b) => {
        b.invalidate("test", "error");
        b.invalidate("other", "otherError");
      });

      field1.markAsChanged("intermediate");
      field2.markAsChanged("intermediate");
      vi.advanceTimersByTime(50);
      field3.markAsChanged("intermediate");

      // Finalizing or resetting a field does not cancel the timers of the others
      field1.finalizeChangeIfNeeded();
      field1.reset();
      expect(field2.isIntermediate).toBe(true);
      expect(field3.isIntermediate).toBe(true);

      vi.advanceTimersByTime(50);
      expect(field1.isChanged).toBe(false);
      expect(field2.isIntermediate).toBe(false);
      expect(field2.isErrorReported).toBe(true);
      expect(field3.isIntermediate).toBe(true);
      expect(field3.isErrorReported).toBe(undefined);

      vi.advanceTimersByTime(50);
      expect(field3.isIntermediate).toBe(false);
      expect(field3.isErrorReported).toBe(true);
    });
  });

  describe("Error reporting with validation in progress (combinations)", () => {
    it("defers the report of an auto-finalized intermediate change until the validation settles", () => {
      const { field, validator, setValue } = setupValidationEnv();

      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(50);
      setValue("invalid"); // Validation settles at 150ms, after the auto-finalization at 100ms

      vi.advanceTimersByTime(50);
      expect(validator.isValidating).toBe(true);
      expect(field.isIntermediate).toBe(false);
      expect(debugFormField(field).isReported.get()).toBe(true);
      expect(field.isErrorReported).toBe(undefined);

      vi.advanceTimersByTime(50);
      expect(validator.isValidating).toBe(false);
      expect(field.isErrorReported).toBe(true);
    });

    it("defers the report while a validation unrelated to the field is in progress", () => {
      const { field, model, validator, updateErrors } = setupEnv();
      validator.addSyncHandler((b) => {
        if (model.other === "invalid") {
          b.invalidate("other", "invalid other");
        }
      });
      vi.advanceTimersByTime(Validator.defaultDelayMs);
      updateErrors((b) => b.invalidate("test", "error"));

      runInAction(() => {
        model.other = "invalid";
      });
      field.reportError();
      expect(validator.isValidating).toBe(true);
      expect(field.hasErrors).toBe(true);
      expect(field.isErrorReported).toBe(undefined);

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(field.isErrorReported).toBe(true);
    });

    it("defers the report while the validation of a nested object is in progress", () => {
      const model = new NestedParentModel();
      const form = Form.get(model);
      const field = form.getField("test");
      const childValidator = Validator.get(model.child);
      childValidator.addSyncHandler((b) => {
        if (model.child.name === "invalid") {
          b.invalidate("name", "invalid name");
        }
      });
      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.validator.isValidating).toBe(false);

      runInAction(() => {
        model.child.name = "invalid";
      });
      field.reportError();
      expect(childValidator.isValidating).toBe(true);
      expect(form.validator.isValidating).toBe(true);
      expect(field.isErrorReported).toBe(undefined);

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.validator.isValidating).toBe(false);
      expect(field.isErrorReported).toBe(false);
      expect(form.getField("child").isErrorReported).toBe(undefined); // Other fields stay unreported
    });

    it("reports right away when the in-flight validation is cancelled by Validator#reset", () => {
      const { field, validator, setValue } = setupValidationEnv();

      setValue("invalid");
      field.reportError();
      expect(field.isErrorReported).toBe(undefined);

      validator.reset();
      expect(validator.isValidating).toBe(false);
      // The pending validation never ran, so the field is reported as valid
      expect(field.isErrorReported).toBe(false);

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(field.hasErrors).toBe(false);
      expect(field.isErrorReported).toBe(false);
    });
  });

  describe("Types", () => {
    it("exposes typed state accessors", () => {
      const { field } = setupEnv();
      expectTypeOf(field.id).toEqualTypeOf<string>();
      expectTypeOf(field.fieldName).toEqualTypeOf<string>();
      expectTypeOf(field.validator).toEqualTypeOf<Validator<any>>();
      expectTypeOf(field.isTouched).toEqualTypeOf<boolean>();
      expectTypeOf(field.isIntermediate).toEqualTypeOf<boolean>();
      expectTypeOf(field.isChanged).toEqualTypeOf<boolean>();
      expectTypeOf(field.isErrorReported).toEqualTypeOf<boolean | undefined>();
      expectTypeOf(field.hasErrors).toEqualTypeOf<boolean>();
      expectTypeOf(field.errors).toEqualTypeOf<ReadonlySet<string>>();
    });

    it("makes the identity and state properties read-only", () => {
      type StateKeys =
        | "id"
        | "fieldName"
        | "validator"
        | "isTouched"
        | "isIntermediate"
        | "isChanged"
        | "isErrorReported"
        | "errors"
        | "hasErrors";
      expectTypeOf<Pick<FormField, StateKeys>>().toEqualTypeOf<{
        readonly id: string;
        readonly fieldName: string;
        readonly validator: Validator<any>;
        readonly isTouched: boolean;
        readonly isIntermediate: boolean;
        readonly isChanged: boolean;
        readonly isErrorReported: boolean | undefined;
        readonly errors: ReadonlySet<string>;
        readonly hasErrors: boolean;
      }>();
      // Control: the assertion above is sensitive to the readonly modifier
      expectTypeOf<Pick<FormField, "id">>().not.toEqualTypeOf<{ id: string }>();
    });

    it("types the constructor arguments", () => {
      expectTypeOf(FormField).constructorParameters.toEqualTypeOf<
        [args: { fieldName: string; validator: Validator<any>; getFinalizationDelayMs: () => number }]
      >();
    });

    it("types the methods", () => {
      const { field } = setupEnv();
      expectTypeOf(field.markAsChanged).parameters.toEqualTypeOf<[type?: FormField.ChangeType]>();
      expectTypeOf(field.markAsChanged).returns.toEqualTypeOf<void>();
      expectTypeOf(field.markAsTouched).parameters.toEqualTypeOf<[]>();
      expectTypeOf(field.markAsTouched).returns.toEqualTypeOf<void>();
      expectTypeOf(field.reportError).parameters.toEqualTypeOf<[]>();
      expectTypeOf(field.reportError).returns.toEqualTypeOf<void>();
      expectTypeOf(field.finalizeChangeIfNeeded).parameters.toEqualTypeOf<[]>();
      expectTypeOf(field.finalizeChangeIfNeeded).returns.toEqualTypeOf<void>();
      expectTypeOf(field.reset).parameters.toEqualTypeOf<[]>();
      expectTypeOf(field.reset).returns.toEqualTypeOf<void>();

      // @ts-expect-error unknown change type
      expectTypeOf(field.markAsChanged).toBeCallableWith("partial");
    });

    it("defines the change type", () => {
      expectTypeOf<FormField.ChangeType>().toEqualTypeOf<"final" | "intermediate">();
    });

    it("defines field names", () => {
      // PINNED(quirk): NameStrict is `keyof T & string`, so method names are accepted as field names (while number and symbol keys are not). Decide: should function-valued keys be excluded from field names?
      expectTypeOf<FormField.NameStrict<TypedModel>>().toEqualTypeOf<"a" | "method">();
      expectTypeOf<FormField.NameAugmented<TypedModel>>().toEqualTypeOf<`a:${string}` | `method:${string}`>();
      expectTypeOf<FormField.Name<TypedModel>>().toEqualTypeOf<
        FormField.NameStrict<TypedModel> | FormField.NameAugmented<TypedModel>
      >();

      expectTypeOf<"a:">().toExtend<FormField.Name<TypedModel>>();
      expectTypeOf<"a:b:c">().toExtend<FormField.Name<TypedModel>>();
      expectTypeOf<"b">().not.toExtend<FormField.Name<TypedModel>>();
      expectTypeOf<"1">().not.toExtend<FormField.Name<TypedModel>>();
      expectTypeOf<"a.b">().not.toExtend<FormField.Name<TypedModel>>();
    });

    it("constrains Form#getField to the field names of the model", () => {
      const form = Form.get(new SampleModel());
      expectTypeOf(form.getField).parameters.toEqualTypeOf<[fieldName: FormField.Name<SampleModel>]>();
      expectTypeOf(form.getField).returns.toEqualTypeOf<FormField>();
      expectTypeOf(form.getField).toBeCallableWith("test");
      expectTypeOf(form.getField).toBeCallableWith("test:suffix");

      // @ts-expect-error unknown field name
      expectTypeOf(form.getField).toBeCallableWith("unknown");
    });
  });
});
