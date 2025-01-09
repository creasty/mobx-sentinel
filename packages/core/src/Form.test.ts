import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Form, getInternal } from "./Form";
import { FormDelegate } from "./delegation";
import {
  SampleConfigurableFieldBinding,
  SampleConfigurableFormBinding,
  SampleFieldBinding,
  SampleFormBinding,
} from "./binding.test";

class EmptyModel {}

class SampleModel implements FormDelegate<SampleModel> {
  @observable string: string = "hello";

  constructor() {
    makeObservable(this);
  }

  async [FormDelegate.validate]() {
    return {
      string: this.string !== "hello" ? "error" : null,
    };
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

class NestedModel implements FormDelegate<NestedModel> {
  @observable sample = new SampleModel();
  @observable array = [new SampleModel()];

  constructor() {
    makeObservable(this);
  }

  [FormDelegate.connect]() {
    return [this.sample, this.array];
  }
}

describe("Form", () => {
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

    it("retrieves instances of nested forms", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      const sampleForm = Form.get(model.sample);
      const arrayForm = Form.get(model.array[0]);

      expect(form.nestedForms.size).toBe(2);
      expect(form.nestedForms).toContain(sampleForm);
      expect(form.nestedForms).toContain(arrayForm);
    });

    it("retrieves instances of nested forms with a specified key", () => {
      const model = new NestedModel();
      const key = Symbol("custom-key");
      const form = Form.get(model, key);

      const sampleForm = Form.get(model.sample, key);
      const arrayForm = Form.get(model.array[0], key);

      expect(form.nestedForms.size).toBe(2);
      expect(form.nestedForms).toContain(sampleForm);
      expect(form.nestedForms).toContain(arrayForm);
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

  describe("#nestedForms", () => {
    it("does not collect nested forms from objects that do not implement FormDelegate.connect", () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(form.nestedForms.size).toBe(0);
    });

    it("collects nested forms via the delegate", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      expect(form.nestedForms).toEqual(new Set([Form.get(model.sample), Form.get(model.array[0])]));
    });

    it("updates nested forms reactively", () => {
      const model = new NestedModel();
      const form = Form.get(model);

      let observed: typeof form.nestedForms | null = null;
      autorun(() => {
        observed = form.nestedForms;
      });
      expect(observed).toBeDefined();
      expect(observed!.size).toBe(2);
      expect(observed).toEqual(form.nestedForms);

      runInAction(() => {
        model.array.push(new SampleModel());
      });
      expect(observed).toBeDefined();
      expect(observed!.size).toBe(3);
      expect(observed).toEqual(form.nestedForms);
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
  });

  describe("#submit", () => {
    it("does nothing when FormDelegate.submit is not implemented", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);
      expect(await form.submit()).toBe(false);
    });

    it("returns true when submission occurred", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);
      expect(await form.submit()).toBe(true);
    });

    it("sets isSubmitting flag while submitting", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isSubmitting: ${form.isSubmitting}`);
      });

      const submit = form.submit();
      submit.then(() => timeline.push(`submit`));

      expect(await submit).toBe(true);
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isSubmitting: false",
          "isSubmitting: true",
          "isSubmitting: false",
          "submit",
        ]
      `);
    });

    it("discards subsequent submit requests while submitting", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isSubmitting: ${form.isSubmitting}`);
      });

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      // Start first submission
      const firstSubmit = form.submit();
      firstSubmit.then(() => timeline.push(`firstSubmit`));
      // Try to submit again while first is still running
      const secondSubmit = form.submit();
      secondSubmit.then(() => timeline.push(`secondSubmit`));

      expect(await firstSubmit).toBe(true); // First submit should be occurred
      expect(await secondSubmit).toBe(false); // Second submit should be discarded
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isSubmitting: false",
          "isSubmitting: true",
          "secondSubmit",
          "isSubmitting: false",
          "firstSubmit",
        ]
      `);
    });

    it("aborts ongoing submission when submitting with force option", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isSubmitting: ${form.isSubmitting}`);
      });

      form.markAsDirty();
      expect(form.canSubmit).toBe(true);

      // Start first submission
      const firstSubmit = form.submit();
      firstSubmit.then(() => timeline.push(`firstSubmit`));
      // Force second submission while first is still running
      const secondSubmit = form.submit({ force: true });
      secondSubmit.then(() => timeline.push(`secondSubmit`));

      expect(await firstSubmit).toBe(false); // First submit should be aborted
      expect(await secondSubmit).toBe(true); // Second submit should be occurred
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isSubmitting: false",
          "isSubmitting: true",
          "isSubmitting: false",
          "firstSubmit",
          "secondSubmit",
        ]
      `);
    });
  });

  describe("#validate", () => {
    it("returns null and does nothing when FormDelegate.validate is not implemented", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      expect(form.validate()).toBe(null);
    });

    it("calls Validation#request and returns the status", async () => {
      const model = new SampleModel();
      const form = Form.get(model);
      const internal = getInternal(form);
      const spy = vi.spyOn(internal.validation, "request");
      expect(form.validate()).toBe("requested");
      expect(spy).toBeCalled();
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

          const binding = form.bind("string", SampleFieldBinding);
          expect(binding.fieldName).toBe("string");
        });

        it("returns the same binding instance when called multiple times", () => {
          const model = new SampleModel();
          const form = Form.get(model);

          const binding1 = form.bind("string", SampleFieldBinding);
          const binding2 = form.bind("string", SampleFieldBinding);
          expect(binding1.bindingId).toBe(binding2.bindingId);
        });
      });
    });

    describe("With a config", () => {
      it("returns the binding properties", () => {
        const model = new SampleModel();
        const form = Form.get(model);

        const binding = form.bind("string", SampleConfigurableFieldBinding, { sample: true });
        expect(binding.fieldName).toBe("string");
        expect(binding.config).toEqual({ sample: true });
      });

      it("returns the same binding instance when called multiple times but updates the config", () => {
        const model = new SampleModel();
        const form = Form.get(model);

        const binding1 = form.bind("string", SampleConfigurableFieldBinding, { sample: true });
        expect(binding1.config).toEqual({ sample: true });
        const binding2 = form.bind("string", SampleConfigurableFieldBinding, { sample: false });
        expect(binding1.bindingId).toBe(binding2.bindingId);
        expect(binding2.config).toEqual({ sample: false });
      });
    });
  });
});

suite("Nested forms", () => {
  test("the validity of the parent form is true if all nested forms are valid", async () => {
    const model = new NestedModel();
    const form = Form.get(model);
    const sampleForm = Form.get(model.sample);

    expect(sampleForm.isValid).toBe(true);
    expect(form.isValid).toBe(true);

    runInAction(() => {
      model.sample.string = "invalid";
    });
    sampleForm.validate();
    await new Promise((resolve) => setTimeout(resolve, sampleForm.config.validationDelayMs + 10));

    expect(sampleForm.isValid).toBe(false);
    expect(form.isValid).toBe(false);
  });
});
