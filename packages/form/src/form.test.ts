import { KeyPath, makeValidatable, nested, Validator, Watcher } from "@mobx-sentinel/core";
import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Form, debugForm } from "./form";
import { FormField } from "./field";
import {
  SampleConfigurableFieldBinding,
  SampleConfigurableFormBinding,
  SampleConfigurableMultiFieldBinding,
  SampleFieldBinding,
  SampleFormBinding,
  SampleMultiFieldBinding,
} from "./binding.test";
import { defaultConfig, FormConfig } from "./config";

describe("Form", () => {
  class EmptyModel {}

  class SampleModel {
    @observable field = true;
    @observable otherField = true;

    constructor() {
      makeObservable(this);

      makeValidatable(this, (b) => {
        if (!this.field) {
          b.invalidate("field", "invalid");
        }
      });
    }
  }

  class NestedModel {
    @observable field = true;
    @nested @observable sample = new SampleModel();
    @nested @observable array = [new SampleModel()];

    constructor() {
      makeObservable(this);
    }
  }

  describe("constructor", () => {
    it("throws an error when attempted to be instantiated directly", () => {
      expect(() => {
        new (Form as any)();
      }).toThrowError(/private constructor/);
    });
  });

  describe(".get", () => {
    it("throws an error when a non-object is given", () => {
      expect(() => {
        Form.get(null as any);
      }).toThrowError(/Expected an object/);
      expect(() => {
        Form.get(1 as any);
      }).toThrowError(/Expected an object/);
    });

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

      expect(form.subForms.get("sample" as KeyPath)).toBe(sampleForm);
      expect(form.subForms.get("array.0" as KeyPath)).toBe(arrayForm);
      expect(form.subForms.size).toBe(2);
    });

    it("retrieves instances of sub-forms with a specified key", () => {
      const model = new NestedModel();
      const key = Symbol("custom-key");
      const form = Form.get(model, key);

      const sampleForm = Form.get(model.sample, key);
      const arrayForm = Form.get(model.array[0], key);

      expect(form.subForms.get("sample" as KeyPath)).toBe(sampleForm);
      expect(form.subForms.get("array.0" as KeyPath)).toBe(arrayForm);
      expect(form.subForms.size).toBe(2);
    });
  });

  describe(".getSafe", () => {
    it("returns null when the subject is not an object", () => {
      expect(Form.getSafe(null as any)).toBeNull();
      expect(Form.getSafe(1 as any)).toBeNull();
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

  describe("#config, #configure", () => {
    it("returns the global configuration by default", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.config).toEqual(defaultConfig);
    });

    it("returns the local configuration", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.configure({ autoFinalizationDelayMs: 999 });
      expect(form.config).toEqual({ ...defaultConfig, autoFinalizationDelayMs: 999 });
    });

    it("resets the local configuration to the global configuration", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.configure({ autoFinalizationDelayMs: 999 });
      expect(form.config).toEqual({ ...defaultConfig, autoFinalizationDelayMs: 999 });
      form.configure(true);
      expect(form.config).toEqual(defaultConfig);
    });

    it("updates the config reactively", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const timeline: FormConfig[] = [];
      autorun(() => timeline.push(form.config));
      form.configure({ autoFinalizationDelayMs: 999 });
      expect(timeline).toEqual([defaultConfig, { ...defaultConfig, autoFinalizationDelayMs: 999 }]);
    });
  });

  describe("#subForms", () => {
    it("does not collect sub-forms from objects without @nested", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.subForms.size).toBe(0);
    });

    it("collects sub-forms via @nested", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      expect(form.subForms.get("sample" as KeyPath)).toBe(Form.get(model.sample));
      expect(form.subForms.get("array.0" as KeyPath)).toBe(Form.get(model.array[0]));
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

    it("returns true when config.allowSubmitNonDirty is true", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.isDirty).toBe(false);
      expect(form.isValid).toBe(true);

      form.configure({ allowSubmitNonDirty: true });
      expect(form.isDirty).toBe(false);
      expect(form.isValid).toBe(true);
      expect(form.canSubmit).toBe(true);
    });

    it("returns true when config.allowSubmitInvalid is true", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.markAsDirty();
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      expect(form.isDirty).toBe(true);
      expect(form.isValid).toBe(false);

      form.configure({ allowSubmitInvalid: true });
      expect(form.isDirty).toBe(true);
      expect(form.isValid).toBe(false);
      expect(form.canSubmit).toBe(true);
    });

    it("returns false while the form is validating", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.isValidating).toBe(false);
      expect(form.canSubmit).toBe(true);

      form.validator.addAsyncHandler(
        () => true,
        async () => void 0
      );
      expect(form.isValidating).toBe(true);
      expect(form.canSubmit).toBe(false);

      await vi.waitFor(() => expect(form.isValidating).toBe(false));
      expect(form.canSubmit).toBe(true);
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

    it("resets the watcher", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const spy = vi.spyOn(form.watcher, "reset");

      form.reset();
      expect(spy).toBeCalled();
    });

    it("does not reset the validator", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const spy = vi.spyOn(form.validator, "reset");

      form.reset();
      expect(spy).not.toBeCalled();
    });

    it("resets fields", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");
      const spy = vi.spyOn(field, "reset");

      form.reset();
      expect(spy).toBeCalled();
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
      const internal = debugForm(form);
      const spy = vi.spyOn(internal.submission, "exec");
      await form.submit();
      expect(spy).not.toBeCalled();
    });

    it("calls Submission#exec when the form is dirty", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      const internal = debugForm(form);
      const spy = vi.spyOn(internal.submission, "exec");
      form.markAsDirty();
      await form.submit();
      expect(spy).toBeCalled();
    });

    it("calls Submission#exec when the force option is true", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      const internal = debugForm(form);
      const spy = vi.spyOn(internal.submission, "exec");
      await form.submit({ force: true });
      expect(spy).toBeCalled();
    });
  });

  describe("#addHandler", () => {
    it("adds a submit handler", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const internal = debugForm(form);
      const spy = vi.spyOn(internal.submission, "addHandler");
      expect(form.addHandler("willSubmit", async () => true)).toBeInstanceOf(Function);
      expect(form.addHandler("submit", async () => false)).toBeInstanceOf(Function);
      expect(form.addHandler("didSubmit", () => void 0)).toBeInstanceOf(Function);
      expect(spy).toBeCalledTimes(3);
    });

    it("throws an error when the event is invalid", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(() => form.addHandler("INVALID" as any, () => void 0)).toThrow();
    });

    it("returns a function that removes the handler when called", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      // Add handlers and track if they're called
      const willSubmitHandler = vi.fn(async () => true);
      const submitHandler = vi.fn(async () => true);
      const didSubmitHandler = vi.fn();

      const removeWillSubmit = form.addHandler("willSubmit", willSubmitHandler);
      const removeSubmit = form.addHandler("submit", submitHandler);
      const removeDidSubmit = form.addHandler("didSubmit", didSubmitHandler);

      // Submit form to verify handlers are called
      form.markAsDirty();
      await form.submit();

      expect(willSubmitHandler).toHaveBeenCalledTimes(1);
      expect(submitHandler).toHaveBeenCalledTimes(1);
      expect(didSubmitHandler).toHaveBeenCalledTimes(1);

      // Remove handlers
      removeWillSubmit();
      removeSubmit();
      removeDidSubmit();

      // Reset mock counts
      willSubmitHandler.mockClear();
      submitHandler.mockClear();
      didSubmitHandler.mockClear();

      // Submit again to verify handlers are not called
      await form.submit();

      expect(willSubmitHandler).not.toHaveBeenCalled();
      expect(submitHandler).not.toHaveBeenCalled();
      expect(didSubmitHandler).not.toHaveBeenCalled();
    });

    it("allows removing a single handler without affecting others", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const handler1 = vi.fn(async () => true);
      const handler2 = vi.fn(async () => true);

      const remove1 = form.addHandler("submit", handler1);
      form.addHandler("submit", handler2);

      form.markAsDirty();
      await form.submit();

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);

      // Remove only the first handler
      remove1();

      handler1.mockClear();
      handler2.mockClear();

      // Submit again with force option
      await form.submit({ force: true });

      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledTimes(1);
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

  describe("#getErrors", () => {
    it("returns the error messages for a field", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");

      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid");
        b.invalidate("otherField", "otherInvalid");
      });

      expect(form.getErrors("field")).toEqual(new Set());
      field.reportError();
      expect(form.getErrors("field")).toEqual(new Set(["invalid"]));
    });

    it("returns the error messages for a field when includePreReported is true", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");

      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid");
        b.invalidate("otherField", "otherInvalid");
      });

      field.reportError();
      expect(form.getErrors("field", true)).toEqual(new Set(["invalid"]));
    });
  });

  describe("#getAllErrors", () => {
    it("returns all error messages for the form", () => {
      const model = new NestedModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      const arrayForm0 = Form.get(model.array[0]);

      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid at field");
        b.invalidate("sample", "invalid at sample");
        b.invalidate("array", "invalid at array");
      });
      sampleForm.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid at sample.field");
      });
      arrayForm0.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid at array.0.field");
      });

      expect(form.getAllErrors()).toEqual(
        new Set([
          "invalid at array",
          "invalid at field",
          "invalid at sample",
          "invalid at sample.field",
          "invalid at array.0.field",
        ])
      );
    });

    it("returns all error messages for the specific field", () => {
      const model = new NestedModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      const arrayForm0 = Form.get(model.array[0]);

      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid at field");
        b.invalidate("sample", "invalid at sample");
        b.invalidate("array", "invalid at array");
      });
      sampleForm.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid at sample.field");
      });
      arrayForm0.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid at array.0.field");
      });

      expect(form.getAllErrors("array")).toEqual(new Set(["invalid at array", "invalid at array.0.field"]));
    });
  });

  describe("#firstErrorMessage", () => {
    it("returns the first error message", () => {
      const model = new NestedModel();
      const form = Form.get(model);
      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "invalid at field");
        b.invalidate("sample", "invalid at sample");
        b.invalidate("array", "invalid at array");
      });
      expect(form.firstErrorMessage).toBe("invalid at field");
    });
  });
});

