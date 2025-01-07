import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Form } from "./Form";
import { FormDelegate } from "./delegation";

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
    return [this.sample, ...this.array];
  }
}

describe("Form", () => {
  describe(".get", () => {
    it("returns the same instance for the same subject and key", () => {
      const model = new SampleModel();
      const form1 = Form.get(model);
      const form2 = Form.get(model);
      expect(form1).toBe(form2);
    });

    it("returns different instances for different subjects", () => {
      const model1 = new SampleModel();
      const model2 = new SampleModel();
      const form1 = Form.get(model1);
      const form2 = Form.get(model2);
      expect(form1).not.toBe(form2);
    });

    it("returns different instances for different keys", () => {
      const model = new SampleModel();
      const form1 = Form.get(model);
      const form2 = Form.get(model, Symbol("key"));
      expect(form1).not.toBe(form2);
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
    it("does nothing when FormDelegate.validate is not implemented", async () => {
      const model = new EmptyModel();
      const form = Form.get(model);
      expect(await form.validate()).toBe(false);
    });

    it("returns true when validation occurred", async () => {
      const model = new SampleModel();
      const form = Form.get(model);
      expect(await form.validate()).toBe(true);
    });

    it("sets isValidating flag while validating", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isValidating: ${form.isValidating}`);
      });

      const validate = form.validate();
      validate.then(() => timeline.push(`validate`));

      expect(await validate).toBe(true);
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isValidating: false",
          "isValidating: true",
          "isValidating: false",
          "validate",
        ]
      `);
    });

    it("discards subsequent validate requests while validating", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isValidating: ${form.isValidating}`);
      });

      // Start first validation
      const firstValidate = form.validate();
      firstValidate.then(() => timeline.push(`firstValidate`));
      // Try to validate again while first is still running
      const secondValidate = form.validate();
      secondValidate.then(() => timeline.push(`secondValidate`));

      expect(await firstValidate).toBe(true); // First validate should be occurred
      expect(await secondValidate).toBe(false); // Second validate should be discarded
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isValidating: false",
          "isValidating: true",
          "isValidating: false",
          "secondValidate",
          "firstValidate",
        ]
      `);
    });

    it("aborts ongoing validation when validating with force option", async () => {
      const model = new SampleModel();
      const form = Form.get(model);

      const timeline: string[] = [];
      autorun(() => {
        timeline.push(`isValidating: ${form.isValidating}`);
      });

      // Start first validation
      const firstValidate = form.validate();
      firstValidate.then(() => timeline.push(`firstValidate`));
      // Force second validation while first is still running
      const secondValidate = form.validate({ force: true });
      secondValidate.then(() => timeline.push(`secondValidate`));

      expect(await firstValidate).toBe(false); // First validate should be aborted
      expect(await secondValidate).toBe(true); // Second validate should be occurred
      expect(timeline).toMatchInlineSnapshot(`
        [
          "isValidating: false",
          "isValidating: true",
          "isValidating: false",
          "firstValidate",
          "secondValidate",
        ]
      `);
    });
  });
});

suite("Nested forms", () => {
  it("the validity of the parent form is true if all nested forms are valid", async () => {
    const model = new NestedModel();
    const form = Form.get(model);
    const sampleForm = Form.get(model.sample);

    expect(sampleForm.isValid).toBe(true);
    expect(form.isValid).toBe(true);

    runInAction(() => {
      model.sample.string = "invalid";
    });
    await sampleForm.validate();

    expect(sampleForm.isValid).toBe(false);
    expect(form.isValid).toBe(false);
  });
});
