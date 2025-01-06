import { autorun, makeObservable, observable, runInAction } from "mobx";
import { Form } from "./Form";

class SampleModel implements Form.Delegate<SampleModel> {
  @observable string: string = "hello";

  constructor() {
    makeObservable(this);
  }

  async [Form.validate]() {
    return {
      string: this.string !== "hello" ? "error" : undefined,
    };
  }
}

class NestedModel implements Form.Delegate<NestedModel> {
  @observable sample = new SampleModel();
  @observable array = [new SampleModel()];

  constructor() {
    makeObservable(this);
  }

  [Form.getNestedFields]() {
    return [this.sample, this.array];
  }
}

describe("Form", () => {
  describe("With nested forms", () => {
    it("the parent form collects nested forms via the delegate", () => {
      const nested = new NestedModel();
      const form = Form.get(nested);

      expect(form.nestedForms).toEqual(new Set([Form.get(nested.sample), Form.get(nested.array[0])]));

      let observed: typeof form.nestedForms | null = null;
      autorun(() => {
        observed = form.nestedForms;
      });
      expect(observed).toEqual(form.nestedForms);

      runInAction(() => {
        nested.array.push(new SampleModel());
      });
      expect(observed).toEqual(form.nestedForms);
    });

    it("the validity of the parent form is true if all nested forms are valid", async () => {
      const nested = new NestedModel();
      const form = Form.get(nested);
      const sampleForm = Form.get(nested.sample);

      expect(sampleForm.isValid).toBe(true);
      expect(form.isValid).toBe(true);

      runInAction(() => {
        nested.sample.string = "invalid";
      });
      await sampleForm.validate();

      expect(sampleForm.isValid).toBe(false);
      expect(form.isValid).toBe(false);
    });
  });
});