describe("Sub-forms", () => {
  class SampleModel {
    @observable field = true;

    constructor() {
      makeObservable(this);

      makeValidatable(this, (b) => {
        if (!this.field) {
          b.invalidate("field", "invalid");
        }
      });
    }
  }

  class NestedModel {
    @observable field = true;
    @nested @observable sample = new SampleModel();
    @nested @observable array = [new SampleModel()];

    constructor() {
      makeObservable(this);

      makeValidatable(this, (b) => {
        if (!this.field) {
          b.invalidate("field", "invalid");
        }
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

  describe("Dirty check", () => {
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

  describe("Reporting errors", () => {
    test("when a new field is added after reportError is called, the error on the new field is not reported", async () => {
      const { form } = setupEnv();

      // Add errors
      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
        b.invalidate("sample", "error");
      });

      const field1 = form.getField("field");

      expect(field1.isErrorReported).toEqual(undefined);
      form.reportError();
      expect(field1.isErrorReported).toEqual(true);

      const field2 = form.getField("sample");
      expect(field2.isErrorReported).toEqual(undefined);
    });

    test("reporting errors on sub-forms does not affect the parent form", async () => {
      const { form, sampleForm, arrayForm0 } = setupEnv();

      // Add errors
      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
      });
      sampleForm.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
      });
      arrayForm0.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
      });

      // Touch fields to initialize them
      const field1 = form.getField("field");
      const field2 = sampleForm.getField("field");
      const field3 = arrayForm0.getField("field");

      // Report errors on sub-forms
      sampleForm.reportError();
      arrayForm0.reportError();

      expect(field1.isErrorReported).toEqual(undefined);
      expect(field2.isErrorReported).toEqual(true);
      expect(field3.isErrorReported).toEqual(true);
    });

    test("when a new sub-form is added after reportError is called, the error on the new form is not reported", async () => {
      const { model, form, arrayForm0 } = setupEnv();

      // Add errors
      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
      });
      arrayForm0.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
      });

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
      arrayForm1.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
      });
      const field3 = arrayForm1.getField("field");

      expect(field1.isErrorReported).toEqual(true);
      expect(field2.isErrorReported).toEqual(true);
      expect(field3.isErrorReported).toEqual(undefined);
    });
  });
});

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

async function flushMicrotasks() {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
}

