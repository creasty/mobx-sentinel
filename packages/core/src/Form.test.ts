import { makeValidatable, watch } from "@form-model/validation";
import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Form, getInternal } from "./Form";
import { FormDelegate } from "./delegation";
import {
  SampleConfigurableFieldBinding,
  SampleConfigurableFormBinding,
  SampleConfigurableMultiFieldBinding,
  SampleFieldBinding,
  SampleFormBinding,
  SampleMultiFieldBinding,
} from "./binding.test";

describe("Form", () => {
  class EmptyModel {}

  class SampleModel {
    @observable field = true;
    @observable otherField = true;

    constructor() {
      makeObservable(this);

      makeValidatable(this, () => {
        return {
          field: this.field ? null : "invalid",
        };
      });
    }

    async [FormDelegate.submit](signal: AbortSignal) {
      return new Promise<boolean>((resolve) => {
        const timerId = setTimeout(() => resolve(true), 100);
        signal.addEventListener("abort", () => {
          clearTimeout(timerId);
          resolve(false);
        });
      });
    }
  }

  class NestedModel {
    @observable field = true;
    @watch.nested @observable sample = new SampleModel();
    @watch.nested @observable array = [new SampleModel()];

    constructor() {
      makeObservable(this);
    }
  }

  describe(".get", () => {
    it("returns the same instance for the same subject", () => {
      const model = new SampleModel();
      const form1 = Form.get(model);
      const form2 = Form.get(model);
      expect(form1).toBe(form2);
      expect(form1.id).toBe(form2.id);
    });

    it("returns different instances for different subjects", () => {
      const model1 = new SampleModel();
      const model2 = new SampleModel();
      const form1 = Form.get(model1);
      const form2 = Form.get(model2);
      expect(form1).not.toBe(form2);
      expect(form1.id).not.toBe(form2.id);
    });

    it("returns different instances for different keys", () => {
      const model = new SampleModel();
      const form1 = Form.get(model);
      const form2 = Form.get(model, Symbol("key"));
      expect(form1).not.toBe(form2);
      expect(form1.id).not.toBe(form2.id);
    });

    it("returns the same instance for the same subject with the same key", () => {
      const model = new SampleModel();
      const key = Symbol("key");
      const form1 = Form.get(model, key);
      const form2 = Form.get(model, key);
      expect(form1).toBe(form2);
      expect(form1.id).toBe(form2.id);
    });

    it("retrieves instances of sub-forms", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      const sampleForm = Form.get(model.sample);
      const arrayForm = Form.get(model.array[0]);

      expect(form.subForms.size).toBe(2);
      expect(form.subForms).toContain(sampleForm);
      expect(form.subForms).toContain(arrayForm);
    });

    it("retrieves instances of sub-forms with a specified key", () => {
      const model = new NestedModel();
      const key = Symbol("custom-key");
      const form = Form.get(model, key);

      const sampleForm = Form.get(model.sample, key);
      const arrayForm = Form.get(model.array[0], key);

      expect(form.subForms.size).toBe(2);
      expect(form.subForms).toContain(sampleForm);
      expect(form.subForms).toContain(arrayForm);
    });
  });

  describe(".dispose", () => {
    it("disposes the form instance for a subject", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      Form.dispose(model);
      expect(Form.get(model)).not.toBe(form); // New instance is created
    });

    it("disposes the form instance for a subject with a specific key", () => {
      const model = new SampleModel();
      const key = Symbol("custom-key");
      const form = Form.get(model);
      const formWithKey = Form.get(model, key);
      Form.dispose(model, key);
      expect(Form.get(model, key)).not.toBe(formWithKey); // New instance is created
      expect(Form.get(model)).toBe(form); // Instances with different keys are not disposed
    });
  });

  describe("#subForms", () => {
    it("does not collect sub-forms from objects without @watch.nested", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.subForms.size).toBe(0);
    });

    it("collects sub-forms via @watch.nested", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      expect(form.subForms).toEqual(new Set([Form.get(model.sample), Form.get(model.array[0])]));
    });

    it("updates sub-forms reactively", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      let observed: typeof form.subForms | null = null;
      autorun(() => {
        observed = form.subForms;
      });
      expect(observed).toBeDefined();
      expect(observed!.size).toBe(2);
      expect(observed).toEqual(form.subForms);

      runInAction(() => {
        model.array.push(new SampleModel());
      });
      expect(observed).toBeDefined();
      expect(observed!.size).toBe(3);
      expect(observed).toEqual(form.subForms);
    });
  });

  describe("#canSubmit", () => {
    it("returns true when the form is dirty and valid", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.canSubmit).toBe(false);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      form.reset();
      expect(form.canSubmit).toBe(false);
    });

    it("returns false when the validation is scheduled", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      form.validate();
      expect(form.canSubmit).toBe(false);
    });
  });

  describe("#markAsDirty", () => {
    it("marks the form as dirty", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.isDirty).toBe(false);
      form.markAsDirty();
      expect(form.isDirty).toBe(true);
    });
  });

  describe("#reset", () => {
    it("resets the form", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.isDirty).toBe(true);
      form.reset();
      expect(form.isDirty).toBe(false);
    });

    it("resets sub-forms", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      const spy1 = vi.spyOn(Form.get(model.sample), "reset");
      const spy2 = vi.spyOn(Form.get(model.array[0]), "reset");

      form.reset();
      expect(spy1).toBeCalled();
      expect(spy2).toBeCalled();
    });
  });

  describe("#reportError", () => {
    it("triggers reportError on all fields", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");

      const spy = vi.spyOn(field, "reportError");
      form.reportError();
      expect(spy).toBeCalled();
    });

    it("recursively triggers reportError on sub-forms", () => {
      const model = new NestedModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      const arrayForm0 = Form.get(model.array[0]);

      const spy1 = vi.spyOn(sampleForm, "reportError");
      const spy2 = vi.spyOn(arrayForm0, "reportError");
      form.reportError();
      expect(spy1).toBeCalled();
      expect(spy2).toBeCalled();
    });
  });

  describe("#submit", () => {
    it("does not call Submission#exec when the form is not dirty", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      const internal = getInternal(form);
      const spy = vi.spyOn(internal.submission, "exec");
      await form.submit();
      expect(spy).not.toBeCalled();
    });

    it("calls Submission#exec when the form is dirty", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      const internal = getInternal(form);
      const spy = vi.spyOn(internal.submission, "exec");
      form.markAsDirty();
      await form.submit();
      expect(spy).toBeCalled();
    });

    it("calls Submission#exec when the force option is true", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      const internal = getInternal(form);
      const spy = vi.spyOn(internal.submission, "exec");
      await form.submit({ force: true });
      expect(spy).toBeCalled();
    });

    it("calls FormDelegate.submit when implemented", async () => {
      const model = new SampleModel();
      const spy = vi.spyOn(model, FormDelegate.submit);
      const form = Form.get(model);
      form.markAsDirty();
      await form.submit();
      expect(spy).toBeCalled();
    });
  });

  describe("#validate", () => {
    it("calls Validation#request", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      const spy = vi.spyOn(form.validator, "request");
      form.validate();
      expect(spy).toBeCalled();
    });
  });

  describe("#addHandler", () => {
    it("adds a handler to the submission event", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const internal = getInternal(form);
      const spy = vi.spyOn(internal.submission, "addHandler");
      expect(form.addHandler("willSubmit", () => void 0)).toBeInstanceOf(Function);
      expect(form.addHandler("submit", async () => false)).toBeInstanceOf(Function);
      expect(form.addHandler("didSubmit", () => void 0)).toBeInstanceOf(Function);
      expect(spy).toBeCalledTimes(3);
    });

    it("adds a handler to the validation event", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const spy = vi.spyOn(form.validator, "addHandler");
      expect(form.addHandler("validate", async () => ({}))).toBeInstanceOf(Function);
      expect(spy).toBeCalledTimes(1);
    });

    it("throws an error when the event is invalid", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(() => form.addHandler("INVALID" as any, () => void 0)).toThrow();
    });
  });

  describe("#bind", () => {
    describe("Create a binding for the form", () => {
      describe("Without a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(SampleFormBinding);
          expect(binding.formId).toBe(form.id);
        });

        it("returns the same binding instance when called multiple times", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(SampleFormBinding);
          const binding2 = form.bind(SampleFormBinding);
          expect(binding1.bindingId).toBe(binding2.bindingId);
        });
      });

      describe("With a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(SampleConfigurableFormBinding, { sample: true });
          expect(binding.formId).toBe(form.id);
          expect(binding.config).toEqual({ sample: true });
        });

        it("returns the same binding instance when called multiple times but updates the config", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(SampleConfigurableFormBinding, { sample: true });
          expect(binding1.config).toEqual({ sample: true });
          const binding2 = form.bind(SampleConfigurableFormBinding, { sample: false });
          expect(binding1.bindingId).toBe(binding2.bindingId);
          expect(binding2.config).toEqual({ sample: false });
        });
      });
    });

    describe("Create a binding for a field", () => {
      describe("Without a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind("field", SampleFieldBinding);
          expect(binding.fieldName).toBe("field");
        });

        it("returns the same binding instance when called multiple times", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind("field", SampleFieldBinding);
          const binding2 = form.bind("field", SampleFieldBinding);
          expect(binding1.bindingId).toBe(binding2.bindingId);
        });
      });

      describe("With a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind("field", SampleConfigurableFieldBinding, { sample: true });
          expect(binding.fieldName).toBe("field");
          expect(binding.config).toEqual({ sample: true });
        });

        it("returns the same binding instance when called multiple times but updates the config", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind("field", SampleConfigurableFieldBinding, { sample: true });
          expect(binding1.config).toEqual({ sample: true });
          const binding2 = form.bind("field", SampleConfigurableFieldBinding, { sample: false });
          expect(binding1.bindingId).toBe(binding2.bindingId);
          expect(binding2.config).toEqual({ sample: false });
        });
      });
    });

    describe("Create a binding for multiple fields", () => {
      describe("Without a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(["field", "otherField"], SampleMultiFieldBinding);
          expect(binding.fieldNames).toEqual(["field", "otherField"]);
        });

        it("returns the same binding instance when called multiple times", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(["field", "otherField"], SampleMultiFieldBinding);
          const binding2 = form.bind(["field", "otherField"], SampleMultiFieldBinding);
          expect(binding1.bindingId).toBe(binding2.bindingId);
        });
      });

      describe("With a config", () => {
        it("returns the binding properties", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding = form.bind(["field", "otherField"], SampleConfigurableMultiFieldBinding, {
            sample: true,
          });
          expect(binding.fieldNames).toEqual(["field", "otherField"]);
          expect(binding.config).toEqual({ sample: true });
        });

        it("returns the same binding instance when called multiple times but updates the config", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind(["field", "otherField"], SampleConfigurableMultiFieldBinding, {
            sample: true,
          });
          expect(binding1.config).toEqual({ sample: true });
          const binding2 = form.bind(["field", "otherField"], SampleConfigurableMultiFieldBinding, {
            sample: false,
          });
          expect(binding1.bindingId).toBe(binding2.bindingId);
          expect(binding2.config).toEqual({ sample: false });
        });
      });
    });
  });

  describe("#getError", () => {
    it("returns the error messages for a field", async () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");

      runInAction(() => {
        model.field = false;
      });
      await vi.waitFor(() => expect(form.isValidating).toBe(false));

      expect(form.getError("field")).toEqual(null);
      field.reportError();
      expect(form.getError("field")).toEqual(["invalid"]);
    });

    it("returns the error messages for a field when includePreReported is true", async () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");

      runInAction(() => {
        model.field = false;
      });
      await vi.waitFor(() => expect(form.isValidating).toBe(false));

      field.reportError();
      expect(form.getError("field", true)).toEqual(["invalid"]);
    });
  });
});

