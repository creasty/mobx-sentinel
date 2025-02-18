import { makeObservable, observable } from "mobx";
import { Form } from "./form";
import { debugFormField, FormField } from "./field";
import { Validator } from "@form-model/validation";

class SampleModel {
  @observable test = "test";
  @observable other = "test";

  constructor() {
    makeObservable(this);
  }
}

function setupEnv() {
  const model = new SampleModel();
  const form = Form.get(model);
  const field = new FormField({
    fieldName: "test",
    validator: form.validator,
    getFinalizationDelayMs: () => 100,
  });

  const waitForDelay = (shift = 10) => new Promise((resolve) => setTimeout(resolve, 100 + shift));

  const errorGroupKey = Symbol();
  const updateErrors = (handler: Validator.InstantHandler<SampleModel>) => {
    form.validator.updateErrors(errorGroupKey, handler);
  };

  return {
    model,
    updateErrors,
    waitForDelay,
    field,
  };
}

describe("FormField", () => {
  it("can be created", () => {
    const { field } = setupEnv();
    expect(field.fieldName).toBe("test");

    expect(field.isTouched).toBe(false);
    expect(field.isIntermediate).toBe(false);
    expect(field.isChanged).toBe(false);
    expect(field.isIntermediate).toBe(false);
    expect(field.isErrorReported).toBe(false);
  });

  describe("#reportError", () => {
    it("marks the field as reported", () => {
      const { field, updateErrors } = setupEnv();
      const internal = debugFormField(field);
      field.reportError();
      expect(field.isTouched).toBe(false);
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(false);
      expect(internal.isErrorReported.get()).toBe(true);

      updateErrors((b) => b.invalidate("test", "error"));
      expect(field.isErrorReported).toBe(true);
      expect(internal.isErrorReported.get()).toBe(true);
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
  });

  describe("#isErrorReported", () => {
    it("returns false if there are no errors", () => {
      const { field } = setupEnv();
      expect(field.isErrorReported).toBe(false);
    });

    it("returns false if there are errors but they are not reported", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      expect(field.isErrorReported).toBe(false);
    });

    it("returns true if there are errors and they are reported", () => {
      const { field, updateErrors } = setupEnv();
      updateErrors((b) => b.invalidate("test", "error"));
      field.reportError();
      expect(field.isErrorReported).toBe(true);
    });
  });

  describe("#markAsTouched", () => {
    it("marks the field as touched", () => {
      const { field } = setupEnv();
      field.markAsTouched();
      expect(field.isTouched).toBe(true);
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(false);
    });
  });

  describe("#markAsChanged", () => {
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
        expect(field.isErrorReported).toBe(false);

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
      expect(field.isErrorReported).toBe(false);
      expect(internal.isErrorReported.get()).toBe(false);
    });
  });
});