describe("Form (details)", () => {
  class SampleModel {
    @observable field = true;
    @observable otherField = true;

    constructor() {
      makeObservable(this);

      makeValidatable(this, (b) => {
        if (!this.field) {
          b.invalidate("field", "invalid");
        }
      });
    }
  }

  class CollectionModel {
    @observable field = true;
    @nested @observable sample = new SampleModel();
    @nested @observable array = [new SampleModel()];
    @nested @observable map = new Map<string, SampleModel>([["a", new SampleModel()]]);
    @nested @observable set = new Set([new SampleModel()]);

    constructor() {
      makeObservable(this);
    }
  }

  class HoistModel {
    @nested.hoist @observable list = [new SampleModel()];

    constructor() {
      makeObservable(this);
    }
  }

  class DeepModel {
    @nested @observable child = new CollectionModel();

    constructor() {
      makeObservable(this);
    }
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe(".get, .getSafe", () => {
    it("treats an explicit undefined formKey as the default key", () => {
      const model = new SampleModel();
      expect(Form.get(model, undefined)).toBe(Form.get(model));
      expect(Form.getSafe(model, undefined)).toBe(Form.get(model));
    });

    it("shares an instance for the same registered symbol but not for symbols with the same description", () => {
      const model = new SampleModel();
      expect(Form.get(model, Symbol.for("form.test.key"))).toBe(Form.get(model, Symbol.for("form.test.key")));
      expect(Form.get(model, Symbol("key"))).not.toBe(Form.get(model, Symbol("key")));
    });

    it("accepts arrays and plain objects as subjects", () => {
      expect(Form.get([])).toBeInstanceOf(Form);
      expect(Form.get({})).toBeInstanceOf(Form);
    });

    it("returns null from getSafe for undefined, strings, and functions", () => {
      expect(Form.getSafe(undefined as any)).toBeNull();
      expect(Form.getSafe("string" as any)).toBeNull();
      expect(Form.getSafe((() => {}) as any)).toBeNull();
    });

    it("throws a TypeError for a function subject", () => {
      const fn = () => {};
      // PINNED(quirk): The signature `T extends object` accepts functions, but the runtime check (`typeof subject !== "object"`) rejects them. Decide: should functions be rejected at the type level, or accepted at runtime?
      expect(() => Form.get(fn)).toThrow(TypeError);
    });

    it("assigns a UUID v4 as the id", () => {
      const form = Form.get(new SampleModel());
      expect(form.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });

    it("throws when the constructor is called with a token other than the internal one", () => {
      expect(() => {
        new (Form as any)(Symbol("form.internalToken"), { subject: {}, formKey: Symbol() });
      }).toThrowError(/private constructor/);
    });

    it("keeps fields, bindings, and submission separate between forms with different keys", () => {
      const model = new SampleModel();
      const editForm = Form.get(model, Symbol("edit"));
      const previewForm = Form.get(model, Symbol("preview"));

      expect(editForm.getField("field")).not.toBe(previewForm.getField("field"));
      expect(debugForm(editForm).submission).not.toBe(debugForm(previewForm).submission);

      const editProps = editForm.bind(SampleFormBinding);
      expect(debugForm(editForm).bindings.size).toBe(1);
      expect(debugForm(previewForm).bindings.size).toBe(0);
      expect(previewForm.bind(SampleFormBinding)).not.toEqual(editProps);
      expect(debugForm(previewForm).bindings.size).toBe(1);
    });

    it("shares the watcher and the validator between forms with different keys", () => {
      const model = new SampleModel();
      const editForm = Form.get(model, Symbol("edit"));
      const previewForm = Form.get(model, Symbol("preview"));

      editForm.markAsDirty();
      editForm.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));

      // PINNED(quirk): Forms of the same subject share one Watcher and one Validator regardless of the formKey, so markAsDirty/reset (including the reset after a successful submission) on one form affects the others. Decide: should forms with different keys have independent dirty states, as the README's "multiple independent forms" wording suggests?
      expect(previewForm.watcher).toBe(editForm.watcher);
      expect(previewForm.validator).toBe(editForm.validator);
      expect(previewForm.isDirty).toBe(true);
      expect(previewForm.isValid).toBe(false);
      previewForm.reset();
      expect(editForm.isDirty).toBe(false);
    });

    it("throws a TypeError when the static methods are called detached from the class", () => {
      const model = new SampleModel();
      const { get, getSafe } = Form;

      // PINNED(quirk): Form.get and Form.getSafe rely on `this` (`this.getSafe` and `new this`), so detached get always throws, and detached getSafe throws when it has to create the form, e.g. when passed around as callbacks. Decide: should the static methods refer to `Form` directly so that they also work detached?
      expect(() => get(model)).toThrow(TypeError);
      expect(() => getSafe(model)).toThrow(TypeError);

      const form = Form.get(model);
      expect(form).toBeInstanceOf(Form);
      expect(getSafe(model)).toBe(form); // Detached getSafe works once the form exists
      expect(() => get(model)).toThrow(TypeError);
    });

    it("throws for a non-extensible subject, even from getSafe", () => {
      const frozen = Object.freeze({});
      const nonExtensible = Object.preventExtensions({});

      // PINNED(bug): Watcher.getSafe (core) stores the watcher on the subject with Object.defineProperty, so Form.getSafe throws a TypeError for a non-extensible object, and Form.get throws a TypeError for a value that is an object. Expected: getSafe does not throw (either a form is returned, e.g. by keeping the watcher and the validator in a WeakMap, or null), as its JSDoc says it returns null instead of throwing and Form.get documents a TypeError only for non-objects. Flip these assertions to `.not.toThrow()` when fixing.
      expect(() => Form.getSafe(frozen)).toThrow(/not extensible/);
      expect(() => Form.getSafe(nonExtensible)).toThrow(/not extensible/);
      expect(() => Form.get(frozen)).toThrow(/not extensible/);
    });
  });

  describe(".dispose", () => {
    it("does nothing for a subject without forms or for an unknown key", () => {
      const model = new SampleModel();
      expect(() => Form.dispose(model)).not.toThrow();
      expect(() => Form.dispose(model, Symbol("unknown"))).not.toThrow();

      const form = Form.get(model);
      Form.dispose(model, Symbol("unknown"));
      expect(Form.get(model)).toBe(form);
    });

    it("disposes the forms of all keys when the key is omitted", () => {
      const model = new SampleModel();
      const key = Symbol("key");
      const form = Form.get(model);
      const formWithKey = Form.get(model, key);

      Form.dispose(model);
      expect(Form.get(model)).not.toBe(form);
      expect(Form.get(model, key)).not.toBe(formWithKey);
    });

    it("leaves the fields of the disposed form working", () => {
      vi.useFakeTimers();
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");
      field.markAsChanged("intermediate");

      Form.dispose(model);
      vi.advanceTimersByTime(form.config.autoFinalizationDelayMs);
      expect(field.isIntermediate).toBe(false);
      expect(field.isErrorReported).toBe(false);
    });

    it("does not carry fields over to the re-created form", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");

      Form.dispose(model);
      const recreated = Form.get(model);
      expect(debugForm(recreated).fields.size).toBe(0);
      expect(recreated.getField("field")).not.toBe(field);
    });

    it("keeps the watcher and the validator of the subject for the re-created form", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.markAsDirty();
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));

      Form.dispose(model);
      const recreated = Form.get(model);

      // PINNED(quirk): Watcher and Validator are attached to the subject itself, so a re-created form inherits the dirty state and the errors of the disposed one. Decide: should Form.dispose also reset (or detach) the watcher and the validator so that the re-created form starts clean?
      expect(recreated.watcher).toBe(form.watcher);
      expect(recreated.validator).toBe(form.validator);
      expect(recreated.isDirty).toBe(true);
      expect(recreated.isValid).toBe(false);
    });

    it("detaches a disposed sub-form from its parent while leaving it usable", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const oldSampleForm = Form.get(model.sample);

      Form.dispose(model.sample);
      const newSampleForm = form.subForms.get("sample" as KeyPath)!;
      expect(newSampleForm).not.toBe(oldSampleForm);
      expect(newSampleForm).toBe(Form.get(model.sample));

      const spy = vi.spyOn(oldSampleForm, "reportError");
      form.reportError();
      expect(spy).not.toBeCalled();

      // The disposed form still shares the watcher of the subject
      oldSampleForm.markAsDirty();
      expect(oldSampleForm.isDirty).toBe(true);
      expect(newSampleForm.isDirty).toBe(true);
      expect(form.isDirty).toBe(true);
    });

    it("does nothing for non-object subjects at runtime", () => {
      expect(() => Form.dispose(null as any)).not.toThrow();
      expect(() => Form.dispose(1 as any)).not.toThrow();
    });

    it("does not dispose the forms of nested objects when disposing the parent", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      sampleForm.getField("field").markAsTouched();

      Form.dispose(model);
      const recreated = Form.get(model);
      expect(recreated).not.toBe(form);

      // Form.dispose only removes the forms registered for the given subject. Sub-forms are the independent forms of
      // other subjects (looked up with Form.getSafe), so the re-created parent picks them up with their field states.
      expect(recreated.subForms.get("sample" as KeyPath)).toBe(sampleForm);
      expect(Form.get(model.sample).getField("field").isTouched).toBe(true);
    });

    it("goes through change, reset, change, submit, and dispose, without carrying handlers over to the re-created form", async () => {
      vi.useFakeTimers();
      const model = new SampleModel();
      const form = Form.get(model);
      const submit = vi.fn(async () => true);
      form.addHandler("submit", submit);

      runInAction(() => {
        model.otherField = false;
      });
      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.isDirty).toBe(true);

      form.reset();
      expect(form.isDirty).toBe(false);
      expect(form.canSubmit).toBe(false);

      runInAction(() => {
        model.otherField = true;
      });
      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.isDirty).toBe(true);
      expect(form.watcher.changedKeys).toEqual(new Set(["otherField"]));

      await expect(form.submit()).resolves.toBe(true);
      expect(submit).toBeCalledTimes(1);
      expect(form.isDirty).toBe(false);

      Form.dispose(model);
      const recreated = Form.get(model);
      await expect(recreated.submit({ force: true })).resolves.toBe(true);
      expect(submit).toBeCalledTimes(1); // Handlers belong to the disposed instance

      // The disposed instance keeps working with its own handlers
      form.markAsDirty();
      await expect(form.submit()).resolves.toBe(true);
      expect(submit).toBeCalledTimes(2);
    });
  });

  describe("#subForms", () => {
    it("collects sub-forms from Map values and Set elements", () => {
      const model = new CollectionModel();
      const form = Form.get(model);

      expect([...form.subForms.keys()]).toEqual(["sample", "array.0", "map.a", "set.0"]);
      expect(form.subForms.get("map.a" as KeyPath)).toBe(Form.get(model.map.get("a")!));
      expect(form.subForms.get("set.0" as KeyPath)).toBe(Form.get([...model.set][0]));
    });

    it("skips null values and symbol keys of Maps", () => {
      class Model {
        @nested @observable nullable: SampleModel | null = null;
        @nested @observable map = new Map<string | symbol, SampleModel>([
          [Symbol("symbol"), new SampleModel()],
          ["string", new SampleModel()],
        ]);

        constructor() {
          makeObservable(this);
        }
      }

      const model = new Model();
      const form = Form.get(model);
      expect([...form.subForms.keys()]).toEqual(["map.string"]);

      runInAction(() => {
        model.nullable = new SampleModel();
      });
      expect([...form.subForms.keys()]).toEqual(["nullable", "map.string"]);
      expect(form.subForms.get("nullable" as KeyPath)).toBe(Form.get(model.nullable!));
    });

    it("collects hoisted sub-forms at the root key path", () => {
      const model = new HoistModel();
      const form = Form.get(model);

      expect([...form.subForms.keys()]).toEqual(["0"]);
      expect(form.subForms.get("0" as KeyPath)).toBe(Form.get(model.list[0]));
    });

    it("propagates the formKey to sub-forms of sub-forms", () => {
      const model = new DeepModel();
      const key = Symbol("key");
      const form = Form.get(model, key);

      const childForm = form.subForms.get("child" as KeyPath)!;
      expect(childForm).toBe(Form.get(model.child, key));
      expect(childForm).not.toBe(Form.get(model.child));
      expect(childForm.subForms.get("sample" as KeyPath)).toBe(Form.get(model.child.sample, key));
      expect(childForm.subForms.get("map.a" as KeyPath)).toBe(Form.get(model.child.map.get("a")!, key));
    });

    it("follows a nested object replaced after the form was created", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const oldSample = model.sample;
      const oldSampleForm = Form.get(oldSample);

      runInAction(() => {
        model.sample = new SampleModel();
      });
      expect(form.subForms.get("sample" as KeyPath)).toBe(Form.get(model.sample));
      expect(form.subForms.get("sample" as KeyPath)).not.toBe(oldSampleForm);
      expect(Form.get(oldSample)).toBe(oldSampleForm); // The old form is not disposed
    });

    it("notifies observers only when the sub-forms change", () => {
      const model = new CollectionModel();
      const form = Form.get(model);

      let count = 0;
      const dispose = autorun(() => {
        void form.subForms;
        count++;
      });
      expect(count).toBe(1);

      runInAction(() => {
        model.field = false;
      });
      expect(count).toBe(1);

      runInAction(() => {
        model.map.set("b", new SampleModel());
      });
      expect(count).toBe(2);
      expect([...form.subForms.keys()]).toEqual(["sample", "array.0", "map.a", "map.b", "set.0"]);
      dispose();
    });

    it("skips nested values that are not objects", () => {
      class Model {
        @nested @observable count = 1;
        @nested @observable tags = ["a", "b"];
        @nested @observable sample = new SampleModel();

        constructor() {
          makeObservable(this);
        }
      }

      const form = Form.get(new Model());
      expect([...form.subForms.keys()]).toEqual(["sample"]);
      expect(() => form.reset()).not.toThrow();
      expect(() => form.reportError()).not.toThrow();
    });

    it("resets and reports errors on the current nested object after it is replaced", () => {
      vi.useFakeTimers();
      const model = new CollectionModel();
      const form = Form.get(model);
      const oldField = Form.get(model.sample).getField("field");
      oldField.markAsTouched();

      runInAction(() => {
        model.sample = new SampleModel();
      });
      const newField = Form.get(model.sample).getField("field");
      newField.markAsTouched();

      form.reset();
      form.reportError();
      vi.advanceTimersByTime(Validator.defaultDelayMs);

      expect(newField.isTouched).toBe(false);
      expect(newField.isErrorReported).toBe(false);
      expect(oldField.isTouched).toBe(true);
      expect(oldField.isErrorReported).toBeUndefined();
    });

    describe("Cyclic references", () => {
      class Node {
        @nested @observable other: Node | null = null;

        constructor() {
          makeObservable(this);
        }
      }

      /** Replace the method with a spy that throws past a few nested calls instead of overflowing the stack */
      const limitRecursion = (form: Form<Node>, method: "reset" | "reportError") => {
        const original = form[method];
        let calls = 0;
        vi.spyOn(form, method).mockImplementation(() => {
          calls++;
          if (calls > 3) throw new RangeError("Recursion limit");
          original.call(form);
        });
        return () => calls;
      };

      it("lists the form itself as a sub-form and recurses into it without bound on reset and reportError", () => {
        const node = new Node();
        const form = Form.get(node);
        runInAction(() => {
          node.other = node;
        });
        expect(form.subForms.get("other" as KeyPath)).toBe(form);

        // Watcher#reset (core) also recurses into nested watchers without bound and overflows the stack first, so it is stubbed to isolate Form#reset
        vi.spyOn(form.watcher, "reset").mockImplementation(() => {});
        const resetCalls = limitRecursion(form, "reset");
        const reportErrorCalls = limitRecursion(form, "reportError");

        // PINNED(quirk): reset and reportError walk sub-forms without tracking visited forms, so a @nested property that references its own subject (directly or through other objects) makes them recurse until the stack overflows (bounded here by a spy; Watcher#reset in core has the same issue). Decide: should Form (and Watcher) skip already visited sub-forms (not.toThrow() and 1 call each), or should cyclic @nested references be rejected?
        expect(() => form.reset()).toThrow(RangeError);
        expect(resetCalls()).toBe(4);
        expect(() => form.reportError()).toThrow(RangeError);
        expect(reportErrorCalls()).toBe(4);
      });

      it("throws when a form is created for a subject that already references itself", () => {
        const node = new Node();
        runInAction(() => {
          node.other = node;
        });

        // PINNED(quirk): The Watcher constructor (core) already reads the watchers of nested objects, so for a subject referencing itself a second Watcher gets registered on the subject first, and registering the outer one fails. Decide: should Watcher.getSafe register itself before processing nested objects, so that cyclic @nested references are supported (or rejected with a clear error)?
        expect(() => Form.get(node)).toThrow(/Cannot redefine property/);
      });
    });
  });

  describe("State composition with sub-forms", () => {
    it("counts invalid keys of the form itself and invalid key paths including sub-forms", () => {
      const model = new CollectionModel();
      const form = Form.get(model);

      form.validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error1");
        b.invalidate("field", "error2");
      });
      Form.get(model.sample).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      Form.get(model.array[0]).validator.updateErrors(Symbol(), (b) => {
        b.invalidate("field", "error");
        b.invalidate("otherField", "error");
      });

      expect(form.invalidFieldCount).toBe(1);
      expect(form.invalidFieldPathCount).toBe(4); // field, sample.field, array.0.field, array.0.otherField
      expect(form.isValid).toBe(false);
      expect(Form.get(model.map.get("a")!).isValid).toBe(true);
    });

    it("becomes invalid when only a sub-form is invalid", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      form.markAsDirty();

      Form.get([...model.set][0]).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      expect(form.invalidFieldCount).toBe(0);
      expect(form.invalidFieldPathCount).toBe(1);
      expect(form.isValid).toBe(false);
      expect(form.canSubmit).toBe(false);
    });

    it("becomes busy while a sub-form is validating", () => {
      vi.useFakeTimers();
      const model = new CollectionModel();
      const form = Form.get(model);
      expect(form.isValidating).toBe(false);

      runInAction(() => {
        model.sample.field = false;
      });
      expect(form.isDirty).toBe(true);
      expect(form.isValidating).toBe(true);
      expect(form.isBusy).toBe(true);
      expect(form.canSubmit).toBe(false);

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.isValidating).toBe(false);
      expect(form.isBusy).toBe(false);
      expect(form.isValid).toBe(false);
      expect(form.canSubmit).toBe(false);
      expect(form.firstErrorMessage).toBe("invalid");
    });

    it("does not become submitting while a sub-form is submitting", async () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      sampleForm.markAsDirty();

      const submit = deferred<boolean>();
      sampleForm.addHandler("submit", () => submit.promise);
      const promise = sampleForm.submit();

      expect(sampleForm.isSubmitting).toBe(true);
      expect(form.isSubmitting).toBe(false);
      expect(form.isBusy).toBe(false);
      expect(form.canSubmit).toBe(true);

      submit.resolve(true);
      await expect(promise).resolves.toBe(true);
    });

    it("uses its own config for canSubmit regardless of the parent form", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);

      form.configure({ allowSubmitNonDirty: true });
      expect(form.canSubmit).toBe(true);
      expect(sampleForm.config.allowSubmitNonDirty).toBe(false);
      expect(sampleForm.canSubmit).toBe(false);
    });

    it("stays dirty after a dirty sub-form is reset", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);

      sampleForm.markAsDirty();
      expect(form.isDirty).toBe(true);

      sampleForm.reset();
      expect(sampleForm.isDirty).toBe(false);
      // PINNED(quirk): The parent watcher records the sub-form change in its own changedTick, so resetting only the sub-form leaves the parent dirty. Decide: should the parent become clean when all of its changes came from sub-forms that were reset?
      expect(form.isDirty).toBe(true);

      form.reset();
      expect(form.isDirty).toBe(false);
      expect(sampleForm.isDirty).toBe(false);
    });
  });

  describe("#isDirty", () => {
    it("becomes dirty when an observable property of the subject changes, and notifies observers", () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: boolean[] = [];
      const dispose = autorun(() => timeline.push(form.isDirty));

      runInAction(() => {
        model.otherField = false;
      });
      runInAction(() => {
        model.otherField = true; // Reverting does not make it clean
      });
      expect(form.watcher.changedKeys).toEqual(new Set(["otherField"]));
      form.reset();

      expect(timeline).toEqual([false, true, false]);
      dispose();
    });
  });

  describe("#canSubmit", () => {
    it("updates reactively through the submission lifecycle", async () => {
      const form = Form.get(new SampleModel());
      const timeline: boolean[] = [];
      const dispose = autorun(() => timeline.push(form.canSubmit));

      form.markAsDirty(); // -> true
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error")); // -> false
      form.configure({ allowSubmitInvalid: true }); // -> true

      const submit = deferred<boolean>();
      form.addHandler("submit", () => submit.promise);
      const promise = form.submit(); // -> false (submitting)
      submit.resolve(false);
      await expect(promise).resolves.toBe(false); // -> true (still dirty)

      expect(timeline).toEqual([false, true, false, true, false, true]);
      expect(form.isDirty).toBe(true);
      dispose();
    });

    it.each([
      { allowSubmitInvalid: false, allowSubmitNonDirty: false, expected: false },
      { allowSubmitInvalid: true, allowSubmitNonDirty: false, expected: false },
      { allowSubmitInvalid: false, allowSubmitNonDirty: true, expected: false },
      { allowSubmitInvalid: true, allowSubmitNonDirty: true, expected: true },
    ])(
      "is $expected for a clean invalid form with allowSubmitInvalid=$allowSubmitInvalid and allowSubmitNonDirty=$allowSubmitNonDirty",
      ({ expected, ...config }) => {
        const form = Form.get(new SampleModel());
        form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
        form.configure(config);

        expect(form.isDirty).toBe(false);
        expect(form.isValid).toBe(false);
        expect(form.canSubmit).toBe(expected);
      }
    );

    it("is false while validating even when invalid and non-dirty submissions are allowed", () => {
      vi.useFakeTimers();
      const model = new SampleModel();
      const form = Form.get(model);
      form.configure({ allowSubmitInvalid: true, allowSubmitNonDirty: true });
      expect(form.canSubmit).toBe(true);

      runInAction(() => {
        model.field = false;
      });
      expect(form.isValidating).toBe(true);
      expect(form.canSubmit).toBe(false);

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.isValid).toBe(false);
      expect(form.canSubmit).toBe(true);
    });

    it("notifies observers only when its value changes", () => {
      const form = Form.get(new SampleModel());
      form.markAsDirty();

      const timeline: boolean[] = [];
      const dispose = autorun(() => timeline.push(form.canSubmit));

      form.configure({ autoFinalizationDelayMs: 1 }); // The config changes, but canSubmit does not
      form.markAsDirty();
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error")); // -> false
      form.configure({ allowSubmitNonDirty: true }); // Still false
      expect(timeline).toEqual([true, false]);
      dispose();
    });
  });

  describe("#isBusy", () => {
    it("notifies observers only when its value changes", async () => {
      vi.useFakeTimers();
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: boolean[] = [];
      const dispose = autorun(() => timeline.push(form.isBusy));

      runInAction(() => {
        model.field = false;
      });
      expect(form.isValidating).toBe(true); // -> true

      const submit = deferred<boolean>();
      form.addHandler("submit", () => submit.promise);
      const promise = form.submit({ force: true });
      expect(form.isSubmitting).toBe(true); // Still true

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.isValidating).toBe(false); // Still true (submitting)

      submit.resolve(true);
      await expect(promise).resolves.toBe(true); // -> false
      expect(timeline).toEqual([false, true, false]);
      dispose();
    });
  });

  describe("#reset", () => {
    it("resets fields of sub-forms in arrays, maps, sets, and hoisted lists", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const fields = [model.sample, model.array[0], model.map.get("a")!, [...model.set][0]].map((subject) =>
        Form.get(subject).getField("field")
      );
      for (const field of fields) {
        field.markAsTouched();
      }

      form.reset();
      expect(fields.map((field) => field.isTouched)).toEqual([false, false, false, false]);

      const hoistModel = new HoistModel();
      const hoistForm = Form.get(hoistModel);
      const hoistedField = Form.get(hoistModel.list[0]).getField("field");
      hoistedField.markAsTouched();
      hoistForm.reset();
      expect(hoistedField.isTouched).toBe(false);
    });

    it("cancels pending auto-finalization of fields", () => {
      vi.useFakeTimers();
      const form = Form.get(new SampleModel());
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      const field = form.getField("field");

      field.markAsChanged("intermediate");
      expect(field.isIntermediate).toBe(true);

      form.reset();
      expect(field.isChanged).toBe(false);

      vi.advanceTimersByTime(form.config.autoFinalizationDelayMs * 2);
      expect(field.isChanged).toBe(false);
      expect(field.isErrorReported).toBeUndefined();
    });

    it("keeps validation errors but hides the reported errors", () => {
      const form = Form.get(new SampleModel());
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      form.getField("field");
      form.reportError();
      expect(form.getErrors("field")).toEqual(new Set(["error"]));

      form.reset();
      expect(form.getErrors("field")).toEqual(new Set());
      expect(form.getErrors("field", true)).toEqual(new Set(["error"]));
      expect(form.isValid).toBe(false);
      expect(form.firstErrorMessage).toBe("error");
    });

    it("applies all changes in a single batch", () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("field");
      const otherField = form.getField("otherField");
      field.markAsTouched();
      otherField.markAsTouched();
      form.markAsDirty();

      let count = 0;
      const dispose = autorun(() => {
        void [form.isDirty, field.isTouched, otherField.isTouched];
        count++;
      });
      form.reset();
      expect(count).toBe(2);
      dispose();
    });
  });

  describe("#reportError", () => {
    it("reports errors on fields of sub-forms in arrays, maps, sets, and hoisted lists", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const subForms = [model.sample, model.array[0], model.map.get("a")!, [...model.set][0]].map((subject) =>
        Form.get(subject)
      );
      const fields = subForms.map((subForm) => subForm.getField("field"));
      for (const subForm of subForms) {
        subForm.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      }

      form.reportError();
      expect(fields.map((field) => field.isErrorReported)).toEqual([true, true, true, true]);

      const hoistModel = new HoistModel();
      const hoistForm = Form.get(hoistModel);
      const hoistedField = Form.get(hoistModel.list[0]).getField("field");
      hoistForm.reportError();
      expect(hoistedField.isErrorReported).toBe(false); // Reported as valid
    });

    it("does not create fields", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));

      form.reportError();
      expect(debugForm(form).fields.size).toBe(0);
      expect(debugForm(Form.get(model.sample)).fields.size).toBe(0);
    });

    it("defers the report until the pending validation settles", () => {
      vi.useFakeTimers();
      const model = new SampleModel();
      const form = Form.get(model);
      const field = form.getField("field");

      runInAction(() => {
        model.field = false;
      });
      expect(form.isValidating).toBe(true);

      form.reportError();
      expect(field.isErrorReported).toBeUndefined();
      expect(form.getErrors("field")).toEqual(new Set());

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.isValidating).toBe(false);
      expect(field.isErrorReported).toBe(true);
      expect(form.getErrors("field")).toEqual(new Set(["invalid"]));
    });

    it("applies all reports in a single batch", () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("field");
      const otherField = form.getField("otherField");

      let count = 0;
      const dispose = autorun(() => {
        void [field.isErrorReported, otherField.isErrorReported];
        count++;
      });
      form.reportError();
      expect([field.isErrorReported, otherField.isErrorReported]).toEqual([false, false]);
      expect(count).toBe(2);
      dispose();
    });
  });

  describe("#getField", () => {
    it("caches fields per name, including augmented names", () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("field");
      expect(form.getField("field")).toBe(field);
      expect(field.fieldName).toBe("field");
      expect(field.validator).toBe(form.validator);

      const augmented = form.getField("field:suffix");
      expect(augmented).not.toBe(field);
      expect(augmented.fieldName).toBe("field:suffix");
      expect(form.getField("field:suffix")).toBe(augmented);
      expect([...debugForm(form).fields.keys()]).toEqual(["field", "field:suffix"]);
    });

    it("keeps fields separate between a form and its sub-forms", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);

      expect(form.getField("field")).not.toBe(sampleForm.getField("field"));
      expect(sampleForm.getField("field").validator).toBe(sampleForm.validator);
    });

    it("reads autoFinalizationDelayMs from the form config each time a change is scheduled", () => {
      vi.useFakeTimers();
      const form = Form.get(new SampleModel());
      const field = form.getField("field");

      form.configure({ autoFinalizationDelayMs: 50 });
      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(49);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);

      form.configure({ autoFinalizationDelayMs: 500 });
      field.markAsChanged("intermediate");
      vi.advanceTimersByTime(499);
      expect(field.isIntermediate).toBe(true);
      vi.advanceTimersByTime(1);
      expect(field.isIntermediate).toBe(false);
    });

    it("does not resolve the errors of the base field for augmented names", () => {
      const form = Form.get(new SampleModel());
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      const augmented = form.getField("field:suffix");

      form.reportError();
      // PINNED(quirk): An augmented name is used verbatim as the key path, so "field:suffix" matches no validation errors even when "field" is invalid, and reportError marks it as valid. Decide: should augmented field names resolve (and report) the errors of their base field?
      expect(augmented.isErrorReported).toBe(false);
      expect(form.getErrors("field:suffix")).toEqual(new Set());
      expect(form.getErrors("field:suffix", true)).toEqual(new Set());
      expect(form.getAllErrors("field:suffix")).toEqual(new Set());

      expect(form.getErrors("field", true)).toEqual(new Set(["error"]));
    });
  });

  describe("#getErrors", () => {
    it("returns unreported errors without reporting them when includePreReported is true", () => {
      const form = Form.get(new SampleModel());
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      expect(debugForm(form).fields.has("field")).toBe(false);

      expect(form.getErrors("field", true)).toEqual(new Set(["error"]));
      expect(debugForm(form).fields.has("field")).toBe(true); // The field is created on demand
      expect(form.getField("field").isErrorReported).toBeUndefined();
      expect(form.getErrors("field")).toEqual(new Set());
    });

    it("returns an empty set for a reported field without errors", () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("field");
      field.reportError();
      expect(field.isErrorReported).toBe(false);
      expect(form.getErrors("field")).toEqual(new Set());
      expect(form.getErrors("field", true)).toEqual(new Set());
    });

    it("notifies observers only when the errors of the field change", () => {
      const form = Form.get(new SampleModel());

      let count = 0;
      const dispose = autorun(() => {
        form.getErrors("field", true);
        count++;
      });
      expect(count).toBe(1);

      form.validator.updateErrors(Symbol(), (b) => b.invalidate("otherField", "error"));
      expect(count).toBe(1);

      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));
      expect(count).toBe(2);
      dispose();
    });
  });

  describe("#getAllErrors", () => {
    it("includes the errors of sub-forms in maps and sets", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      Form.get(model.map.get("a")!).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "map error"));
      Form.get([...model.set][0]).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "set error"));

      expect(form.getAllErrors("map")).toEqual(new Set(["map error"]));
      expect(form.getAllErrors("set")).toEqual(new Set(["set error"]));
      expect(form.getAllErrors()).toEqual(new Set(["map error", "set error"]));
    });

    it("returns only the errors of the first element for a field holding multiple sub-forms", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      runInAction(() => {
        model.array.push(new SampleModel());
      });
      Form.get(model.array[0]).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error at 0"));
      Form.get(model.array[1]).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error at 1"));

      expect(form.getAllErrors()).toEqual(new Set(["error at 0", "error at 1"]));
      // PINNED(bug): Validator#findErrors (prefix match) stops after the first nested entry of the field, so the errors of array.1 are missing. Expected: Set(["error at 0", "error at 1"]), as getAllErrors is documented to return the errors of the field and its nested forms. Flip this assertion when fixing.
      expect(form.getAllErrors("array")).toEqual(new Set(["error at 0"]));
    });

    it("returns the errors of the first element for a key path pointing at another element", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      runInAction(() => {
        model.array.push(new SampleModel());
      });
      Form.get(model.array[0]).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error at 0"));
      Form.get(model.array[1]).validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error at 1"));

      // The runtime accepts any key path string even though the type only allows field names
      const getAllErrors = form.getAllErrors as (fieldName?: string) => Set<string>;
      // PINNED(bug): For a prefix match, Validator#findErrors replaces the searched key path with the first nested entry of the field, so "array.1" yields the errors of array.0. Expected: Set(["error at 1"]). Flip this assertion when fixing.
      expect(getAllErrors.call(form, "array.1")).toEqual(new Set(["error at 0"]));
    });
  });

  describe("#firstErrorMessage", () => {
    it("returns null when there are no errors", () => {
      const form = Form.get(new CollectionModel());
      // PINNED(quirk): firstErrorMessage returns null when there are no errors, matching its type (`string | null`) and Validator#firstErrorMessage, but the README documents `string | undefined`. Decide: should it return undefined (toBeUndefined(), and the "properties" type assertion changes), or should the README say `string | null`?
      expect(form.firstErrorMessage).toBeNull();
    });

    it("prefers own errors over sub-form errors regardless of the order they were added, and updates reactively", () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);

      const timeline: (string | null)[] = [];
      const dispose = autorun(() => timeline.push(form.firstErrorMessage));

      sampleForm.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "nested"));
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "own"));
      expect(form.getAllErrors()).toEqual(new Set(["own", "nested"]));

      form.validator.reset();
      sampleForm.validator.reset();
      expect(timeline).toEqual([null, "nested", "own", "nested", null]);
      dispose();
    });
  });

  describe("#submit", () => {
    it("runs willSubmit, submit, and didSubmit handlers in order with the same abort signal", async () => {
      const form = Form.get(new SampleModel());
      form.markAsDirty();

      const calls: unknown[][] = [];
      const signals: AbortSignal[] = [];
      form.addHandler("willSubmit", async (signal) => {
        signals.push(signal);
        calls.push(["willSubmit", form.isSubmitting, signal.aborted]);
        return true;
      });
      form.addHandler("submit", async (signal) => {
        signals.push(signal);
        calls.push(["submit", form.isSubmitting, signal.aborted]);
        return true;
      });
      form.addHandler("didSubmit", (succeed) => {
        calls.push(["didSubmit", form.isSubmitting, succeed]);
      });

      expect(form.isSubmitting).toBe(false);
      const promise = form.submit();
      expect(form.isSubmitting).toBe(true);
      expect(form.isBusy).toBe(true);

      await expect(promise).resolves.toBe(true);
      expect(form.isSubmitting).toBe(false);
      expect(calls).toEqual([
        ["willSubmit", true, false],
        ["submit", true, false],
        ["didSubmit", false, true],
      ]);
      expect(signals[0]).toBe(signals[1]);
    });

    it("runs willSubmit handlers one at a time", async () => {
      const form = Form.get(new SampleModel());
      form.markAsDirty();

      const calls: string[] = [];
      const first = deferred<boolean>();
      form.addHandler("willSubmit", () => {
        calls.push("willSubmit1");
        return first.promise;
      });
      form.addHandler("willSubmit", async () => {
        calls.push("willSubmit2");
        return true;
      });

      const promise = form.submit();
      await flushMicrotasks();
      // willSubmit handlers are awaited one by one, as documented, so the second handler does not start until the first settles.
      expect(calls).toEqual(["willSubmit1"]);

      first.resolve(true);
      await expect(promise).resolves.toBe(true);
      expect(calls).toEqual(["willSubmit1", "willSubmit2"]);
    });

    it("runs submit handlers one at a time and skips the rest after a failure", async () => {
      const form = Form.get(new SampleModel());
      form.markAsDirty();

      const calls: string[] = [];
      const first = deferred<boolean>();
      form.addHandler("submit", () => {
        calls.push("submit1");
        return first.promise;
      });
      const second = vi.fn(async () => true);
      form.addHandler("submit", second);
      const didSubmit = vi.fn();
      form.addHandler("didSubmit", didSubmit);

      const promise = form.submit();
      await flushMicrotasks();
      expect(calls).toEqual(["submit1"]);
      expect(second).not.toBeCalled();

      first.resolve(false);
      await expect(promise).resolves.toBe(false);
      expect(second).not.toBeCalled();
      expect(didSubmit.mock.calls).toEqual([[false]]);
      expect(form.isDirty).toBe(true);
    });

    it("returns false without running any handler when the form is invalid, unless forced", async () => {
      const form = Form.get(new SampleModel());
      form.markAsDirty();
      form.validator.updateErrors(Symbol(), (b) => b.invalidate("field", "error"));

      const willSubmit = vi.fn(async () => true);
      const didSubmit = vi.fn();
      form.addHandler("willSubmit", willSubmit);
      form.addHandler("didSubmit", didSubmit);

      await expect(form.submit()).resolves.toBe(false);
      await expect(form.submit({ force: false })).resolves.toBe(false);
      expect(willSubmit).not.toBeCalled();
      expect(didSubmit).not.toBeCalled();
      expect(form.isSubmitting).toBe(false);

      await expect(form.submit({ force: true })).resolves.toBe(true);
      expect(willSubmit).toBeCalledTimes(1);
      expect(didSubmit.mock.calls).toEqual([[true]]);
      expect(form.isDirty).toBe(false);
      expect(form.isValid).toBe(false); // Errors are kept
    });

    it("returns false without running any handler while the validation is pending", async () => {
      vi.useFakeTimers();
      const model = new SampleModel();
      const form = Form.get(model);
      const submit = vi.fn(async () => true);
      form.addHandler("submit", submit);

      runInAction(() => {
        model.otherField = false;
        model.field = false;
        model.field = true;
      });
      expect(form.isDirty).toBe(true);
      expect(form.isValidating).toBe(true);
      await expect(form.submit()).resolves.toBe(false);
      expect(submit).not.toBeCalled();

      vi.advanceTimersByTime(Validator.defaultDelayMs);
      expect(form.isValidating).toBe(false);
      await expect(form.submit()).resolves.toBe(true);
      expect(submit).toBeCalledTimes(1);
    });

    it("does not reset the form when a willSubmit handler returns false", async () => {
      const form = Form.get(new SampleModel());
      form.markAsDirty();
      const submit = vi.fn(async () => true);
      const didSubmit = vi.fn();
      form.addHandler("willSubmit", async () => false);
      form.addHandler("submit", submit);
      form.addHandler("didSubmit", didSubmit);

      await expect(form.submit()).resolves.toBe(false);
      expect(submit).not.toBeCalled();
      expect(didSubmit.mock.calls).toEqual([[false]]);
      expect(form.isDirty).toBe(true);
    });

    it("returns false and keeps the form dirty when a willSubmit or submit handler throws", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      const form = Form.get(new SampleModel());
      form.markAsDirty();

      const willSubmitError = new Error("willSubmit");
      const removeWillSubmit = form.addHandler("willSubmit", async () => {
        throw willSubmitError;
      });
      const submit = vi.fn(async () => true);
      const removeSubmit = form.addHandler("submit", submit);
      await expect(form.submit()).resolves.toBe(false);
      expect(submit).not.toBeCalled();
      expect(consoleError).toHaveBeenLastCalledWith(willSubmitError);
      expect(form.isDirty).toBe(true);
      removeWillSubmit();
      removeSubmit();

      const submitError = new Error("submit");
      form.addHandler("submit", async () => {
        throw submitError;
      });
      await expect(form.submit()).resolves.toBe(false);
      expect(consoleError).toHaveBeenLastCalledWith(submitError);
      expect(form.isDirty).toBe(true);
      expect(form.isSubmitting).toBe(false);
    });

    it("still succeeds and resets the form when a didSubmit handler throws", async () => {
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const form = Form.get(new SampleModel());
      form.markAsDirty();

      const error = new Error("didSubmit");
      form.addHandler("didSubmit", () => {
        throw error;
      });
      await expect(form.submit()).resolves.toBe(true);
      expect(consoleWarn).toHaveBeenCalledWith(error);
      expect(form.isDirty).toBe(false);
    });

    it("resets the form before user didSubmit handlers run", async () => {
      const form = Form.get(new SampleModel());
      const field = form.getField("field");
      field.markAsTouched();
      form.markAsDirty();

      const observed: { isDirty: boolean; isTouched: boolean }[] = [];
      form.addHandler("didSubmit", () => {
        observed.push({ isDirty: form.isDirty, isTouched: field.isTouched });
      });

      await expect(form.submit()).resolves.toBe(true);
      // PINNED(quirk): The internal reset is registered as the first didSubmit handler in the constructor, so user didSubmit handlers already observe the reset state. Decide: should user didSubmit handlers see the pre-reset state (e.g. to inspect what was submitted)?
      expect(observed).toEqual([{ isDirty: false, isTouched: false }]);
    });

    it("discards the dirty state of changes made while the submission is in flight", async () => {
      const model = new SampleModel();
      const form = Form.get(model);
      form.markAsDirty();

      const submit = deferred<boolean>();
      form.addHandler("submit", () => submit.promise);
      const promise = form.submit();

      runInAction(() => {
        model.otherField = false;
      });
      expect(form.watcher.changedKeys).toEqual(new Set(["otherField"]));

      submit.resolve(true);
      await expect(promise).resolves.toBe(true);
      // PINNED(quirk): The reset after a successful submission also clears changes made after the submission started, so edits made during the request no longer count as dirty. Decide: should the post-submit reset only clear the changes made before the submission started?
      expect(form.isDirty).toBe(false);
      expect(form.watcher.changedKeys).toEqual(new Set());
    });

    it("resets sub-forms after a successful submission", async () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      const field = sampleForm.getField("field");
      field.markAsTouched();
      sampleForm.markAsDirty();
      expect(form.isDirty).toBe(true);

      await expect(form.submit()).resolves.toBe(true);
      expect(form.isDirty).toBe(false);
      expect(sampleForm.isDirty).toBe(false);
      expect(field.isTouched).toBe(false);
    });

    it("leaves the parent form dirty after a successful sub-form submission", async () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      sampleForm.markAsDirty();

      await expect(sampleForm.submit()).resolves.toBe(true);
      expect(sampleForm.isDirty).toBe(false);
      // PINNED(quirk): Submitting a sub-form resets only the sub-form, and the parent keeps the change recorded in its own watcher (same root cause as "stays dirty after a dirty sub-form is reset"). Decide: should a successful sub-form submission clear the parent's dirty state derived from that sub-form?
      expect(form.isDirty).toBe(true);
    });

    it("does not run the submission handlers of sub-forms", async () => {
      const model = new CollectionModel();
      const form = Form.get(model);
      const sampleForm = Form.get(model.sample);
      const willSubmit = vi.fn(async () => true);
      const submit = vi.fn(async () => true);
      const didSubmit = vi.fn();
      sampleForm.addHandler("willSubmit", willSubmit);
      sampleForm.addHandler("submit", submit);
      sampleForm.addHandler("didSubmit", didSubmit);
      sampleForm.markAsDirty();

      await expect(form.submit()).resolves.toBe(true);
      expect(willSubmit).not.toBeCalled();
      expect(submit).not.toBeCalled();
      expect(didSubmit).not.toBeCalled();
      expect(sampleForm.isSubmitting).toBe(false);
      expect(sampleForm.isDirty).toBe(false); // Reset through the parent
    });

    describe("Concurrent submissions", () => {
      const setupEnv = () => {
        const form = Form.get(new SampleModel());
        form.markAsDirty();

        const calls: { signal: AbortSignal; result: Deferred<boolean> }[] = [];
        form.addHandler("submit", (signal) => {
          const result = deferred<boolean>();
          calls.push({ signal, result });
          return result.promise;
        });
        const didSubmit = vi.fn();
        form.addHandler("didSubmit", didSubmit);

        return { form, calls, didSubmit };
      };

      it("ignores a non-forced submit while submitting", async () => {
        const { form, calls, didSubmit } = setupEnv();

        const first = form.submit();
        expect(form.isSubmitting).toBe(true);
        expect(form.canSubmit).toBe(false);
        await expect(form.submit()).resolves.toBe(false);
        expect(calls).toHaveLength(1);
        expect(calls[0].signal.aborted).toBe(false);

        calls[0].result.resolve(true);
        await expect(first).resolves.toBe(true);
        expect(didSubmit.mock.calls).toEqual([[true]]);
      });

      it("aborts the signal of the in-flight submission when forced", async () => {
        const { form, calls, didSubmit } = setupEnv();

        const first = form.submit();
        const second = form.submit({ force: true });
        expect(calls).toHaveLength(2);
        expect(calls[0].signal.aborted).toBe(true);
        expect(calls[1].signal.aborted).toBe(false);

        calls[0].result.resolve(false);
        calls[1].result.resolve(true);
        await expect(first).resolves.toBe(false);
        await expect(second).resolves.toBe(true);
        expect(didSubmit.mock.calls).toEqual([[true]]); // The cancelled submission does not call didSubmit
        expect(form.isSubmitting).toBe(false);
      });

      it("keeps submitting until the forced submission settles, even after the aborted one settles", async () => {
        const { form, calls } = setupEnv();

        const first = form.submit();
        const second = form.submit({ force: true });
        calls[0].result.resolve(false);
        await expect(first).resolves.toBe(false);

        expect(form.isSubmitting).toBe(true);
        expect(form.canSubmit).toBe(false);

        calls[1].result.resolve(true);
        await expect(second).resolves.toBe(true);
        expect(form.isSubmitting).toBe(false);
      });

      it("aborts the forced submission with a later forced submit after the aborted one settles", async () => {
        const { form, calls } = setupEnv();

        const first = form.submit();
        const second = form.submit({ force: true });
        calls[0].result.resolve(false);
        await first;

        const third = form.submit({ force: true });
        expect(calls).toHaveLength(3);
        expect(calls[1].signal.aborted).toBe(true);
        expect(calls[2].signal.aborted).toBe(false);

        calls[1].result.resolve(true);
        calls[2].result.resolve(true);
        await expect(second).resolves.toBe(false); // Aborted, even though its handler resolved true
        await expect(third).resolves.toBe(true);
      });

      it("treats an aborted submission as failed even when its handlers resolve true", async () => {
        const form = Form.get(new SampleModel());
        form.markAsDirty();

        const calls: string[] = [];
        const results: Deferred<boolean>[] = [];
        form.addHandler("submit", (signal) => {
          calls.push(`submit1(aborted=${signal.aborted})`);
          const result = deferred<boolean>();
          results.push(result);
          return result.promise;
        });
        form.addHandler("submit", async (signal) => {
          calls.push(`submit2(aborted=${signal.aborted})`);
          return true;
        });
        const didSubmit = vi.fn();
        form.addHandler("didSubmit", didSubmit);

        const first = form.submit();
        const second = form.submit({ force: true });
        form.markAsDirty(); // A change made while the forced submission is running

        results[0].resolve(true);
        await expect(first).resolves.toBe(false);
        expect(calls).toEqual(["submit1(aborted=false)", "submit1(aborted=false)"]);
        expect(didSubmit).not.toBeCalled();
        expect(form.isDirty).toBe(true);

        results[1].resolve(true);
        await expect(second).resolves.toBe(true);
        expect(calls).toEqual(["submit1(aborted=false)", "submit1(aborted=false)", "submit2(aborted=false)"]);
        expect(didSubmit.mock.calls).toEqual([[true]]);
        expect(form.isDirty).toBe(false);
      });

      it.each([
        { handler: "honors the abort signal", honorsSignal: true, settlesWithForce: false },
        { handler: "ignores the abort signal", honorsSignal: false, settlesWithForce: false },
        { handler: "settles in the same tick as the force", honorsSignal: true, settlesWithForce: true },
      ])(
        "keeps the form dirty and submittable when the aborted submission's handler $handler and the forced one fails",
        async ({ honorsSignal, settlesWithForce }) => {
          const form = Form.get(new SampleModel());
          form.markAsDirty();

          const requests: Deferred<boolean>[] = [];
          form.addHandler("submit", (signal) => {
            const request = deferred<boolean>();
            requests.push(request);
            if (honorsSignal) {
              // Like a try/catch handler around fetch(url, { signal }): resolve false as soon as the signal aborts
              signal.addEventListener("abort", () => request.resolve(false));
            }
            return request.promise;
          });
          const didSubmit = vi.fn();
          form.addHandler("didSubmit", didSubmit);

          const first = form.submit();
          if (settlesWithForce) {
            requests[0].resolve(true); // The response arrives in the same tick as the force
          }
          const second = form.submit({ force: true });
          requests[0].resolve(true); // The first request succeeds anyway (no-op if already settled)

          await expect(first).resolves.toBe(false);
          expect(didSubmit).not.toBeCalled();
          expect(form.isDirty).toBe(true);
          expect(form.isSubmitting).toBe(true);

          requests[1].resolve(false); // The forced submission fails
          await expect(second).resolves.toBe(false);
          expect(didSubmit.mock.calls).toEqual([[false]]);
          expect(form.isDirty).toBe(true);
          expect(form.canSubmit).toBe(true);
        }
      );

      it("does not call didSubmit for the cancelled submission, so a didSubmit handler reports no error mid-flight", async () => {
        const { form, calls, didSubmit } = setupEnv();
        const reportError = vi.spyOn(form, "reportError");
        // Like apps/example: report errors from didSubmit when a submission fails
        form.addHandler("didSubmit", (succeed) => {
          if (!succeed) form.reportError();
        });

        const first = form.submit();
        const second = form.submit({ force: true });
        calls[0].result.resolve(false); // The cancelled request rejects on abort, and its handler returns false
        await expect(first).resolves.toBe(false);
        expect(didSubmit).not.toBeCalled();
        expect(reportError).not.toBeCalled();
        expect(form.isSubmitting).toBe(true);

        calls[1].result.resolve(false);
        await expect(second).resolves.toBe(false);
        expect(didSubmit.mock.calls).toEqual([[false]]);
        expect(reportError).toHaveBeenCalledTimes(1); // Once, for the forced submission that actually failed
      });

      it.each([{ lateResult: false }, { lateResult: true }])(
        "calls didSubmit only for the forced submission when the cancelled one settles after it with $lateResult",
        async ({ lateResult }) => {
          const { form, calls, didSubmit } = setupEnv();

          const first = form.submit();
          const second = form.submit({ force: true });
          calls[1].result.resolve(true);
          await expect(second).resolves.toBe(true);
          expect(didSubmit.mock.calls).toEqual([[true]]);
          expect(form.isSubmitting).toBe(false);
          expect(form.isDirty).toBe(false);

          form.markAsDirty(); // A change made after the forced submission succeeded
          calls[0].result.resolve(lateResult);
          await expect(first).resolves.toBe(false);
          expect(didSubmit.mock.calls).toEqual([[true]]);
          expect(form.isDirty).toBe(true);
          expect(form.isSubmitting).toBe(false);
        }
      );

      it("calls a didSubmit listener guarded by succeed exactly once, for the successful forced submission", async () => {
        const { form, calls } = setupEnv();
        const onSuccess = vi.fn();
        // Like the useFormHandler example in packages/react/README.md
        form.addHandler("didSubmit", (succeed) => {
          if (succeed) onSuccess();
        });

        const first = form.submit();
        const second = form.submit({ force: true });
        calls[0].result.resolve(true); // The cancelled request succeeds anyway, as its handler ignores the signal
        await expect(first).resolves.toBe(false);
        expect(onSuccess).not.toBeCalled();

        calls[1].result.resolve(true);
        await expect(second).resolves.toBe(true);
        expect(onSuccess).toHaveBeenCalledTimes(1);

        form.markAsDirty();
        const third = form.submit();
        calls[2].result.resolve(false); // A later submission that fails
        await expect(third).resolves.toBe(false);
        expect(onSuccess).toHaveBeenCalledTimes(1);
      });

      describe("with a submit handler around a request that honors the abort signal", () => {
        const setupRequestEnv = () => {
          vi.useFakeTimers();
          const form = Form.get(new SampleModel());
          form.markAsDirty();

          // README-style submit handler around a fetch-like request that rejects as soon as its signal aborts
          const signals: AbortSignal[] = [];
          form.addHandler("submit", async (signal) => {
            signals.push(signal);
            try {
              await new Promise<void>((resolve, reject) => {
                const timerId = setTimeout(resolve, 1000);
                signal.addEventListener("abort", () => {
                  clearTimeout(timerId);
                  reject(signal.reason);
                });
              });
              return true;
            } catch {
              return false;
            }
          });
          const didSubmit = vi.fn();
          form.addHandler("didSubmit", didSubmit);

          return { form, signals, didSubmit };
        };

        it("stays busy while the forced request is in flight and resets only once it succeeds", async () => {
          const { form, signals, didSubmit } = setupRequestEnv();

          const first = form.submit();
          await vi.advanceTimersByTimeAsync(400);
          const second = form.submit({ force: true });
          await expect(first).resolves.toBe(false);
          expect(didSubmit).not.toBeCalled();
          expect(form.isSubmitting).toBe(true);
          expect(form.isBusy).toBe(true);
          expect(form.canSubmit).toBe(false);

          // A plain submit, as SubmitButtonBinding calls it, does not start a concurrent request
          await expect(form.submit()).resolves.toBe(false);
          expect(signals).toHaveLength(2);
          expect(signals[1].aborted).toBe(false);

          await vi.advanceTimersByTimeAsync(999);
          expect(form.isSubmitting).toBe(true);
          expect(form.isDirty).toBe(true);

          await vi.advanceTimersByTimeAsync(1);
          await expect(second).resolves.toBe(true);
          expect(didSubmit.mock.calls).toEqual([[true]]);
          expect(form.isSubmitting).toBe(false);
          expect(form.isDirty).toBe(false);
        });

        it("lets a later forced submit abort the in-flight request after the aborted one settles", async () => {
          const { form, signals, didSubmit } = setupRequestEnv();

          const first = form.submit();
          const second = form.submit({ force: true });
          await expect(first).resolves.toBe(false);

          const third = form.submit({ force: true });
          expect(signals).toHaveLength(3);
          expect(signals[1].aborted).toBe(true);
          await expect(second).resolves.toBe(false);
          expect(didSubmit).not.toBeCalled();
          expect(form.isSubmitting).toBe(true);
          expect(form.isDirty).toBe(true);

          await vi.advanceTimersByTimeAsync(1000);
          await expect(third).resolves.toBe(true);
          expect(didSubmit.mock.calls).toEqual([[true]]);
          expect(form.isSubmitting).toBe(false);
          expect(form.isDirty).toBe(false);
        });
      });
    });
  });

  describe("Detached methods", () => {
    it("allows addHandler, bind, and configure to be called detached, but not the other methods", async () => {
      const form = Form.get(new SampleModel());
      const {
        addHandler,
        bind,
        configure,
        submit,
        reset,
        reportError,
        markAsDirty,
        getField,
        getErrors,
        getAllErrors,
      } = form;

      const didSubmit = vi.fn();
      addHandler("didSubmit", didSubmit);
      expect(bind(SampleFormBinding)).toEqual(form.bind(SampleFormBinding));
      expect(debugForm(form).bindings.size).toBe(1);
      configure({ allowSubmitNonDirty: true });
      expect(form.config.allowSubmitNonDirty).toBe(true);
      await expect(form.submit()).resolves.toBe(true);
      expect(didSubmit.mock.calls).toEqual([[true]]);

      // PINNED(quirk): addHandler, bind, and configure are bound, but the other public methods rely on `this` and throw when detached (e.g. `onClick={form.submit}`). Decide: should the public methods be bound consistently?
      await expect(submit()).rejects.toThrow(TypeError);
      expect(() => reset()).toThrow(TypeError);
      expect(() => reportError()).toThrow(TypeError);
      expect(() => markAsDirty()).toThrow(TypeError);
      expect(() => getField("field")).toThrow(TypeError);
      expect(() => getErrors("field")).toThrow(TypeError);
      expect(() => getAllErrors()).toThrow(TypeError);
    });
  });

  describe("Types", () => {
    class TypedModel {
      @observable name = "";
      @observable age = 0;

      constructor() {
        makeObservable(this);
      }
    }

    test("static methods", () => {
      const model = new TypedModel();
      expectTypeOf(Form.get(model)).toEqualTypeOf<Form<TypedModel>>();
      expectTypeOf(Form.get(model, Symbol())).toEqualTypeOf<Form<TypedModel>>();
      expectTypeOf(Form.getSafe(model)).toEqualTypeOf<Form<TypedModel> | null>();
      expectTypeOf(Form.dispose).parameters.toEqualTypeOf<[subject: object, formKey?: symbol]>();
      expectTypeOf(Form.dispose).returns.toEqualTypeOf<void>();

      const assertInvalidCalls = () => {
        // @ts-expect-error The subject must be an object
        Form.get(1);
        // @ts-expect-error The subject must be an object
        Form.getSafe("string");
        // @ts-expect-error The formKey must be a symbol
        Form.get(model, "key");
        // @ts-expect-error The constructor is private
        new Form();
      };
      void assertInvalidCalls;
    });

    test("properties", () => {
      const form = Form.get(new TypedModel());
      expectTypeOf(form.id).toEqualTypeOf<string>();
      expectTypeOf(form.watcher).toEqualTypeOf<Watcher>();
      expectTypeOf(form.validator).toEqualTypeOf<Validator<TypedModel>>();
      expectTypeOf(form.config).toEqualTypeOf<Readonly<FormConfig>>();
      expectTypeOf(form.isDirty).toEqualTypeOf<boolean>();
      expectTypeOf(form.isValid).toEqualTypeOf<boolean>();
      expectTypeOf(form.isValidating).toEqualTypeOf<boolean>();
      expectTypeOf(form.isSubmitting).toEqualTypeOf<boolean>();
      expectTypeOf(form.isBusy).toEqualTypeOf<boolean>();
      expectTypeOf(form.canSubmit).toEqualTypeOf<boolean>();
      expectTypeOf(form.invalidFieldCount).toEqualTypeOf<number>();
      expectTypeOf(form.invalidFieldPathCount).toEqualTypeOf<number>();
      expectTypeOf(form.subForms).toEqualTypeOf<ReadonlyMap<KeyPath, Form<any>>>();
      expectTypeOf(form.firstErrorMessage).toEqualTypeOf<string | null>();
      expectTypeOf(form.bindInput).toEqualTypeOf<unknown>();
    });

    test("methods", () => {
      const form = Form.get(new TypedModel());
      expectTypeOf(form.getField).parameter(0).toEqualTypeOf<"name" | "age" | `name:${string}` | `age:${string}`>();
      expectTypeOf(form.getField).returns.toEqualTypeOf<FormField>();
      expectTypeOf(form.getErrors).returns.toEqualTypeOf<ReadonlySet<string>>();
      expectTypeOf(form.getAllErrors).returns.toEqualTypeOf<Set<string>>();
      expectTypeOf(form.submit).parameters.toEqualTypeOf<[args?: { force?: boolean }]>();
      expectTypeOf(form.submit).returns.toEqualTypeOf<Promise<boolean>>();
      expectTypeOf(form.reset).returns.toEqualTypeOf<void>();
      expectTypeOf(form.reportError).returns.toEqualTypeOf<void>();
      expectTypeOf(form.markAsDirty).returns.toEqualTypeOf<void>();
      expectTypeOf(form.getErrors).parameters.toEqualTypeOf<
        [fieldName: FormField.Name<TypedModel>, includePreReported?: boolean]
      >();
      expectTypeOf(form.getAllErrors).parameters.toEqualTypeOf<[fieldName?: FormField.Name<TypedModel>]>();

      const assertReadonlyProperties = () => {
        // @ts-expect-error The id is read-only
        form.id = "id";
        // @ts-expect-error The watcher is read-only
        form.watcher = Watcher.get({});
        // @ts-expect-error isDirty is a getter
        form.isDirty = true;
        // @ts-expect-error canSubmit is a getter
        form.canSubmit = true;
      };
      void assertReadonlyProperties;

      const assertInvalidCalls = () => {
        // @ts-expect-error includePreReported must be a boolean
        form.getErrors("name", "yes");
        // @ts-expect-error Unknown field
        form.getField("unknown");
        // @ts-expect-error Augmented names require a known field as the prefix
        form.getErrors("unknown:suffix");
        // @ts-expect-error Unknown field
        form.getAllErrors("unknown");
        // @ts-expect-error The force option must be a boolean
        form.submit({ force: 1 });
      };
      void assertInvalidCalls;
    });

    test("addHandler", () => {
      const form = Form.get(new TypedModel());

      const assertHandlers = () => {
        form.addHandler("willSubmit", async (abortSignal) => {
          expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
          return true;
        });
        form.addHandler("submit", async (abortSignal) => {
          expectTypeOf(abortSignal).toEqualTypeOf<AbortSignal>();
          return true;
        });
        form.addHandler("didSubmit", (succeed) => {
          expectTypeOf(succeed).toEqualTypeOf<boolean>();
        });
        expectTypeOf(form.addHandler("didSubmit", () => {})).toEqualTypeOf<() => void>();

        // @ts-expect-error willSubmit handlers must return a promise
        form.addHandler("willSubmit", () => true);
        // @ts-expect-error submit handlers must resolve a boolean
        form.addHandler("submit", async () => {});
        // @ts-expect-error Unknown event
        form.addHandler("unknown", () => {});
      };
      void assertHandlers;

      expectTypeOf<Form.Handlers>().toEqualTypeOf<{
        willSubmit: (abortSignal: AbortSignal) => Promise<boolean>;
        submit: (abortSignal: AbortSignal) => Promise<boolean>;
        didSubmit: (succeed: boolean) => void;
      }>();
    });
  });
});