suite("Sub-forms", () => {
  class SampleModel {
    @observable field = true;

    constructor() {
      makeObservable(this);

      makeValidatable(this, () => {
        return {
          field: this.field ? null : "invalid",
        };
      });
    }
  }

  class NestedModel {
    @observable field = true;
    @watch.nested @observable sample = new SampleModel();
    @watch.nested @observable array = [new SampleModel()];

    constructor() {
      makeObservable(this);

      makeValidatable(this, () => {
        return {
          field: this.field ? null : "invalid",
        };
      });
    }
  }

  const setupEnv = () => {
    const model = new NestedModel();
    const form = Form.get(model);
    const sampleForm = Form.get(model.sample);
    const arrayForm0 = Form.get(model.array[0]);

    return {
      model,
      form,
      sampleForm,
      arrayForm0,
      async waitForValidation() {
        await vi.waitFor(() => {
          expect(form.isValidating).toBe(false);
          expect(sampleForm.isValidating).toBe(false);
          expect(arrayForm0.isValidating).toBe(false);
        });
      },
    };
  };

  suite("Dirty check", () => {
    test("when a sub-form becomes dirty, the parent form also becomes dirty", () => {
      const { form, sampleForm } = setupEnv();

      expect(sampleForm.isDirty).toBe(false);
      expect(form.isDirty).toBe(false);

      sampleForm.markAsDirty();

      expect(sampleForm.isDirty).toBe(true);
      expect(form.isDirty).toBe(true);
    });

    test("when a parent form becomes dirty, sub-forms remain unaffected", () => {
      const { form, sampleForm } = setupEnv();

      expect(sampleForm.isDirty).toBe(false);
      expect(form.isDirty).toBe(false);

      form.markAsDirty();

      expect(form.isDirty).toBe(true);
      expect(sampleForm.isDirty).toBe(false);
    });
  });

  suite("Validation", () => {
    test("when a sub-form becomes invalid, the parent form also becomes invalid", async () => {
      const { model, form, sampleForm, waitForValidation } = setupEnv();

      expect(sampleForm.isValid).toBe(true);
      expect(form.isValid).toBe(true);

      runInAction(() => {
        model.sample.field = false;
      });
      await waitForValidation();

      expect(sampleForm.isValid).toBe(false);
      expect(form.isValid).toBe(false);
    });

    test("when a parent form becomes invalid, sub-forms remain unaffected", async () => {
      const { model, form, sampleForm, waitForValidation } = setupEnv();

      expect(sampleForm.isValid).toBe(true);
      expect(form.isValid).toBe(true);

      runInAction(() => {
        model.field = false;
      });
      await waitForValidation();

      expect(form.isValid).toBe(false);
      expect(sampleForm.isValid).toBe(true);
    });

    test("count total invalid fields", async () => {
      const { model, form, sampleForm, arrayForm0, waitForValidation } = setupEnv();

      runInAction(() => {
        model.field = false;
        model.sample.field = false;
        model.array[0].field = false;
      });
      await waitForValidation();

      expect(form.invalidFieldCount).toBe(1);
      expect(sampleForm.invalidFieldCount).toBe(1);
      expect(arrayForm0.invalidFieldCount).toBe(1);
      expect(form.totalInvalidFieldCount).toBe(3);
    });
  });

  suite("Reporting errors", () => {
    test("when a new field is added after reportError is called, the error on the new field is not reported", async () => {
      const { form } = setupEnv();

      const field1 = form.getField("field");
      expect(field1.isErrorReported).toEqual(false);
      form.reportError();
      expect(field1.isErrorReported).toEqual(true);

      const field2 = form.getField("sample");
      expect(field2.isErrorReported).toEqual(false);
    });

    test("reporting errors on sub-forms does not affect the parent form", async () => {
      const { form, sampleForm, arrayForm0 } = setupEnv();

      // Touch fields to initialize them
      const field1 = form.getField("field");
      const field2 = sampleForm.getField("field");
      const field3 = arrayForm0.getField("field");

      // Report errors on sub-forms
      sampleForm.reportError();
      arrayForm0.reportError();

      expect(field1.isErrorReported).toEqual(false);
      expect(field2.isErrorReported).toEqual(true);
      expect(field3.isErrorReported).toEqual(true);
    });

    test("when a new sub-form is added after reportError is called, the error on the new form is not reported", async () => {
      const { model, form, arrayForm0 } = setupEnv();

      // Touch fields to initialize them
      const field1 = form.getField("field");
      const field2 = arrayForm0.getField("field");

      // Report errors on the parent form
      form.reportError();

      // Add a new sub-form
      runInAction(() => {
        model.array.push(new SampleModel());
      });
      const arrayForm1 = Form.get(model.array[1]);
      const field3 = arrayForm1.getField("field");

      expect(field1.isErrorReported).toEqual(true);
      expect(field2.isErrorReported).toEqual(true);
      expect(field3.isErrorReported).toEqual(false);
    });
  });
});
