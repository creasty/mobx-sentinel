import { makeObservable, observable } from "mobx";
import { Form } from "./Form";
import { FormField } from "./FormField";
import { FormDelegate } from "./delegation";

class SampleModel implements FormDelegate<SampleModel> {
  @observable test = "test";

  [FormDelegate.config]: FormDelegate.Config = {
    interimValidationDelayMs: 100,
  };

  constructor() {
    makeObservable(this);
  }
}

function setupEnv() {
  const model = new SampleModel();
  const form = Form.get(model);
  const field = new FormField({ form, fieldName: "test" });
  return { model, form, field };
}

describe("FormField", () => {
  it("can be created", () => {
    const { field } = setupEnv();
    expect(field.fieldName).toBe("test");

    expect(field.isTouched).toBe(false);
    expect(field.isProvisional).toBe(false);
    expect(field.isChanged).toBe(false);
    expect(field.isProvisional).toBe(false);
    expect(field.isValidityReported).toBe(false);
  });

  describe("#markAsTouched", () => {
    it("marks the field as touched", () => {
      const { field } = setupEnv();
      field.markAsTouched();
      expect(field.isTouched).toBe(true);
      expect(field.isProvisional).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isValidityReported).toBe(false);
    });
  });

  describe("#markAsChanged", () => {
    it("marks the field as changed (provisional)", () => {
      const { field } = setupEnv();
      field.markAsChanged("provisional");
      expect(field.isTouched).toBe(false);
      expect(field.isProvisional).toBe(true);
      expect(field.isChanged).toBe(true);
      expect(field.isValidityReported).toBe(false);
    });

    it("marks the field as changed (committed)", () => {
      const { field } = setupEnv();
      field.markAsChanged("committed");
      expect(field.isTouched).toBe(false);
      expect(field.isProvisional).toBe(false);
      expect(field.isChanged).toBe(true);
      expect(field.isValidityReported).toBe(true);
    });
  });

  describe("#reportValidity", () => {
    it("marks the field as validity reported", () => {
      const { field } = setupEnv();
      field.reportValidity();
      expect(field.isTouched).toBe(false);
      expect(field.isProvisional).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isValidityReported).toBe(true);
    });
  });

  describe("#reset", () => {
    it("resets the field", () => {
      const { field } = setupEnv();

      field.markAsTouched();
      field.markAsChanged("provisional");
      field.markAsChanged("committed");
      field.reportValidity();

      field.reset();
      expect(field.isTouched).toBe(false);
      expect(field.isProvisional).toBe(false);
      expect(field.isChanged).toBe(false);
      expect(field.isValidityReported).toBe(false);
    });
  });

  describe("#validate", () => {
    it("calls the validate on the form", () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validate();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe("#validateWithDelay", () => {
    const waitForDelay = (form: Form<unknown>, shift = 10) =>
      new Promise((resolve) => setTimeout(resolve, form.config.interimValidationDelayMs + shift));

    it("calls the validate on the form after the delay and marks the field as changed", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      expect(field.isChanged).toBe(false);

      field.validateWithDelay();
      expect(spy).toHaveBeenCalledTimes(0);

      await waitForDelay(form);

      expect(spy).toHaveBeenCalledTimes(1);
      expect(field.isChanged).toBe(true);
      expect(field.isProvisional).toBe(false);
    });

    it("prolongs the delay when the validation is requested again before it is completed", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validateWithDelay();
      await waitForDelay(form, -10);
      field.validateWithDelay();
      await waitForDelay(form);

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("cancels the delayed validation and triggers validation right away when validate() is called", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validateWithDelay();
      field.validate();
      expect(spy).toHaveBeenCalledTimes(1);
      await waitForDelay(form);
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it("cancels the delayed validation when the field is reset", async () => {
      const { field, form } = setupEnv();
      const spy = vi.spyOn(form, "validate");

      field.validateWithDelay();
      field.reset();
      await waitForDelay(form);

      expect(spy).toHaveBeenCalledTimes(0);
    });
  });
});
