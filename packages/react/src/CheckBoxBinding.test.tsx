import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { makeObservable, observable } from "mobx";
import { Form, FormField } from "@mobx-sentinel/form";
import "./extension";
import { observer } from "mobx-react-lite";
import { CheckBoxBinding } from "./CheckBoxBinding";

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

describe("CheckBoxBinding", () => {
  const setupEnv = () => {
    const model = new SampleModel();
    const form = Form.get(model);
    const field = new FormField({
      fieldName: "boolean",
      validator: form.validator,
      getFinalizationDelayMs: () => form.config.autoFinalizationDelayMs,
    });
    const binding = new CheckBoxBinding(field, {
      getter: () => false,
      setter: () => {},
    });
    const element = document.createElement("input");
    const fakeEvent = () => {
      return { currentTarget: element } as any;
    };

    return {
      model,
      form,
      field,
      binding,
      fakeEvent,
    };
  };

  describe("props.id", () => {
    it("uses the field id by default", () => {
      const env = setupEnv();
      expect(env.binding.props.id).toBe(env.field.id);
    });

    it("uses the provided id", () => {
      const env = setupEnv();
      env.binding.config.id = "somethingElse";
      expect(env.binding.props.id).toBe("somethingElse");
    });
  });

  describe("#onChange", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onChange(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onChange = callback;
      env.binding.onChange(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
    });
  });

  describe("#onFocus", () => {
    it("works without a callback", () => {
      const env = setupEnv();
      env.binding.onFocus(env.fakeEvent());
    });

    it("calls the callback if provided", () => {
      const env = setupEnv();
      const callback = vi.fn();
      env.binding.config.onFocus = callback;
      env.binding.onFocus(env.fakeEvent());
      expect(callback).toBeCalledWith(env.fakeEvent());
    });
  });

  describe("errorMessages", () => {
    it("returns null if no errors", () => {
      const env = setupEnv();
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toBeNull();
    });

    it("returns the error messages if errors are reported", () => {
      const env = setupEnv();
      env.form.validator.updateErrors(Symbol(), (builder) => {
        builder.invalidate("boolean", "invalid1");
        builder.invalidate("boolean", "invalid2");
      });
      expect(env.binding.errorMessages).toBeNull();
      env.field.reportError();
      expect(env.binding.errorMessages).toEqual("invalid1, invalid2");
    });
  });
});

suite("bindCheckBox", () => {
  const setupEnv = (inputLabel: string) => {
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
  };

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
