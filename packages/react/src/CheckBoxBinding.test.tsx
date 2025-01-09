import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form } from "@form-model/core";
import "./extension";
import { observer } from "mobx-react-lite";

class SampleModel {
  @observable boolean: boolean = false;
  @observable booleanOpt: boolean | null = null;

  constructor() {
    makeObservable(this);
  }
}

const SampleComponent: React.FC<{ model: SampleModel }> = observer(({ model }) => {
  const form = Form.get(model);

  return (
    <>
      <input
        aria-label="boolean"
        {...form.bindCheckBox("boolean", {
          getter: () => model.boolean,
          setter: (v) => (model.boolean = v),
        })}
      />
      <input
        aria-label="booleanOpt"
        {...form.bindCheckBox("booleanOpt", {
          getter: () => model.booleanOpt ?? false,
          setter: (v) => (model.booleanOpt = v),
        })}
      />
    </>
  );
});

function setupEnv(inputLabel: string) {
  const model = new SampleModel();

  render(<SampleComponent model={model} />);
  const input = screen.getByLabelText(inputLabel) as HTMLInputElement;

  return {
    model,
    input,
    async clickInput() {
      await userEvent.click(input);
    },
  };
}

describe("CheckBoxBinding", () => {
  test("works with a required field", async () => {
    const env = setupEnv("boolean");

    expect(env.model.boolean).toBe(false);
    expect(env.input).not.toBeChecked();
    await env.clickInput();
    expect(env.model.boolean).toBe(true);
    expect(env.input).toBeChecked();
    await env.clickInput();
    expect(env.model.boolean).toBe(false);
    expect(env.input).not.toBeChecked();
  });

  test("works with an optional field", async () => {
    const env = setupEnv("booleanOpt");

    expect(env.model.booleanOpt).toBe(null);
    expect(env.input).not.toBeChecked();
    await env.clickInput();
    expect(env.model.booleanOpt).toBe(true);
    expect(env.input).toBeChecked();
    await env.clickInput();
    expect(env.model.booleanOpt).toBe(false);
    expect(env.input).not.toBeChecked();
  });
});
