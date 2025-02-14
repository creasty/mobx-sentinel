import { makeObservable, observable } from "mobx";
import { Form } from "./Form";
import { FormField } from "./FormField";
import { FormDelegate } from "./delegation";
import { ErrorMap } from "@form-model/validation";

class SampleModel implements FormDelegate {
  @observable test = "test";

  [FormDelegate.config]: FormDelegate.Config = {
    intermediateValidationDelayMs: 100,
  };

  constructor() {
    makeObservable(this);
  }
}

function setupEnv() {
  const model = new SampleModel();
  const form = Form.get(model);
  const formErrors = observable.map<string, string[]>() satisfies ErrorMap;
  const field = new FormField({ form, formErrors, fieldName: "test" });
  return { model, formErrors, form, field };
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

  describe("#errors", () => {
    it("returns null if there are no errors at all", () => {
      const { field } = setupEnv();
      expect(field.errors).toBe(null);
    });

    it("returns null if there is no errors for the field", () => {
      const { field, formErrors } = setupEnv();
      formErrors.set("someOtherField", ["otherError"]);
      expect(field.errors).toBe(null);
    });

    it("returns the errors if there are errors for the field", () => {
      const { field, formErrors } = setupEnv();
      formErrors.set("test", ["error"]);
      expect(field.errors).toEqual(["error"]);
      formErrors.set("someOtherField", ["otherError"]);
      expect(field.errors).toEqual(["error"]);
    });
  });

  describe("#hasErrors", () => {
    it("returns false if there are no errors", () => {
      const { field } = setupEnv();
      expect(field.hasErrors).toBe(false);
    });

    it("returns true if there are errors", () => {
      const { field, formErrors } = setupEnv();
      formErrors.set("test", ["error"]);
      expect(field.hasErrors).toBe(true);
    });
  });

  describe("#hasReportedErrors", () => {
    it("returns false if there are no errors", () => {
      const { field } = setupEnv();
      expect(field.hasReportedErrors).toBe(false);
    });

    it("returns false if there are errors but they are not reported", () => {
      const { field, formErrors } = setupEnv();
      formErrors.set("test", ["error"]);
      expect(field.hasReportedErrors).toBe(false);
    });

    it("returns true if there are errors and they are reported", () => {
      const { field, formErrors } = setupEnv();
      formErrors.set("test", ["error"]);
      field.reportError();
      expect(field.hasReportedErrors).toBe(true);
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
    it("marks the field as changed (intermediate)", () => {
      const { field } = setupEnv();
      field.markAsChanged("intermediate");
      expect(field.isTouched).toBe(false);
      expect(field.isIntermediate).toBe(true);
      expect(field.isChanged).toBe(true);
      expect(field.isErrorReported).toBe(false);
    });

    it("marks the field as changed (final)", () => {
      const { field } = setupEnv();
      field.markAsChanged("final");
      expect(field.isTouched).toBe(false);
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(true);
      expect(field.isErrorReported).toBe(true);
    });
  });

  describe("#reportError", () => {
    it("marks the field as reported", () => {
      const { field } = setupEnv();
      field.reportError();
      expect(field.isTouched).toBe(false);
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(true);
    });
  });

  describe("#reset", () => {
    it("resets the field", () => {
      const { field } = setupEnv();

      field.markAsTouched();
      field.markAsChanged("intermediate");
      field.markAsChanged("final");
      field.reportError();

      field.reset();
      expect(field.isTouched).toBe(false);
      expect(field.isIntermediate).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBe(false);
    });
  });

  describe("#validate", () => {
    it("calls the validate on the form with the force option", () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validate();
      expect(spy).toBeCalledTimes(1);
      expect(spy).toBeCalledWith({ force: true });
    });

    it("finalize changes only if there have been intermediate changes", async () => {
      const { field } = setupEnv();

      // No changes - doesn't change state
      expect(field.isChanged).toBe(false);
      field.validate();
      expect(field.isChanged).toBe(false);
      expect(field.isIntermediate).toBe(false);

      // Intermediate changes
      field.markAsChanged("intermediate");
      expect(field.isChanged).toBe(true);
      expect(field.isIntermediate).toBe(true);

      // Intermediate changes are finalized
      field.validate();
      expect(field.isChanged).toBe(true);
      expect(field.isIntermediate).toBe(false);
    });
  });

  describe("#validateWithDelay", () => {
    const waitForDelay = (form: Form<unknown>, shift = 10) =>
      new Promise((resolve) => setTimeout(resolve, form.config.intermediateValidationDelayMs + shift));

    it("calls the validate on the form after the delay", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      expect(field.isChanged).toBe(false);

      field.validateWithDelay();
      expect(spy).toBeCalledTimes(0);

      await waitForDelay(form);

      expect(spy).toBeCalledTimes(1);
    });

    it("prolongs the delay when the validation is requested again before it is completed", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validateWithDelay();
      await waitForDelay(form, -10);
      field.validateWithDelay();
      await waitForDelay(form);

      expect(spy).toBeCalledTimes(1);
    });

    it("cancels the delayed validation and triggers validation right away when validate() is called", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validateWithDelay();
      field.validate();
      expect(spy).toBeCalledTimes(1);
      await waitForDelay(form);
      expect(spy).toBeCalledTimes(1);
    });

    it("cancels the delayed validation when the field is reset", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validateWithDelay();
      field.reset();
      await waitForDelay(form);

      expect(spy).toBeCalledTimes(0);
    });
  });
});
