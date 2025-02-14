import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form, FormField } from "@form-model/core";
import "./extension";
import { observer } from "mobx-react-lite";
import { LabelBinding } from "./LabelBinding";

class SampleModel {
  @observable field1 = "hello";
  @observable field2 = "world";

  constructor() {
    makeObservable(this);
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <>
      <label aria-label="label" {...form.bindLabel(["field1", "field2"])}>
        Label
      </label>
      <input
        aria-label="field1"
        {...form.bindInput("field1", {
          getter: () => model.field1,
          setter: (v) => (model.field1 = v),
        })}
      />
      <input
        aria-label="field2"
        {...form.bindInput("field2", {
          getter: () => model.field2,
          setter: (v) => (model.field2 = v),
        })}
      />
    </>
  );
});

describe("LabelBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "test",
      formErrors: new Map(),
      getFinalizationDelayMs: () => form.config.intermediateValidationDelayMs,
    });
    const binding = new LabelBinding([field], {});

    return {
      model,
      form,
      field,
      binding,
    };
  };

  describe("props.htmlFor", () => {
    it("uses the field id by default", () => {
      const env = setupEnv();
      expect(env.binding.props.htmlFor).toBe(env.field.id);
    });

    it("uses the provided id", () => {
      const env = setupEnv();
      env.binding.config.htmlFor = "somethingElse";
      expect(env.binding.props.htmlFor).toBe("somethingElse");
    });
  });
});

suite("bindLabel", () => {
  const setupEnv = () => {
    const model = new SampleModel();

    render(<SampleComponent model={model} />);
    const label = screen.getByLabelText("label") as HTMLLabelElement;
    const field1 = screen.getByLabelText("field1") as HTMLInputElement;
    const field2 = screen.getByLabelText("field2") as HTMLInputElement;

    return {
      model,
      label,
      field1,
      field2,
      clickLabel: () => userEvent.click(label),
    };
  };

  test("focuses the first field when clicked", async () => {
    const env = setupEnv();
    expect(env.field1).not.toHaveFocus();
    await env.clickLabel();
    expect(env.field1).toHaveFocus();
  });
});
